package com.szlaczek.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
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
class AuthIntegrationTests {

    private static final Pattern REQUEST_ID = Pattern.compile("[0-9a-f]{32}");
    private static final String TEST_IP = "127.0.0.1";
    private static final String RATE_LIMIT_IP = "203.0.113.77";

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private LoginRateLimiter rateLimiter;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void resetRateLimiter() {
        for (String username : List.of("alice", "bob", "carol", "disabled")) {
            rateLimiter.reset(TEST_IP, username);
            rateLimiter.reset(RATE_LIMIT_IP, username);
        }
    }

    @Test
    void csrfEndpointReturnsTokenCookieAndHeadersWithoutCreatingSession() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andExpect(header().exists("X-Request-Id"))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.headerName").value("X-XSRF-TOKEN"))
                .andExpect(jsonPath("$.cookieName").value("XSRF-TOKEN"))
                .andReturn();

        String requestId = result.getResponse().getHeader("X-Request-Id");
        assertThat(requestId).matches(REQUEST_ID);

        String cookieHeader = setCookie(result.getResponse(), "XSRF-TOKEN");
        assertThat(cookieHeader).contains("Path=/").doesNotContain("HttpOnly");

        String token = JsonPath.read(result.getResponse().getContentAsString(), "$.token");
        assertThat(cookieValue(cookieHeader)).isEqualTo(token);
        assertThat(result.getRequest().getSession(false)).isNull();
    }

    @Test
    void loginKeepsSessionMeReturnsCurrentUserAndLogoutRevokesAccess() throws Exception {
        Csrf csrf = csrf();

        MvcResult login = login(csrf, "alice", "AliceDemo123!", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.username").value("alice"))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andReturn();

        MockHttpSession session = (MockHttpSession) login.getRequest().getSession(false);
        assertThat(session).isNotNull();
        assertThat(session.isInvalid()).isFalse();

        Csrf rotated = csrfFrom(login.getResponse());
        assertThat(rotated.token()).isNotEqualTo(csrf.token());

        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("alice"))
                .andExpect(jsonPath("$.id").isNotEmpty());

        mockMvc.perform(post("/api/auth/logout")
                .session(session)
                .cookie(rotated.cookie())
                .header("X-XSRF-TOKEN", rotated.token()))
                .andExpect(status().isNoContent())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(result -> {
                    List<String> cookies = result.getResponse().getHeaders("Set-Cookie");
                    assertThat(cookies).anySatisfy(cookie -> assertThat(cookie)
                            .startsWith("JSESSIONID=")
                            .contains("Max-Age=0")
                            .contains("HttpOnly"));
                    assertThat(cookies).anySatisfy(cookie -> assertThat(cookie)
                            .startsWith("XSRF-TOKEN=")
                            .contains("Max-Age=0"));
                });

        assertThat(session.isInvalid()).isTrue();

        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.detail").value("Wymagane jest zalogowanie."));
    }

    @Test
    void loginRotatesSessionAndCsrfTokenAndRejectsOldToken() throws Exception {
        Csrf firstCsrf = csrf();
        MvcResult firstLogin = login(firstCsrf, "alice", "AliceDemo123!", null)
                .andExpect(status().isOk())
                .andReturn();

        MockHttpSession firstSession = (MockHttpSession) firstLogin.getRequest().getSession(false);
        String firstSessionId = firstSession.getId();
        Csrf secondCsrf = csrfFrom(firstLogin.getResponse());

        MvcResult secondLogin = login(secondCsrf, "alice", "AliceDemo123!", firstSession)
                .andExpect(status().isOk())
                .andReturn();

        MockHttpSession secondSession = (MockHttpSession) secondLogin.getRequest().getSession(false);
        Csrf thirdCsrf = csrfFrom(secondLogin.getResponse());

        assertThat(secondSession.getId()).isNotEqualTo(firstSessionId);
        assertThat(thirdCsrf.token()).isNotEqualTo(secondCsrf.token());

        mockMvc.perform(post("/api/auth/login")
                .session(secondSession)
                .cookie(thirdCsrf.cookie())
                .header("X-XSRF-TOKEN", secondCsrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(loginJson("alice", "AliceDemo123!")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }

    @Test
    void loginRequiresCsrfAndRejectsMissingOrWrongToken() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(loginJson("alice", "AliceDemo123!")))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));

        Csrf csrf = csrf();
        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .cookie(csrf.cookie())
                .header("X-XSRF-TOKEN", "wrong-token")
                .content(loginJson("alice", "AliceDemo123!")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }

    @Test
    void logoutWithoutSessionReturns401BeforeCsrf() throws Exception {
        mockMvc.perform(post("/api/auth/logout"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

        mockMvc.perform(post("/api/auth/logout").header("X-XSRF-TOKEN", "wrong"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void logoutWithSessionButWithoutCsrfReturns403() throws Exception {
        Csrf csrf = csrf();
        MvcResult login = login(csrf, "alice", "AliceDemo123!", null)
                .andExpect(status().isOk())
                .andReturn();
        MockHttpSession session = (MockHttpSession) login.getRequest().getSession(false);

        mockMvc.perform(post("/api/auth/logout").session(session))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }

    @Test
    void twoSessionsOfOneUserAreIndependent() throws Exception {
        Csrf firstCsrf = csrf();
        MvcResult firstLogin = login(firstCsrf, "alice", "AliceDemo123!", null)
                .andExpect(status().isOk())
                .andReturn();
        MockHttpSession firstSession = (MockHttpSession) firstLogin.getRequest().getSession(false);
        Csrf firstSessionCsrf = csrfFrom(firstLogin.getResponse());

        Csrf secondCsrf = csrf();
        MvcResult secondLogin = login(secondCsrf, "alice", "AliceDemo123!", null)
                .andExpect(status().isOk())
                .andReturn();
        MockHttpSession secondSession = (MockHttpSession) secondLogin.getRequest().getSession(false);

        mockMvc.perform(post("/api/auth/logout")
                .session(firstSession)
                .cookie(firstSessionCsrf.cookie())
                .header("X-XSRF-TOKEN", firstSessionCsrf.token()))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/auth/me").session(secondSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("alice"));
    }

    @Test
    void invalidCredentialsResponsesCannotDistinguishUnknownOrDisabledAccounts() throws Exception {
        jdbcTemplate.update("delete from app_users where username = 'disabled'");
        jdbcTemplate.update(
                "insert into app_users (username, password_hash, enabled) values (?, ?, false)",
                "disabled",
                passwordEncoder.encode("Disabled123!"));

        Csrf csrf = csrf();
        String wrongPassword = login(csrf, "alice", "WrongPassword1!", null)
                .andExpect(status().isUnauthorized())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String unknownLogin = login(csrf, "carol", "Whatever123!", null)
                .andExpect(status().isUnauthorized())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String disabledLogin = login(csrf, "disabled", "Disabled123!", null)
                .andExpect(status().isUnauthorized())
                .andReturn()
                .getResponse()
                .getContentAsString();

        String normalized = normalizeTraceId(wrongPassword);
        assertThat(normalizeTraceId(unknownLogin)).isEqualTo(normalized);
        assertThat(normalizeTraceId(disabledLogin)).isEqualTo(normalized);
        assertThat(normalized).contains("\"code\":\"INVALID_CREDENTIALS\"");
    }

    @Test
    void loginAcceptsMixedCaseAndSurroundingWhitespace() throws Exception {
        Csrf csrf = csrf();

        login(csrf, "  ALICE  ", "AliceDemo123!", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("alice"));
    }

    @Test
    void validationRejectsMissingFieldsUnknownFieldsAndMalformedJson() throws Exception {
        Csrf csrf = csrf();

        loginRaw(csrf, "{\"password\":\"AliceDemo123!\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("username"))
                .andExpect(jsonPath("$.errors[0].code").value("REQUIRED"));

        loginRaw(csrf, "{\"username\":\"alice\",\"password\":\"AliceDemo123!\",\"ownerId\":\"x\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("ownerId"))
                .andExpect(jsonPath("$.errors[0].code").value("UNKNOWN_FIELD"));

        loginRaw(csrf, "{\"username\":\"alice\",")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_JSON"));

        loginRaw(csrf, "{\"username\":\"alice\",\"username\":\"alice\",\"password\":\"AliceDemo123!\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_JSON"));

        loginRaw(csrf, "{\"username\":\"alice\",\"password\":\"\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("password"));
    }

    @Test
    void wrongContentTypeAndOversizedBodyAreRejected() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.TEXT_PLAIN)
                .content(loginJson("alice", "AliceDemo123!")))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));

        String oversized = " ".repeat(65_537);
        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(oversized))
                .andExpect(status().isContentTooLarge())
                .andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"));
    }

    @Test
    void rateLimitBlocksSixthFailedAttemptAndReturnsRetryAfter() throws Exception {
        Csrf csrf = csrf();

        for (int attempt = 1; attempt <= 5; attempt++) {
            login(csrf, "alice", "WrongPassword1!", null)
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        }

        login(csrf, "alice", "AliceDemo123!", null)
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER))
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"));

        login(csrf, "bob", "BobDemo1234!", null).andExpect(status().isOk());
    }

    @Test
    void unknownApiPathReturns401WithoutSessionAnd404WithSession() throws Exception {
        mockMvc.perform(get("/api/does-not-exist"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

        Csrf csrf = csrf();
        MvcResult login = login(csrf, "alice", "AliceDemo123!", null)
                .andExpect(status().isOk())
                .andReturn();
        MockHttpSession session = (MockHttpSession) login.getRequest().getSession(false);

        mockMvc.perform(get("/api/does-not-exist").session(session))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void errorTraceIdMatchesRequestIdAndClientValueIsIgnored() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/me")
                .header("X-Request-Id", "client-supplied"))
                .andExpect(status().isUnauthorized())
                .andReturn();

        String requestId = result.getResponse().getHeader("X-Request-Id");
        String traceId = JsonPath.read(result.getResponse().getContentAsString(), "$.traceId");

        assertThat(requestId).matches(REQUEST_ID).isNotEqualTo("client-supplied");
        assertThat(traceId).isEqualTo(requestId);
    }

    @Test
    void healthEndpointIsPublic() throws Exception {
        mockMvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }

    private Csrf csrf() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andReturn();
        return csrfFrom(result.getResponse());
    }

    private Csrf csrfFrom(MockHttpServletResponse response) {
        String header = setCookie(response, "XSRF-TOKEN");
        return new Csrf(cookieValue(header), new Cookie("XSRF-TOKEN", cookieValue(header)));
    }

    private org.springframework.test.web.servlet.ResultActions login(
            Csrf csrf, String username, String password, MockHttpSession session) throws Exception {
        var request = post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .cookie(csrf.cookie())
                .header("X-XSRF-TOKEN", csrf.token())
                .content(loginJson(username, password));
        if (session != null) {
            request.session(session);
        }
        return mockMvc.perform(request);
    }

    private org.springframework.test.web.servlet.ResultActions loginRaw(Csrf csrf, String json)
            throws Exception {
        return mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .cookie(csrf.cookie())
                .header("X-XSRF-TOKEN", csrf.token())
                .content(json));
    }

    private static String loginJson(String username, String password) {
        return "{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}";
    }

    private static String setCookie(MockHttpServletResponse response, String name) {
        return response.getHeaders("Set-Cookie").stream()
                .filter(header -> header.startsWith(name + "="))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Missing cookie " + name));
    }

    private static String cookieValue(String setCookieHeader) {
        int end = setCookieHeader.indexOf(';');
        String pair = end < 0 ? setCookieHeader : setCookieHeader.substring(0, end);
        return pair.substring(pair.indexOf('=') + 1);
    }

    private static String normalizeTraceId(String json) {
        return json.replaceAll("\"traceId\":\"[0-9a-f]{32}\"", "\"traceId\":\"<trace>\"");
    }

    private record Csrf(String token, Cookie cookie) {
    }
}
