package com.szlaczek.backend.crypto;

import java.util.Base64;
import java.util.regex.Pattern;

/**
 * Parses and builds the package format defined by {@code docs/API.md} section 9:
 * {@code v1.<key_id>.<nonce>.<ciphertext>.<tag>}.
 *
 * <p>
 * This class owns all package syntax and length validation. It does not know which key ids are configured; the
 * {@link CryptoService} checks the key id against the loaded key.
 */
public final class PackageCodec {

    public static final short FORMAT_VERSION = 1;
    public static final String VERSION_TOKEN = "v1";
    public static final int NONCE_BYTES = 12;
    public static final int TAG_BYTES = 16;
    public static final int MAX_CIPHERTEXT_BYTES = 40_000;
    public static final int MAX_PACKAGE_CHARS = 56_000;

    private static final Pattern KEY_ID_PATTERN = Pattern.compile("^[a-z0-9][a-z0-9_-]{0,31}$");
    private static final Pattern BASE64URL_PATTERN = Pattern.compile("^[A-Za-z0-9_-]+$");
    private static final Base64.Encoder BASE64URL_ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder BASE64URL_DECODER = Base64.getUrlDecoder();

    public String encode(EncryptedPayload payload) {
        validate(payload);
        String encoded = VERSION_TOKEN + "." + payload.keyId() + "." + BASE64URL_ENCODER.encodeToString(payload.nonce())
                + "." + BASE64URL_ENCODER.encodeToString(payload.ciphertext()) + "."
                + BASE64URL_ENCODER.encodeToString(payload.tag());
        if (encoded.length() > MAX_PACKAGE_CHARS) {
            throw CryptoException.invalidPackage();
        }
        return encoded;
    }

    public EncryptedPayload decode(String packageValue) {
        if (packageValue == null) {
            throw CryptoException.invalidPackage();
        }

        String trimmed = trimAsciiWhitespace(packageValue);
        if (trimmed.isEmpty() || trimmed.length() > MAX_PACKAGE_CHARS || !isAscii(trimmed)) {
            throw CryptoException.invalidPackage();
        }

        String[] segments = trimmed.split("\\.", -1);
        if (segments.length != 5) {
            throw CryptoException.invalidPackage();
        }
        if (!VERSION_TOKEN.equals(segments[0])) {
            throw CryptoException.unsupportedVersion();
        }

        String keyId = segments[1];
        validateKeyId(keyId);

        byte[] nonce = decodeSegment(segments[2]);
        byte[] ciphertext = decodeSegment(segments[3]);
        byte[] tag = decodeSegment(segments[4]);
        validateLengths(nonce, ciphertext, tag);

        return new EncryptedPayload(FORMAT_VERSION, keyId, nonce, ciphertext, tag);
    }

    public void validate(EncryptedPayload payload) {
        if (payload == null) {
            throw CryptoException.invalidPackage();
        }
        if (payload.formatVersion() != FORMAT_VERSION) {
            throw CryptoException.unsupportedVersion();
        }
        validateKeyId(payload.keyId());

        byte[] nonce = payload.nonce();
        byte[] ciphertext = payload.ciphertext();
        byte[] tag = payload.tag();
        validateLengths(nonce, ciphertext, tag);

        int encodedLength = VERSION_TOKEN.length() + 1 + payload.keyId().length() + 1 + encodedLength(nonce) + 1
                + encodedLength(ciphertext) + 1 + encodedLength(tag);
        if (encodedLength > MAX_PACKAGE_CHARS) {
            throw CryptoException.invalidPackage();
        }
    }

    private static void validateKeyId(String keyId) {
        if (keyId == null || !KEY_ID_PATTERN.matcher(keyId).matches()) {
            throw CryptoException.invalidPackage();
        }
    }

    private static void validateLengths(byte[] nonce, byte[] ciphertext, byte[] tag) {
        if (nonce.length != NONCE_BYTES || tag.length != TAG_BYTES || ciphertext.length < 1
                || ciphertext.length > MAX_CIPHERTEXT_BYTES) {
            throw CryptoException.invalidPackage();
        }
    }

    private static byte[] decodeSegment(String segment) {
        if (!BASE64URL_PATTERN.matcher(segment).matches()) {
            throw CryptoException.invalidPackage();
        }

        byte[] decoded;
        try {
            decoded = BASE64URL_DECODER.decode(segment);
        } catch (IllegalArgumentException exception) {
            throw CryptoException.invalidPackage();
        }

        if (!BASE64URL_ENCODER.encodeToString(decoded).equals(segment)) {
            throw CryptoException.invalidPackage();
        }
        return decoded;
    }

    private static int encodedLength(byte[] value) {
        return (value.length * 4 + 2) / 3;
    }

    private static boolean isAscii(String value) {
        for (int index = 0; index < value.length(); index++) {
            if (value.charAt(index) > 0x7F) {
                return false;
            }
        }
        return true;
    }

    private static String trimAsciiWhitespace(String value) {
        int start = 0;
        int end = value.length();
        while (start < end && isAsciiWhitespace(value.charAt(start))) {
            start++;
        }
        while (end > start && isAsciiWhitespace(value.charAt(end - 1))) {
            end--;
        }
        return value.substring(start, end);
    }

    private static boolean isAsciiWhitespace(char value) {
        return value == ' ' || value == '\t' || value == '\n' || value == '\u000B' || value == '\f' || value == '\r';
    }
}
