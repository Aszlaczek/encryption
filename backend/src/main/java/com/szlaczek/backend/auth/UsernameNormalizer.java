package com.szlaczek.backend.auth;

import java.util.Locale;
import java.util.Objects;

/**
 * Single place for login normalization. The database enforces the same rule through
 * {@code username = lower(btrim(username))}.
 */
public final class UsernameNormalizer {

    private UsernameNormalizer() {
    }

    public static String normalize(String username) {
        return Objects.requireNonNull(username, "username").trim().toLowerCase(Locale.ROOT);
    }
}
