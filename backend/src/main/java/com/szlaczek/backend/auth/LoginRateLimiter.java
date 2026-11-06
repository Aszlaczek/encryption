package com.szlaczek.backend.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * In-memory failed-login limiter. The key is the client IP plus the normalized login, so one noisy account cannot lock
 * out other accounts on the same IP. The map is bounded and expired entries are dropped on access.
 */
@Component
public class LoginRateLimiter {

    static final int MAX_FAILURES = 5;
    static final Duration WINDOW = Duration.ofSeconds(60);
    private static final int MAX_TRACKED_KEYS = 10_000;

    private final Clock clock;
    private final Map<Key, Deque<Instant>> failures = new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<Key, Deque<Instant>> eldest) {
            return size() > MAX_TRACKED_KEYS;
        }
    };

    public LoginRateLimiter(Clock clock) {
        this.clock = clock;
    }

    public synchronized void checkAllowed(String ip, String normalizedUsername) {
        Key key = new Key(ip, normalizedUsername);
        Deque<Instant> timestamps = failures.get(key);
        if (timestamps == null) {
            return;
        }

        prune(timestamps);
        if (timestamps.isEmpty()) {
            failures.remove(key);
            return;
        }

        if (timestamps.size() >= MAX_FAILURES) {
            Instant retryAt = timestamps.peekFirst().plus(WINDOW);
            long millisRemaining = Math.max(1, Duration.between(clock.instant(), retryAt).toMillis());
            long retryAfterSeconds = Math.max(1, (millisRemaining + 999) / 1000);
            throw new RateLimitedException(retryAfterSeconds);
        }
    }

    public synchronized void recordFailure(String ip, String normalizedUsername) {
        Key key = new Key(ip, normalizedUsername);
        Deque<Instant> timestamps = failures.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        prune(timestamps);
        timestamps.addLast(clock.instant());
    }

    public synchronized void reset(String ip, String normalizedUsername) {
        failures.remove(new Key(ip, normalizedUsername));
    }

    private void prune(Deque<Instant> timestamps) {
        Instant threshold = clock.instant().minus(WINDOW);
        while (!timestamps.isEmpty() && !timestamps.peekFirst().isAfter(threshold)) {
            timestamps.removeFirst();
        }
    }

    private record Key(String ip, String username) {
    }
}
