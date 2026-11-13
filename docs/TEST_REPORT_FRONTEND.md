# Raport testów frontendu — klient API, logowanie i sesja (ZR-17)

- **Data:** 2026-11-13
- **Zadanie:** ZR-17 — frontend logowania i klient API
- **Wymagania:** R01, R02, R08
- **Zależności potwierdzone:** ZR-04 (`5cf29ca`), ZR-08 (`fb2c9b5`), ZR-15 (`a310d9e`)
- **Commit funkcjonalny:** (hash w commicie statusowym)
- **Zakres kodu:** `frontend/src/shared/api/`, `frontend/src/features/auth/`, `frontend/src/app/App.tsx`, `frontend/vite.config.ts`, `frontend/src/styles/global.css`

## 1. Środowisko

| Element | Wartość |
|---|---|
| System | macOS (arm64) |
| Node.js | 22.19.0 |
| npm | 11.16.0 |
| React | 19.3.1 |
| Vite | 7.3.7 |
| TypeScript | 6.0.3 |
| Vitest | 5.1.0 |
| Testing Library | RTL 16, user-event 14, jsdom 29 |
| ESLint / Prettier | 10 / 3.9.10 |
| Smoke przeglądarkowy | Playwright 1.64.1 + Google Chrome (headless), ad-hoc poza repozytorium |
| Backend | Spring Boot 4.1.2 / Java 17, Compose, PostgreSQL 16 |
| Publiczny adres | `http://localhost:3000` (nginx), backend i baza niepublikowane |

## 2. Komendy i wyniki

```text
cd frontend && npm run lint          -> OK (0 błędów, 0 ostrzeżeń)
cd frontend && npm run format:check  -> All matched files use Prettier code style!
cd frontend && npm test              -> Test Files 4 passed (4), Tests 26 passed (26)
cd frontend && npm run build         -> tsc -b + vite build, dist/ wygenerowany

docker compose up -d --build         -> db/backend/frontend healthy
curl http://localhost:3000/actuator/health -> 200
curl http://localhost:3000/api/messages    -> 401 bez sesji
curl http://localhost:3000/                -> 200
```

Build produkcyjny: `dist/index.html` 0,59 kB, CSS 3,50 kB, JS 232,18 kB (gzip 72,91 kB).

## 3. Testy jednostkowe i komponentowe (26)

| Plik | Liczba | Scenariusze |
|---|---:|---|
| `src/shared/api/client.test.ts` | 8 | GET bez CSRF; POST z tokenem z cookie; pobranie `/api/auth/csrf` przy braku cookie; parsowanie RFC 9457, `errors[]` i `Retry-After`; fallback dla nie-JSON; jednorazowy retry po `403 CSRF_INVALID`; brak drugiego retry; `204` → `undefined` |
| `src/features/auth/LoginForm.test.tsx` | 8 | etykiety, hinty i `aria-describedby`; pusty submit bez requestu; `aria-invalid` i fokus na pierwszym błędzie; trim loginu bez trimowania hasła; stan pending i `aria-busy`; `401` z czyszczeniem hasła; `429` z `Retry-After`; `400` mapowane na pola; błąd sieci |
| `src/features/auth/AuthProvider.test.tsx` | 7 | `/me` 200 → powłoka zalogowana; `/me` 401 → formularz bez alertu; `/me` 500 → retry; login → użytkownik i brak `ownerId`; logout 204 → formularz; logout 401 → formularz; logout 500 → alert i zachowana sesja; brak zapisów do storage i brak hasła w cookies |
| `src/app/App.test.tsx` | 3 | nagłówek, link do repozytorium, landmark `main` i skip link |

Klient API jest testowany na zamockowanym `fetch`; testy sprawdzają metodę, `credentials: 'same-origin'`, `cache: 'no-store'`, nagłówki CSRF i treść żądania. Formularz jest testowany przez `user-event`, a sesja przez pełny `AuthProvider` + `App`.

## 4. Dostępność formularza

| Wymaganie | Realizacja | Dowód |
|---|---|---|
| Etykiety pól | `<label htmlFor>` powiązany z `input id` | `getByLabelText('Login')`, `getByLabelText('Hasło')` |
| Opis pola | hint `id="login-username-hint"` i `aria-describedby` | test sprawdza wartość atrybutu |
| Błąd pola | `<p id="login-username-error">` dopisany do `aria-describedby` | test sprawdza hint + błąd i `aria-invalid="true"` |
| Fokus | pierwsze błędne pole; alert `tabIndex={-1}` | test `toHaveFocus()` oraz smoke |
| Stan oczekiwania | `aria-busy`, disabled inputs i przycisku, `role="status"` | test pending |
| Komunikaty | `role="alert"` dla `401`/`429`/sieci | testy i smoke |
| Nawigacja | skip link i landmark `main` | `App.test.tsx` |

