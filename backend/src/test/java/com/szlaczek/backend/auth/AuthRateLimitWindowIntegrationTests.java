package com.szlaczek.backend.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Proves the full login path honours the limiter window. A controllable {@link Clock} replaces the real one, so the
 * test never waits 60 seconds.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class AuthRateLimitWindowIntegrationTests {

    private static final String CLIENT_IP = "203.0.113.88";
    private static final String USERNAME = "alice";
    private static final Instant START = Instant.parse("2026-11-06T10:00:00Z");

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private LoginRateLimiter rateLimiter;

    @Autowired
    private MutableClock clock;

    @BeforeEach
    void resetClockAndLimiter() {
        clock.set(START);
        rateLimiter.reset(CLIENT_IP, USERNAME);
    }

    @Test
    void allowsLoginAgainAfterRateLimitWindowExpires() throws Exception {
        Csrf csrf = csrf();

        for (int attempt = 1; attempt <= LoginRateLimiter.MAX_FAILURES; attempt++) {
            login(csrf, "WrongPassword1!")
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        }

        login(csrf, "AliceDemo123!")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string(HttpHeaders.RETRY_AFTER, "60"))
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"));

        clock.advance(LoginRateLimiter.WINDOW.plusSeconds(1));

        login(csrf, "AliceDemo123!")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(USERNAME));
    }

    private Csrf csrf() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/csrf").header("X-Real-IP", CLIENT_IP))
                .andExpect(status().isOk())
                .andReturn();
        String cookieHeader = setCookie(result.getResponse(), "XSRF-TOKEN");
        String token = cookieValue(cookieHeader);
        return new Csrf(token, new Cookie("XSRF-TOKEN", token));
    }

    private ResultActions login(Csrf csrf, String password) throws Exception {
        return mockMvc.perform(post("/api/auth/login")
                .header("X-Real-IP", CLIENT_IP)
                .contentType(MediaType.APPLICATION_JSON)
                .cookie(csrf.cookie())
                .header("X-XSRF-TOKEN", csrf.token())
                .content("{\"username\":\"" + USERNAME + "\",\"password\":\"" + password + "\"}"));
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

    private record Csrf(String token, Cookie cookie) {
    }

    @TestConfiguration
    static class ClockConfiguration {

        @Bean
        @Primary
        MutableClock mutableClock() {
            return new MutableClock(START);
        }
    }

    static final class MutableClock extends Clock {

        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        private void set(Instant instant) {
            this.instant = instant;
        }

        private void advance(Duration duration) {
            this.instant = this.instant.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
