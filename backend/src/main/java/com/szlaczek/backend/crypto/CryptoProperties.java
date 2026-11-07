package com.szlaczek.backend.crypto;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Configuration of the single AES-256 key used by the MVP.
 *
 * <p>
 * The key can be supplied either through {@code key-file} (preferred, used by Docker Compose secrets) or through
 * {@code key} (local development and tests). The key material is never included in {@link #toString()}.
 */
@Validated
@ConfigurationProperties(prefix = "app.crypto")
public record CryptoProperties(@NotBlank String keyId, String keyFile, String key) {

    @Override
    public String toString() {
        return "CryptoProperties[keyId=" + keyId + ", keyFile=" + keyFile + ", key=<redacted>]";
    }
}
