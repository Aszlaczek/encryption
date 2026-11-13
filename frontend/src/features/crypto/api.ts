import { apiRequest } from '../../shared/api';

export type EncryptResponse = {
  package: string;
};

export type DecryptResponse = {
  plaintext: string;
};

export type SavedMessage = {
  id: string;
  createdAt: string;
  package: string;
};

/** Encrypts without persisting anything. */
export function encryptPlaintext(plaintext: string): Promise<EncryptResponse> {
  return apiRequest<EncryptResponse>('/api/crypto/encrypt', {
    method: 'POST',
    body: { plaintext },
  });
}

/** Decrypts a package scoped to the current session owner through the AAD. */
export function decryptPackage(pkg: string): Promise<DecryptResponse> {
  return apiRequest<DecryptResponse>('/api/crypto/decrypt', {
    method: 'POST',
    body: { package: pkg },
  });
}

/** Encrypts and persists a message for the current session owner. */
export function saveMessage(plaintext: string): Promise<SavedMessage> {
  return apiRequest<SavedMessage>('/api/messages', {
    method: 'POST',
    body: { plaintext },
  });
}
