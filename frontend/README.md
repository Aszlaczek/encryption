# Frontend

React 19 + Vite 7 + TypeScript 6. Wersje są przypięte dokładnie w `package.json`, a pełne drzewo zależności w `package-lock.json`.

## Komendy

```bash
nvm use            # Node 22 (plik .nvmrc)
npm ci
npm run dev        # http://localhost:5173, proxy /api i /actuator -> http://localhost:8080
npm run build      # tsc -b && vite build -> dist/
npm run preview    # podgląd builda, http://localhost:4173
npm run lint       # ESLint
npm run format     # Prettier --write
npm run format:check
npm run test       # Vitest + React Testing Library
```

## Podział modułów

```text
src/
├── app/        # kompozycja aplikacji, strona główna, testy
├── features/   # pionowe moduły funkcjonalne
│   ├── auth/       # logowanie, sesja, CSRF
│   ├── crypto/     # szyfrowanie i deszyfrowanie
│   └── messages/   # lista, szczegóły, usuwanie
├── shared/     # kod współdzielony, niezależny od funkcji
│   ├── api/        # klient HTTP i obsługa błędów RFC 9457
│   └── ui/         # dostępne komponenty prezentacyjne
├── styles/     # style globalne
└── test/       # konfiguracja testów
```

Zasady:

- `features/*` nie importują się nawzajem; wspólny kod trafia do `shared/*`.
- `shared/*` nie importuje z `features/*`.
- Właściciel wiadomości pochodzi z sesji backendu — frontend nigdy nie wysyła `ownerId`.
- Sesja to cookie `JSESSIONID` (`HttpOnly`); CSRF jest czytany z cookie `XSRF-TOKEN` i wysyłany tylko dla mutacji. Nie używaj `localStorage`/`sessionStorage`/IndexedDB dla użytkownika, hasła ani wiadomości.

## Logowanie i sesja

- Start aplikacji wywołuje `GET /api/auth/me`: `200` → widok zalogowany, `401` → formularz bez błędu, `5xx`/sieć → ekran błędu z „Spróbuj ponownie”.
- Formularz ma etykiety, hinty, `aria-describedby`, `aria-invalid`, `aria-busy`, `role="alert"` i fokus na błędzie.
- `400` mapuje `errors[]` na pola, `401` daje komunikat „Nieprawidłowy login lub hasło.”, a `429` pokazuje `Retry-After`.
- Po logowaniu i wylogowaniu token CSRF jest resetowany; `403 CSRF_INVALID` powoduje jedną ponowną próbę po `GET /api/auth/csrf`.
- Tryb dev proxuje `/api` i `/actuator`; cel zmienisz przez `VITE_API_PROXY_TARGET` (domyślnie `http://localhost:8080`). W Compose ten sam origin zapewnia nginx na `http://localhost:3000`.

Testy: `npm test` — 26 testów klienta, formularza, sesji i widoku aplikacji. Raport i smoke przeglądarkowy: [`../docs/TEST_REPORT_FRONTEND.md`](../docs/TEST_REPORT_FRONTEND.md).
