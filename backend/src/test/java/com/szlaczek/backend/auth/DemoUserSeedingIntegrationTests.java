package com.szlaczek.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
@SpringBootTest
@ActiveProfiles("local")
class DemoUserSeedingIntegrationTests {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");

    @Autowired
    private AppUserRepository appUsers;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private UserDetailsService userDetailsService;

    @Autowired
    private DemoUserSeeder demoUserSeeder;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void createsExactlyTwoDemoAccountsWithArgon2Hashes() {
        assertThat(appUsers.count()).isEqualTo(2);
        assertThat(appUsers.findAll())
                .extracting(AppUser::getUsername)
                .containsExactlyInAnyOrder("alice", "bob");

        assertArgon2Hash("alice", "AliceDemo123!");
        assertArgon2Hash("bob", "BobDemo1234!");
    }

    @Test
    void matchesCorrectPasswordsAndRejectsWrongOnes() {
        UserDetails alice = userDetailsService.loadUserByUsername("  ALICE  ");

        assertThat(alice.getUsername()).isEqualTo("alice");
        assertThat(alice.isEnabled()).isTrue();
        assertThat(passwordEncoder.matches("AliceDemo123!", alice.getPassword())).isTrue();
        assertThat(passwordEncoder.matches("AliceDemo123", alice.getPassword())).isFalse();
        assertThat(passwordEncoder.matches("BobDemo1234!", alice.getPassword())).isFalse();

        UserDetails bob = userDetailsService.loadUserByUsername("bob");

        assertThat(bob.getUsername()).isEqualTo("bob");
        assertThat(passwordEncoder.matches("BobDemo1234!", bob.getPassword())).isTrue();
        assertThat(passwordEncoder.matches("AliceDemo123!", bob.getPassword())).isFalse();
    }

    @Test
    @Transactional
    void seedingIsIdempotentAndDoesNotOverwriteChangedPasswords() throws Exception {
        String replacementHash = passwordEncoder.encode("ChangedPassword1!");
        jdbcTemplate.update(
                "update app_users set password_hash = ? where username = ?", replacementHash, "alice");

        demoUserSeeder.run(new DefaultApplicationArguments(new String[0]));

        assertThat(appUsers.count()).isEqualTo(2);
        assertThat(passwordHash("alice")).isEqualTo(replacementHash);
        assertThat(passwordHash("bob")).startsWith("$argon2id$");
    }

    @Test
    void databaseContainsHashesOnly() {
        assertThat(jdbcTemplate.queryForList(
                "select column_name from information_schema.columns "
                        + "where table_schema = 'public' and table_name = 'app_users'",
                String.class))
                .doesNotContain("password", "plaintext");

        List<String> hashes = jdbcTemplate.queryForList(
                "select password_hash from app_users", String.class);

        assertThat(hashes).hasSize(2);
        assertThat(hashes).allSatisfy(hash -> {
            assertThat(hash).startsWith("$argon2id$");
            assertThat(hash).doesNotContain("AliceDemo123!", "BobDemo1234!");
        });
    }

    private void assertArgon2Hash(String username, String plaintext) {
        String hash = passwordHash(username);

        assertThat(hash).startsWith("$argon2id$v=19$m=16384,t=2,p=1$");
        assertThat(hash).hasSize(97);
        assertThat(hash).doesNotContain(plaintext);
        assertThat(passwordEncoder.matches(plaintext, hash)).isTrue();
        assertThat(passwordEncoder.matches(plaintext + "x", hash)).isFalse();
    }

    private String passwordHash(String username) {
        return jdbcTemplate.queryForObject(
                "select password_hash from app_users where username = ?", String.class, username);
    }
}
