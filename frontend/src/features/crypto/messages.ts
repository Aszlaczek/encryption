import { ApiError } from '../../shared/api';

export type CryptoField = 'plaintext' | 'package';

export type CryptoFailure =
  | { kind: 'field'; message: string }
  | { kind: 'form'; message: string }
  | { kind: 'session'; message: string };

const NETWORK_MESSAGE = 'Nie można połączyć się z serwerem. Sprawdź połączenie i spróbuj ponownie.';
const SESSION_MESSAGE = 'Sesja wygasła. Zaloguj się ponownie.';
const FORMAT_MESSAGE = 'Pakiet ma nieprawidłowy format. Wklej cały pakiet zaczynający się od v1.';
const DECRYPT_MESSAGE =
  'Nie udało się odszyfrować pakietu. Sprawdź, czy pochodzi z tego konta i nie został zmieniony.';
const CSRF_MESSAGE =
  'Nie udało się odświeżyć zabezpieczenia formularza. Odśwież stronę i spróbuj ponownie.';
const SERVER_MESSAGE = 'Wystąpił błąd serwera. Spróbuj ponownie.';

/**
 * Maps crypto and message errors onto the UI. Field violations stay next to the textarea,
 * everything else becomes a form-level alert, and 401 also ends the session.
 */
export function describeCryptoError(error: unknown, field: CryptoField): CryptoFailure {
  if (!(error instanceof ApiError)) {
    return { kind: 'form', message: NETWORK_MESSAGE };
  }

  if (error.status === 401) {
    return { kind: 'session', message: SESSION_MESSAGE };
  }

  if (error.status === 400 && error.code === 'INVALID_PACKAGE_FORMAT') {
    return { kind: 'form', message: FORMAT_MESSAGE };
  }

  if (error.status === 400 && error.code === 'VALIDATION_FAILED') {
    const violation = error.fieldErrors.find((entry) => entry.field === field);
    if (violation) {
      return { kind: 'field', message: violation.message };
    }
    return { kind: 'form', message: error.detail || 'Popraw dane formularza.' };
  }

  if (error.status === 400) {
    return { kind: 'form', message: error.detail || 'Popraw dane formularza.' };
  }

  if (error.status === 403) {
    return { kind: 'form', message: CSRF_MESSAGE };
  }

  if (error.status === 422 && error.code === 'DECRYPT_FAILED') {
    return { kind: 'form', message: DECRYPT_MESSAGE };
  }

  if (error.status === 429) {
    return {
      kind: 'form',
      message:
        error.retryAfterSeconds === undefined
          ? 'Zbyt wiele operacji. Spróbuj ponownie później.'
          : `Zbyt wiele operacji. Spróbuj ponownie za ${error.retryAfterSeconds} s.`,
    };
  }

  return { kind: 'form', message: SERVER_MESSAGE };
}
