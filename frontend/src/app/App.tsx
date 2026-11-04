const REPOSITORY_URL = 'https://github.com/Aszlaczek/encryption';

export function App() {
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
          <section aria-labelledby="status-heading">
            <h2 id="status-heading">Stan projektu</h2>
            <ul className="status-list">
              <li>Frontend: React, Vite i TypeScript — szkielet gotowy.</li>
              <li>Backend: Spring Boot i PostgreSQL — szkielet oraz model danych gotowe.</li>
              <li>Logowanie, szyfrowanie i lista wiadomości — w przygotowaniu.</li>
            </ul>
          </section>
        </main>

        <footer className="app__footer">
          <p>Projekt demonstracyjny. Nie służy do przechowywania prawdziwych sekretów.</p>
        </footer>
      </div>
    </>
  );
}
