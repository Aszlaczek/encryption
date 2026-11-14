# Raport testów frontendu — klient API, logowanie, sesja, formularze crypto, lista i usuwanie wiadomości oraz responsywność i dostępność (ZR-17…ZR-21)

- **Data:** 2026-11-13 (ZR-17…ZR-19), 2026-11-14 (ZR-20, ZR-21)
- **Zadania:** ZR-17 — klient API i logowanie; ZR-18 — formularze szyfrowania i deszyfrowania; ZR-19 — lista zapisanych wiadomości; ZR-20 — usuwanie zapisanych wiadomości; ZR-21 — responsywność i dostępność
- **Wymagania:** R01, R02, R03, R04, R06, R07, R08, R09
- **Zależności ZR-18 potwierdzone:** ZR-13 (`7c10342`), ZR-14 (`66fce7a`), ZR-17 (`c51a319`)
- **Zależności ZR-19 potwierdzone:** ZR-14 (`66fce7a`), ZR-17 (`c51a319`); baseline `9e9144b`
- **Zależności ZR-20 potwierdzone:** ZR-19 (`bd0da9b`)
- **Zależności ZR-21 potwierdzone:** ZR-20 (`449e97b`), baseline dokumentacji `37092f3`
- **Commit funkcjonalny ZR-17:** `c51a319`; ZR-18: `26fda0d`; ZR-19: `bd0da9b`; ZR-20: `449e97b`; ZR-21: `46085ce`
- **Zakres kodu ZR-17:** `frontend/src/shared/api/`, `frontend/src/features/auth/`, `frontend/src/app/App.tsx`, `frontend/vite.config.ts`, `frontend/src/styles/global.css`
- **Zakres kodu ZR-18:** `frontend/src/features/crypto/`, `frontend/src/shared/ui/CopyButton.tsx`, `frontend/src/features/auth/` (`expireSession`), `frontend/src/app/App.tsx`, `frontend/src/styles/global.css`
- **Zakres kodu ZR-19:** `frontend/src/features/messages/`, `frontend/src/shared/format.ts`, `frontend/src/features/crypto/` (importy formattera), `frontend/src/app/App.tsx`, `frontend/src/test/backend.ts`, `frontend/src/styles/global.css`
- **Zakres kodu ZR-20:** `frontend/src/features/messages/` (`api.ts`, `errors.ts`, `MessageListItem.tsx`, `MessagesPanel.tsx` i testy), `frontend/src/styles/global.css`
- **Zakres kodu ZR-21:** `frontend/src/app/App.tsx`, `frontend/src/features/messages/` (`MessageListItem.tsx`, `MessagesPanel.tsx` i testy), `frontend/src/features/crypto/` (`EncryptPanel.tsx`, `DecryptPanel.tsx`), `frontend/src/styles/global.css`, `docs/screenshots/zr21/`

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

## 9. ZR-18 — formularze szyfrowania i deszyfrowania

- **Data:** 2026-11-13
- **Wymagania:** R01, R03, R08
- **Zależności potwierdzone:** ZR-13 (`7c10342`), ZR-14 (`66fce7a`), ZR-17 (`c51a319`)
- **Commit funkcjonalny:** `26fda0d`
- **Zakres kodu:** `frontend/src/features/crypto/` (`api.ts`, `limits.ts`, `messages.ts`, `format.ts`, `EncryptPanel`, `DecryptPanel`, `CryptoWorkspace`), `frontend/src/shared/ui/CopyButton.tsx`, `frontend/src/features/auth/` (`expireSession`, komunikat o wygaśnięciu), `frontend/src/app/App.tsx`, `frontend/src/styles/global.css`

### 9.1 Komendy i wyniki

```text
cd frontend && npm run lint          -> OK (0 błędów, 0 ostrzeżeń)
cd frontend && npm run format:check  -> All matched files use Prettier code style!
cd frontend && npm test              -> Test Files 11 passed (11), Tests 71 passed (71)
cd frontend && npm run build         -> tsc -b + vite build, dist/ wygenerowany
docker compose up -d --build frontend -> frontend healthy; 3 kontenery healthy
curl http://localhost:3000/actuator/health -> 200
POST /api/crypto/encrypt bez sesji   -> 401
POST /api/crypto/encrypt (alice)     -> 200, package v1.k1...
POST /api/crypto/decrypt (alice)     -> 200, "Zażółć gęślą jaźń 🔐"
POST /api/messages                   -> 201, id + createdAt + package
POST /api/crypto/decrypt zapisanego  -> 200, "Wiadomość zapisana przez smoke test"
POST /api/crypto/decrypt "nie-pakiet" -> 400 INVALID_PACKAGE_FORMAT
POST /api/crypto/decrypt obcy pakiet -> 422 DECRYPT_FAILED
grep -rn "dangerouslySetInnerHTML|innerHTML" src -> brak wystąpień
./scripts/check-secrets.sh           -> OK
git diff --check                     -> OK
```

Build produkcyjny: `dist/index.html` 0,59 kB, CSS 5,26 kB, JS 241,33 kB (gzip 75,09 kB).

### 9.2 Testy (71)

| Plik | Liczba | Scenariusze |
|---|---:|---|
| `src/shared/api/client.test.ts` | 8 | bez zmian z ZR-17: CSRF, RFC 9457, retry, `204` |
| `src/features/auth/LoginForm.test.tsx` | 8 | bez zmian z ZR-17: etykiety, błędy pól, pending, `401`/`429`/sieć |
| `src/features/auth/AuthProvider.test.tsx` | 8 | ZR-17 + `401` z crypto kończy sesję i pokazuje komunikat na logowaniu |
| `src/app/App.test.tsx` | 4 | ZR-17 + zalogowany widok zawiera obie sekcje crypto |
| `src/shared/ui/CopyButton.test.tsx` | 3 | kopiowanie i `role="status"`; odrzucenie clipboardu; brak Clipboard API |
| `src/features/crypto/limits.test.ts` | 7 | punkty kodowe vs UTF-16; bajty UTF-8; puste/blank; granice 10 000 i 40 000 B; granica 56 000 znaków |
| `src/features/crypto/api.test.ts` | 4 | ciała `{plaintext}`/`{package}`; CSRF; `201`; brak `ownerId` |
| `src/features/crypto/messages.test.ts` | 8 | sieć, `401`, błąd pola, `detail`, format vs `DECRYPT_FAILED`, `429`, `403`, `5xx` |
| `src/features/crypto/EncryptPanel.test.tsx` | 11 | etykiety i licznik; pusty submit; wynik jako tekst; osobny zapis; pending; błąd pola; `429`; `401`; sieć; kopiowanie |
| `src/features/crypto/DecryptPanel.test.tsx` | 9 | etykiety; pusty submit; `trim()`; XSS jako tekst; zły format; `DECRYPT_FAILED`; `401`; pending; kopiowanie treści |
| `src/features/crypto/CryptoWorkspace.test.tsx` | 1 | obie sekcje i pola widoczne jednocześnie |

Klient crypto jest testowany na zamockowanym `fetch`, a panele na zamockowanym module `./api`; `CopyButton` i kopiowanie w panelach używają podstawionego `navigator.clipboard` (nadpisywanego po `userEvent.setup()`).

### 9.3 Mapowanie kryteriów akceptacji

