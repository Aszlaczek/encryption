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
│   ├── crypto/     # formularze szyfrowania/deszyfrowania, limity, API
│   └── messages/   # lista z paginacją, podgląd pakietu i deszyfrowanie na żądanie
├── shared/     # kod współdzielony, niezależny od funkcji
│   ├── api/        # klient HTTP i obsługa błędów RFC 9457
│   └── ui/         # dostępne komponenty prezentacyjne (FormField, CopyButton)
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

## Szyfrowanie i deszyfrowanie

- `features/crypto` ma dwie sekcje widoczne jednocześnie: „Szyfrowanie” i „Deszyfrowanie”.
- „Szyfruj” wywołuje `POST /api/crypto/encrypt` i nic nie zapisuje; „Szyfruj i zapisz” wywołuje `POST /api/messages` i pokazuje `id`, czas oraz pakiet.
- Licznik pokazuje punkty kodowe i bajty UTF-8 (limit 10 000 / 40 000 B); pakiet ma limit 56 000 znaków. Serwer pozostaje źródłem prawdy.
- Pakiet i odszyfrowana treść są kopiowane przez Clipboard API. Brak API lub odmowa daje komunikat o ręcznym kopiowaniu.
- Wynik jest renderowany wyłącznie jako tekst (`<output>`, `<pre>`); nie używaj `dangerouslySetInnerHTML`.
- `INVALID_PACKAGE_FORMAT` i `DECRYPT_FAILED` mają osobne komunikaty; `429` pokazuje `Retry-After`.
- `401` z chronionego endpointu kończy sesję: `expireSession()` czyści stan i CSRF, a formularz logowania pokazuje „Sesja wygasła. Zaloguj się ponownie.”.

## Lista zapisanych wiadomości

- `features/messages` pobiera pierwszą stronę przez `GET /api/messages?limit=10` i dokłada kolejne po „Pobierz więcej”, przekazując kursor z poprzedniej odpowiedzi bez jego interpretacji.
- Lista pokazuje wyłącznie `id` i `createdAt`. Pakiet (`GET /api/messages/{id}`) i plaintext (`POST /api/messages/{id}/decrypt`) są pobierane dopiero po kliknięciu „Pokaż pakiet”/„Odszyfruj” przy wybranej wiadomości; nie ma masowego pobierania treści.
- Kursor przesuwa się dopiero po sukcesie: błąd strony zachowuje wczytane pozycje i ponawia ten sam kursor. Pozycje są deduplikowane po `id`, a `hasMore` bez kursora jest traktowane jako błąd.
- Stany mają `role="status"`/`role="alert"` i fokus na alercie; „Odśwież listę” wraca do pierwszej strony.
- `401` kończy sesję przez `onSessionExpired`. `App` montuje panel z `key={user.id}`, więc wylogowanie i zmiana konta usuwają listę oraz odszyfrowaną treść.
- Wynik deszyfrowania jest renderowany wyłącznie jako tekst w `<pre>`; nie używaj `dangerouslySetInnerHTML` ani `innerHTML`.

Testy: `npm test` — 106 testów klienta, formularza logowania, sesji, limitów, API crypto, paneli, listy wiadomości i widoku aplikacji. Raport i smoke przeglądarkowy: [`../docs/TEST_REPORT_FRONTEND.md`](../docs/TEST_REPORT_FRONTEND.md).
