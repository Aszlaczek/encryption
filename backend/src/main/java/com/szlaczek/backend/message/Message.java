package com.szlaczek.backend.message;

import com.szlaczek.backend.auth.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

/**
 * Encrypted message envelope. Only the encrypted fields are stored; there is intentionally no plaintext content field.
 * The entity is internal to the persistence layer and must never be returned directly from an API endpoint.
 */
@Entity
@Table(name = "messages")
public class Message {

    public static final String ALGORITHM = "AES-256-GCM";
    public static final short FORMAT_VERSION = 1;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private AppUser owner;

    @Column(name = "nonce", nullable = false)
    private byte[] nonce;

    @Column(name = "ciphertext", nullable = false)
    private byte[] ciphertext;

    @Column(name = "tag", nullable = false)
    private byte[] tag;

    @Column(name = "key_id", nullable = false, length = 32)
    private String keyId;

    @Column(name = "format_version", nullable = false)
    private short formatVersion;

    @Column(name = "algorithm", nullable = false, length = 32)
    private String algorithm;

    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    protected Message() {
        // Required by JPA.
    }

    public Message(AppUser owner, String keyId, byte[] nonce, byte[] ciphertext, byte[] tag) {
        this.owner = owner;
        this.keyId = keyId;
        this.nonce = nonce;
        this.ciphertext = ciphertext;
        this.tag = tag;
        this.formatVersion = FORMAT_VERSION;
        this.algorithm = ALGORITHM;
    }

    public UUID getId() {
        return id;
    }

    public AppUser getOwner() {
        return owner;
    }

    public byte[] getNonce() {
        return nonce;
    }

    public byte[] getCiphertext() {
        return ciphertext;
    }

    public byte[] getTag() {
        return tag;
    }

    public String getKeyId() {
        return keyId;
    }

    public short getFormatVersion() {
        return formatVersion;
    }

    public String getAlgorithm() {
        return algorithm;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
