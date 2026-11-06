package com.szlaczek.backend.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.stereotype.Service;

/** Invalidates only the current server-side session and removes both API cookies. */
@Service
public class LogoutService {

    private final CookieCsrfTokenRepository csrfTokenRepository;
    private final String sessionCookieName;
    private final boolean secureCookie;

    public LogoutService(
            CookieCsrfTokenRepository csrfTokenRepository,
            @Value("${server.servlet.session.cookie.name:JSESSIONID}") String sessionCookieName,
            @Value("${server.servlet.session.cookie.secure:false}") boolean secureCookie) {
        this.csrfTokenRepository = csrfTokenRepository;
        this.sessionCookieName = sessionCookieName;
        this.secureCookie = secureCookie;
    }

    public void logout(HttpServletRequest request, HttpServletResponse response) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }

        SecurityContextHolder.clearContext();
        csrfTokenRepository.saveToken(null, request, response);

        ResponseCookie clearedSession = ResponseCookie.from(sessionCookieName, "")
                .httpOnly(true)
                .secure(secureCookie)
                .path("/")
                .sameSite("Lax")
                .maxAge(Duration.ZERO)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, clearedSession.toString());
    }
}
