package com.szlaczek.backend.crypto.api;

import com.szlaczek.backend.auth.AppUserPrincipal;
import com.szlaczek.backend.crypto.CryptoService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Stateless encryption and decryption endpoints. */
@RestController
@RequestMapping("/api/crypto")
public class CryptoController {

    private final CryptoService cryptoService;

    public CryptoController(CryptoService cryptoService) {
        this.cryptoService = cryptoService;
    }

    @PostMapping(value = "/encrypt", consumes = MediaType.APPLICATION_JSON_VALUE)
    public PackageResponse encrypt(
            @Valid @RequestBody EncryptRequest body, @AuthenticationPrincipal AppUserPrincipal principal) {
        return new PackageResponse(cryptoService.encryptPackage(body.plaintext(), principal.getId()));
    }

    @PostMapping(value = "/decrypt", consumes = MediaType.APPLICATION_JSON_VALUE)
    public PlaintextResponse decrypt(
            @Valid @RequestBody DecryptPackageRequest body, @AuthenticationPrincipal AppUserPrincipal principal) {
        return new PlaintextResponse(cryptoService.decryptPackage(body.packageValue(), principal.getId()));
    }
}
