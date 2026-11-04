# Frontend

React 19 + Vite 7 + TypeScript 6. Wersje są przypięte dokładnie w `package.json`, a pełne drzewo zależności w `package-lock.json`.

## Komendy

```bash
nvm use            # Node 22 (plik .nvmrc)
npm ci
npm run dev        # http://localhost:5173
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
