package com.szlaczek.backend.message.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.UUID;

/** Message metadata and its canonical encrypted package. */
public record MessageResponse(UUID id, Instant createdAt, @JsonProperty("package") String packageValue) {
}
