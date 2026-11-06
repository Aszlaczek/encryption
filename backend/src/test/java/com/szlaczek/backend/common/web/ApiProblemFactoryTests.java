package com.szlaczek.backend.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

class ApiProblemFactoryTests {

    private final ApiProblemFactory factory = new ApiProblemFactory();

    @Test
    void buildsRfc9457ProblemFromRequestTraceId() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/messages");
        request.setQueryString("ownerId=someone-else");
        request.setAttribute(ApiRequestHeadersFilter.TRACE_ID_ATTRIBUTE, "b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b");

        ApiProblem problem = factory.problem(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_FAILED",
                "Żądanie zawiera nieobsługiwane pole.",
                request,
                List.of(new FieldViolation("ownerId", "UNKNOWN_FIELD", "Pole nie jest obsługiwane.")));

        assertThat(problem.type()).isEqualTo("about:blank");
        assertThat(problem.title()).isEqualTo("Bad Request");
        assertThat(problem.status()).isEqualTo(400);
        assertThat(problem.code()).isEqualTo("VALIDATION_FAILED");
        assertThat(problem.instance()).isEqualTo("/api/messages");
        assertThat(problem.traceId()).isEqualTo("b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b");
        assertThat(problem.errors()).containsExactly(
                new FieldViolation("ownerId", "UNKNOWN_FIELD", "Pole nie jest obsługiwane."));
    }

    @Test
    void generatesTraceIdWhenFilterDidNotRun() {
        ApiProblem problem = factory.problem(
                HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Wymagane jest zalogowanie.",
                new MockHttpServletRequest("GET", "/api/auth/me"));

        assertThat(problem.traceId()).matches("[0-9a-f]{32}");
        assertThat(problem.errors()).isNull();
    }
}
