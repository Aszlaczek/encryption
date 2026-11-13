import { describe, expect, it } from 'vitest';
import { ApiError } from '../../shared/api';
import { describeCryptoError } from './messages';

describe('describeCryptoError', () => {
  it('treats a missing ApiError as a network failure', () => {
    expect(describeCryptoError(new TypeError('Failed to fetch'), 'plaintext')).toEqual({
      kind: 'form',
      message: 'Nie można połączyć się z serwerem. Sprawdź połączenie i spróbuj ponownie.',
    });
  });

  it('maps 401 to a session failure', () => {
    const failure = describeCryptoError(
      new ApiError(401, 'UNAUTHENTICATED', 'Wymagane logowanie.'),
      'plaintext',
    );
    expect(failure).toEqual({ kind: 'session', message: 'Sesja wygasła. Zaloguj się ponownie.' });
  });

  it('keeps validation violations next to the matching field', () => {
    const failure = describeCryptoError(
      new ApiError(400, 'VALIDATION_FAILED', 'Popraw dane.', {
        fieldErrors: [
          { field: 'plaintext', code: 'TOO_LONG', message: 'Maksymalnie 10 000 znaków.' },
          { field: 'package', code: 'REQUIRED', message: 'Pole jest wymagane.' },
        ],
      }),
      'plaintext',
    );
    expect(failure).toEqual({ kind: 'field', message: 'Maksymalnie 10 000 znaków.' });
  });

  it('uses the problem detail when no violation matches the field', () => {
    const failure = describeCryptoError(
      new ApiError(400, 'VALIDATION_FAILED', 'Nieznane pole.', {
        fieldErrors: [{ field: 'other', code: 'UNKNOWN', message: 'Inne.' }],
      }),
      'package',
    );
    expect(failure).toEqual({ kind: 'form', message: 'Nieznane pole.' });
  });

  it('distinguishes malformed packages from failed decryption', () => {
    expect(
      describeCryptoError(new ApiError(400, 'INVALID_PACKAGE_FORMAT', 'Zły format.'), 'package'),
    ).toMatchObject({ kind: 'form', message: expect.stringContaining('nieprawidłowy format') });

    expect(
      describeCryptoError(new ApiError(422, 'DECRYPT_FAILED', 'Nie udało się.'), 'package'),
    ).toMatchObject({
      kind: 'form',
      message: expect.stringContaining('Nie udało się odszyfrować'),
    });
  });

  it('shows the Retry-After value for 429', () => {
    const failure = describeCryptoError(
      new ApiError(429, 'RATE_LIMITED', 'Zbyt wiele.', { retryAfterSeconds: 9 }),
      'plaintext',
    );
    expect(failure).toEqual({
      kind: 'form',
      message: 'Zbyt wiele operacji. Spróbuj ponownie za 9 s.',
    });
  });

  it('handles a CSRF failure that survived the automatic retry', () => {
    const failure = describeCryptoError(
      new ApiError(403, 'CSRF_INVALID', 'Brak tokenu.'),
      'plaintext',
    );
    expect(failure).toMatchObject({
      kind: 'form',
      message: expect.stringContaining('zabezpieczenia formularza'),
    });
  });

  it('falls back to a server error for unexpected statuses', () => {
    expect(describeCryptoError(new ApiError(500, 'INTERNAL_ERROR', 'Błąd.'), 'plaintext')).toEqual({
      kind: 'form',
      message: 'Wystąpił błąd serwera. Spróbuj ponownie.',
    });
  });
});
