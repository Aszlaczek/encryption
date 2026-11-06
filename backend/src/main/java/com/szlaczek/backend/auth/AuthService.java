package com.szlaczek.backend.auth;

import com.szlaczek.backend.auth.api.LoginRequest;
import com.szlaczek.backend.auth.api.UserResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.InternalAuthenticationServiceException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.stereotype.Service;

/** Coordinates login, session rotation and CSRF rotation after a successful authentication. */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContextRepository;
    private final CookieCsrfTokenRepository csrfTokenRepository;
    private final LoginRateLimiter rateLimiter;
    private final ClientIpResolver clientIpResolver;

    public AuthService(
            AuthenticationManager authenticationManager,
            SecurityContextRepository securityContextRepository,
            CookieCsrfTokenRepository csrfTokenRepository,
            LoginRateLimiter rateLimiter,
            ClientIpResolver clientIpResolver) {
        this.authenticationManager = authenticationManager;
        this.securityContextRepository = securityContextRepository;
        this.csrfTokenRepository = csrfTokenRepository;
        this.rateLimiter = rateLimiter;
        this.clientIpResolver = clientIpResolver;
    }

    public UserResponse login(
            LoginRequest request, HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        String username = request.username();
        String ip = clientIpResolver.resolve(httpRequest);

        rateLimiter.checkAllowed(ip, username);

        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(username, request.password()));
        } catch (InternalAuthenticationServiceException exception) {
            log.error("Authentication backend failure for login '{}'", username, exception);
            throw exception;
        } catch (AuthenticationException exception) {
            rateLimiter.recordFailure(ip, username);
            throw new InvalidCredentialsException();
        }

        rateLimiter.reset(ip, username);
        if (authentication instanceof CredentialsContainer credentialsContainer) {
            credentialsContainer.eraseCredentials();
        }

        rotateSession(httpRequest);
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, httpRequest, httpResponse);

        rotateCsrfToken(httpRequest, httpResponse);

        AppUserPrincipal principal = (AppUserPrincipal) authentication.getPrincipal();
        return UserResponse.from(principal);
    }

    private void rotateSession(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            request.changeSessionId();
        }
    }

    private void rotateCsrfToken(HttpServletRequest request, HttpServletResponse response) {
        csrfTokenRepository.saveToken(
                csrfTokenRepository.generateToken(request), request, response);
    }
}
