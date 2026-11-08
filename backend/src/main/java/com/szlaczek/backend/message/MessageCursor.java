package com.szlaczek.backend.message;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import java.util.regex.Pattern;

/** Canonical base64url cursor for the last (createdAt, id) pair in a message page. */
public record MessageCursor(Instant createdAt, UUID id) {

    private static final Pattern ENCODED = Pattern.compile("^[A-Za-z0-9_-]{1,512}$");
    private static final Pattern PAYLOAD = Pattern
            .compile("^[1-9][0-9]*:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

    public String encode() {
        long epochMicros = Math.addExact(Math.multiplyExact(createdAt.getEpochSecond(), 1_000_000L),
                createdAt.getNano() / 1_000);
        return ENCODER.encodeToString((epochMicros + ":" + id).getBytes(StandardCharsets.US_ASCII));
    }

    public static MessageCursor decode(String encoded) {
        try {
            if (encoded == null || !ENCODED.matcher(encoded).matches()) {
                throw new IllegalArgumentException();
            }
            byte[] decoded = DECODER.decode(encoded);
            if (!ENCODER.encodeToString(decoded).equals(encoded)) {
                throw new IllegalArgumentException();
            }
            String payload = new String(decoded, StandardCharsets.US_ASCII);
            if (!PAYLOAD.matcher(payload).matches()) {
                throw new IllegalArgumentException();
            }
            int separator = payload.indexOf(':');
            long epochMicros = Long.parseLong(payload.substring(0, separator));
            Instant createdAt = Instant.ofEpochSecond(epochMicros / 1_000_000L, (epochMicros % 1_000_000L) * 1_000L);
            UUID id = UUID.fromString(payload.substring(separator + 1));
            MessageCursor cursor = new MessageCursor(createdAt, id);
            if (!cursor.encode().equals(encoded)) {
                throw new IllegalArgumentException();
            }
            return cursor;
        } catch (RuntimeException exception) {
            throw new InvalidCursorException();
        }
    }
}
