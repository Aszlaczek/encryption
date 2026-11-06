package com.szlaczek.backend.common.web;

import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;

/**
 * Tightens JSON parsing for every REST controller: unknown properties are rejected instead of silently ignored, and
 * duplicate keys are malformed input rather than "last one wins".
 */
@Configuration
public class JacksonConfig {

    @Bean
    public JsonMapperBuilderCustomizer strictJsonMapperBuilderCustomizer() {
        return builder -> builder
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION);
    }
}
