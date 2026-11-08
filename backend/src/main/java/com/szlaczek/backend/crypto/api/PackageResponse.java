package com.szlaczek.backend.crypto.api;

import com.fasterxml.jackson.annotation.JsonProperty;

/** Encoded encrypted package response. */
public record PackageResponse(@JsonProperty("package") String packageValue) {
}
