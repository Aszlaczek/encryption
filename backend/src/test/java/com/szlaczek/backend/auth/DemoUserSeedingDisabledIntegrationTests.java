package com.szlaczek.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.ApplicationContext;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
@SpringBootTest
class DemoUserSeedingDisabledIntegrationTests {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");

    @Autowired
    private AppUserRepository appUsers;

    @Autowired
    private UserDetailsService userDetailsService;

    @Autowired
    private ApplicationContext context;

    @Test
    void doesNotCreateDemoAccountsWithoutLocalProfile() {
        assertThat(context.getBeansOfType(DemoUserSeeder.class)).isEmpty();
        assertThat(appUsers.count()).isZero();
        assertThat(appUsers.findByUsername("alice")).isEmpty();
        assertThat(appUsers.findByUsername("bob")).isEmpty();
    }

    @Test
    void userDetailsServiceCannotFindDemoAccounts() {
        assertThatThrownBy(() -> userDetailsService.loadUserByUsername("alice"))
                .isInstanceOf(UsernameNotFoundException.class);
        assertThatThrownBy(() -> userDetailsService.loadUserByUsername("  ALICE  "))
                .isInstanceOf(UsernameNotFoundException.class);
    }
}
