package com.szlaczek.backend.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Base64;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.Test;

class PackageCodecTests {

    private static final String VECTOR_PACKAGE = "v1.k1.AAECAwQFBgcICQoL.0qr27sNOSnsG_3KCOZoblzioLbrV_EpMCk_E-xKhnw.aESjuIBJ6PPj48-yE2GTKg";
    private static final String VECTOR_NONCE = "AAECAwQFBgcICQoL";
    private static final String VECTOR_CIPHERTEXT = "0qr27sNOSnsG_3KCOZoblzioLbrV_EpMCk_E-xKhnw";
    private static final String VECTOR_TAG = "aESjuIBJ6PPj48-yE2GTKg";

    private static final Base64.Encoder BASE64URL_ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder BASE64URL_DECODER = Base64.getUrlDecoder();

    private final PackageCodec codec = new PackageCodec();

    @Test
    void decodesPublishedVector() {
        EncryptedPayload payload = codec.decode(VECTOR_PACKAGE);

        assertThat(payload.formatVersion()).isEqualTo(PackageCodec.FORMAT_VERSION);
        assertThat(payload.keyId()).isEqualTo("k1");
        assertThat(payload.nonce()).isEqualTo(BASE64URL_DECODER.decode(VECTOR_NONCE));
        assertThat(payload.ciphertext()).isEqualTo(BASE64URL_DECODER.decode(VECTOR_CIPHERTEXT));
        assertThat(payload.tag()).isEqualTo(BASE64URL_DECODER.decode(VECTOR_TAG));
    }

    @Test
    void encodesPublishedVector() {
        EncryptedPayload payload = vectorPayload();

        assertThat(codec.encode(payload)).isEqualTo(VECTOR_PACKAGE);
    }

    @Test
    void trimsAsciiWhitespaceAtBothEnds() {
        EncryptedPayload payload = codec.decode(" \t\n\r\u000B\f" + VECTOR_PACKAGE + "\r\n\t ");

        assertThat(codec.encode(payload)).isEqualTo(VECTOR_PACKAGE);
    }

    @Test
    void rejectsUnicodeWhitespaceAtEdges() {
        assertError(() -> codec.decode("\u00A0" + VECTOR_PACKAGE), CryptoError.INVALID_PACKAGE_FORMAT);
        assertError(() -> codec.decode(VECTOR_PACKAGE + "\u00A0"), CryptoError.INVALID_PACKAGE_FORMAT);
    }

    @Test
    void rejectsInternalWhitespace() {
        String nonceWithSpace = VECTOR_NONCE.substring(0, 8) + " " + VECTOR_NONCE.substring(8);

        assertError(
                () -> codec.decode(packageWith(nonceWithSpace, VECTOR_CIPHERTEXT, VECTOR_TAG)),
                CryptoError.INVALID_PACKAGE_FORMAT);
    }

    @Test
    void rejectsNullAndEmptyPackages() {
        assertError(() -> codec.decode(null), CryptoError.INVALID_PACKAGE_FORMAT);
        assertError(() -> codec.decode(""), CryptoError.INVALID_PACKAGE_FORMAT);
        assertError(() -> codec.decode(" \t\r\n"), CryptoError.INVALID_PACKAGE_FORMAT);
    }

    @Test
    void rejectsPackageLongerThanLimit() {
        String tooLong = "A".repeat(PackageCodec.MAX_PACKAGE_CHARS + 1);

        assertError(() -> codec.decode(tooLong), CryptoError.INVALID_PACKAGE_FORMAT);
    }

    @Test
    void rejectsWrongSegmentCount() {
        assertError(
                () -> codec.decode(VECTOR_PACKAGE.substring(0, VECTOR_PACKAGE.lastIndexOf('.'))),
                CryptoError.INVALID_PACKAGE_FORMAT);
        assertError(() -> codec.decode(VECTOR_PACKAGE + ".extra"), CryptoError.INVALID_PACKAGE_FORMAT);
    }

    @Test
    void rejectsUnsupportedVersion() {
        assertError(
                () -> codec.decode(VECTOR_PACKAGE.replaceFirst("^v1\\.", "v2.")),
                CryptoError.UNSUPPORTED_PACKAGE_VERSION);
    }

