# Raport testów frontendu — klient API, logowanie, sesja, formularze crypto i lista wiadomości (ZR-17/ZR-18/ZR-19)

- **Data:** 2026-11-13
- **Zadania:** ZR-17 — klient API i logowanie; ZR-18 — formularze szyfrowania i deszyfrowania; ZR-19 — lista zapisanych wiadomości
- **Wymagania:** R01, R02, R03, R04, R08, R09
- **Zależności ZR-18 potwierdzone:** ZR-13 (`7c10342`), ZR-14 (`66fce7a`), ZR-17 (`c51a319`)
- **Zależności ZR-19 potwierdzone:** ZR-14 (`66fce7a`), ZR-17 (`c51a319`); baseline `9e9144b`
- **Commit funkcjonalny ZR-17:** `c51a319`; ZR-18: `26fda0d`; ZR-19: `__ZR19_COMMIT__`
- **Zakres kodu ZR-17:** `frontend/src/shared/api/`, `frontend/src/features/auth/`, `frontend/src/app/App.tsx`, `frontend/vite.config.ts`, `frontend/src/styles/global.css`
- **Zakres kodu ZR-18:** `frontend/src/features/crypto/`, `frontend/src/shared/ui/CopyButton.tsx`, `frontend/src/features/auth/` (`expireSession`), `frontend/src/app/App.tsx`, `frontend/src/styles/global.css`
- **Zakres kodu ZR-19:** `frontend/src/features/messages/`, `frontend/src/shared/format.ts`, `frontend/src/features/crypto/` (importy formattera), `frontend/src/app/App.tsx`, `frontend/src/test/backend.ts`, `frontend/src/styles/global.css`

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
