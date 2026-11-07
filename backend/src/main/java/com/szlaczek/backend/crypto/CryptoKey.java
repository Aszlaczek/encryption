package com.szlaczek.backend.crypto;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Objects;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

/**
 * Validated AES-256 key material. Creating an instance fails fast when the configured key is missing, is not valid
 * base64, does not decode to exactly 32 bytes or uses an unknown key identifier.
 */
public record CryptoKey(String keyId, SecretKey secretKey) {

    public static final String SUPPORTED_KEY_ID = "k1";

    public static final int KEY_LENGTH_BYTES = 32;

    public CryptoKey {
        Objects.requireNonNull(keyId, "keyId");
        Objects.requireNonNull(secretKey, "secretKey");
    }

    public static CryptoKey from(CryptoProperties properties) {
        String keyId = normalize(properties.keyId());
        if (!SUPPORTED_KEY_ID.equals(keyId)) {
            throw new IllegalStateException(
                    "Nieznany keyId: " + (keyId.isBlank() ? "(brak)" : keyId) + "; obsługiwany: " + SUPPORTED_KEY_ID);
        }

        String encodedKey = readEncodedKey(properties);
        if (encodedKey.isBlank()) {
            throw new IllegalStateException("Brak klucza AES: ustaw APP_CRYPTO_KEY_FILE lub APP_CRYPTO_KEY");
        }

        byte[] decodedKey;
        try {
            decodedKey = Base64.getDecoder().decode(encodedKey);
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("Klucz AES nie jest poprawnym base64", exception);
        }

        if (decodedKey.length != KEY_LENGTH_BYTES) {
            throw new IllegalStateException(
                    "Klucz AES musi mieć " + KEY_LENGTH_BYTES + " bajty po dekodowaniu base64, otrzymano "
                            + decodedKey.length);
        }

        return new CryptoKey(keyId, new SecretKeySpec(decodedKey, "AES"));
    }

    private static String readEncodedKey(CryptoProperties properties) {
        String keyFile = normalize(properties.keyFile());
        if (!keyFile.isBlank()) {
            Path path = Path.of(keyFile);
            try {
                return Files.readString(path, StandardCharsets.UTF_8).strip();
            } catch (IOException exception) {
                throw new IllegalStateException("Nie można odczytać pliku klucza AES: " + path, exception);
            }
        }
        return normalize(properties.key());
    }

    private static String normalize(String value) {
        return value == null ? "" : value.strip();
    }

    @Override
    public String toString() {
        return "CryptoKey[keyId=" + keyId + "]";
    }
}