| Kryterium | Dowód |
|---|---|
| Pakiet można skopiować i odszyfrować na tym samym koncie | `EncryptPanel` — „copies the encrypted package”; `DecryptPanel` — round-trip treści; smoke: `navigator.clipboard.readText()` zwrócił dokładnie pakiet, a `POST /api/crypto/decrypt` zwrócił `Zażółć gęślą jaźń 🔐`; zapisany pakiet również odszyfrowany |
| Błędny pakiet daje czytelny komunikat | `messages.test.ts` i `DecryptPanel.test.tsx` rozróżniają `INVALID_PACKAGE_FORMAT` („Pakiet ma nieprawidłowy format…”) od `DECRYPT_FAILED` („Nie udało się odszyfrować pakietu…”); smoke potwierdził `400` i `422` z tymi komunikatami |
| Treść renderowana jako tekst bez `innerHTML` | `DecryptPanel` — payload `<img src=x onerror="window.__xss=1">` jest widoczny jako tekst, `region.querySelector('img') === null`, handler nie wykonał się; smoke: 0 elementów `img`; `grep` po `src` nie znajduje `innerHTML` ani `dangerouslySetInnerHTML` |

### 9.4 Smoke w przeglądarce

Playwright 1.64.1 + Google Chrome (headless), ad-hoc poza repozytorium, przeciwko Compose i nginx. Uprawnienia `clipboard-read`/`clipboard-write` nadane dla `http://localhost:3000`.

| Krok | Oczekiwanie | Wynik |
|---|---|---|
| Logowanie `alice` / `AliceDemo123!` | widok „Zalogowano” i nagłówek „Szyfrowanie i deszyfrowanie” | PASS |
| Pusty submit szyfrowania | komunikat „Wpisz treść wiadomości.”, fokus na textarea | PASS |
| „Szyfruj” z tekstem Unicode/emoji | pakiet `v1.…`, brak zapisu | PASS |
| „Kopiuj pakiet” | schowek zawiera dokładnie pakiet, status „Skopiowano pakiet” | PASS |
| Wklejenie pakietu i „Odszyfruj” | treść identyczna z wejściem | PASS |
| Szyfrowanie i deszyfrowanie `<img onerror>` | tekst zamiast elementu; 0 `img`; brak `window.__xss` | PASS |
| Pakiet `nie-pakiet` | komunikat o nieprawidłowym formacie | PASS |
| Pakiet obcego pochodzenia | komunikat `DECRYPT_FAILED` | PASS |
| „Szyfruj i zapisz” | `201`, ID 36 znaków, `<time datetime>`, pakiet | PASS |
| Deszyfrowanie zapisanego pakietu | treść identyczna | PASS |
| Storage po operacjach | `localStorage`, `sessionStorage`, IndexedDB puste; brak plaintextu i hasła w cookies | PASS |

Sekwencja API zarejestrowana przez Playwright:

```text
GET  /api/auth/me         401
GET  /api/auth/csrf       200
POST /api/auth/login      200
POST /api/crypto/encrypt  200
POST /api/crypto/decrypt  200
POST /api/crypto/encrypt  200
POST /api/crypto/decrypt  200
POST /api/crypto/decrypt  400
POST /api/crypto/decrypt  422
POST /api/messages        201
POST /api/crypto/decrypt  200
```

Konsola przeglądarki nie zgłosiła błędów strony (`pageerror` puste); odnotowano wyłącznie oczekiwane wpisy sieciowe dla `401`, `400` i `422`.

### 9.5 Ograniczenia

- Smoke Playwright był jednorazowy i nie jest commitowany; formalne E2E i axe pozostają osobnym zadaniem.
- Testy komponentów mockują moduł API; realny kontrakt potwierdzają testy `api.test.ts` i smoke.
- Limiter crypto 60/30 nie istnieje w backendzie; mapowanie `429` jest pokryte testem jednostkowym, nie realnym żądaniem.
- Kopiowanie wymaga bezpiecznego kontekstu (localhost lub HTTPS); przy odmowie użytkownik dostaje komunikat o ręcznym kopiowaniu.
- Brak jeszcze listy i usuwania zapisanych wiadomości; formularz szyfrowania jest jedynym edytorem treści.
- Brak testów responsywności i zrzutów przy 360/768/1280 px; R07 pozostaje otwarte.

### 9.6 Dziennik wykonania

| Data | Zmiana | Uzasadnienie | Problem i rozwiązanie | Testy | Następny krok |
|---|---|---|---|---|---|
| 2026-11-13 | Dodano `features/crypto` (API, limity, mapowanie błędów, panele, workspace), `shared/ui/CopyButton`, `expireSession` i komunikat o wygaśnięciu sesji; zaktualizowano `App`, `SessionPanel`, style i testy. | Realizacja R01, R03, R08: szyfrowanie bez zapisu i z zapisem, deszyfrowanie wklejonego pakietu, kopiowanie, czytelne błędy i treść bez `innerHTML`. | (1) `userEvent.setup()` nadpisywał podstawiony `navigator.clipboard`, więc testy kopiowania padały — clipboard ustawiany jest po `setup()`. (2) `.focus()` na textarea w `catch` nie działał, bo pole było jeszcze `disabled` — fokus przeniesiono do efektu na `fieldError`. (3) `Intl.NumberFormat('pl-PL')` wstawia niełamliwe spacje — testy polegają na normalizacji białych znaków. | `npm run lint`, `format:check`, `npm test` 71/71, `npm run build`; smoke Playwright PASS; `check-secrets` i `git diff --check` OK. | UI listy i usuwania wiadomości, `DELETE`, limitery crypto, potem formalne E2E i CI. |

---

## 10. ZR-19 — lista zapisanych wiadomości

### 10.1 Komendy i wyniki

Weryfikacja 2026-11-13; Node.js 22.19.0, npm 11.16.0, Playwright 1.64.1 + Google Chrome, Docker Compose, PostgreSQL 16.

```text
cd frontend && npm run lint          -> OK
cd frontend && npm run format:check  -> All matched files use Prettier code style!
cd frontend && npm test              -> 15 plików, 106/106 testów, PASS
cd frontend && npm run build         -> tsc -b + vite build; JS 248.82 kB (gzip 76.56 kB), CSS 6.24 kB
docker compose up -d --build frontend -> frontend healthy; 3 kontenery healthy
curl http://localhost:3000/actuator/health -> 200
./scripts/check-secrets.sh           -> OK
git diff --check                     -> OK
```

### 10.2 Testy (106)

| Plik | Liczba | Co sprawdza |
|---|---:|---|
| `src/features/messages/api.test.ts` | 6 | `limit=10`, kursor bez reinterpretacji, `AbortSignal`, szczegóły po `id`, decrypt POST bez ciała z CSRF, brak `ownerId` |
| `src/features/messages/errors.test.ts` | 7 | sieć, `401`, `404`/`INVALID_MESSAGE_ID`, `INVALID_CURSOR`, `429`, `403`, `MESSAGE_UNDECRYPTABLE` vs `500` |
| `src/features/messages/MessageListItem.test.tsx` | 9 | brak pobierania przy renderze, pakiet po kliknięciu i kopiowanie, ukrycie bez refetchu, decrypt na żądanie, XSS jako tekst, kopiowanie treści, pending, `404`/`MESSAGE_UNDECRYPTABLE` z fokusem, `401` kończący sesję |
| `src/features/messages/MessagesPanel.test.tsx` | 12 | ładowanie i pustka, brak prefetchu, kolejna strona z kursorem, błąd strony z retry tego samego kursora, błąd pierwszej strony, `401` dla pierwszej i kolejnej strony, `429`, `hasMore` bez kursora, deduplikacja, odświeżenie, abort przy odmontowaniu |

