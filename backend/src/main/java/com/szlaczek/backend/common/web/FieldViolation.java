package com.szlaczek.backend.common.web;

/** One invalid request field in an {@link ApiProblem}. */
public record FieldViolation(String field, String code, String message) {
}
