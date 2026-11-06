package com.szlaczek.backend.common.security;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

/**
 * Enforces the contract order "401 before 403": anonymous unsafe requests are allowed through CSRF validation so the
 * authorization filter can answer {@code 401}. Login always requires CSRF, even without a session. Authenticated unsafe
 * requests require CSRF.
 */
public final class ApiCsrfRequestMatcher implements RequestMatcher {

    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

    private static final RequestMatcher LOGIN = PathPatternRequestMatcher.pathPattern(HttpMethod.POST,
            "/api/auth/login");

    @Override
    public boolean matches(HttpServletRequest request) {
        if (SAFE_METHODS.contains(request.getMethod())) {
            return false;
        }

        if (LOGIN.matches(request)) {
            return true;
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null
                && authentication.isAuthenticated()
                && !(authentication instanceof AnonymousAuthenticationToken);
    }
}
