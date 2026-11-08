package com.szlaczek.backend.message;

/** Persisted envelope could not be authenticated or decoded. */
public final class MessageUndecryptableException extends RuntimeException {

    public MessageUndecryptableException(Throwable cause) {
        super("Nie można odszyfrować zapisanej wiadomości.", cause);
    }
}
