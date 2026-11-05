package com.szlaczek.backend.auth;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Loads application users for Spring Security. The login is normalized here, so callers may pass mixed case and
 * surrounding whitespace. The stored value is already the Argon2id hash.
 */
@Service
public class AppUserDetailsService implements UserDetailsService {

    private final AppUserRepository appUsers;

    public AppUserDetailsService(AppUserRepository appUsers) {
        this.appUsers = appUsers;
    }

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        if (username == null || username.isBlank()) {
            throw new UsernameNotFoundException("Invalid credentials");
        }

        String normalized = UsernameNormalizer.normalize(username);

        AppUser user = appUsers
                .findByUsername(normalized)
                .orElseThrow(() -> new UsernameNotFoundException("Invalid credentials"));

        return User.withUsername(user.getUsername())
                .password(user.getPasswordHash())
                .disabled(!user.isEnabled())
                .roles("USER")
                .build();
    }
}
