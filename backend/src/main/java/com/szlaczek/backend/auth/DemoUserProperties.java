package com.szlaczek.backend.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Demo accounts read from {@code application-local.properties}. The properties bean exists only when the {@code local}
 * profile is active.
 */
@Validated
@ConfigurationProperties(prefix = "app.demo-users")
public record DemoUserProperties(@NotEmpty List<@Valid Account> accounts) {

    public record Account(@NotBlank String username, @NotBlank String password) {
    }
}
