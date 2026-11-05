package com.szlaczek.backend.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates the public demo accounts when the {@code local} profile is active. The seeder is idempotent and never
 * overwrites an existing account, so a restart does not reset a changed password. Passwords are hashed with Argon2id
 * and never logged.
 */
@Component
@Profile("local")
public class DemoUserSeeder implements ApplicationRunner {

    private static final Logger LOG = LoggerFactory.getLogger(DemoUserSeeder.class);

    private final DemoUserProperties properties;
    private final AppUserRepository appUsers;
    private final PasswordEncoder passwordEncoder;

    public DemoUserSeeder(
            DemoUserProperties properties,
            AppUserRepository appUsers,
            PasswordEncoder passwordEncoder) {
        this.properties = properties;
        this.appUsers = appUsers;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        for (DemoUserProperties.Account account : properties.accounts()) {
            String username = UsernameNormalizer.normalize(account.username());

            if (username.isBlank()) {
                throw new IllegalStateException("Demo account username must not be blank");
            }

            if (appUsers.existsByUsername(username)) {
                LOG.info("Demo user '{}' already exists; not overwriting", username);
                continue;
            }

            appUsers.save(new AppUser(username, passwordEncoder.encode(account.password())));
            LOG.info("Created demo user '{}'", username);
        }
    }
}
