package com.szlaczek.backend.auth.api;

import com.szlaczek.backend.auth.AppUserPrincipal;
import java.util.UUID;

/** Public user representation; never exposes the entity or the password hash. */
public record UserResponse(UUID id, String username) {

    public static UserResponse from(AppUserPrincipal principal) {
        return new UserResponse(principal.getId(), principal.getUsername());
    }
}
