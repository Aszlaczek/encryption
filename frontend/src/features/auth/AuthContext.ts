import { createContext } from 'react';
import type { LoginCredentials, User } from './api';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User }
  | { status: 'error'; message: string };

export type AuthContextValue = {
  state: SessionState;
  login: (credentials: LoginCredentials) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
