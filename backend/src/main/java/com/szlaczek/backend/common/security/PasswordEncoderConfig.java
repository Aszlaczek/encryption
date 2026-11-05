package com.szlaczek.backend.common.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Password hashing configuration.
 *
 * <p>
 * The Argon2id parameters are pinned explicitly instead of relying on a library default, so a dependency upgrade cannot
 * silently change the hash cost. They match Spring Security's v5.8 defaults: 16 B salt, 32 B hash, parallelism 1, 16
 * MiB memory and 2 iterations. A hash encoded with these parameters is 97 characters long and fits the
 * {@code varchar(100)} column.
 */
@Configuration
public class PasswordEncoderConfig {

    static final int SALT_LENGTH_BYTES = 16;
    static final int HASH_LENGTH_BYTES = 32;
    static final int PARALLELISM = 1;
    static final int MEMORY_KIB = 16_384;
    static final int ITERATIONS = 2;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new Argon2PasswordEncoder(
                SALT_LENGTH_BYTES, HASH_LENGTH_BYTES, PARALLELISM, MEMORY_KIB, ITERATIONS);
    }
}