Pozostałe pliki bez zmian funkcjonalnych: `App.test.tsx` ma teraz 5 testów (dodano listę i czyszczenie po wylogowaniu), a `AuthProvider.test.tsx` korzysta z routera `fetch` po ścieżce. Łącznie 106 testów w 15 plikach.

### 10.3 Mapowanie kryteriów akceptacji

| Kryterium | Dowód |
|---|---|
| Widoczne wyłącznie wiadomości bieżącego konta | `MessagesPanel.test.tsx` renderuje tylko zwrócone pozycje i nie pobiera treści; curl: lista Alicji nie zawiera identyfikatorów Boba, Bob widzi tylko swoje 2; smoke sprawdza brak ID Boba w treści strony przed i po paginacji; obcy `GET`/`decrypt` zwraca `404 MESSAGE_NOT_FOUND` |
| Paginacja działa i pokazuje błędy API | `MessagesPanel.test.tsx`: kolejna strona z kursorem, błąd strony z retry tego samego kursora, `429`, `hasMore` bez kursora, deduplikacja, abort; smoke: wymuszony `500` zachowuje 10 pozycji i alert, retry dociąga 14 unikalnych; curl: `INVALID_CURSOR` → `400`, `limit=0` → `400 VALIDATION_FAILED` |
| Wylogowanie czyści wrażliwy stan widoku | `App.test.tsx`: po wylogowaniu brak odszyfrowanej treści i ID wiadomości, storage pusty; smoke: po wylogowaniu brak listy i plaintextu w `body`, `localStorage`/`sessionStorage`/IndexedDB puste |

### 10.4 Smoke w przeglądarce

Playwright 1.64.1 + Google Chrome (headless), ad-hoc poza repozytorium, przeciwko Compose i nginx. Scenariusz rejestruje wszystkie żądania `/api/*` i sprawdza stan DOM oraz storage.

| Krok | Oczekiwanie | Wynik |
|---|---|---|
| Logowanie `alice` / `AliceDemo123!` | nagłówek „Zapisane wiadomości” i 10 pozycji | PASS |
| Pierwsze wejście | dokładnie jedno `GET /api/messages?limit=10`, zero `GET /api/messages/{id}` i zero `POST …/decrypt` | PASS |
| Izolacja | brak identyfikatorów Boba w widoku Alicji | PASS (2 sprawdzone) |
| Wymuszony `500` na kolejnej stronie | 10 wcześniejszych pozycji zostaje, `role="alert"` z komunikatem | PASS |
| „Spróbuj ponownie” po błędzie | ten sam kursor, 14 unikalnych pozycji, brak duplikatów | PASS |
| „Pokaż pakiet” | jedno `GET /api/messages/{id}`, pakiet `v1.…` w `<output>` | PASS |
| „Kopiuj pakiet” | schowek zawiera dokładnie pakiet, status „Skopiowano pakiet” | PASS |
| „Odszyfruj” dla `<img onerror>` | tekst w `<pre>`, 0 elementów `img`, brak wykonania handlera, jedno `POST …/decrypt` | PASS |
| Storage po operacjach | `localStorage`, `sessionStorage`, IndexedDB puste; brak plaintextu i hasła w cookies | PASS |
| Wylogowanie | brak listy i plaintextu w DOM, storage pusty | PASS |

Sekwencja API zarejestrowana przez Playwright (skrót):

```text
GET  /api/auth/me          401
GET  /api/auth/csrf        200
POST /api/auth/login       200
GET  /api/messages?limit=10 200
GET  /api/messages?limit=10&cursor=… 500 (wymuszony)
GET  /api/messages?limit=10&cursor=… 200 (ten sam kursor)
GET  /api/messages/{id}    200
POST /api/messages/{id}/decrypt 200
POST /api/messages         201 (wiadomość z payloadem XSS)
POST /api/messages/{id}/decrypt 200
POST /api/auth/logout      204
```

Konsola przeglądarki nie zgłosiła błędów strony (`pageerror` puste); odnotowano wyłącznie oczekiwane wpisy sieciowe dla `401` i wymuszonego `500`.

### 10.5 Ograniczenia

- Smoke Playwright był jednorazowy i nie jest commitowany; formalne E2E i axe pozostają osobnym zadaniem.
- Testy komponentów mockują moduł `./api`; realny kontrakt potwierdzają `api.test.ts`, curl i smoke.
- Brak usuwania wiadomości: `DELETE /api/messages/{id}` i przycisk usuwania są poza zakresem ZR-19.
- Limiter crypto 60/30 nadal nie istnieje; mapowanie `429` jest pokryte testem jednostkowym i sztuczną odpowiedzią, nie realnym limitem.
- Lista pobiera kolejne strony ręcznie; brak automatycznego infinite scroll i brak wirtualizacji długich list.
- Konto Alicji miało dodatkowe wiadomości z wcześniejszych smoke'ów, więc liczba 14 dotyczy stanu bazy w chwili testu, a nie stałej fixtures.

### 10.6 Dziennik wykonania

| Data | Zmiana | Uzasadnienie | Problem i rozwiązanie | Testy | Następny krok |
|---|---|---|---|---|---|
| 2026-11-13 | Dodano `features/messages` (API, mapowanie błędów, panel, element listy), `shared/format.ts`, style listy i wyników, router `fetch` w testach; zaktualizowano `App`, `App.test.tsx` i `AuthProvider.test.tsx`. | Realizacja R01, R04, R09: lista tylko własnych wiadomości, paginacja z obsługą błędów, podgląd pakietu i deszyfrowanie na żądanie, brak masowego plaintextu i czyszczenie po wylogowaniu. | (1) `App` przekazywał nową funkcję `expireSession` przy każdym renderze, co restartowało pierwsze pobranie — callback trafił do `useRef`. (2) Kolejka `mockResolvedValueOnce` przesuwała się po dodaniu żądania listy — testy integracyjne dostały router po ścieżce. (3) `userEvent.setup()` nadpisywał clipboard — stub ustawiany jest po `setup()`. (4) Przycisk „Pobierz więcej” zmienia tekst na „Pobieranie…”, więc smoke czeka na „To wszystkie zapisane wiadomości.” zamiast na odmontowanie przycisku. | `npm run lint`, `format:check`, `npm test` 106/106, `npm run build`; curl i smoke Playwright PASS; `check-secrets` i `git diff --check` OK. | `DELETE /api/messages/{id}` i UI usuwania, potem limitery crypto, formalne E2E i CI. |

---

## 11. ZR-20 — usuwanie zapisanych wiadomości

### 11.1 Komendy i wyniki

Weryfikacja 2026-11-14; Node.js 22.19.0, npm 11.16.0, Playwright 1.64.1 + Google Chrome 157, Docker Compose, PostgreSQL 16.15.

```text
cd frontend && npm run lint          -> OK (0 błędów, 0 ostrzeżeń)
cd frontend && npm run format:check  -> All matched files use Prettier code style!
cd frontend && npm test              -> 15 plików, 120/120 testów, PASS
cd frontend && npm run build         -> tsc -b + vite build; JS 250.70 kB (gzip 77.08 kB), CSS 6.91 kB
docker compose up -d --build         -> 3 kontenery healthy
curl http://localhost:3000/actuator/health -> 200
./scripts/check-secrets.sh           -> OK
node scripts/validate-api-contract.mjs -> OK
git diff --check                     -> OK
```

