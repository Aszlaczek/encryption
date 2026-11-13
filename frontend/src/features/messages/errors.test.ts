import { describe, expect, it } from 'vitest';
import { ApiError } from '../../shared/api';
import { describeMessageError } from './errors';

describe('describeMessageError', () => {
  it('treats a missing ApiError as a network failure', () => {
    expect(describeMessageError(new TypeError('Failed to fetch'))).toEqual({
      kind: 'form',
      message: 'Nie można połączyć się z serwerem. Sprawdź połączenie i spróbuj ponownie.',
    });
  });

  it('maps 401 to a session failure', () => {
    expect(
      describeMessageError(new ApiError(401, 'UNAUTHENTICATED', 'Wymagane logowanie.')),
    ).toEqual({ kind: 'session', message: 'Sesja wygasła. Zaloguj się ponownie.' });
  });

  it('explains a missing or already deleted message', () => {
    expect(describeMessageError(new ApiError(404, 'MESSAGE_NOT_FOUND', 'Brak.'))).toEqual({
      kind: 'form',
      message: 'Ta wiadomość nie istnieje lub została usunięta. Odśwież listę.',
    });
    expect(describeMessageError(new ApiError(400, 'INVALID_MESSAGE_ID', 'Zły id.'))).toEqual({
      kind: 'form',
      message: 'Ta wiadomość nie istnieje lub została usunięta. Odśwież listę.',
    });
  });

  it('explains an invalid pagination cursor', () => {
    expect(describeMessageError(new ApiError(400, 'INVALID_CURSOR', 'Zły kursor.'))).toEqual({
      kind: 'form',
      message: 'Nie udało się pobrać kolejnej strony. Odśwież listę i spróbuj ponownie.',
    });
  });

  it('shows the Retry-After value for 429', () => {
    expect(
      describeMessageError(
        new ApiError(429, 'RATE_LIMITED', 'Zbyt wiele.', { retryAfterSeconds: 9 }),
      ),
    ).toEqual({ kind: 'form', message: 'Zbyt wiele operacji. Spróbuj ponownie za 9 s.' });
  });

  it('handles a CSRF failure that survived the automatic retry', () => {
    expect(describeMessageError(new ApiError(403, 'CSRF_INVALID', 'Brak tokenu.'))).toMatchObject({
      kind: 'form',
      message: expect.stringContaining('zabezpieczenia formularza'),
    });
  });

  it('explains undecryptable data separately from a generic server error', () => {
    expect(
      describeMessageError(new ApiError(500, 'MESSAGE_UNDECRYPTABLE', 'Nie udało się.')),
    ).toMatchObject({
      kind: 'form',
      message: expect.stringContaining('Nie udało się odszyfrować tej wiadomości'),
    });

    expect(describeMessageError(new ApiError(500, 'INTERNAL_ERROR', 'Błąd.'))).toEqual({
      kind: 'form',
      message: 'Wystąpił błąd serwera. Spróbuj ponownie.',
    });
  });
});
