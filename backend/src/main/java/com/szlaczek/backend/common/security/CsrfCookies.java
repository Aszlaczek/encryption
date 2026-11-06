package com.szlaczek.backend.common.security;

/** Cookie and header names fixed by the public API contract. */
public final class CsrfCookies {

    public static final String COOKIE_NAME = "XSRF-TOKEN";
    public static final String HEADER_NAME = "X-XSRF-TOKEN";

    private CsrfCookies() {
    }
}