### 11.2 Testy modułu messages (48 z 120)

| Plik | Liczba | Co doszło w ZR-20 |
|---|---:|---|
| `src/features/messages/api.test.ts` | 8 | `deleteMessage`: `DELETE` bez ciała, `cache: 'no-store'`, CSRF, `204` → `undefined`, `encodeURIComponent` w ścieżce; brak `ownerId` także dla usuwania |
| `src/features/messages/errors.test.ts` | 8 | `isMissingMessage`: `404 MESSAGE_NOT_FOUND` i `400 INVALID_MESSAGE_ID` to „już usunięta”, a `INVALID_CURSOR`, `500` i błąd sieci — nie |
| `src/features/messages/MessageListItem.test.tsx` | 15 | potwierdzenie inline z fokusem na „Tak, usuń”, anulowanie bez żądania, `DELETE` dopiero po potwierdzeniu, blokada akcji podczas `pending`, `404` → `onDeleted(..., { alreadyGone: true })`, błąd `500` z alertem i zachowaną pozycją, `401` kończący sesję |
| `src/features/messages/MessagesPanel.test.tsx` | 17 | usunięcie tylko wskazanej pozycji bez zmiany kursora, auto-dociągnięcie kolejnej strony po usunięciu ostatniej widocznej, pustka dopiero bez `hasMore`, komunikat „Wiadomość była już usunięta.”, błąd inny niż `404` zostawia listę |

Pozostałe pliki bez zmian; łącznie 120 testów w 15 plikach.

### 11.3 Mapowanie kryteriów akceptacji

| Kryterium | Dowód |
|---|---|
| Użytkownik może usunąć własną wiadomość | `api.test.ts` potwierdza `DELETE /api/messages/{id}` z CSRF; `MessageListItem.test.tsx` — żądanie dopiero po „Tak, usuń”; smoke: `DELETE … 204`, pozycja i odszyfrowana treść znikają z DOM |
| Usunięcie wymaga świadomego potwierdzenia | `role="group"` „Potwierdzenie usunięcia wiadomości”, fokus na „Tak, usuń”, „Anuluj” chowa grupę i nie wysyła żądania; smoke potwierdza brak `DELETE` przed potwierdzeniem i fokus |
| Usunięta lub nieistniejąca wiadomość nie blokuje widoku | `404` jest mapowane na sukces: pozycja znika, panel pokazuje `role="status"` „Wiadomość była już usunięta.”, brak alertu; smoke usuwa wiersz w tle i powtarza akcję w UI |
| Paginacja pozostaje spójna po usunięciu | Test panelu: kursor bez zmian, po usunięciu ostatniej widocznej pozycji przy `hasMore=true` dociągana jest następna strona tym samym kursorem; pustka tylko przy braku dalszych danych |
| Brak wycieku treści | `pre` z plaintextem znika razem z pozycją; smoke: brak markera w DOM po usunięciu i po wylogowaniu, `localStorage`/`sessionStorage` puste |

### 11.4 Smoke w przeglądarce (21/21)

Playwright 1.64.1 + Google Chrome 157 (headless), ad-hoc poza repozytorium, przeciwko Compose i nginx.

| Krok | Oczekiwanie | Wynik |
|---|---|---|
| Logowanie `alice` / `AliceDemo123!` | widoczna lista „Zapisane wiadomości” | PASS |
| „Szyfruj i zapisz” | `201`, nowe `id` | PASS |
| „Odśwież listę” | pozycja z tym `id` w `li.message-item` | PASS |
| „Pokaż pakiet” i „Odszyfruj” przed usunięciem | pakiet `v1.…` i plaintext w pozycji | PASS |
| „Usuń” | grupa potwierdzenia, fokus na „Tak, usuń”, brak `DELETE` przed potwierdzeniem | PASS |
| „Anuluj” | grupa znika, pozycja zostaje, brak żądania | PASS |
| „Tak, usuń” | `DELETE` → `204`, pozycja odmontowana, brak plaintextu w DOM | PASS |
| Wiersz usunięty w tle (`fetch` z tej samej sesji) | `DELETE` → `204` | PASS |
| Ponowne usunięcie w UI | `DELETE` → `404`, komunikat „Wiadomość była już usunięta.”, pozycja znika, brak alertu | PASS |
| Storage po operacjach | `localStorage` i `sessionStorage` puste | PASS |
| Wylogowanie | powrót do formularza, brak listy i plaintextu w DOM | PASS |
| Błędy strony | `pageerror` puste | PASS |

Sekwencja API zarejestrowana przez Playwright:

```text
GET    /api/messages?limit=10        200
POST   /api/messages                 201
GET    /api/messages?limit=10        200
GET    /api/messages/{id}            200
POST   /api/messages/{id}/decrypt    200
DELETE /api/messages/{id}            204
POST   /api/messages                 201
GET    /api/messages?limit=10        200
DELETE /api/messages/{id}            204 (w tle, ta sama sesja)
DELETE /api/messages/{id}            404 (UI traktuje jak sukces)
```

### 11.5 Ograniczenia ZR-20

- Smoke Playwright był jednorazowy i nie jest commitowany; formalne E2E i axe pozostają osobnym zadaniem.
- Testy komponentów mockują moduł `./api`; realny kontrakt potwierdzają `api.test.ts`, curl i smoke.
- `handleDeleted` czyta stan z bieżącego renderu; jedno usunięcie kończy się przed kolejnym, więc nie ma równoległych usunięć w jednym panelu.
- Auto-dociągnięcie strony to jedno dodatkowe żądanie listy wywołane akcją użytkownika, nie prefetch pakietów ani plaintextu.
- Limiter crypto 60/30 nadal nie istnieje; mapowanie `429` jest pokryte testem jednostkowym, nie realnym limitem.
- Brak testów responsywności i zrzutów przy 360/768/1280 px; R07 pozostawało otwarte. **Uzupełnione w ZR-21 — patrz sekcja 12.**

### 11.6 Dziennik wykonania

| Data | Zmiana | Uzasadnienie | Problem i rozwiązanie | Testy | Następny krok |
|---|---|---|---|---|---|
| 2026-11-14 | Dodano `deleteMessage`, `isMissingMessage`, potwierdzenie inline w `MessageListItem`, usuwanie pozycji i auto-dociągnięcie strony w `MessagesPanel`, style `button--danger`/potwierdzenia/komunikatu oraz 14 testów. | Realizacja R01, R04, R06, R09: trwałe usuwanie własnej wiadomości z potwierdzeniem, `404` jako osiągnięty cel, spójny kursor i brak treści w DOM. | (1) `404` przy usuwaniu nie może pokazywać alertu — dodano `isMissingMessage` i osobną ścieżkę `alreadyGone` z `role="status"`. (2) Po usunięciu ostatniej widocznej pozycji `handleLoadMore` miał nieaktualne domknięcie — panel wywołuje `loadNextPage` z kursorem ze stanu. (3) Smoke nie może szukać `id` w `body`, bo pokazuje go też sekcja wyniku szyfrowania — lokalizator `li.message-item`. | `npm run lint`, `format:check`, `npm test` 120/120, `npm run build`; curl i smoke Playwright 21/21 PASS; `check-secrets`, `validate-api-contract` i `git diff --check` OK. | Limitery crypto 60/30, potem formalne E2E, CI i `docs/PERFORMANCE.md`. |

## 12. ZR-21 — responsywność i dostępność

### 12.1 Środowisko

