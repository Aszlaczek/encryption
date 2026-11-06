package com.szlaczek.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class AppUserPrincipalTests {

    @Test
    void exposesSessionIdentityWithoutEntity() {
        UUID id = UUID.fromString("8f14e45f-ea0b-4d1c-9b2a-6f7c8d9e0a1b");
        AppUserPrincipal principal = new AppUserPrincipal(id, "alice", "$argon2id$hash", true);

        assertThat(principal.getId()).isEqualTo(id);
        assertThat(principal.getUsername()).isEqualTo("alice");
        assertThat(principal.getPassword()).isEqualTo("$argon2id$hash");
        assertThat(principal.isEnabled()).isTrue();
        assertThat(principal.isAccountNonExpired()).isTrue();
        assertThat(principal.isAccountNonLocked()).isTrue();
        assertThat(principal.isCredentialsNonExpired()).isTrue();
        assertThat(principal.getAuthorities())
                .extracting(authority -> authority.getAuthority())
                .containsExactly("ROLE_USER");
    }

    @Test
    void disabledUserIsReportedAsDisabled() {
        AppUserPrincipal principal = new AppUserPrincipal(UUID.randomUUID(), "disabled", "$argon2id$hash", false);

        assertThat(principal.isEnabled()).isFalse();
    }
}
