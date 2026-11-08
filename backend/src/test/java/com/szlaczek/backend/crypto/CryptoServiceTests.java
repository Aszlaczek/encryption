package com.szlaczek.backend.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.crypto.spec.SecretKeySpec;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.Test;

class CryptoServiceTests {

    private static final String VECTOR_PACKAGE = "v1.k1.AAECAwQFBgcICQoL.0qr27sNOSnsG_3KCOZoblzioLbrV_EpMCk_E-xKhnw.aESjuIBJ6PPj48-yE2GTKg";
    private static final String PLAINTEXT = "Zażółć gęślą jaźń 🔐";
    private static final UUID OWNER_ID = UUID.fromString("8f14e45f-ea0b-4d1c-9b2a-6f7c8d9e0a1b");
    private static final UUID OTHER_OWNER_ID = UUID.fromString("00000000-0000-0000-0000-000000000000");

    private static final Base64.Encoder BASE64URL_ENCODER = Base64.getUrlEncoder().withoutPadding();

    private final PackageCodec codec = new PackageCodec();
    private final CryptoService service = new CryptoService(zeroKey(), codec);

    @Test
    void decryptsPublishedVector() {
        assertThat(service.decryptPackage(VECTOR_PACKAGE, OWNER_ID)).isEqualTo(PLAINTEXT);
    }

    @Test
    void reEncryptsPublishedVectorWithSameNonce() {
        EncryptedPayload vector = codec.decode(VECTOR_PACKAGE);

        String reEncrypted = codec.encode(service.encryptWithNonce(PLAINTEXT, OWNER_ID, vector.nonce()));

        assertThat(reEncrypted).isEqualTo(VECTOR_PACKAGE);
    }

    @Test
    void usesFreshNonceForEveryEncryption() {
        String first = service.encryptPackage(PLAINTEXT, OWNER_ID);
        String second = service.encryptPackage(PLAINTEXT, OWNER_ID);

        assertThat(codec.decode(first).nonce()).isNotEqualTo(codec.decode(second).nonce());
        assertThat(first).isNotEqualTo(second);
        assertThat(service.decryptPackage(first, OWNER_ID)).isEqualTo(PLAINTEXT);
        assertThat(service.decryptPackage(second, OWNER_ID)).isEqualTo(PLAINTEXT);
    }

