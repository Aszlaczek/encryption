package com.szlaczek.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class LoginRateLimiterTests {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-06T10:00:00Z"));
    private final LoginRateLimiter limiter = new LoginRateLimiter(clock);

    @Test
    void blocksSixthAttemptAndReportsRetryAfter() {
        for (int attempt = 1; attempt <= LoginRateLimiter.MAX_FAILURES; attempt++) {
            limiter.checkAllowed("203.0.113.1", "alice");
            limiter.recordFailure("203.0.113.1", "alice");
        }

        assertThatThrownBy(() -> limiter.checkAllowed("203.0.113.1", "alice"))
                .isInstanceOfSatisfying(RateLimitedException.class, exception -> {
                    assertThat(exception.getRetryAfterSeconds()).isEqualTo(60);
                });
    }

    @Test
    void allowsAttemptsAgainAfterWindowExpires() {
        for (int attempt = 1; attempt <= LoginRateLimiter.MAX_FAILURES; attempt++) {
            limiter.recordFailure("203.0.113.1", "alice");
        }

        clock.advance(Duration.ofSeconds(61));

        limiter.checkAllowed("203.0.113.1", "alice");
    }

    @Test
    void successfulLoginResetsCounter() {
        for (int attempt = 1; attempt <= 4; attempt++) {
            limiter.recordFailure("203.0.113.1", "alice");
        }

        limiter.reset("203.0.113.1", "alice");

        for (int attempt = 1; attempt <= 5; attempt++) {
            limiter.checkAllowed("203.0.113.1", "alice");
            limiter.recordFailure("203.0.113.1", "alice");
        }

        assertThatThrownBy(() -> limiter.checkAllowed("203.0.113.1", "alice"))
                .isInstanceOf(RateLimitedException.class);
    }

    @Test
    void keysAreIndependentByIpAndNormalizedLogin() {
        for (int attempt = 1; attempt <= LoginRateLimiter.MAX_FAILURES; attempt++) {
            limiter.recordFailure("203.0.113.1", "alice");
        }

        limiter.checkAllowed("203.0.113.1", "bob");
        limiter.checkAllowed("203.0.113.2", "alice");
    }

    @Test
    void onlyFailuresInsideWindowAreCounted() {
        limiter.recordFailure("203.0.113.1", "alice");
        limiter.recordFailure("203.0.113.1", "alice");
        limiter.recordFailure("203.0.113.1", "alice");

        clock.advance(Duration.ofSeconds(61));

        limiter.recordFailure("203.0.113.1", "alice");
        limiter.recordFailure("203.0.113.1", "alice");

        limiter.checkAllowed("203.0.113.1", "alice");
    }

    private static final class MutableClock extends Clock {

        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        private void advance(Duration duration) {
            instant = instant.plus(duration);
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
