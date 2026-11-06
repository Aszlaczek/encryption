package com.szlaczek.backend.common.web;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Builds problem details in one place, so security filters and MVC handlers produce the same shape.
 */
@Component
public class ApiProblemFactory {

    public ApiProblem problem(
            HttpStatus status, String code, String detail, HttpServletRequest request) {
        return problem(status, code, detail, request, null);
    }

    public ApiProblem problem(
            HttpStatus status,
            String code,
            String detail,
            HttpServletRequest request,
            List<FieldViolation> errors) {
        return new ApiProblem(
                "about:blank",
                status.getReasonPhrase(),
                status.value(),
                code,
                detail,
                request.getRequestURI(),
                traceId(request),
                errors);
    }

    private String traceId(HttpServletRequest request) {
        Object traceId = request.getAttribute(ApiRequestHeadersFilter.TRACE_ID_ATTRIBUTE);

        if (traceId instanceof String value && !value.isBlank()) {
            return value;
        }

        return UUID.randomUUID().toString().replace("-", "");
    }
}
