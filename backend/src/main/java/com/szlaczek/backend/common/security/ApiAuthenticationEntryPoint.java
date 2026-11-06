package com.szlaczek.backend.common.security;

import com.szlaczek.backend.common.web.ApiProblemWriter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

/** Returns the contract's 401 problem details instead of a redirect or an empty body. */
@Component
public class ApiAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ApiProblemWriter problemWriter;

    public ApiAuthenticationEntryPoint(ApiProblemWriter problemWriter) {
        this.problemWriter = problemWriter;
    }

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authenticationException)
            throws IOException {
        problemWriter.write(
                request,
                response,
                HttpStatus.UNAUTHORIZED,
                "UNAUTHENTICATED",
                "Wymagane jest zalogowanie.");
    }
}
