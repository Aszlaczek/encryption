package com.szlaczek.backend.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.security.crypto.password.PasswordEncoder;

class PasswordEncoderConfigTests {

    @Test
    void encodesArgon2idWithPinnedParameters() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext(
                PasswordEncoderConfig.class)) {
            PasswordEncoder encoder = context.getBean(PasswordEncoder.class);
            String hash = encoder.encode("AliceDemo123!");

            assertThat(hash).startsWith("$argon2id$v=19$m=16384,t=2,p=1$");
            assertThat(hash).hasSize(97);
            assertThat(hash).doesNotContain("AliceDemo123!");
            assertThat(encoder.matches("AliceDemo123!", hash)).isTrue();
            assertThat(encoder.matches("AliceDemo123", hash)).isFalse();
            assertThat(encoder.encode("AliceDemo123!")).isNotEqualTo(hash);

            String longPassword = "a".repeat(128);
            String longHash = encoder.encode(longPassword);
            assertThat(encoder.matches(longPassword, longHash)).isTrue();
        }
    }
}
