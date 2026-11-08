package com.szlaczek.backend.message.api;

/** Message path id is not a canonical UUID. */
public final class InvalidMessageIdException extends RuntimeException {

    public InvalidMessageIdException() {
        super("Niepoprawny identyfikator wiadomości.");
    }
}
