package com.szlaczek.backend.auth.api;

import com.szlaczek.backend.auth.UsernameNormalizer;
import com.szlaczek.backend.common.web.Utf8Bytes;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

/**
 * Login payload. The username is normalized in the compact constructor, so validation and authentication see the same
 * value. The password is never trimmed.
 */
public record LoginRequest(
        @NotBlank(message = "Pole jest wymagane.") @Size(max = 50, message = "Maksymalnie 50 znaków.") String username,
        @NotEmpty(message = "Pole jest wymagane.") @Utf8Bytes(max = 128, message = "Maksymalnie 128 bajtów UTF-8.") String password) {

    public LoginRequest {
        username = username == null ? null : UsernameNormalizer.normalize(username);
    }
}
