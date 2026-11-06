package com.szlaczek.backend.common.web;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * RFC 9457 problem details with the stable machine-readable {@code code} used by the API contract.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiProblem(
        String type,
        String title,
        int status,
        String code,
        String detail,
        String instance,
        String traceId,
        List<FieldViolation> errors) {
}