## 5. Smoke w przeglądarce

Scenariusz uruchomiony ad-hoc przez Playwright 1.64.1 z Google Chrome (headless) przeciwko Compose i nginx. Skrypt nie jest częścią repozytorium; formalny E2E pozostaje osobnym zadaniem.

| Krok | Oczekiwanie | Wynik |
|---|---|---|
| Wejście na `http://localhost:3000` | formularz „Zaloguj się”, `autocomplete=username`, `type=password` | PASS |
| Pusty submit | `aria-invalid`, `aria-describedby` z `login-username-error`, fokus na polu, komunikat „Podaj login.” | PASS |
| Błędne hasło | `401`, alert „Nieprawidłowy login lub hasło.”, fokus na alercie, hasło wyczyszczone | PASS |
| Poprawne `alice` / `AliceDemo123!` | „Zalogowano”, użytkownik `alice` | PASS |
| Reload | sesja nadal aktywna dzięki `JSESSIONID` | PASS |
| Cookies po logowaniu | `JSESSIONID` `HttpOnly` + `SameSite=Lax`; `XSRF-TOKEN` czytelny dla JS | PASS |
| Wylogowanie | powrót do formularza, `POST /api/auth/logout 204` | PASS |
| Reload po wylogowaniu | formularz logowania, brak cookies sesji | PASS |
| Storage | `localStorage`, `sessionStorage` i IndexedDB puste; brak hasła w storage i cookies | PASS |

Sekwencja API zarejestrowana przez Playwright:

```text
GET  /api/auth/me      401
GET  /api/auth/csrf    200
POST /api/auth/login   401
POST /api/auth/login   200
GET  /api/auth/me      200
POST /api/auth/logout  204
GET  /api/auth/me      401
```

Konsola przeglądarki nie zgłosiła błędów aplikacji; odnotowano wyłącznie oczekiwane wpisy sieciowe dla odpowiedzi `401`.

## 6. Bezpieczeństwo danych po stronie klienta

- Sesja to cookie `JSESSIONID` z `HttpOnly`; JavaScript nie ma do niego dostępu.
- CSRF to osobne cookie `XSRF-TOKEN`, wysyłane jako nagłówek tylko dla metod mutujących.
- Brak `localStorage`, `sessionStorage` i IndexedDB po logowaniu, reloadzie i wylogowaniu.
- Hasło i plaintext nie są zapisywane w storage ani w cookies; testy sprawdzają `Storage.prototype.setItem` i zawartość cookies.
- Żądanie logowania zawiera wyłącznie `username` i `password`; test potwierdza brak `ownerId`.
- Po wylogowaniu stan Reacta jest czyszczony, a drzewo zalogowane jest odmontowywane.

## 7. Ograniczenia

- Testy komponentów mockują `fetch`; nie zastępują E2E.
- Smoke Playwright był jednorazowy i nie jest commitowany; nie ma jeszcze konfiguracji Playwright, testów axe ani CI.
- Po zalogowaniu dostępna jest tylko powłoka użytkownika; lista, edytor i usuwanie wiadomości powstaną w kolejnym zadaniu.
- Brak testów responsywności i zrzutów przy 360/768/1280 px; R07 pozostaje otwarte.
- `XSRF-TOKEN` jest czytelny dla JavaScript z założenia; ochrona opiera się na `SameSite=Lax`, weryfikacji nagłówka i braku prostego cross-origin odczytu.
- Formularz nie zawiera jeszcze polityki haseł ani rejestracji — konta są wyłącznie demonstracyjne.

## 8. Dziennik wykonania

| Data | Zmiana | Uzasadnienie | Problem i rozwiązanie | Testy | Następny krok |
|---|---|---|---|---|---|
| 2026-11-13 | Dodano `shared/api` (klient, `ApiError`, CSRF), `features/auth` (API, `AuthProvider`, `useAuth`, `LoginForm`, `SessionPanel`), `shared/ui/FormField`, przebudowano `App`, dodano proxy Vite i style. | Realizacja R01, R02, R08: logowanie i wylogowanie z backendem, dostępne błędy pól, brak sekretów w storage. | (1) ESLint blokował synchroniczny `setState` w efekcie — przeniesiono ustawianie `loading` do akcji retry. (2) `FormField.tsx` i `formField.ts` kolidowały na case-insensitive macOS i komponent był `undefined` — helper przeniesiono do `fieldDescription.ts`. (3) Retry CSRF używał starego cookie — klient preferuje teraz token w pamięci po wymuszonym odświeżeniu. | `npm run lint`, `format:check`, `npm test` 26/26, `npm run build`; smoke Playwright PASS. | UI listy/edytora wiadomości, potem `DELETE` i limitery crypto. |
