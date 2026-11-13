import { createContext } from 'react';
import type { LoginCredentials, User } from './api';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User }
  | { status: 'error'; message: string };

export type AuthContextValue = {
  state: SessionState;
  /** One-off notice shown on the login form, for example after an expired session. */
  sessionNotice: string | null;
  login: (credentials: LoginCredentials) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => void;
  /** Drops the client-side session after a 401 from a protected endpoint. */
  expireSession: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
