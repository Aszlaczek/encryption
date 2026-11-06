package com.szlaczek.backend.auth;

/**
 * Raised for wrong credentials, an unknown login and a disabled account alike, so responses cannot distinguish them.
 */
public class InvalidCredentialsException extends RuntimeException {

    public InvalidCredentialsException() {
        super("Invalid credentials");
    }
}