| Element | Wartość |
|---|---|
| Data pomiarów | 2026-11-14 |
| Baseline | `37092f3` (drzewo przed zmianami), zależność funkcjonalna `449e97b` |
| System | macOS (arm64) |
| Node.js / npm | 22.19.0 / 11.16.0 |
| Playwright | 1.64.1, uruchamiany ad-hoc poza repozytorium |
| Przeglądarka | Google Chrome 157.0.8103.51, headless; UA `HeadlessChrome/157.0.0.0` |
| axe-core | 4.10.3 (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, `best-practice`) |
| Stos | Docker Compose: nginx + Spring Boot 4.1.2 / Java 17 + PostgreSQL 16.15 |
| Adres | `http://localhost:3000` (jedyny publiczny port); health `200` |
| Backend | bez zmian w ZR-21; wynik 128/128 z ZR-20 nie był ponownie uruchamiany |
| Frontend | 15 plików, 124/124 testów; lint, format i build bez błędów |

Pomiary wykonano na realnym stosie Compose i przez nginx, nie na `vite preview`. Skrypty pomiarowe i skan axe były jednorazowe (poza repozytorium); w repozytorium są zrzuty ekranu i ten raport. Formalny harness E2E/axe pozostaje osobnym zadaniem.

### 12.2 Komendy i wyniki

```text
cd frontend && npm run lint          -> OK (0 błędów, 0 ostrzeżeń)
cd frontend && npm run format:check  -> All matched files use Prettier code style!
cd frontend && npm test              -> 15 plików, 124/124 testów, PASS
cd frontend && npm run build         -> tsc -b + vite build; JS 251.85 kB (gzip 77.40 kB), CSS 7.37 kB (gzip 1.77 kB)
docker compose up -d --build frontend -> kontener frontendu odtworzony i uruchomiony
curl http://localhost:3000/actuator/health -> 200
```

### 12.3 Responsywność — pomiary i zrzuty

Dla każdego stanu sprawdzono `document.documentElement.scrollWidth <= clientWidth + 1` oraz bounding boxy wszystkich widocznych elementów poza własnymi kontenerami przewijania. Wynik „0 przyciętych” oznacza brak elementu wychodzącego poza viewport.

| Viewport | Stan | `scrollWidth` / `clientWidth` | Przepełnienie strony | Przycięte elementy |
|---|---|---:|---|---:|
| 360×800 | logowanie | 360 / 360 | nie | 0 |
| 360×800 | lista + długi pakiet i treść | 360 / 360 | nie | 0 |
| 360×800 | otwarte potwierdzenie usunięcia | 360 / 360 | nie | 0 |
| 768×1024 | logowanie / lista / długi pakiet / potwierdzenie | 768 / 768 | nie | 0 |
| 1280×800 | logowanie / lista / długi pakiet / potwierdzenie | 1280 / 1280 | nie | 0 |
| 640×400 (odpowiednik 200% przy 1280×800) | logowanie / lista / długi pakiet / potwierdzenie | 640 / 640 | nie | 0 |
| 320×320 (dodatkowo, odpowiednik 400% przy 1280×800) | logowanie / lista / długi pakiet / potwierdzenie | 320 / 320 | nie | 0 |

Zrzuty (pełna strona, Chrome 157):

- [360 px — logowanie](screenshots/zr21/zr21-360-login.png)
- [360 px — długi pakiet i treść](screenshots/zr21/zr21-360-long-package.png)
- [360 px — potwierdzenie usunięcia](screenshots/zr21/zr21-360-confirm.png)
- [768 px — długi pakiet i treść](screenshots/zr21/zr21-768-long-package.png)
- [1280 px — długi pakiet i treść](screenshots/zr21/zr21-1280-long-package.png)
- [640×400 — odpowiednik 200% zoomu](screenshots/zr21/zr21-zoom200-640-long-package.png)

**Zakres zoomu.** 200% przy oknie 1280×800 odpowiada viewportowi CSS 640×400 i taki viewport zmierzono. 360 px przy 200% daje 180 px CSS, czyli mniej niż próg reflow WCAG 2.2 (320 px CSS); ten przypadek jest poza zakresem, a 320 px CSS sprawdzono dodatkowo jako 400% przy 1280 px. Nie dodano media queries, bo pomiary nie wykazały przepełnienia — układ jednokolumnowy z `flex-wrap` i `overflow-wrap: anywhere` wystarcza od 320 px.

### 12.4 Długie pakiety i treść

- Plaintext testowy: 10 000 emoji = 10 000 punktów kodowych i 40 000 B UTF-8, czyli górne limity z `docs/API.md`.
- Wygenerowany pakiet miał **53 380 znaków** (limit 56 000), a mimo to strona nie zyskała poziomego przewijania na żadnej szerokości.
- Pakiet i treść są kontenerami przewijania: `scrollHeight` 16 992 px / 6 888 px przy `clientHeight` 286 px, `overflow: auto`, `white-space: pre-wrap`, `overflow-wrap: anywhere`.
- Oba kontenery mają `tabIndex={0}`, więc można je przewijać strzałkami po dojściu Tabem. Wcześniej axe zgłaszał `scrollable-region-focusable` dla `<output>` i `<pre>` — po zmianie zgłoszenie zniknęło.
- `output` zastąpiono przez `pre role="group"` z `aria-label`; dzięki temu długi pakiet nie jest implicit live regionem (`role="status"`) i nie ryzykuje odczytania dziesiątek tysięcy znaków po pojawieniu się wyniku. Nagłówki `h4` i `aria-labelledby` sekcji wyników pozostały.

### 12.5 Klawiatura i fokus

- Pełny obchód na 1280×800: 45 naciśnięć Tab. Kolejność: skip link → link repozytorium → „Wyloguj się” → textarea szyfrowania → „Szyfruj” → „Szyfruj i zapisz” → textarea deszyfrowania → „Odszyfruj” → „Odśwież listę” → trzy akcje każdej widocznej wiadomości → „Pobierz więcej” → `body` → skip link. Wszystkie 38 elementów interaktywnych było osiągalnych; po cyklu fokus wracał do skip linku.
- Logowanie: 6 kroków Tab — skip link → link repozytorium → Login → Hasło → „Zaloguj się” → `body`.
- Każdy krok obchodu miał widoczny pierścień `outline: solid 3px rgb(29, 78, 216)`; w trybie ciemnym token to `#93c5fd`. Skip link po Tabie jest widoczny, a Enter przenosi fokus na `<main id="main-content" tabIndex={-1}>` z widocznym pierścieniem.
- Po otwarciu potwierdzenia fokus trafia na „Tak, usuń”. **Anuluj** i **Escape** zamykają grupę i wracają fokusem do przycisku „Usuń” (wcześniej fokus spadał na `body`).
- Po udanym usunięciu fokus przechodzi na akcję „Usuń” następnej widocznej wiadomości; po usunięciu ostatniej pozycji — na nagłówek „Zapisane wiadomości” (`tabIndex={-1}`). Działa to także dla usunięcia klawiaturą (Enter), gdzie pierścień pozostaje widoczny.
- Po rozwinięciu wyników Tab przechodzi kolejno: pakiet `pre` → „Kopiuj pakiet” → treść `pre` → „Kopiuj treść”; wszystkie elementy mają widoczny fokus.
- Wiadomości zapisane w tej samej minucie mają identyczny czas, więc etykiety akcji zawierają dodatkowo 8 znaków identyfikatora; nazwy przycisków są unikalne.

