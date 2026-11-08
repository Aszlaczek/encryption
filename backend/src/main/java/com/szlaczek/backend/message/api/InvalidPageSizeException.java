package com.szlaczek.backend.message.api;

/** List page size is outside the public API contract. */
public final class InvalidPageSizeException extends RuntimeException {

    public InvalidPageSizeException() {
        super("Limit strony musi mieścić się w zakresie 1–50.");
    }
}
