package com.szlaczek.backend.message.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class MessageControllerIntegrationTests {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void clearMessages() {
        jdbcTemplate.update("delete from messages");
    }

    @Test
    void createStoresOnlyEncryptedEnvelopeAndOwnerCanGetAndDecryptIt() throws Exception {
        Session alice = login("alice", "AliceDemo123!");
        String plaintext = "tajna wiadomość 🔐";
        MvcResult created = create(alice, plaintext)
                .andExpect(status().isCreated())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(header().exists(HttpHeaders.LOCATION))
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.createdAt").isNotEmpty())
                .andExpect(jsonPath("$.package").isNotEmpty())
                .andReturn();

        String id = JsonPath.read(created.getResponse().getContentAsString(), "$.id");
        String packageValue = JsonPath.read(created.getResponse().getContentAsString(), "$.package");
        UUID ownerId = UUID.fromString(JsonPath.read(
                mockMvc.perform(get("/api/auth/me").session(alice.session()))
                        .andReturn().getResponse().getContentAsString(),
                "$.id"));
        var row = jdbcTemplate.queryForMap(
                "select owner_id, nonce, ciphertext, tag, key_id, format_version, algorithm from messages where id = ?::uuid",
                id);
        assertThat(row.get("owner_id").toString()).isEqualTo(ownerId.toString());
        assertThat((byte[]) row.get("ciphertext"))
                .isNotEqualTo(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(row.get("key_id")).isEqualTo("k1");
        assertThat(row.get("algorithm")).isEqualTo("AES-256-GCM");
        assertThat(jdbcTemplate.queryForList(
                "select column_name from information_schema.columns where table_name = 'messages'", String.class))
                .doesNotContain("plaintext", "content", "body");

        mockMvc.perform(get("/api/messages/" + id).session(alice.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.package").value(packageValue));

        mockMvc.perform(post("/api/messages/" + id + "/decrypt")
                .session(alice.session())
                .cookie(alice.xsrfCookie())
                .header("X-XSRF-TOKEN", alice.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plaintext").value(plaintext))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));

        jdbcTemplate.update("update messages set tag = ? where id = ?::uuid", new byte[16], id);
        mockMvc.perform(post("/api/messages/" + id + "/decrypt")
                .session(alice.session())
                .cookie(alice.xsrfCookie())
                .header("X-XSRF-TOKEN", alice.token()))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("MESSAGE_UNDECRYPTABLE"))
                .andExpect(jsonPath("$.plaintext").doesNotExist());
    }

    @Test
    void listIsOwnerScopedAndUsesStableCursorWithMaximumFifty() throws Exception {
        Session alice = login("alice", "AliceDemo123!");
        Session bob = login("bob", "BobDemo1234!");
        List<String> aliceIds = new ArrayList<>();
        for (int index = 0; index < 3; index++) {
            MvcResult result = create(alice, "wiadomość " + index).andExpect(status().isCreated()).andReturn();
            aliceIds.add(JsonPath.read(result.getResponse().getContentAsString(), "$.id"));
        }
        String bobId = JsonPath.read(
                create(bob, "bob only").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(),
                "$.id");

        MvcResult first = mockMvc.perform(get("/api/messages?limit=2&ownerId=" + UUID.randomUUID())
                .session(alice.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.hasMore").value(true))
                .andExpect(jsonPath("$.nextCursor").isNotEmpty())
                .andReturn();
        List<String> firstIds = JsonPath.read(first.getResponse().getContentAsString(), "$.items[*].id");
        assertThat(firstIds).containsExactly(aliceIds.get(2), aliceIds.get(1));
        assertThat(firstIds).doesNotContain(bobId);
        List<String> bobPageIds = JsonPath.read(
                mockMvc.perform(get("/api/messages").session(bob.session())).andReturn().getResponse()
                        .getContentAsString(),
                "$.items[*].id");
        assertThat(bobPageIds).containsExactly(bobId);

        String cursor = JsonPath.read(first.getResponse().getContentAsString(), "$.nextCursor");
        MvcResult second = mockMvc.perform(get("/api/messages?limit=2&cursor=" + cursor).session(alice.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.hasMore").value(false))
                .andExpect(jsonPath("$.nextCursor").doesNotExist())
                .andReturn();
        List<String> secondIds = JsonPath.read(second.getResponse().getContentAsString(), "$.items[*].id");
        assertThat(secondIds).containsExactly(aliceIds.get(0));
        assertThat(firstIds).doesNotContainAnyElementsOf(secondIds);

        mockMvc.perform(get("/api/messages?limit=51").session(alice.session()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mockMvc.perform(get("/api/messages?limit=not-a-number").session(alice.session()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mockMvc.perform(get("/api/messages?cursor=!!!").session(alice.session()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_CURSOR"));
    }

    @Test
    void otherOwnersAndMissingIdsReturnSameNotFoundAndAnonymousCannotList() throws Exception {
        Session alice = login("alice", "AliceDemo123!");
        Session bob = login("bob", "BobDemo1234!");
        String id = JsonPath.read(create(alice, "owner message").andReturn().getResponse().getContentAsString(),
                "$.id");
        String absentId = UUID.randomUUID().toString();

        MvcResult foreign = mockMvc.perform(get("/api/messages/" + id).session(bob.session()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("MESSAGE_NOT_FOUND"))
                .andReturn();
        MvcResult absent = mockMvc.perform(get("/api/messages/" + absentId).session(bob.session()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("MESSAGE_NOT_FOUND"))
                .andReturn();
        String foreignCode = JsonPath.read(foreign.getResponse().getContentAsString(), "$.code");
        String absentCode = JsonPath.read(absent.getResponse().getContentAsString(), "$.code");
        String foreignDetail = JsonPath.read(foreign.getResponse().getContentAsString(), "$.detail");
        String absentDetail = JsonPath.read(absent.getResponse().getContentAsString(), "$.detail");
        assertThat(foreignCode).isEqualTo(absentCode);
        assertThat(foreignDetail).isEqualTo(absentDetail);

        mockMvc.perform(get("/api/messages"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        mockMvc.perform(post("/api/messages")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"plaintext\":\"secret\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        mockMvc.perform(post("/api/messages/" + id + "/decrypt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        mockMvc.perform(get("/api/messages/not-a-uuid").session(alice.session()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_MESSAGE_ID"));
        mockMvc.perform(post("/api/messages/" + id + "/decrypt").session(alice.session()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }

    @Test
    void deleteIsOwnerScopedAndRemovesOnlyTheOwnersRow() throws Exception {
        Session alice = login("alice", "AliceDemo123!");
        Session bob = login("bob", "BobDemo1234!");
        String id = JsonPath.read(
                create(alice, "wiadomość do usunięcia")
                        .andExpect(status().isCreated())
                        .andReturn().getResponse().getContentAsString(),
                "$.id");

        mockMvc.perform(delete("/api/messages/" + id)
                .session(bob.session())
                .cookie(bob.xsrfCookie())
                .header("X-XSRF-TOKEN", bob.token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("MESSAGE_NOT_FOUND"))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));
        assertThat(messageCount(id)).isEqualTo(1);

        MvcResult deleted = mockMvc.perform(delete("/api/messages/" + id)
                .session(alice.session())
                .cookie(alice.xsrfCookie())
                .header("X-XSRF-TOKEN", alice.token()))
                .andExpect(status().isNoContent())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andReturn();
        assertThat(deleted.getResponse().getContentAsString()).isEmpty();
        assertThat(messageCount(id)).isZero();

        mockMvc.perform(get("/api/messages/" + id).session(alice.session()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("MESSAGE_NOT_FOUND"));
        mockMvc.perform(delete("/api/messages/" + id)
                .session(alice.session())
                .cookie(alice.xsrfCookie())
                .header("X-XSRF-TOKEN", alice.token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("MESSAGE_NOT_FOUND"));
        mockMvc.perform(get("/api/messages").session(alice.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void deleteRequiresValidIdSessionAndCsrf() throws Exception {
        Session alice = login("alice", "AliceDemo123!");
        String id = JsonPath.read(
                create(alice, "wiadomość chroniona")
                        .andExpect(status().isCreated())
                        .andReturn().getResponse().getContentAsString(),
                "$.id");

        mockMvc.perform(delete("/api/messages/" + id))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        mockMvc.perform(delete("/api/messages/" + id).session(alice.session()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
        mockMvc.perform(delete("/api/messages/not-a-uuid")
                .session(alice.session())
                .cookie(alice.xsrfCookie())
                .header("X-XSRF-TOKEN", alice.token()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_MESSAGE_ID"));
        assertThat(messageCount(id)).isEqualTo(1);
    }

    private int messageCount(String id) {
        return jdbcTemplate.queryForObject(
                "select count(*) from messages where id = ?::uuid", Integer.class, id);
    }

    private org.springframework.test.web.servlet.ResultActions create(Session session, String plaintext)
            throws Exception {
        return mockMvc.perform(post("/api/messages")
                .session(session.session())
                .cookie(session.xsrfCookie())
                .header("X-XSRF-TOKEN", session.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"plaintext\":\"" + plaintext + "\"}"));
    }

    private Session login(String username, String password) throws Exception {
        MvcResult csrf = mockMvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        String token = JsonPath.read(csrf.getResponse().getContentAsString(), "$.token");
        MvcResult login = mockMvc.perform(post("/api/auth/login")
                .cookie(new Cookie("XSRF-TOKEN", token))
                .header("X-XSRF-TOKEN", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        MockHttpSession session = (MockHttpSession) login.getRequest().getSession(false);
        Cookie xsrfCookie = java.util.Arrays.stream(login.getResponse().getCookies())
                .filter(cookie -> "XSRF-TOKEN".equals(cookie.getName()))
                .findFirst()
                .orElseThrow();
        return new Session(session, xsrfCookie, xsrfCookie.getValue());
    }

    private record Session(MockHttpSession session, Cookie xsrfCookie, String token) {
    }
}
