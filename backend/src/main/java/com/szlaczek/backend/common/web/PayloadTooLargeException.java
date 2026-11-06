package com.szlaczek.backend.common.web;

import java.io.IOException;

/**
 * Raised while reading a request body that exceeds the API limit. It is an {@link IOException} so servlet and Jackson
 * plumbing propagate it without special handling.
 */
public class PayloadTooLargeException extends IOException {

    public PayloadTooLargeException(String message) {
        super(message);
    }
}
