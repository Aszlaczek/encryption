package com.szlaczek.backend.crypto;

/**
 * Stable, transport-neutral reasons for cryptography failures. Controllers will map these to the HTTP error codes
 * defined in {@code docs/API.md}; the cryptography package itself does not depend on HTTP.
 */
public enum CryptoError {
    INVALID_PACKAGE_FORMAT, UNSUPPORTED_PACKAGE_VERSION, UNKNOWN_KEY_ID, DECRYPT_FAILED
}
