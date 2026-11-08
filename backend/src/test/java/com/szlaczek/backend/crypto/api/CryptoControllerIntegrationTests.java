package com.szlaczek.backend.crypto.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
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
class CryptoControllerIntegrationTests {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Test
    void encryptsAndDecryptsForOwnerAndReturnsNoStore() throws Exception {
        Session session = login("alice", "AliceDemo123!");
        String packageValue = encrypt(session, "Zażółć gęślą jaźń 🔐")
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.package").isNotEmpty())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String encryptedPackage = JsonPath.read(packageValue, "$.package");

        mockMvc.perform(post("/api/crypto/decrypt")
                .session(session.session())
                .cookie(session.xsrfCookie())
                .header("X-XSRF-TOKEN", session.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"package\":\"" + encryptedPackage + "\"}"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.plaintext").value("Zażółć gęślą jaźń 🔐"));
    }

    @Test
    void anonymousClientCannotAccessCryptoEndpoints() throws Exception {
        mockMvc.perform(post("/api/crypto/encrypt")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"plaintext\":\"test\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));
    }

    @Test
    void anotherOwnerAndMalformedPackagesProduceControlledErrorsWithoutPlaintext() throws Exception {
        Session alice = login("alice", "AliceDemo123!");
        Session bob = login("bob", "BobDemo1234!");
        String encryptedPackage = JsonPath.read(
                encrypt(alice, "tajny tekst")
                        .andReturn()
                        .getResponse()
                        .getContentAsString(),
                "$.package");

        mockMvc.perform(decryptRequest(bob, encryptedPackage))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("DECRYPT_FAILED"))
                .andExpect(jsonPath("$.plaintext").doesNotExist())
                .andExpect(jsonPath("$.detail").value("Nie udało się odszyfrować pakietu."));

        mockMvc.perform(decryptRequest(alice, "not-a-package"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PACKAGE_FORMAT"))
                .andExpect(jsonPath("$.plaintext").doesNotExist());
    }

    @Test
    void plaintextLimitsAreValidatedByCodePointsAndUtf8Bytes() throws Exception {
        Session session = login("alice", "AliceDemo123!");
        mockMvc.perform(post("/api/crypto/encrypt")
                .session(session.session())
                .cookie(session.xsrfCookie())
                .header("X-XSRF-TOKEN", session.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"plaintext\":\"" + "a".repeat(10_001) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].code").value("TOO_LONG"));

        mockMvc.perform(post("/api/crypto/encrypt")
                .session(session.session())
                .cookie(session.xsrfCookie())
                .header("X-XSRF-TOKEN", session.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"plaintext\":\"" + "😀".repeat(10_000) + "\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void plaintextUtf8ByteBoundaryIsExactAndErrorsDoNotEchoInput() throws Exception {
        Session session = login("alice", "AliceDemo123!");
        mockMvc.perform(post("/api/crypto/encrypt")
                .session(session.session())
                .cookie(session.xsrfCookie())
                .header("X-XSRF-TOKEN", session.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"plaintext\":\"" + "😀".repeat(10_001) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(header().exists("X-Request-Id"))
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_PROBLEM_JSON_VALUE))
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("plaintext"))
                .andExpect(result -> assertThat(result.getResponse().getContentAsString()).doesNotContain("😀"));
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder decryptRequest(
            Session session, String packageValue) {
        return post("/api/crypto/decrypt")
                .session(session.session())
                .cookie(session.xsrfCookie())
                .header("X-XSRF-TOKEN", session.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"package\":\"" + packageValue + "\"}");
    }

    private org.springframework.test.web.servlet.ResultActions encrypt(Session session, String plaintext)
            throws Exception {
        return mockMvc.perform(post("/api/crypto/encrypt")
                .session(session.session())
                .cookie(session.xsrfCookie())
                .header("X-XSRF-TOKEN", session.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"plaintext\":\"" + plaintext + "\"}"));
    }

    private Session login(String username, String password) throws Exception {
        MvcResult csrf = mockMvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        String token = JsonPath.read(csrf.getResponse().getContentAsString(), "$.token");
        Cookie csrfCookie = new Cookie("XSRF-TOKEN", token);
        MvcResult login = mockMvc.perform(post("/api/auth/login")
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        MockHttpSession session = (MockHttpSession) login.getRequest().getSession(false);
        assertThat(session).isNotNull();
        Cookie rotatedCookie = cookie(login, "XSRF-TOKEN");
        String rotatedToken = cookieValue(login, "XSRF-TOKEN");
        return new Session(session, rotatedCookie, rotatedToken);
    }

    private static Cookie cookie(MvcResult result, String name) {
        return result.getResponse().getCookies().length == 0
                ? new Cookie(name, "")
                : java.util.Arrays.stream(result.getResponse().getCookies())
                        .filter(cookie -> name.equals(cookie.getName()))
                        .findFirst()
                        .orElseThrow();
    }

    private static String cookieValue(MvcResult result, String name) {
        return cookie(result, name).getValue();
    }

    private record Session(MockHttpSession session, Cookie xsrfCookie, String token) {
    }
}