    @Test
    void rejectsInvalidKeyIdSyntax() {
        assertError(
                () -> codec.decode(VECTOR_PACKAGE.replace(".k1.", ".K1.")), CryptoError.INVALID_PACKAGE_FORMAT);
        assertError(() -> codec.decode(VECTOR_PACKAGE.replace(".k1.", "..")), CryptoError.INVALID_PACKAGE_FORMAT);

        String tooLongKeyId = "v1." + "a".repeat(33) + "." + VECTOR_NONCE + "." + VECTOR_CIPHERTEXT + "." + VECTOR_TAG;
        assertError(() -> codec.decode(tooLongKeyId), CryptoError.INVALID_PACKAGE_FORMAT);
    }

    @Test
    void acceptsSyntacticallyValidUnknownKeyId() {
        EncryptedPayload payload = codec.decode(VECTOR_PACKAGE.replace(".k1.", ".k2."));

        assertThat(payload.keyId()).isEqualTo("k2");
    }

    @Test
    void rejectsPaddedBase64Url() {
        assertError(
                () -> codec.decode(packageWith(VECTOR_NONCE + "=", VECTOR_CIPHERTEXT, VECTOR_TAG)),
                CryptoError.INVALID_PACKAGE_FORMAT);
    }

    @Test
    void rejectsStandardBase64Characters() {
        assertError(
                () -> codec.decode(packageWith("AAECAwQFBgcICQo+", VECTOR_CIPHERTEXT, VECTOR_TAG)),
                CryptoError.INVALID_PACKAGE_FORMAT);
        assertError(
                () -> codec.decode(packageWith("AAECAwQFBgcICQo/", VECTOR_CIPHERTEXT, VECTOR_TAG)),
                CryptoError.INVALID_PACKAGE_FORMAT);
    }

    @Test
    void rejectsNonCanonicalBase64Url() {
        String nonCanonicalTag = VECTOR_TAG.substring(0, VECTOR_TAG.length() - 1) + "h";

        assertError(
                () -> codec.decode(packageWith(VECTOR_NONCE, VECTOR_CIPHERTEXT, nonCanonicalTag)),
                CryptoError.INVALID_PACKAGE_FORMAT);
    }

    @Test
    void rejectsWrongNonceLength() {
        assertError(
                () -> codec.decode(packageWith(
                        BASE64URL_ENCODER.encodeToString(new byte[11]), VECTOR_CIPHERTEXT, VECTOR_TAG)),
                CryptoError.INVALID_PACKAGE_FORMAT);
        assertError(
                () -> codec.decode(packageWith(
                        BASE64URL_ENCODER.encodeToString(new byte[13]), VECTOR_CIPHERTEXT, VECTOR_TAG)),
                CryptoError.INVALID_PACKAGE_FORMAT);
    }

    @Test
    void rejectsWrongTagLength() {
        assertError(
                () -> codec.decode(packageWith(
                        VECTOR_NONCE, VECTOR_CIPHERTEXT, BASE64URL_ENCODER.encodeToString(new byte[15]))),
                CryptoError.INVALID_PACKAGE_FORMAT);
        assertError(
                () -> codec.decode(packageWith(
                        VECTOR_NONCE, VECTOR_CIPHERTEXT, BASE64URL_ENCODER.encodeToString(new byte[17]))),
                CryptoError.INVALID_PACKAGE_FORMAT);
    }

    @Test
    void rejectsEmptyCiphertext() {
        assertError(
                () -> codec.decode(packageWith(VECTOR_NONCE, "", VECTOR_TAG)),
                CryptoError.INVALID_PACKAGE_FORMAT);
    }

    @Test
    void rejectsCiphertextAboveLimit() {
        String tooLarge = BASE64URL_ENCODER.encodeToString(new byte[PackageCodec.MAX_CIPHERTEXT_BYTES + 1]);

        assertError(
                () -> codec.decode(packageWith(VECTOR_NONCE, tooLarge, VECTOR_TAG)),
                CryptoError.INVALID_PACKAGE_FORMAT);
    }

