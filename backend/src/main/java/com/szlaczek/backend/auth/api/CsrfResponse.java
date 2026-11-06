package com.szlaczek.backend.auth.api;

/** CSRF token metadata returned by {@code GET /api/auth/csrf}. */
public record CsrfResponse(String token, String headerName, String cookieName) {
}
