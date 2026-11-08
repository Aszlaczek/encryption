package com.szlaczek.backend.crypto;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Creates and validates the application key during startup. The bean is eager, so an invalid or missing key prevents
 * the application from starting.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(CryptoProperties.class)
class CryptoConfiguration {

    private static final Logger log = LoggerFactory.getLogger(CryptoConfiguration.class);

    @Bean
    CryptoKey cryptoKey(CryptoProperties properties) {
        CryptoKey cryptoKey = CryptoKey.from(properties);
        log.info("Crypto key loaded for keyId={} ({} bytes)", cryptoKey.keyId(), CryptoKey.KEY_LENGTH_BYTES);
        return cryptoKey;
    }

    @Bean
    PackageCodec packageCodec() {
        return new PackageCodec();
    }

    @Bean
    CryptoService cryptoService(CryptoKey cryptoKey, PackageCodec packageCodec) {
        return new CryptoService(cryptoKey, packageCodec);
    }
}
