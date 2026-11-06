package com.szlaczek.backend.common.web;

import com.szlaczek.backend.auth.InvalidCredentialsException;
import com.szlaczek.backend.auth.RateLimitedException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import tools.jackson.databind.exc.UnrecognizedPropertyException;

/** Turns MVC and Jackson failures into the RFC 9457 shape defined by {@code docs/API.md}. */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    private final ApiProblemFactory problemFactory;

    public ApiExceptionHandler(ApiProblemFactory problemFactory) {
        this.problemFactory = problemFactory;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiProblem> handleValidation(
            MethodArgumentNotValidException exception, HttpServletRequest request) {
        List<FieldViolation> violations = exception.getBindingResult().getFieldErrors().stream()
                .sorted(Comparator.comparing(FieldError::getField))
                .map(this::violation)
                .toList();

        String detail = violations.size() == 1
                ? "Pole '" + violations.get(0).field() + "' jest nieprawidłowe."
                : "Żądanie zawiera nieprawidłowe pola.";

        return problem(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", detail, request, violations);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiProblem> handleNotReadable(
            HttpMessageNotReadableException exception, HttpServletRequest request) {
        if (containsCause(exception, PayloadTooLargeException.class)) {
            return payloadTooLarge(request);
        }

        UnrecognizedPropertyException unknownProperty = findCause(exception, UnrecognizedPropertyException.class);
        if (unknownProperty != null) {
            String field = unknownProperty.getPropertyName();
            FieldViolation violation = new FieldViolation(
                    field,
                    "UNKNOWN_FIELD",
                    "Pole nie jest obsługiwane; właściciel pochodzi z sesji.");
            return problem(
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_FAILED",
                    "Żądanie zawiera nieobsługiwane pole.",
                    request,
                    List.of(violation));
        }

        return problem(HttpStatus.BAD_REQUEST, "MALFORMED_JSON", "Niepoprawny JSON.", request);
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiProblem> handleUnsupportedMediaType(
            HttpMediaTypeNotSupportedException exception, HttpServletRequest request) {
        return problem(
                HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                "UNSUPPORTED_MEDIA_TYPE",
                "Wymagany jest Content-Type: application/json w UTF-8.",
                request);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiProblem> handleMethodNotAllowed(
            HttpRequestMethodNotSupportedException exception, HttpServletRequest request) {
        ResponseEntity<ApiProblem> response = problem(
                HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", "Metoda nie jest obsługiwana dla tej ścieżki.",
                request);
        Set<org.springframework.http.HttpMethod> methods = exception.getSupportedHttpMethods();
        if (methods == null || methods.isEmpty()) {
            return response;
        }

        String allow = methods.stream().map(method -> method.name()).sorted().collect(Collectors.joining(", "));
        return ResponseEntity.status(response.getStatusCode())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.ALLOW, allow)
                .body(response.getBody());
    }

    @ExceptionHandler({NoResourceFoundException.class, org.springframework.web.servlet.NoHandlerFoundException.class})
    public ResponseEntity<ApiProblem> handleNotFound(Exception exception, HttpServletRequest request) {
        return problem(HttpStatus.NOT_FOUND, "NOT_FOUND", "Nie znaleziono zasobu.", request);
    }

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<ApiProblem> handleInvalidCredentials(
            InvalidCredentialsException exception, HttpServletRequest request) {
        return problem(
                HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Nieprawidłowy login lub hasło.", request);
    }

    @ExceptionHandler(RateLimitedException.class)
    public ResponseEntity<ApiProblem> handleRateLimited(
            RateLimitedException exception, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.RETRY_AFTER, Long.toString(exception.getRetryAfterSeconds()))
                .body(problemFactory.problem(
                        HttpStatus.TOO_MANY_REQUESTS,
                        "RATE_LIMITED",
                        "Zbyt wiele żądań. Spróbuj ponownie później.",
                        request));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiProblem> handleUnexpected(Exception exception, HttpServletRequest request) {
        Object traceId = request.getAttribute(ApiRequestHeadersFilter.TRACE_ID_ATTRIBUTE);
        log.error(
                "Unhandled error for {} {} (traceId={})",
                request.getMethod(),
                request.getRequestURI(),
                traceId,
                exception);
        return problem(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "Wystąpił nieoczekiwany błąd. Skontaktuj się z administratorem, podając traceId.",
                request);
    }

    private ResponseEntity<ApiProblem> payloadTooLarge(HttpServletRequest request) {
        return problem(
                HttpStatus.CONTENT_TOO_LARGE,
                "PAYLOAD_TOO_LARGE",
                "Żądanie przekracza 65 536 bajtów.",
                request);
    }

    private ResponseEntity<ApiProblem> problem(
            HttpStatus status,
            String code,
            String detail,
            HttpServletRequest request) {
        return problem(status, code, detail, request, null);
    }

    private ResponseEntity<ApiProblem> problem(
            HttpStatus status,
            String code,
            String detail,
            HttpServletRequest request,
            List<FieldViolation> errors) {
        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(problemFactory.problem(status, code, detail, request, errors));
    }

    private FieldViolation violation(FieldError error) {
        String code = switch (error.getCode() == null ? "" : error.getCode()) {
            case "NotNull" -> "REQUIRED";
            case "NotEmpty" -> error.getRejectedValue() == null ? "REQUIRED" : "TOO_SHORT";
            case "NotBlank" -> error.getRejectedValue() == null ? "REQUIRED" : "BLANK";
            case "Size" -> "TOO_LONG";
            case "Utf8Bytes" -> "TOO_MANY_BYTES";
            default -> "INVALID_FORMAT";
        };
        String message = error.getDefaultMessage() == null
                ? "Nieprawidłowa wartość."
                : error.getDefaultMessage();
        return new FieldViolation(error.getField(), code, message);
    }

    private static <T extends Throwable> T findCause(Throwable throwable, Class<T> type) {
        Throwable current = throwable;
        while (current != null) {
            if (type.isInstance(current)) {
                return type.cast(current);
            }
            current = current.getCause();
        }
        return null;
    }

    private static boolean containsCause(Throwable throwable, Class<? extends Throwable> type) {
        return findCause(throwable, type) != null;
    }
}