    @Test
    void acceptsMaximumCiphertext() {
        String maximum = BASE64URL_ENCODER.encodeToString(new byte[PackageCodec.MAX_CIPHERTEXT_BYTES]);
        String packageValue = packageWith(VECTOR_NONCE, maximum, VECTOR_TAG);

        EncryptedPayload payload = codec.decode(packageValue);

        assertThat(payload.ciphertext()).hasSize(PackageCodec.MAX_CIPHERTEXT_BYTES);
        assertThat(codec.encode(payload)).isEqualTo(packageValue);
    }

    @Test
    void validateRejectsNullAndInvalidPayloads() {
        assertError(() -> codec.validate(null), CryptoError.INVALID_PACKAGE_FORMAT);

        EncryptedPayload wrongVersion = new EncryptedPayload(
                (short) 2,
                "k1",
                BASE64URL_DECODER.decode(VECTOR_NONCE),
                BASE64URL_DECODER.decode(VECTOR_CIPHERTEXT),
                BASE64URL_DECODER.decode(VECTOR_TAG));
        assertError(() -> codec.validate(wrongVersion), CryptoError.UNSUPPORTED_PACKAGE_VERSION);

        EncryptedPayload shortNonce = new EncryptedPayload(
                PackageCodec.FORMAT_VERSION,
                "k1",
                new byte[11],
                BASE64URL_DECODER.decode(VECTOR_CIPHERTEXT),
                BASE64URL_DECODER.decode(VECTOR_TAG));
        assertError(() -> codec.validate(shortNonce), CryptoError.INVALID_PACKAGE_FORMAT);
    }

    @Test
    void payloadDefensivelyCopiesArrays() {
        byte[] nonce = BASE64URL_DECODER.decode(VECTOR_NONCE);
        byte[] ciphertext = BASE64URL_DECODER.decode(VECTOR_CIPHERTEXT);
        byte[] tag = BASE64URL_DECODER.decode(VECTOR_TAG);
        EncryptedPayload payload = new EncryptedPayload(PackageCodec.FORMAT_VERSION, "k1", nonce, ciphertext, tag);

        nonce[0] = 99;
        ciphertext[0] = 99;
        tag[0] = 99;

        assertThat(payload.nonce()).isEqualTo(BASE64URL_DECODER.decode(VECTOR_NONCE));
        assertThat(payload.ciphertext()).isEqualTo(BASE64URL_DECODER.decode(VECTOR_CIPHERTEXT));
        assertThat(payload.tag()).isEqualTo(BASE64URL_DECODER.decode(VECTOR_TAG));

        byte[] returned = payload.nonce();
        returned[0] = 99;
        assertThat(payload.nonce()).isEqualTo(BASE64URL_DECODER.decode(VECTOR_NONCE));
    }

    @Test
    void doesNotExposePayloadContentsInToString() {
        String text = vectorPayload().toString();

        assertThat(text).contains("keyId=k1", "nonce=12B", "ciphertext=31B", "tag=16B");
        assertThat(text).doesNotContain(VECTOR_CIPHERTEXT, VECTOR_TAG);
    }

    @Test
    void acceptsMinimumCiphertext() {
        String oneByte = BASE64URL_ENCODER.encodeToString(new byte[]{42});
        String packageValue = packageWith(VECTOR_NONCE, oneByte, VECTOR_TAG);

        EncryptedPayload payload = codec.decode(packageValue);

        assertThat(payload.ciphertext()).hasSize(1);
        assertThat(codec.encode(payload)).isEqualTo(packageValue);
    }

    private static EncryptedPayload vectorPayload() {
        return new EncryptedPayload(
                PackageCodec.FORMAT_VERSION,
                "k1",
                BASE64URL_DECODER.decode(VECTOR_NONCE),
                BASE64URL_DECODER.decode(VECTOR_CIPHERTEXT),
                BASE64URL_DECODER.decode(VECTOR_TAG));
    }

    private static String packageWith(String nonce, String ciphertext, String tag) {
        return "v1.k1." + nonce + "." + ciphertext + "." + tag;
    }

    private static void assertError(ThrowingCallable callable, CryptoError expected) {
        assertThatThrownBy(callable)
                .isInstanceOfSatisfying(
                        CryptoException.class, exception -> assertThat(exception.error()).isEqualTo(expected));
    }
}
