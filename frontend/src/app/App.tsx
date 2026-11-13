import { AuthProvider, LoginForm, SessionPanel, useAuth } from '../features/auth';
import { CryptoWorkspace } from '../features/crypto';
import { MessagesPanel } from '../features/messages';

const REPOSITORY_URL = 'https://github.com/Aszlaczek/encryption';

export function App() {
  return (
    <AuthProvider>
      <AppLayout />
    </AuthProvider>
  );
}

function AppLayout() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Przejdź do treści
      </a>
      <div className="app">
        <header className="app__header">
          <p className="app__eyebrow">Zadanie rekrutacyjne</p>
          <h1>Szyfrowanie wiadomości</h1>
          <p className="app__lead">
            Aplikacja do szyfrowania, zapisywania i odczytywania wiadomości. Szyfrogram jest
            przechowywany w bazie, a dostęp do niego ma wyłącznie jego właściciel.
          </p>
          <a className="app__link" href={REPOSITORY_URL} target="_blank" rel="noreferrer">
            Repozytorium projektu
          </a>
        </header>

        <main id="main-content" className="app__main">
          <SessionGate />
        </main>

        <footer className="app__footer">
          <p>Projekt demonstracyjny. Nie służy do przechowywania prawdziwych sekretów.</p>
        </footer>
      </div>
    </>
  );
}

function SessionGate() {
  const { state, refresh, expireSession } = useAuth();

  if (state.status === 'loading') {
    return (
      <p className="session-status" role="status">
        Sprawdzanie sesji…
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="auth-card" aria-labelledby="session-error-heading">
        <h2 id="session-error-heading">Nie udało się sprawdzić sesji</h2>
        <div className="alert alert--error" role="alert">
          {state.message}
        </div>
        <button className="button button--primary" type="button" onClick={refresh}>
          Spróbuj ponownie
        </button>
      </section>
    );
  }

  if (state.status === 'authenticated') {
    return (
      <>
        <SessionPanel />
        <CryptoWorkspace onSessionExpired={expireSession} />
        <MessagesPanel key={state.user.id} onSessionExpired={expireSession} />
      </>
    );
  }

  return <LoginForm />;
}