### 12.6 Czytnik ekranu i ARIA

Weryfikacja programowa opiera się na drzewie dostępności Chrome (`ariaSnapshot` + role, nazwy i stany), czyli dokładnie na strukturze, którą konsumuje VoiceOver.

- Landmarki: `banner` (nagłówek), `main`, `contentinfo` (stopka); brak zduplikowanych landmarków i brak regionów bez nazwy.
- Nagłówki tworzą spójne poziomy: `h1` „Szyfrowanie wiadomości” → `h2` sesja / „Szyfrowanie i deszyfrowanie” / „Zapisane wiadomości” → `h3` panel i data wiadomości → `h4` „Pakiet wiadomości” / „Odszyfrowana treść”. Brak przeskoków poziomów.
- 12 pustych regionów `role="status"` obsługuje komunikaty przejściowe; po otwarciu najdłuższego pakietu maksymalna długość tekstu w live regionie wynosiła **0 znaków**. Długi pakiet i treść są w `pre role="group"` z nazwą, a nie w live regionie.
- Link zewnętrzny ma dostępną nazwę „Repozytorium projektu (otwiera się w nowej karcie)”.
- Nazwy akcji zawierają datę i krótki identyfikator, np. „Usuń wiadomość: 14 lis 2026, 10:13, identyfikator 9742e5e2”; dzięki temu pozycje z tej samej minuty nie mają identycznych nazw.
- **Ograniczenie:** rzeczywisty odsłuch VoiceOver nie został wykonany. `osascript -e 'application "VoiceOver" is running'` zwrócił `false`, aplikacja istnieje w `/System/Library/CoreServices/VoiceOver.app`, ale nie ma skryptowego słownika ani automatyzacji mowy w tym środowisku. Nie oznaczamy więc odsłuchu jako wykonanego — raport potwierdza drzewo dostępności, a manualny pass VoiceOver pozostaje do wykonania przez człowieka.

### 12.7 Kontrast

Współczynniki policzono według WCAG 2.x dla rzeczywistych kolorów computed style, z uwzględnieniem przezroczystości i tła panelu. Próg tekstu to 4,5:1, elementów UI i pierścienia fokusu — 3:1.

| Element | Tryb jasny | Tryb ciemny | Próg |
|---|---:|---:|---:|
| Tekst podstawowy | 17,06:1 | 14,48:1 | 4,5:1 |
| Hint pola (80% krycia) | 8,91:1 | 8,93:1 | 4,5:1 |
| Tekst w polu (Canvas) | 17,85:1 | 15,20:1 | 4,5:1 |
| Przycisk niebezpieczny | 5,82:1 | 8,63:1 | 4,5:1 |
| Pierścień fokusu na stronie | 6,41:1 | 9,90:1 | 3:1 |
| Pierścień fokusu na panelu | 6,03:1 | 9,09:1 | 3:1 |
| Obramowanie pola (55%) | 4,00:1 | 5,25:1 | 3:1 |
| Obramowanie przycisku secondary (55%) | 3,87:1 | 4,95:1 | 3:1 |

Przed poprawką pierścień `#60a5fa` na `#f8fafc` miał ok. **2,4:1** i nie spełniał 3:1. Obramowania pól i przycisków secondary miały 35%/45% krycia i odpowiednio **2,22:1** oraz **2,88:1** w trybie jasnym. Podniesiono je do 55%, a pierścień zmieniono na token `--focus-ring`: `#1d4ed8` (jasny) i `#93c5fd` (ciemny). Axe pozostawia `color-contrast` jako `incomplete` dla `textarea` (systemowy `Canvas`) i długiego `pre`; powyższe wartości są ręcznym rozstrzygnięciem tego wyniku.

### 12.8 Skan axe

| Stan | Naruszenia | `incomplete` |
|---|---:|---|
| 1280 — logowanie, jasny | 0 | 0 |
| 1280 — logowanie, ciemny | 0 | 0 |
| 1280 — zalogowany, jasny | 0 | `color-contrast` dla 2 `textarea` |
| 1280 — zalogowany, ciemny | 0 | `color-contrast` dla 2 `textarea` |
| 1280 — długi pakiet + treść + potwierdzenie, jasny | 0 | `color-contrast` dla 2 `textarea` i 1 `pre` |
| 360 — zalogowany, jasny | 0 | `color-contrast` dla 2 `textarea` |

Pierwszy przebieg wykrył `scrollable-region-focusable` na `output` i `pre` (naprawione przez `tabIndex={0}`) oraz `aria-prohibited-attr` jako `incomplete` dla `pre[aria-label]` bez roli (naprawione przez `role="group"`). Skan axe jest uzupełnieniem pomiarów i testów, nie jedynym dowodem.

### 12.9 Wprowadzone poprawki

1. Tokeny `--focus-ring` (`#1d4ed8` / `#93c5fd`) i użycie ich w skip linku, linku, polach, przyciskach, `<main>` i kontenerach wyników; kontrast pierścienia ≥ 6:1.
2. `tabIndex={-1}` na `<main>` — skip link faktycznie przenosi fokus na treść.
3. `tabIndex={0}` i widoczny fokus na pakiecie/treści; `output` → `pre role="group"` z nazwą, bez implicit live regionu dla długiego szyfrogramu.
4. Powrót fokusu do „Usuń” po Anuluj/Escape; Escape zamyka potwierdzenie.
5. Po usunięciu fokus przechodzi na następną pozycję albo nagłówek listy; nie spada na `body`.
6. Unikalne nazwy akcji dla wiadomości z tą samą minutą (krótki identyfikator).
7. Wzmocnione obramowania pól i przycisków secondary do 55% (≥ 3,87:1).
8. Ukryty opis „(otwiera się w nowej karcie)” dla linku z `target="_blank"`.
9. Cztery nowe testy Vitest: Escape i powrót fokusu, pakiet/treść w porządku Tab, fokus na nagłówku po usunięciu ostatniej pozycji, unikalne nazwy przy wspólnym czasie.

### 12.10 Ograniczenia

- Rzeczywisty odsłuch VoiceOver nie został wykonany (brak działającej automatyzacji w środowisku); zweryfikowano drzewo dostępności, role, nazwy, stany i live regiony.
- Skrypty pomiarowe i axe są jednorazowe, poza repozytorium; zrzuty i wyniki są w `docs/screenshots/zr21/` oraz w tym raporcie. Formalny E2E z axe pozostaje zadaniem CI/E2E.
- 200% zoomu sprawdzono jako równoważny viewport CSS 640×400, a nie przez sterowanie zoomem przeglądarki; dla reflow jest to ta sama szerokość CSS.
- `color-contrast` w axe pozostaje `incomplete` dla pól z `Canvas` i długiego `pre`; rozstrzygnięcie ręczne opisano w 12.7.
- Backend nie był zmieniany w ZR-21, więc nie powtarzano pełnego `./mvnw verify`; obowiązuje wynik 128/128 z ZR-20.

### 12.11 Mapowanie kryteriów akceptacji

