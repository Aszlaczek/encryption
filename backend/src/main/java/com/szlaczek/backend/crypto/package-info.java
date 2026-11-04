/**
 * Cryptography module: AES-256-GCM encryption, package codec and AAD construction.
 *
 * <p>
 * The package format is {@code v1.<key_id>.<nonce>.<ciphertext>.<tag>} encoded with canonical base64url; the AAD is
 * {@code v1:<ownerId>:<keyId>}.
 */
package com.szlaczek.backend.crypto;
