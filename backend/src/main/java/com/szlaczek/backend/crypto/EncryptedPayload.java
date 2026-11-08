package com.szlaczek.backend.crypto;

import java.util.Objects;

/**
 * Encrypted message payload. The arrays are copied on construction and on every access, so callers cannot mutate the
 * stored envelope. The class deliberately has no dependency on HTTP or persistence.
 */
public record EncryptedPayload(short formatVersion, String keyId, byte[] nonce, byte[] ciphertext, byte[] tag) {

    public EncryptedPayload {
        keyId = Objects.requireNonNull(keyId, "keyId");
        nonce = copyOf(nonce, "nonce");
        ciphertext = copyOf(ciphertext, "ciphertext");
        tag = copyOf(tag, "tag");
    }

    @Override
    public byte[] nonce() {
        return nonce.clone();
    }

    @Override
    public byte[] ciphertext() {
        return ciphertext.clone();
    }

    @Override
    public byte[] tag() {
        return tag.clone();
    }

    private static byte[] copyOf(byte[] value, String name) {
        Objects.requireNonNull(value, name);
        return value.clone();
    }

    @Override
    public String toString() {
        return "EncryptedPayload[formatVersion=" + formatVersion + ", keyId=" + keyId + ", nonce=" + nonce.length
                + "B, ciphertext=" + ciphertext.length + "B, tag=" + tag.length + "B]";
    }
}
