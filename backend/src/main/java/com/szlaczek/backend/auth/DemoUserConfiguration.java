package com.szlaczek.backend.auth;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("local")
@EnableConfigurationProperties(DemoUserProperties.class)
class DemoUserConfiguration {
}
