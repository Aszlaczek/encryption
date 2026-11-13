import { ApiError } from '../../shared/api';

export type MessageFailure = {
  kind: 'form' | 'session';
  message: string;
};

const NETWORK_MESSAGE = 'Nie można połączyć się z serwerem. Sprawdź połączenie i spróbuj ponownie.';
const SESSION_MESSAGE = 'Sesja wygasła. Zaloguj się ponownie.';
const NOT_FOUND_MESSAGE = 'Ta wiadomość nie istnieje lub została usunięta. Odśwież listę.';
const CURSOR_MESSAGE = 'Nie udało się pobrać kolejnej strony. Odśwież listę i spróbuj ponownie.';
const UNDECRYPTABLE_MESSAGE =
  'Nie udało się odszyfrować tej wiadomości. Dane mogą być uszkodzone lub klucz się zmienił.';
const CSRF_MESSAGE =
  'Nie udało się odświeżyć zabezpieczenia formularza. Odśwież stronę i spróbuj ponownie.';
const SERVER_MESSAGE = 'Wystąpił błąd serwera. Spróbuj ponownie.';

/**
 * Maps list, detail and decrypt failures onto the UI. A 401 always ends the session; every
 * other failure stays local to the list or the item so loaded data is not discarded.
 */
export function describeMessageError(error: unknown): MessageFailure {
  if (!(error instanceof ApiError)) {
    return { kind: 'form', message: NETWORK_MESSAGE };
  }

  if (error.status === 401) {
    return { kind: 'session', message: SESSION_MESSAGE };
  }

  if (error.status === 404 || (error.status === 400 && error.code === 'INVALID_MESSAGE_ID')) {
    return { kind: 'form', message: NOT_FOUND_MESSAGE };
  }

  if (error.status === 400 && error.code === 'INVALID_CURSOR') {
    return { kind: 'form', message: CURSOR_MESSAGE };
  }

  if (error.status === 403) {
    return { kind: 'form', message: CSRF_MESSAGE };
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

  if (error.status === 500 && error.code === 'MESSAGE_UNDECRYPTABLE') {
    return { kind: 'form', message: UNDECRYPTABLE_MESSAGE };
  }

  return { kind: 'form', message: SERVER_MESSAGE };
}
