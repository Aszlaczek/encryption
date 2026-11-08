/**
 * Cryptography module: AES-256-GCM encryption, package codec, HTTP API and AAD construction.
 *
 * <p>
 * {@link com.szlaczek.backend.crypto.CryptoService} performs AES-256-GCM with a fresh 12-byte nonce and a 128-bit tag.
 * {@link com.szlaczek.backend.crypto.PackageCodec} is the only place that parses and builds the package
 * {@code v1.<key_id>.<nonce>.<ciphertext>.<tag>} encoded with canonical base64url; the AAD is
 * {@code v1:<ownerId>:<keyId>}.
 */
package com.szlaczek.backend.crypto;
