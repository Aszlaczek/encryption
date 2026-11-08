package com.szlaczek.backend.message;

import java.util.UUID;

/** Owner-scoped lookup did not find a message. */
public final class MessageNotFoundException extends RuntimeException {

    public MessageNotFoundException(UUID id) {
        super("Nie znaleziono wiadomości.");
    }
}
