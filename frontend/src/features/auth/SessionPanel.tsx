import { useState } from 'react';
import { ApiError } from '../../shared/api';
import { useAuth } from './useAuth';

export function SessionPanel() {
  const { state, logout } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'authenticated') {
    return null;
  }

  async function handleLogout() {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await logout();
    } catch (logoutError) {
      setError(
        logoutError instanceof ApiError
          ? 'Nie udało się wylogować. Spróbuj ponownie.'
          : 'Nie można połączyć się z serwerem. Spróbuj ponownie.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="session-panel" aria-labelledby="session-heading">
      <h2 id="session-heading">Zalogowano</h2>
      <p>
        Jesteś zalogowany jako <strong>{state.user.username}</strong>.
      </p>
      <p className="session-panel__note">
        Lista i edytor wiadomości pojawią się w kolejnym zadaniu.
      </p>
      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}
      <button
        className="button button--secondary"
        type="button"
        onClick={handleLogout}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? 'Wylogowywanie…' : 'Wyloguj się'}
      </button>
    </section>
  );
}
