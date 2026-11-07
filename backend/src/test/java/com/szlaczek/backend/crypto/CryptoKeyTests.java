package com.szlaczek.backend.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CryptoKeyTests {

    private static final byte[] KEY_BYTES = "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.US_ASCII);
    private static final String KEY = Base64.getEncoder().encodeToString(KEY_BYTES);
    private static final String OTHER_KEY = Base64.getEncoder()
            .encodeToString("fedcba9876543210fedcba9876543210".getBytes(StandardCharsets.US_ASCII));

    @TempDir
    private Path tempDir;

    @Test
    void loadsInlineKey() {
        CryptoKey key = CryptoKey.from(new CryptoProperties("k1", null, KEY));

        assertThat(key.keyId()).isEqualTo("k1");
        assertThat(key.secretKey().getAlgorithm()).isEqualTo("AES");
        assertThat(key.secretKey().getEncoded()).isEqualTo(KEY_BYTES);
    }

    @Test
    void loadsFileAndIgnoresTrailingNewline() throws IOException {
        Path keyFile = tempDir.resolve("crypto.key");
        Files.writeString(keyFile, KEY + "\n", StandardCharsets.UTF_8);

        CryptoKey key = CryptoKey.from(new CryptoProperties("k1", keyFile.toString(), null));

        assertThat(key.secretKey().getEncoded()).isEqualTo(KEY_BYTES);
    }

    @Test
    void fileTakesPrecedenceOverInlineKey() throws IOException {
        Path keyFile = tempDir.resolve("crypto.key");
        Files.writeString(keyFile, KEY, StandardCharsets.UTF_8);

        CryptoKey key = CryptoKey.from(new CryptoProperties("k1", keyFile.toString(), OTHER_KEY));

        assertThat(key.secretKey().getEncoded()).isEqualTo(KEY_BYTES);
    }

    @Test
    void rejectsMissingKey() {
        assertThatThrownBy(() -> CryptoKey.from(new CryptoProperties("k1", null, null)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Brak klucza AES");
    }

    @Test
    void rejectsInvalidBase64() {
        assertThatThrownBy(() -> CryptoKey.from(new CryptoProperties("k1", null, "not base64!")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("nie jest poprawnym base64");
    }

    @Test
    void rejectsSixteenByteKey() {
        String shortKey = Base64.getEncoder().encodeToString(new byte[16]);

        assertThatThrownBy(() -> CryptoKey.from(new CryptoProperties("k1", null, shortKey)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32 bajty")
                .hasMessageContaining("otrzymano 16");
    }

    @Test
    void rejectsThirtyThreeByteKey() {
        String longKey = Base64.getEncoder().encodeToString(new byte[33]);

        assertThatThrownBy(() -> CryptoKey.from(new CryptoProperties("k1", null, longKey)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32 bajty")
                .hasMessageContaining("otrzymano 33");
    }

    @Test
    void rejectsUnknownKeyId() {
        assertThatThrownBy(() -> CryptoKey.from(new CryptoProperties("k2", null, KEY)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Nieznany keyId: k2")
                .hasMessageContaining("k1");
    }

    @Test
    void rejectsMissingFile() {
        Path missing = tempDir.resolve("missing.key");

        assertThatThrownBy(() -> CryptoKey.from(new CryptoProperties("k1", missing.toString(), null)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Nie można odczytać pliku klucza AES");
    }

    @Test
    void doesNotExposeKeyMaterialInToString() {
        CryptoProperties properties = new CryptoProperties("k1", null, KEY);
        CryptoKey key = CryptoKey.from(properties);

        assertThat(properties.toString()).doesNotContain(KEY).contains("key=<redacted>");
        assertThat(key.toString()).doesNotContain(KEY).contains("keyId=k1");
    }
}
