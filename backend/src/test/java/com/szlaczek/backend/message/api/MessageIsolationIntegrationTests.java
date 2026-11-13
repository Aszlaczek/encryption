package com.szlaczek.backend.message.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;

/**
 * Cross-user isolation and persistence checks for requirements R02, R04 and R06.
 *
 * <p>
 * Two real sessions (alice = A, bob = B) exercise every owner-scoped path against PostgreSQL 16: list, details,
 * stored-message decryption, pasted-package decryption, session and CSRF guards, SQL injection payloads and the actual
 * database row. Every negative assertion verifies that the response body and the stored envelope never expose A's
 * plaintext.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class MessageIsolationIntegrationTests {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void clearMessages() {
        jdbcTemplate.update("delete from messages");
    }

    @Test
    void listAndDetailsNeverExposeAnotherUsersMessage() throws Exception {
        Session alice = login("alice", "AliceDemo123!");
        Session bob = login("bob", "BobDemo1234!");
        assertThat(alice.session()).isNotSameAs(bob.session());
        assertThat(userId(alice)).isNotEqualTo(userId(bob));

        String secret = "Wiadomość wyłącznie dla Alicji — Bob nie może jej zobaczyć 🔐";
        MvcResult created = create(alice, secret).andExpect(status().isCreated()).andReturn();
        String id = json(created, "$.id");
        String packageValue = json(created, "$.package");

        MvcResult bobList = mockMvc.perform(get("/api/messages")
                .param("limit", "50")
                .param("ownerId", userId(alice))
                .session(bob.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.hasMore").value(false))
                .andExpect(jsonPath("$.nextCursor").doesNotExist())
                .andReturn();
        assertNoSecret(bobList, secret, packageValue);

        MvcResult foreign = mockMvc.perform(get("/api/messages/" + id).session(bob.session()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("MESSAGE_NOT_FOUND"))
                .andExpect(jsonPath("$.plaintext").doesNotExist())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andReturn();
        MvcResult missing = mockMvc.perform(get("/api/messages/" + UUID.randomUUID()).session(bob.session()))
                .andExpect(status().isNotFound())
                .andReturn();
        assertThat(json(foreign, "$.code")).isEqualTo(json(missing, "$.code"));
        assertThat(json(foreign, "$.detail")).isEqualTo(json(missing, "$.detail"));
        assertNoSecret(foreign, secret, packageValue);

        MvcResult aliceList = mockMvc.perform(get("/api/messages").session(alice.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].package").doesNotExist())
                .andExpect(jsonPath("$.items[0].plaintext").doesNotExist())
                .andReturn();
        assertNoSecret(aliceList, secret);

        mockMvc.perform(get("/api/messages/" + id).session(alice.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.package").value(packageValue))
                .andExpect(jsonPath("$.plaintext").doesNotExist())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));
    }

    @Test
    void storedMessageDecryptIsOwnerScoped() throws Exception {
        Session alice = login("alice", "AliceDemo123!");
        Session bob = login("bob", "BobDemo1234!");

        String aliceSecret = "Sekret zapisany przez Alicję";
        String id = json(create(alice, aliceSecret).andExpect(status().isCreated()).andReturn(), "$.id");

        MvcResult foreign = mockMvc.perform(post("/api/messages/" + id + "/decrypt")
                .session(bob.session())
                .cookie(bob.xsrfCookie())
                .header("X-XSRF-TOKEN", bob.token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("MESSAGE_NOT_FOUND"))
                .andExpect(jsonPath("$.plaintext").doesNotExist())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andReturn();
        MvcResult missing = mockMvc.perform(post("/api/messages/" + UUID.randomUUID() + "/decrypt")
                .session(bob.session())
                .cookie(bob.xsrfCookie())
                .header("X-XSRF-TOKEN", bob.token()))
                .andExpect(status().isNotFound())
                .andReturn();
        assertThat(json(foreign, "$.detail")).isEqualTo(json(missing, "$.detail"));
        assertNoSecret(foreign, aliceSecret);

        mockMvc.perform(post("/api/messages/" + id + "/decrypt")
                .session(alice.session())
                .cookie(alice.xsrfCookie())
                .header("X-XSRF-TOKEN", alice.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plaintext").value(aliceSecret));

        String bobSecret = "Sekret zapisany przez Boba";
        String bobId = json(create(bob, bobSecret).andExpect(status().isCreated()).andReturn(), "$.id");
        MvcResult bobDecrypt = mockMvc.perform(post("/api/messages/" + bobId + "/decrypt")
                .session(bob.session())
                .cookie(bob.xsrfCookie())
                .header("X-XSRF-TOKEN", bob.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plaintext").value(bobSecret))
                .andReturn();
        assertNoSecret(bobDecrypt, aliceSecret);
    }

    @ParameterizedTest(name = "[{index}] {0}")
    @MethodSource("secretPayloads")
    void pastedForeignPackageIsRejectedWithoutRevealingPlaintext(String secret) throws Exception {
        Session alice = login("alice", "AliceDemo123!");
        Session bob = login("bob", "BobDemo1234!");

        MvcResult encrypted = encrypt(alice, secret).andExpect(status().isOk()).andReturn();
        String packageValue = json(encrypted, "$.package");

        MvcResult foreign = mockMvc.perform(decryptRequest(bob, packageValue))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("DECRYPT_FAILED"))
                .andExpect(jsonPath("$.detail").value("Nie udało się odszyfrować pakietu."))
                .andExpect(jsonPath("$.plaintext").doesNotExist())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andReturn();
        assertNoSecret(foreign, secret, packageValue);

        mockMvc.perform(decryptRequest(alice, packageValue))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plaintext").value(secret));

        String id = json(create(alice, secret).andExpect(status().isCreated()).andReturn(), "$.id");
        MvcResult storedForeign = mockMvc.perform(post("/api/messages/" + id + "/decrypt")
                .session(bob.session())
                .cookie(bob.xsrfCookie())
                .header("X-XSRF-TOKEN", bob.token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("MESSAGE_NOT_FOUND"))
                .andExpect(jsonPath("$.plaintext").doesNotExist())
                .andReturn();
        assertNoSecret(storedForeign, secret);

        MvcResult bobList = mockMvc.perform(get("/api/messages").session(bob.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0))
                .andReturn();
        assertNoSecret(bobList, secret);

        byte[] ciphertext = jdbcTemplate.queryForObject(
                "select ciphertext from messages where id = ?::uuid", byte[].class, id);
        assertThat(ciphertext).isNotEqualTo(secret.getBytes(StandardCharsets.UTF_8));
        assertThat(indexOf(ciphertext, secret.getBytes(StandardCharsets.UTF_8))).isEqualTo(-1);
    }

    @Test
    void sessionAndCsrfGuardsProtectEveryOwnerScopedOperation() throws Exception {
        Session alice = login("alice", "AliceDemo123!");
        Session bob = login("bob", "BobDemo1234!");
        String secret = "Wiadomość chroniona sesją i CSRF";
        MvcResult created = create(alice, secret).andExpect(status().isCreated()).andReturn();
        String id = json(created, "$.id");
        String packageValue = json(created, "$.package");

        assertThat(json(mockMvc.perform(get("/api/auth/me").session(alice.session())).andReturn(), "$.username"))
                .isEqualTo("alice");
        assertThat(json(mockMvc.perform(get("/api/auth/me").session(bob.session())).andReturn(), "$.username"))
                .isEqualTo("bob");

        List<ResultActions> anonymous = List.of(
                mockMvc.perform(get("/api/messages")),
                mockMvc.perform(get("/api/messages/" + id)),
                mockMvc.perform(post("/api/messages/" + id + "/decrypt")),
                mockMvc.perform(post("/api/crypto/decrypt")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonBody(Map.of("package", packageValue)))),
                mockMvc.perform(post("/api/messages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonBody(Map.of("plaintext", secret)))));
        for (ResultActions request : anonymous) {
            MvcResult result = request.andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
                    .andReturn();
            assertNoSecret(result, secret, packageValue);
        }

        MvcResult withoutCsrf = mockMvc.perform(post("/api/messages/" + id + "/decrypt").session(bob.session()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"))
                .andReturn();
        assertNoSecret(withoutCsrf, secret, packageValue);

        mockMvc.perform(post("/api/messages/" + id + "/decrypt")
                .session(bob.session())
                .cookie(bob.xsrfCookie())
                .header("X-XSRF-TOKEN", "not-the-token"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));

        mockMvc.perform(post("/api/messages")
                .session(bob.session())
                .cookie(bob.xsrfCookie())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonBody(Map.of("plaintext", "bez tokenu"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));

        MvcResult foreignWithCsrf = mockMvc.perform(post("/api/messages/" + id + "/decrypt")
                .session(bob.session())
                .cookie(bob.xsrfCookie())
                .header("X-XSRF-TOKEN", bob.token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("MESSAGE_NOT_FOUND"))
                .andReturn();
        assertNoSecret(foreignWithCsrf, secret);
    }

    @Test
    void databaseStoresOnlyEncryptedEnvelopesAndFlywayHistoryIsApplied() throws Exception {
        Session alice = login("alice", "AliceDemo123!");
        Session bob = login("bob", "BobDemo1234!");
        UUID aliceId = UUID.fromString(userId(alice));
        UUID bobId = UUID.fromString(userId(bob));

        String firstSecret = "pierwszy sekret Alicji";
        String secondSecret = "drugi sekret Alicji z emoji 🔐";
        String bobSecret = "sekret Boba";
        String firstId = json(create(alice, firstSecret).andReturn(), "$.id");
        String secondId = json(create(alice, secondSecret).andReturn(), "$.id");
        String bobMessageId = json(create(bob, bobSecret).andReturn(), "$.id");

        List<Map<String, Object>> aliceRows = jdbcTemplate.queryForList(
                "select id, owner_id, nonce, ciphertext, tag, key_id, format_version, algorithm, created_at"
                        + " from messages where owner_id = ?::uuid order by created_at, id",
                aliceId.toString());
        assertThat(aliceRows).hasSize(2);
        assertThat(aliceRows).allSatisfy(row -> {
            assertThat(row.get("owner_id").toString()).isEqualTo(aliceId.toString());
            assertThat((byte[]) row.get("nonce")).hasSize(12);
            assertThat((byte[]) row.get("tag")).hasSize(16);
            assertThat(row.get("key_id")).isEqualTo("k1");
            assertThat(row.get("format_version")).isEqualTo(1);
            assertThat(row.get("algorithm")).isEqualTo("AES-256-GCM");
            assertThat(row.get("created_at")).isNotNull();
        });
        assertThat(aliceRows).extracting(row -> row.get("id").toString())
                .containsExactlyInAnyOrder(firstId, secondId);
        assertThat(aliceRows)
                .extracting(row -> java.util.Base64.getEncoder().encodeToString((byte[]) row.get("nonce")))
                .doesNotHaveDuplicates();

        for (String[] expected : List.of(
                new String[]{firstId, firstSecret},
                new String[]{secondId, secondSecret})) {
            byte[] ciphertext = jdbcTemplate.queryForObject(
                    "select ciphertext from messages where id = ?::uuid", byte[].class, expected[0]);
            assertThat(indexOf(ciphertext, expected[1].getBytes(StandardCharsets.UTF_8))).isEqualTo(-1);
        }
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from messages where ciphertext = ?::bytea",
                Integer.class,
                firstSecret.getBytes(StandardCharsets.UTF_8))).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from messages where owner_id = ?::uuid", Integer.class, bobId.toString()))
                .isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from messages where id = ?::uuid and owner_id = ?::uuid",
                Integer.class,
                bobMessageId,
                bobId.toString())).isEqualTo(1);

        assertThat(jdbcTemplate.queryForList(
                "select column_name from information_schema.columns where table_name = 'messages'", String.class))
                .doesNotContain("plaintext", "content", "body", "message", "secret", "title");

        List<String> versions = jdbcTemplate.queryForList(
                "select version from flyway_schema_history where success order by installed_rank", String.class);
        assertThat(versions).containsExactly("1", "2", "3");
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from flyway_schema_history where success = false", Integer.class)).isZero();
    }

    @Test
    void sqlInjectionAndOwnerParametersCannotWidenScope() throws Exception {
        Session alice = login("alice", "AliceDemo123!");
        Session bob = login("bob", "BobDemo1234!");
        String secret = "rekord Alicji";
        String id = json(create(alice, secret).andReturn(), "$.id");

        for (String payload : List.of(
                "1' OR '1'='1",
                "00000000-0000-0000-0000-000000000000' OR '1'='1",
                "not-a-uuid")) {
            MvcResult result = mockMvc.perform(get("/api/messages/{id}", payload).session(bob.session()))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_MESSAGE_ID"))
                    .andReturn();
            assertNoSecret(result, secret);
        }
        mockMvc.perform(get("/api/messages").param("limit", "10; DROP TABLE messages").session(bob.session()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mockMvc.perform(get("/api/messages").param("limit", "1 OR 1=1").session(bob.session()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mockMvc.perform(get("/api/messages").param("cursor", "' OR 1=1 --").session(bob.session()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_CURSOR"));

        mockMvc.perform(post("/api/messages")
                .session(bob.session())
                .cookie(bob.xsrfCookie())
                .header("X-XSRF-TOKEN", bob.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonBody(Map.of("plaintext", "próba podszycia", "ownerId", userId(alice)))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("ownerId"))
                .andExpect(jsonPath("$.errors[0].code").value("UNKNOWN_FIELD"));

        assertThat(jdbcTemplate.queryForObject("select count(*) from messages", Integer.class)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "select owner_id from messages where id = ?::uuid", String.class, id))
                .isEqualTo(userId(alice));
        mockMvc.perform(get("/api/messages").param("ownerId", userId(alice)).session(bob.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    static Stream<String> secretPayloads() {
        return Stream.of(
                "Zażółć gęślą jaźń 🔐",
                "<script>alert('xss')</script>",
                "'; DROP TABLE messages; --",
                "linia 1\nlinia 2\t\"cudzysłów\" \\backslash",
                "długi sekret " + "x".repeat(1_000));
    }

    private ResultActions create(Session session, String plaintext) throws Exception {
        return mockMvc.perform(post("/api/messages")
                .session(session.session())
                .cookie(session.xsrfCookie())
                .header("X-XSRF-TOKEN", session.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonBody(Map.of("plaintext", plaintext))));
    }

    private ResultActions encrypt(Session session, String plaintext) throws Exception {
        return mockMvc.perform(post("/api/crypto/encrypt")
                .session(session.session())
                .cookie(session.xsrfCookie())
                .header("X-XSRF-TOKEN", session.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonBody(Map.of("plaintext", plaintext))));
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder decryptRequest(
            Session session, String packageValue) {
        return post("/api/crypto/decrypt")
                .session(session.session())
                .cookie(session.xsrfCookie())
                .header("X-XSRF-TOKEN", session.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonBody(Map.of("package", packageValue)));
    }

    private String jsonBody(Map<String, String> body) {
        return objectMapper.writeValueAsString(body);
    }

    private String userId(Session session) throws Exception {
        return json(mockMvc.perform(get("/api/auth/me").session(session.session())).andReturn(), "$.id");
    }

    private static String json(MvcResult result, String path) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), path);
    }

    private static void assertNoSecret(MvcResult result, String... values) throws Exception {
        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).doesNotContain(values);
    }

    private static int indexOf(byte[] haystack, byte[] needle) {
        outer : for (int start = 0; start <= haystack.length - needle.length; start++) {
            for (int offset = 0; offset < needle.length; offset++) {
                if (haystack[start + offset] != needle[offset]) {
                    continue outer;
                }
            }
            return start;
        }
        return -1;
    }

    private Session login(String username, String password) throws Exception {
        MvcResult csrf = mockMvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        String token = JsonPath.read(csrf.getResponse().getContentAsString(), "$.token");
        MvcResult login = mockMvc.perform(post("/api/auth/login")
                .cookie(new Cookie("XSRF-TOKEN", token))
                .header("X-XSRF-TOKEN", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonBody(Map.of("username", username, "password", password))))
                .andExpect(status().isOk())
                .andReturn();
        MockHttpSession session = (MockHttpSession) login.getRequest().getSession(false);
        Cookie xsrfCookie = Arrays.stream(login.getResponse().getCookies())
                .filter(cookie -> "XSRF-TOKEN".equals(cookie.getName()))
                .findFirst()
                .orElseThrow();
        return new Session(session, xsrfCookie, xsrfCookie.getValue());
    }

    private record Session(MockHttpSession session, Cookie xsrfCookie, String token) {
    }
}