| Kryterium | Dowód |
|---|---|
| Brak poziomego przepełnienia od pakietów | 7 konfiguracji viewportu × 4 stany, `scrollWidth == clientWidth`, 0 przyciętych elementów; pakiet 53 380 znaków i plaintext 40 000 B |
| 360 / 768 / 1280 px oraz 200% zoom | Tabela 12.3 i zrzuty ekranu; dodatkowo 320 px CSS |
| Każda akcja osiągalna klawiaturą z widocznym fokusem | Obchód 45 kroków + 6 kroków logowania; pierścień 3 px przy każdym elemencie; skip link, potwierdzenie, wyniki i „Pobierz więcej” |
| Fokus, kontrast, ARIA, długie szyfrogramy | Powrót fokusu po Anuluj/Escape/usunięciu; kontrast 12.7; drzewo ARIA 12.6; `tabIndex` i przewijanie długich wyników 12.4 |
| Czytnik ekranu | `ariaSnapshot`, landmarki, nagłówki, live regiony i nazwy akcji; ograniczenie rzeczywistego VoiceOver opisane w 12.6 i 12.10 |
| axe jako uzupełnienie | 6 skanów, 0 naruszeń, `incomplete` ręcznie rozstrzygnięte; wcześniejsze naruszenia naprawione |
| Środowisko, wyniki i poprawki udokumentowane | Sekcje 12.1–12.9 oraz dziennik 12.12 |

### 12.12 Dziennik wykonania

| Data | Zmiana | Uzasadnienie | Problem i rozwiązanie | Testy | Następny krok |
|---|---|---|---|---|---|
| 2026-11-14 | Tokeny fokusu, `tabIndex` na `<main>`, wynikach i nagłówku listy, `pre role="group"`, powrót fokusu po Anuluj/Escape/usunięciu, Escape w potwierdzeniu, unikalne nazwy akcji, mocniejsze obramowania, opis nowej karty i 4 testy. | Realizacja R07/R08: brak przepełnienia, pełna obsługa klawiatury, widoczny fokus, czytelne nazwy i kontrast; axe ma 0 naruszeń. | (1) `#60a5fa` na jasnym tle miał 2,4:1 — token `#1d4ed8`. (2) `output`/`pre` przewijane bez fokusu — `tabIndex=0`. (3) `pre[aria-label]` bez roli — `role="group"`. (4) Usunięcie fokusowanego elementu zostawiało `body` — panel przenosi fokus na następną akcję/nagłówek. (5) Anuluj/Escape nie wracały fokusem — ref przycisku „Usuń”. | `npm run lint`, `format:check`, `npm test` 124/124, `npm run build`; axe 0 naruszeń w 6 skanach; brak przepełnienia w 28 pomiarach; Compose health 200. | Limitery crypto 60/30, formalne E2E/axe w CI, `docs/PERFORMANCE.md`. |

## 13. ZR-22 — testy formularzy i scenariusze E2E

### 13.1 Środowisko i wersja kodu

| Element | Wartość |
|---|---|
| Data weryfikacji | 2026-11-14 |
| Kod aplikacji (baseline) | `e0fd30b` (`docs(status): zamknij wpis ZR-21`); ZR-22 nie zmienia kodu produkcyjnego, tylko testy i konfigurację E2E |
| Harness ZR-22 | commit zawierający ten raport (testy, `playwright.config.ts`, `e2e/`, dokumentacja) |
| System | macOS 27.0.1 (arm64), build `26A434` |
| Node.js / npm | 22.19.0 / 11.16.0 |
| Playwright | `@playwright/test` 1.64.1 (pin w `devDependencies`), ffmpeg v1013 |
| Przeglądarka | Google Chrome 157.0.8103.51, `channel: 'chrome'`, headless |
| Docker / Compose | 29.9.1 / v5.6.0 |
| PostgreSQL | 16.15 (`aarch64-unknown-linux-musl`) |
| Stos | Compose: nginx + Spring Boot 4.1.2 / Java 17 + PostgreSQL 16; 3 kontenery `healthy` |
| Adres E2E | `http://localhost:3000` (jedyny publiczny port, przez nginx) |
| Backend | bez zmian w ZR-22; wynik 128/128 z ZR-20 nie był ponownie uruchamiany |
| Frontend | 15 plików, 131/131 testów Vitest; 8 scenariuszy Playwright |

E2E korzysta z realnego stosu Compose przez nginx, a nie z `vite preview`, żeby faktycznie przećwiczyć `JSESSIONID` (`HttpOnly`, `SameSite=Lax`), rotację CSRF i właściciela z sesji. Przed uruchomieniem wymagane są `docker compose up -d` oraz zainstalowany Chrome (albo `npx playwright install chromium` i `PW_CHANNEL=none`).

### 13.2 Komendy i wyniki

```text
cd frontend && npm ci                         -> OK (pin 1.64.1 w package-lock.json)
cd frontend && npm run lint                   -> OK (0 błędów, 0 ostrzeżeń)
cd frontend && npm run format:check           -> All matched files use Prettier code style!
cd frontend && npm test                       -> 15 plików, 131/131 testów, PASS (2,16 s)
cd frontend && npm run build                  -> tsc -b + vite build; JS 251.85 kB (gzip 77.40 kB), CSS 7.37 kB (gzip 1.77 kB)
docker compose ps                             -> backend, db, frontend: healthy
curl http://localhost:3000/actuator/health    -> 200
cd frontend && npm run test:e2e               -> 8/8, PASS (5,6 s; drugi przebieg 5,5 s)
docker compose exec -T db psql ... count(*)   -> messages: 32 przed i 32 po przebiegu E2E
```

Dwa kolejne przebiegi E2E dały ten sam wynik 8/8. Liczba wierszy w tabeli `messages` nie zmieniła się (32 → 32), co potwierdza, że teardown usuwa wiadomości utworzone przez scenariusze. Artefakty Playwrighta (`test-results/`, `playwright-report/`, `blob-report/`) są ignorowane przez Git.

### 13.3 Nowe testy RTL/Vitest (7)

| Plik | Przypadek | Co potwierdza |
|---|---|---|
| `src/app/App.test.tsx` | przełączenie alice → bob | Po wylogowaniu i zalogowaniu na bob lista i odszyfrowana treść alice znikają; panel jest montowany od nowa przez `key={state.user.id}`; storage pozostaje pusty |
| `src/app/App.test.tsx` | utrata sesji przy chronionym żądaniu | `401` z deszyfrowania wraca do logowania z `Sesja wygasła. Zaloguj się ponownie.`; lista i identyfikatory znikają |
| `src/features/crypto/EncryptPanel.test.tsx` | nieudany zapis (`429`) | Alert z `Retry-After`, tekst pozostaje w polu, przycisk wraca do stanu aktywnego, brak regionu „Wiadomość zapisana” |
| `src/features/crypto/EncryptPanel.test.tsx` | zapis `401` | Komunikat sesji i wywołanie `onSessionExpired`, brak fałszywego sukcesu |
| `src/features/crypto/DecryptPanel.test.tsx` | `429` | Alert z `Retry-After`, pakiet pozostaje w polu, fokus na alercie |
| `src/features/crypto/DecryptPanel.test.tsx` | błąd sieci | Komunikat połączenia i brak regionu z odszyfrowaną treścią |
| `src/features/auth/LoginForm.test.tsx` | błąd sieci | Przycisk wraca do stanu aktywnego, login i hasło pozostają, brak `aria-invalid` |

Łącznie frontend: 131 testów (było 124). Testy nie duplikują istniejących przypadków `400`/`401`/`429`, pending, CSRF retry ani XSS — uzupełniają brakujące ścieżki zapisu, deszyfrowania i przełączenia konta.

### 13.4 Scenariusze Playwright (8)

