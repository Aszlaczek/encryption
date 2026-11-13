import { ApiError, apiRequest, resetCsrfToken } from '../../shared/api';

export type User = {
  id: string;
  username: string;
};

export type LoginCredentials = {
  username: string;
  password: string;
};

/** Current session user or `null` when the backend answers 401. Other failures are rethrown. */
export async function loadSession(signal?: AbortSignal): Promise<User | null> {
  try {
    return await apiRequest<User>('/api/auth/me', { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function login(credentials: LoginCredentials): Promise<User> {
  const user = await apiRequest<User>('/api/auth/login', {
    method: 'POST',
    body: credentials,
  });
  // The backend rotates the CSRF token after a successful login; never reuse the previous value.
  resetCsrfToken();
  return user;
}

export async function logout(): Promise<void> {
  await apiRequest<void>('/api/auth/logout', { method: 'POST' });
  resetCsrfToken();
}

/** Drops client-side authentication state without touching the server session. */
export function clearAuthState(): void {
  resetCsrfToken();
}
