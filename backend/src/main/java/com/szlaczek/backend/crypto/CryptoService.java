package com.szlaczek.backend.crypto;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Objects;
import java.util.UUID;
import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Stateless AES-256-GCM service. It depends only on the validated {@link CryptoKey} and {@link PackageCodec}; it has no
 * HTTP or persistence dependency.
 *
 * <p>
 * Every operation creates a fresh {@link Cipher} instance. A shared {@link SecureRandom} is used only to generate a new
 * 12-byte nonce for every encryption.
 */
public final class CryptoService {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int TAG_BITS = 128;
    private static final int MAX_PLAINTEXT_BYTES = PackageCodec.MAX_CIPHERTEXT_BYTES;

    private final CryptoKey cryptoKey;
    private final PackageCodec packageCodec;
    private final SecureRandom secureRandom;

    public CryptoService(CryptoKey cryptoKey, PackageCodec packageCodec) {
        this.cryptoKey = Objects.requireNonNull(cryptoKey, "cryptoKey");
        this.packageCodec = Objects.requireNonNull(packageCodec, "packageCodec");
        this.secureRandom = new SecureRandom();
    }

    /**
     * Encrypts UTF-8 plaintext with a fresh nonce and returns the encrypted fields. Use {@link #encryptPackage} when
     * the result should be a transport package.
     */
    public EncryptedPayload encrypt(String plaintext, UUID ownerId) {
        Objects.requireNonNull(ownerId, "ownerId");
        byte[] nonce = new byte[PackageCodec.NONCE_BYTES];
        secureRandom.nextBytes(nonce);
        return encryptWithNonce(plaintext, ownerId, nonce);
    }

    public String encryptPackage(String plaintext, UUID ownerId) {
        return packageCodec.encode(encrypt(plaintext, ownerId));
    }

    public String decryptPackage(String packageValue, UUID ownerId) {
        return decrypt(packageCodec.decode(packageValue), ownerId);
    }

    /**
     * Decrypts fields that may come from the database. The whole ciphertext and tag are passed to {@code doFinal}, so
     * no plaintext is exposed before GCM verifies the tag.
     */
    public String decrypt(EncryptedPayload payload, UUID ownerId) {
        Objects.requireNonNull(ownerId, "ownerId");
        packageCodec.validate(payload);
        if (!cryptoKey.keyId().equals(payload.keyId())) {
            throw CryptoException.unknownKeyId();
        }

        byte[] nonce = payload.nonce();
        byte[] ciphertext = payload.ciphertext();
        byte[] tag = payload.tag();
        byte[] ciphertextWithTag = new byte[ciphertext.length + tag.length];
        System.arraycopy(ciphertext, 0, ciphertextWithTag, 0, ciphertext.length);
        System.arraycopy(tag, 0, ciphertextWithTag, ciphertext.length, tag.length);

        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, cryptoKey.secretKey(), new GCMParameterSpec(TAG_BITS, nonce));
            cipher.updateAAD(aad(ownerId, payload.keyId()));
            byte[] plaintext = cipher.doFinal(ciphertextWithTag);
            return new String(plaintext, StandardCharsets.UTF_8);
        } catch (AEADBadTagException exception) {
            throw CryptoException.decryptFailed(exception);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Nie można odszyfrować wiadomości.", exception);
        }
    }

    /**
     * Package-private seam used by the deterministic test vector. Production callers must use {@link #encrypt}, which
     * always generates a fresh nonce.
     */
    EncryptedPayload encryptWithNonce(String plaintext, UUID ownerId, byte[] nonce) {
        Objects.requireNonNull(plaintext, "plaintext");
        Objects.requireNonNull(ownerId, "ownerId");
        Objects.requireNonNull(nonce, "nonce");
        if (nonce.length != PackageCodec.NONCE_BYTES) {
            throw new IllegalArgumentException("Nonce musi mieć 12 bajtów.");
        }

        byte[] plaintextBytes = plaintext.getBytes(StandardCharsets.UTF_8);
        if (plaintextBytes.length == 0) {
            throw new IllegalArgumentException("Plaintext nie może być pusty.");
        }
        if (plaintextBytes.length > MAX_PLAINTEXT_BYTES) {
            throw new IllegalArgumentException("Plaintext przekracza 40000 bajtów UTF-8.");
        }

        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, cryptoKey.secretKey(), new GCMParameterSpec(TAG_BITS, nonce));
            cipher.updateAAD(aad(ownerId, cryptoKey.keyId()));
            byte[] ciphertextWithTag = cipher.doFinal(plaintextBytes);
            int ciphertextLength = ciphertextWithTag.length - PackageCodec.TAG_BYTES;
            if (ciphertextLength < 1) {
                throw new IllegalStateException("Nieoczekiwany wynik szyfrowania AES-GCM.");
            }

            byte[] ciphertext = Arrays.copyOfRange(ciphertextWithTag, 0, ciphertextLength);
            byte[] tag = Arrays.copyOfRange(ciphertextWithTag, ciphertextLength, ciphertextWithTag.length);
            EncryptedPayload payload = new EncryptedPayload(
                    PackageCodec.FORMAT_VERSION, cryptoKey.keyId(), nonce, ciphertext, tag);
            packageCodec.validate(payload);
            return payload;
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Nie można zaszyfrować wiadomości.", exception);
        }
    }

    private static byte[] aad(UUID ownerId, String keyId) {
        return (PackageCodec.VERSION_TOKEN + ":" + ownerId + ":" + keyId).getBytes(StandardCharsets.UTF_8);
    }
}
