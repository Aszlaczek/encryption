package com.szlaczek.backend.message.api;

import com.szlaczek.backend.common.web.Codepoints;
import com.szlaczek.backend.common.web.Utf8Bytes;
import jakarta.validation.constraints.NotBlank;

/** Plaintext to encrypt and persist for the authenticated owner. */
public record CreateMessageRequest(
        @NotBlank(message = "Tekst nie może być pusty ani składać się wyłącznie z białych znaków ASCII.") @Codepoints(max = 10_000, message = "Maksymalnie 10 000 punktów kodowych.") @Utf8Bytes(max = 40_000, message = "Maksymalnie 40 000 bajtów UTF-8.") String plaintext) {
}
