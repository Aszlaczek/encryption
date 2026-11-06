package com.szlaczek.backend.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

/**
 * Resolves the client IP for the login limiter. In the deployed topology the backend is not published and nginx sets
 * {@code X-Real-IP}; outside Compose the servlet remote address is authoritative.
 */
@Component
public class ClientIpResolver {

    static final String TRUSTED_PROXY_HEADER = "X-Real-IP";
    private static final int MAX_IP_LENGTH = 64;

    public String resolve(HttpServletRequest request) {
        String forwarded = request.getHeader(TRUSTED_PROXY_HEADER);
        if (forwarded != null) {
            String candidate = forwarded.trim();
            if (!candidate.isEmpty() && candidate.length() <= MAX_IP_LENGTH) {
                return candidate;
            }
        }

        return request.getRemoteAddr();
    }
}
