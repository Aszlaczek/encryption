package com.szlaczek.backend.crypto.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Encoded package to decrypt for the authenticated session owner. */
public record DecryptPackageRequest(
        @JsonProperty("package") @NotBlank(message = "Pakiet jest wymagany.") @Size(max = 56_000, message = "Maksymalnie 56 000 znaków.") String packageValue) {
}
