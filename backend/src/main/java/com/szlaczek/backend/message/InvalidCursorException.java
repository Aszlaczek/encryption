package com.szlaczek.backend.message;

/** Invalid cursor input without exposing the supplied value. */
public final class InvalidCursorException extends RuntimeException {

    public InvalidCursorException() {
        super("Niepoprawny kursor paginacji.");
    }
}
