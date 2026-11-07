package com.szlaczek.backend.crypto;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class CryptoKeyStartupTests {

    private static final String KEY = Base64.getEncoder()
            .encodeToString("0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.US_ASCII));

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(CryptoConfiguration.class)
            .withPropertyValues("app.crypto.key-id=k1");

    @Test
    void startsWithValidKey() {
        runner.withPropertyValues("app.crypto.key=" + KEY).run(context -> {
            assertThat(context.getStartupFailure()).isNull();
            assertThat(context.getBean(CryptoKey.class).secretKey().getEncoded()).hasSize(32);
        });
    }

    @Test
    void failsWhenKeyIsMissing() {
        runner.run(context -> {
            assertThat(context.getStartupFailure()).isNotNull();
            assertThat(messageChainContains(context.getStartupFailure(), "Brak klucza AES")).isTrue();
        });
    }

    @Test
    void failsWhenKeyIsNotValidBase64() {
        runner.withPropertyValues("app.crypto.key=not base64!").run(context -> {
            assertThat(context.getStartupFailure()).isNotNull();
            assertThat(messageChainContains(context.getStartupFailure(), "nie jest poprawnym base64"))
                    .isTrue();
        });
    }

    @Test
    void failsWhenKeyHasWrongLength() {
        String shortKey = Base64.getEncoder().encodeToString(new byte[16]);
        runner.withPropertyValues("app.crypto.key=" + shortKey).run(context -> {
            assertThat(context.getStartupFailure()).isNotNull();
            assertThat(messageChainContains(context.getStartupFailure(), "32 bajty")).isTrue();
        });
    }

    @Test
    void failsWhenKeyIdIsUnknown() {
        runner.withPropertyValues("app.crypto.key-id=k2", "app.crypto.key=" + KEY).run(context -> {
            assertThat(context.getStartupFailure()).isNotNull();
            assertThat(messageChainContains(context.getStartupFailure(), "Nieznany keyId: k2"))
                    .isTrue();
        });
    }

    private static boolean messageChainContains(Throwable throwable, String fragment) {
        Throwable current = throwable;
        while (current != null) {
            if (current.getMessage() != null && current.getMessage().contains(fragment)) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }
}
