package com.szlaczek.backend.common.security;

import com.szlaczek.backend.common.web.ApiProblemWriter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.stereotype.Component;

/** Returns 403 problem details; CSRF failures use the stable {@code CSRF_INVALID} code. */
@Component
public class ApiAccessDeniedHandler implements AccessDeniedHandler {

    private final ApiProblemWriter problemWriter;

    public ApiAccessDeniedHandler(ApiProblemWriter problemWriter) {
        this.problemWriter = problemWriter;
    }

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException accessDeniedException)
            throws IOException {
        if (accessDeniedException instanceof CsrfException) {
            problemWriter.write(
                    request,
                    response,
                    HttpStatus.FORBIDDEN,
                    "CSRF_INVALID",
                    "Brak lub nieprawidłowy token CSRF.");
            return;
        }

        problemWriter.write(
                request, response, HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Brak uprawnień do wykonania operacji.");
    }
}
