package com.szlaczek.backend.message.api;

import java.time.Instant;
import java.util.UUID;

/** Safe metadata shown in the owner's message list. */
public record MessageSummary(UUID id, Instant createdAt) {
}