    @Test
    void concurrentEncryptionsUseUniqueNoncesAndDecrypt() throws Exception {
        int operations = 64;
        ExecutorService executor = Executors.newFixedThreadPool(8);
        try {
            List<Future<String>> futures = new ArrayList<>();
            for (int index = 0; index < operations; index++) {
                String plaintext = PLAINTEXT + " #" + index;
                futures.add(executor.submit(() -> service.encryptPackage(plaintext, OWNER_ID)));
            }

            Set<String> nonces = new HashSet<>();
            for (int index = 0; index < operations; index++) {
                String packageValue = futures.get(index).get(10, TimeUnit.SECONDS);
                nonces.add(BASE64URL_ENCODER.encodeToString(codec.decode(packageValue).nonce()));
                assertThat(service.decryptPackage(packageValue, OWNER_ID)).isEqualTo(PLAINTEXT + " #" + index);
            }

            assertThat(nonces).hasSize(operations);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void rejectsDifferentOwner() {
        assertError(() -> service.decryptPackage(VECTOR_PACKAGE, OTHER_OWNER_ID), CryptoError.DECRYPT_FAILED);
    }

    @Test
    void rejectsTamperedTag() {
        EncryptedPayload vector = codec.decode(VECTOR_PACKAGE);
        byte[] tag = vector.tag();
        tag[0] ^= 1;

        EncryptedPayload tampered = new EncryptedPayload(vector.formatVersion(), vector.keyId(), vector.nonce(),
                vector.ciphertext(), tag);

        assertError(() -> service.decrypt(tampered, OWNER_ID), CryptoError.DECRYPT_FAILED);
    }

    @Test
    void rejectsTamperedCiphertext() {
        EncryptedPayload vector = codec.decode(VECTOR_PACKAGE);
        byte[] ciphertext = vector.ciphertext();
        ciphertext[0] ^= 1;

        EncryptedPayload tampered = new EncryptedPayload(
                vector.formatVersion(), vector.keyId(), vector.nonce(), ciphertext, vector.tag());

        assertError(() -> service.decrypt(tampered, OWNER_ID), CryptoError.DECRYPT_FAILED);
    }

    @Test
    void rejectsDifferentKeyWithSameKeyId() {
        CryptoService otherService = new CryptoService(otherKey(), codec);

        assertError(() -> otherService.decryptPackage(VECTOR_PACKAGE, OWNER_ID), CryptoError.DECRYPT_FAILED);
    }

    @Test
    void decryptFailureDoesNotExposePlaintext() {
        assertThatThrownBy(() -> service.decryptPackage(VECTOR_PACKAGE, OTHER_OWNER_ID))
                .isInstanceOfSatisfying(CryptoException.class, exception -> {
                    assertThat(exception.error()).isEqualTo(CryptoError.DECRYPT_FAILED);
                    assertThat(exception.getMessage()).doesNotContain(PLAINTEXT, VECTOR_PACKAGE);
                });
    }

    @Test
    void rejectsMalformedPackage() {
        assertError(() -> service.decryptPackage("not-a-package", OWNER_ID), CryptoError.INVALID_PACKAGE_FORMAT);
    }

    @Test
    void rejectsUnsupportedVersion() {
        assertError(
                () -> service.decryptPackage(VECTOR_PACKAGE.replaceFirst("^v1\\.", "v2."), OWNER_ID),
                CryptoError.UNSUPPORTED_PACKAGE_VERSION);
    }

    @Test
    void rejectsUnknownKeyId() {
        assertError(
                () -> service.decryptPackage(VECTOR_PACKAGE.replace(".k1.", ".k2."), OWNER_ID),
                CryptoError.UNKNOWN_KEY_ID);
    }

    @Test
    void rejectsPayloadWithWrongVersion() {
        EncryptedPayload vector = codec.decode(VECTOR_PACKAGE);
        EncryptedPayload wrongVersion = new EncryptedPayload(
                (short) 2, vector.keyId(), vector.nonce(), vector.ciphertext(), vector.tag());

        assertError(() -> service.decrypt(wrongVersion, OWNER_ID), CryptoError.UNSUPPORTED_PACKAGE_VERSION);
    }

    @Test
    void roundTripsUtf8AndUsesExpectedFieldLengths() {
        String packageValue = service.encryptPackage(PLAINTEXT, OWNER_ID);
        EncryptedPayload payload = codec.decode(packageValue);

        assertThat(service.decryptPackage(packageValue, OWNER_ID)).isEqualTo(PLAINTEXT);
        assertThat(payload.nonce()).hasSize(PackageCodec.NONCE_BYTES);
        assertThat(payload.ciphertext()).hasSize(PLAINTEXT.getBytes(StandardCharsets.UTF_8).length);
        assertThat(payload.tag()).hasSize(PackageCodec.TAG_BYTES);
        assertThat(payload.formatVersion()).isEqualTo(PackageCodec.FORMAT_VERSION);
        assertThat(payload.keyId()).isEqualTo("k1");
    }

    @Test
    void decryptsPayloadWithoutPackage() {
        EncryptedPayload payload = service.encrypt(PLAINTEXT, OWNER_ID);

        assertThat(service.decrypt(payload, OWNER_ID)).isEqualTo(PLAINTEXT);
    }

    @Test
    void rejectsEmptyAndTooLargePlaintext() {
        assertThatThrownBy(() -> service.encrypt(null, OWNER_ID)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> service.encrypt("", OWNER_ID))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("pusty");
        assertThatThrownBy(() -> service.encrypt("a".repeat(PackageCodec.MAX_CIPHERTEXT_BYTES + 1), OWNER_ID))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("40000");
    }

    @Test
    void acceptsMaximumPlaintext() {
        String plaintext = "a".repeat(PackageCodec.MAX_CIPHERTEXT_BYTES);

        String packageValue = service.encryptPackage(plaintext, OWNER_ID);

        assertThat(service.decryptPackage(packageValue, OWNER_ID)).isEqualTo(plaintext);
    }

    @Test
    void rejectsWrongNonceLengthForDeterministicEncryption() {
        assertThatThrownBy(() -> service.encryptWithNonce(PLAINTEXT, OWNER_ID, new byte[11]))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("12 bajtów");
    }

    private static CryptoKey zeroKey() {
        return new CryptoKey("k1", new SecretKeySpec(new byte[32], "AES"));
    }

    private static CryptoKey otherKey() {
        return new CryptoKey(
                "k1", new SecretKeySpec("0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.US_ASCII), "AES"));
    }

    private static void assertError(ThrowingCallable callable, CryptoError expected) {
        assertThatThrownBy(callable)
                .isInstanceOfSatisfying(
                        CryptoException.class, exception -> assertThat(exception.error()).isEqualTo(expected));
    }
}
