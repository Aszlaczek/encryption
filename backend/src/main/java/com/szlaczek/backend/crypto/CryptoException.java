package com.szlaczek.backend.crypto;

import java.util.Objects;

/**
 * Domain exception for cryptography failures. Messages are deliberately generic: they never contain plaintext, a
 * package, ciphertext or key material.
 */
public final class CryptoException extends RuntimeException {

    private final CryptoError error;

    private CryptoException(CryptoError error, String message, Throwable cause) {
        super(message, cause);
        this.error = Objects.requireNonNull(error, "error");
    }

    public static CryptoException invalidPackage() {
        return new CryptoException(CryptoError.INVALID_PACKAGE_FORMAT, "Niepoprawny format pakietu.", null);
    }

    public static CryptoException unsupportedVersion() {
        return new CryptoException(
                CryptoError.UNSUPPORTED_PACKAGE_VERSION, "Nieobsługiwana wersja pakietu.", null);
    }

    public static CryptoException unknownKeyId() {
        return new CryptoException(CryptoError.UNKNOWN_KEY_ID, "Nieznany identyfikator klucza.", null);
    }

    public static CryptoException decryptFailed(Throwable cause) {
        return new CryptoException(CryptoError.DECRYPT_FAILED, "Nie udało się odszyfrować pakietu.", cause);
    }

    public CryptoError error() {
        return error;
    }
}