| Plik / scenariusz | Kroki i asercje |
|---|---|
| `flow.spec.ts` — pełny przepływ | Logowanie `alice` → „Szyfruj” bez zapisu (pakiet `v1.`) → „Szyfruj i zapisz” → „Odśwież listę” → pozycja o przechwyconym ID → pakiet pobrany dopiero po „Pokaż pakiet” → deszyfrowanie w formularzu i na liście daje identyczny marker → cookies `JSESSIONID` `HttpOnly`, `SameSite=Lax`, bez `Secure` na HTTP → reload utrzymuje sesję i listę, ale nie odszyfrowaną treść → wylogowanie usuwa pozycję i cookie → reload pozostaje anonimowy |
| `errors.spec.ts` — walidacja | Puste pola szyfrowania i deszyfrowania, fokus na polu, 10 001 znaków odrzucone bez zapisu |
| `errors.spec.ts` — zły format | `nie-pakiet` daje komunikat o formacie zamiast deszyfrowania |
| `errors.spec.ts` — błędne dane | Unikalny login nieistniejącego konta → `Nieprawidłowy login lub hasło.`, hasło wyczyszczone, login zachowany |
| `errors.spec.ts` — limit prób | 5 × `401` na unikalnym loginie, 6. próba → `429` z `Retry-After` w komunikacie; klucz limitera (IP + login) nie blokuje `alice`/`bob` |
| `errors.spec.ts` — utrata sesji | Usunięcie cookie `JSESSIONID` → „Odśwież listę” → powrót do logowania z komunikatem, bez listy i przycisku wylogowania |
| `security.spec.ts` — XSS | Zapis `<img onerror>` + `<script>` → deszyfrowanie zwraca dosłowny tekst; 0 elementów `img`/`script` w pozycji i 0 `img` na stronie; `window.__xssPwned` i `window.__xssPwned2` pozostają `undefined` |
| `security.spec.ts` — przełączenie konta | `alice` zapisuje marker i pakiet → wylogowanie → `bob` nie widzi ID ani treści alice; wklejony pakiet alice daje `422` z komunikatem „…z tego konta…” (AAD właściciela); `localStorage`, `sessionStorage` i IndexedDB puste |

Harness: `frontend/playwright.config.ts` (baseURL z `E2E_BASE_URL`, `channel` z `PW_CHANNEL`, `workers: 1`, `fullyParallel: false`, trace/screenshot/video przy błędzie), `frontend/e2e/global-setup.ts` (szybka porażka z instrukcją, gdy health ≠ `UP`) oraz `frontend/e2e/fixtures.ts` (logowanie, zapis, odczyt pakietu, deszyfrowanie, unikalne markery i sprzątanie przez API). Każdy test dostaje świeży kontekst przeglądarki i loguje się realnie; nie ma współdzielonego `storageState`. Sprzątanie loguje się jako `alice` i usuwa wyłącznie ID zarejestrowane przez dany scenariusz.

### 13.5 Mapowanie wymagań

| Wymaganie | Dowód z ZR-22 |
|---|---|
| R01 — frontend React/JS | `npm run build`, 131/131 Vitest, 8/8 Playwright na Chrome 157 przez Compose |
| R02 — logowanie i walidacja | E2E: błędne dane, 5 prób + `429`, puste i zbyt długie formularze, utrata sesji; RTL: 7 nowych przypadków |
| R03 — szyfrowanie/deszyfrowanie | E2E: „Szyfruj” bez zapisu, pakiet `v1.`, deszyfrowanie w formularzu i na liście tym samym markerem |
| R04 — zapis i odczyt | E2E: zapis → odświeżenie listy → ID → pakiet → plaintext → reload → logout; storage pusty |
| R06 — XSS, kontrola dostępu, błędy | E2E: XSS jako tekst bez wykonania handlerów, 0 elementów `img`/`script`, obcy pakiet `422`, brak danych alice w sesji bob, `401`/`429`/`400` obsłużone |

### 13.6 Mapowanie kryteriów akceptacji

| Kryterium | Dowód |
|---|---|
| Scenariusz logowanie–szyfrowanie–zapis–odczyt–wylogowanie przechodzi | `flow.spec.ts`, wynik `8 passed (5,6 s)`; drugi przebieg `8 passed (5,5 s)` |
| Niepoprawne dane i utrata sesji są obsłużone | `errors.spec.ts` (5 scenariuszy) + nowe testy RTL `429`, `401`, sieci i sesji |
| Raport wskazuje wersję kodu i środowisko | Tabela 13.1 (baseline `e0fd30b`, system, Node, Playwright, Chrome, Compose) i komendy 13.2 |
| XSS jako dosłowny tekst | `security.spec.ts`: tekst identyczny z payloadem, 0 `img`/`script`, flagi `window` `undefined` |
| Przełączenie konta czyści dane | `security.spec.ts` + `App.test.tsx`: brak ID i treści alice, puste storage, obcy pakiet `422` |

### 13.7 Ograniczenia

- E2E wymaga Dockera, uruchomionego Compose i Chrome (lub pobranego Chromium + ffmpeg). `npm test` nadal działa bez stosu; E2E nie jest częścią `npm test`.
- Scenariusze korzystają z kont demo profilu `local`; hasła są jawne w dokumentacji wyłącznie dla tego profilu.
- Test limitera zużywa własny unikalny login, więc nie blokuje kont demo, ale pozostawia wpis w pamięci limitera do 60 s.
- Sprzątanie usuwa wiadomości przez publiczne API jako `alice`; scenariusze nie tworzą wiadomości na innych kontach.
- Artefakty przy sukcesie nie są zapisywane (trace/screenshot tylko przy błędzie), więc raport nie zawiera nowych zrzutów ekranu; dowodem są asercje i log przebiegu.
- Backend nie był zmieniany, więc `./mvnw verify` nie był ponownie uruchamiany; obowiązuje 128/128 z ZR-20.
- Skan axe nie był częścią ZR-22 (wynik 0 naruszeń z ZR-21 pozostaje aktualny dla niezmienionego UI).

### 13.8 Dziennik wykonania

| Data | Zmiana | Uzasadnienie | Problem i rozwiązanie | Testy | Następny krok |
|---|---|---|---|---|---|
| 2026-11-14 | 7 testów RTL (przełączenie konta, utrata sesji, błędy zapisu/deszyfrowania/sieci) oraz harness Playwright: config, global setup, fixtures, 8 scenariuszy, skrypty npm, `tsconfig.e2e.json`, wpisy `.gitignore` i ESLint. | Domknięcie R01/R02/R03/R04/R06: pełny przepływ i błędy na realnym stosie, XSS jako tekst, przełączenie konta, raport z wersją kodu i środowiskiem. | (1) Brak ffmpeg blokował nagrywanie wideo — `npx playwright install ffmpeg`. (2) Playwright nie był zależnością — pin 1.64.1 i `npm ci`. (3) `e2e` poza `tsconfig` — osobny `tsconfig.e2e.json` w `tsc -b`. (4) ESLint traktował `use` w fixture jak Hook — wyjątek dla `e2e/**`. (5) Sprzątanie po wylogowaniu — niezależne logowanie API w teardown; baza 32 → 32. (6) Vitest łapał `e2e/*.spec.ts` przez domyślny glob — `test.include` zawężone do `src/`. | `npm run lint`, `format:check`, `npm test` 131/131, `npm run build`, `npm run test:e2e` 8/8 (dwukrotnie), Compose health 200. | Limitery crypto 60/30, CI z E2E/axe, `docs/PERFORMANCE.md`, manualny odsłuch VoiceOver. |
