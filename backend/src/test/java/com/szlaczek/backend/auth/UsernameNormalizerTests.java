package com.szlaczek.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class UsernameNormalizerTests {

    @Test
    void trimsAndLowercasesUsingRootLocale() {
        assertThat(UsernameNormalizer.normalize("  Alice  ")).isEqualTo("alice");
        assertThat(UsernameNormalizer.normalize("ALICE")).isEqualTo("alice");
        assertThat(UsernameNormalizer.normalize("Bob")).isEqualTo("bob");
    }

    @Test
    void leavesEmptyInputEmpty() {
        assertThat(UsernameNormalizer.normalize("   ")).isEmpty();
    }

    @Test
    void rejectsNull() {
        assertThatThrownBy(() -> UsernameNormalizer.normalize(null))
                .isInstanceOf(NullPointerException.class);
    }
}
