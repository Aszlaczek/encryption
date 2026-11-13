import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../../shared/api';
import {
  clearAuthState,
  loadSession,
  login as loginRequest,
  logout as logoutRequest,
  type LoginCredentials,
  type User,
} from './api';
import { AuthContext, type SessionState } from './AuthContext';

function sessionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.status === 429
      ? 'Zbyt wiele żądań. Spróbuj ponownie za chwilę.'
      : 'Nie udało się sprawdzić sesji. Spróbuj ponownie.';
  }
  return 'Nie można połączyć się z serwerem. Sprawdź połączenie i spróbuj ponownie.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    loadSession(controller.signal)
      .then((user) => {
        if (!active) {
          return;
        }
        setState(user ? { status: 'authenticated', user } : { status: 'anonymous' });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setState({ status: 'error', message: sessionErrorMessage(error) });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey]);

  const login = useCallback(async (credentials: LoginCredentials): Promise<User> => {
    const user = await loginRequest(credentials);
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutRequest();
    } catch (error) {
      // An expired session is already logged out; anything else keeps the current UI state.
      if (!(error instanceof ApiError && error.status === 401)) {
        throw error;
      }
    }
    clearAuthState();
    setState({ status: 'anonymous' });
  }, []);

  const refresh = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((value) => value + 1);
  }, []);

  const value = useMemo(() => ({ state, login, logout, refresh }), [state, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
