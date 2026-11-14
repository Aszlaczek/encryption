# AGENTS.md — instrukcje dla agentów

Ten plik jest automatycznie ładowany przez OpenCode. Zawiera skrót; szczegółowa historia i kontekst znajdują się w [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md).

## Cel projektu

Aplikacja do szyfrowania wiadomości między zalogowanymi użytkownikami: frontend React + Vite + TypeScript (UI po polsku), backend Spring Boot 4.1.2 / Java 17, PostgreSQL 16, uruchamiane przez Docker Compose. Hasła są hashowane Argon2id, a treść wiadomości szyfrowana po stronie serwera AES-256-GCM. Szczegóły wymagań: [`README.md`](README.md), kontrakt HTTP: [`docs/API.md`](docs/API.md).

## Aktualny stan (2026-11-14)

- Ostatni commit funkcjonalny: `28bf7e1` (ZR-22 — testy formularzy i E2E Playwright); drzewo powinno być czyste po commicie.
- Ukończone: ZR-01…ZR-22.
- Działa: endpointy auth, crypto oraz `POST/GET /api/messages`, `GET /api/messages/{id}`, `POST /api/messages/{id}/decrypt`, `DELETE /api/messages/{id}`, owner scope, kursor (limit maks. 50), CSRF, błędy RFC 9457 i `no-store`; frontend logowania z klientem API, sesją `/me`, CSRF i wylogowaniem; formularze szyfrowania/deszyfrowania z licznikami, kopiowaniem i rozdziałem „Szyfruj”/„Szyfruj i zapisz”; lista zapisanych wiadomości z paginacją kursorem, podglądem pakietu i deszyfrowaniem dopiero po kliknięciu; usuwanie z potwierdzeniem inline, `404` jako „już usunięta” i auto-dociąganiem strony; responsywność 320–1280 px i 200% zoomu bez przepełnienia oraz dostępność z pełnym obchodem klawiatury, powrotem fokusu, przewijalnymi wynikami i 0 naruszeń axe. Harness Playwright w `frontend/e2e/` pokrywa pełny przepływ i błędy na realnym Compose przez nginx.
- **Nie ma jeszcze** limitera crypto 60/30 na minutę. CI z E2E/axe i `docs/PERFORMANCE.md` też są do wykonania; manualny odsłuch VoiceOver pozostaje po stronie człowieka.
- Testy: 128/128 backendu (`./mvnw spotless:check verify`), 131/131 frontendu (`npm test`) i 8/8 E2E (`npm run test:e2e`); raporty: [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md) i [`docs/TEST_REPORT_FRONTEND.md`](docs/TEST_REPORT_FRONTEND.md) (§12 — ZR-21, §13 — ZR-22).

## Najpierw przeczytaj

1. [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md) — chronologia, decyzje, pułapki, następne kroki.
2. [`README.md`](README.md) — status, uruchomienie, dowody R01–R10.
3. [`docs/API.md`](docs/API.md) — **kanoniczny** kontrakt HTTP, DTO, błędy, format pakietu, kursor.
4. [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — schemat, mapowanie JPA, migracje, Argon2id.
5. [`docs/DECISIONS.md`](docs/DECISIONS.md) — ADR-01…ADR-24.
6. [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md) — Q01…Q51 (rozstrzygnięte i otwarte).
7. [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md) — raport testów negatywnych ZR-16 i ZR-20 (izolacja A/B, usuwanie, persystencja, kontrola mutacyjna).
8. [`docs/TEST_REPORT_FRONTEND.md`](docs/TEST_REPORT_FRONTEND.md) — testy klienta, logowania, sesji, formularzy crypto, listy i usuwania, responsywności i dostępności ZR-21 oraz testów RTL i E2E Playwright ZR-22.

Gdy dokumenty się różnią, rozstrzyga `docs/API.md` dla HTTP i `docs/DATA_MODEL.md` dla bazy. Zmiana zachowania wymaga aktualizacji dokumentu i ADR w **tym samym commicie**.

## Stack i topologia

- Frontend: React 19.3.1, Vite 7.3.7, TypeScript 6.0.3, ESLint 10, Prettier 3, Vitest 5 + jsdom, Playwright 1.64.1 (E2E).
- Backend: Spring Boot 4.1.2, Java 17 (target), Maven wrapper 3.10.0, Flyway, JPA/Hibernate, Spring Security, BouncyCastle 1.86.
- Baza: PostgreSQL 16; migracje `V1`–`V3`; `ddl-auto=validate`.
- Compose: publiczny jest **tylko** `3000:80` (nginx). `backend:8080` i `db:5432` są niepublikowane; sieci `edge` i `data` (`internal: true`); wolumen `pgdata`.
- Profile: Compose domyślnie ustawia `SPRING_PROFILES_ACTIVE=local` (seed kont demo). Poza `local` seeder nie powstaje.

## Komendy

```bash
# Backend: format, lint, testy (Testcontainers wymaga uruchomionego Dockera)
cd backend && ./mvnw spotless:apply
cd backend && ./mvnw spotless:check verify

# Frontend
cd frontend && npm ci
cd frontend && npm run lint && npm run format:check && npm run test && npm run build

# E2E: wymaga Dockera, uruchomionego Compose i Chrome (albo Chromium + ffmpeg)
docker compose up -d
cd frontend && npm run test:e2e        # 8 scenariuszy, workers=1
cd frontend && npx playwright install ffmpeg   # tylko gdy brak wideo/ffmpeg
cd frontend && PW_CHANNEL=none npm run test:e2e  # Chromium zamiast Chrome

# Cały stos
./scripts/generate-crypto-key.sh  # tylko raz; tworzy .secrets/crypto.key
docker compose up -d --build      # pierwszy start / przebudowa
docker compose up -d              # kolejne starty
docker compose ps                 # 3 kontenery powinny być healthy
curl -i http://localhost:3000/actuator/health
curl -i http://localhost:3000/api/messages   # obecnie 401 bez sesji

# Auth: CSRF -> login -> me -> logout
JAR=$(mktemp)
curl -sS -c "$JAR" http://localhost:3000/api/auth/csrf
TOKEN=$(awk '$6=="XSRF-TOKEN"{print $7}' "$JAR")
curl -sS -b "$JAR" -c "$JAR" -H 'Content-Type: application/json' \
  -H "X-XSRF-TOKEN: $TOKEN" \
  --data '{"username":"alice","password":"AliceDemo123!"}' \
  http://localhost:3000/api/auth/login
curl -sS -b "$JAR" http://localhost:3000/api/auth/me
TOKEN=$(awk '$6=="XSRF-TOKEN"{print $7}' "$JAR")
curl -sS -b "$JAR" -c "$JAR" -X POST -H "X-XSRF-TOKEN: $TOKEN" \
  http://localhost:3000/api/auth/logout

# Weryfikacja schematu, kontraktu i sekretów (z katalogu głównego)
./scripts/validate-schema.sh
node scripts/validate-api-contract.mjs
./scripts/check-secrets.sh
git diff --check
```

Baza w Compose:

```bash
docker compose exec -T db psql -U encryption -d encryption -c '\dt'
docker compose exec -T db psql -U encryption -d encryption -c 'select username, length(password_hash) from app_users;'
```

## Niezmienniki — nie wolno ich zepsuć

1. **Właściciel wyłącznie z sesji.** Żadne DTO ani parametr żądania nie może wskazywać `ownerId`.
2. **Brak plaintextu w bazie.** Tabele nie mają kolumn z jawną treścią; hasła to Argon2id, treść wiadomości to zaszyfrowany pakiet.
3. **`created_at` generuje baza** (`@Generated(event = INSERT)`, `insertable = false`).
4. **Relacja jednokierunkowa** `Message.owner`; brak `user_messages` i dwukierunkowych kolekcji.
5. **Repozytoria owner-scoped.** Brak `findAll()` dla wiadomości; zasób obcego użytkownika to `404`, nie `403`.
6. **`ddl-auto=validate`.** Źródłem prawdy jest Flyway; Hibernate tylko waliduje.
7. **Nie edytuj zastosowanych migracji** (`V1`–`V3`) — zmienia się checksum. Zmiany tylko przez `V4+`.
8. **Encje nigdy nie trafiają do API** — tylko DTO.
9. **Kolejność kontroli:** `401` przed `403`; `CSRF` wymagany dla metod mutujących.
10. **Argon2id** z parametrami z `PasswordEncoderConfig` (salt 16 B, hash 32 B, parallelism 1, 16 MiB, 2 iteracje); hash ma 97 znaków i mieści się w `varchar(100)`.
11. **Konta demo tylko w profilu `local`**, seed idempotentny i bez nadpisywania haseł.
12. **Format pakietu i limity** zgodne z `docs/API.md` (m.in. 10 000 code points / 40 000 B plaintext, 56 000 znaków pakietu, 65 536 B żądania).
13. **Logowanie zawsze wymaga CSRF**, a po sukcesie rotują się identyfikator sesji i token CSRF.
14. **Sesja to `JSESSIONID`** z `HttpOnly` i `SameSite=Lax`, 30 min bezczynności; `Secure` tylko przez `SESSION_COOKIE_SECURE`.
15. **Błędy auth i transportu** mają RFC 9457 z `code`; `413`/`415` wyprzedzają uwierzytelnienie, a `429` występuje przed weryfikacją hasła.

## Zasady pracy

- Jedno zadanie = co najmniej jeden dedykowany commit; commity po polsku, konwencja `typ(zakres): opis (ZR-XX)`.
- Przed commitem: `./scripts/check-secrets.sh`, `git diff --check`, właściwe testy; nie zgłaszaj „done” na podstawie samego istnienia kodu.
- Po zakończeniu: push na `origin/main` i wpis do Notion z **rzeczywistym** hashem commita i wynikami komend.
- Aktualizuj `README.md`, dokumenty w `docs/` i `docs/PROJECT_MEMORY.md` w tym samym commicie, jeśli zmienia się zachowanie lub stan projektu.
- Nie dodawaj sekretów do repozytorium; `.env.example` zawiera tylko placeholdery.

## Znane pułapki

- **Flyway checksum:** edycja `V1`–`V3` zepsuje istniejące bazy i testy. Nowe zmiany tylko `V4+`; liczbę migracji w `PersistenceIntegrationTests` trzeba wtedy zaktualizować.
- **Testcontainers** wymagają działającego Dockera; bez niego `./mvnw verify` nie przejdzie.
- **Obrazy budowane są z `-DskipTests`** — testy trzeba uruchomić osobno.
- **BouncyCastle nie jest w BOM Spring Boota** — wersja `1.86` jest pinowana jawnie; nie usuwaj jej.
- **`DemoUserProperties`** jest rejestrowane tylko w `DemoUserConfiguration` z `@Profile("local")`; nie przenoś `@EnableConfigurationProperties` do konfiguracji globalnej, bo aplikacja bez profilu `local` nie wystartuje.
- **Argon2id zużywa 16 MiB na weryfikację hasła** — równoległe logowania zwiększają zapotrzebowanie na RAM.
- **Compose domyślnie używa profilu `local`** — wdrożenie produkcyjne musi ustawić inny `SPRING_PROFILES_ACTIVE`, inaczej powstaną konta demo.
- **`varchar(100)`** daje mały zapas na podniesienie parametrów Argon2id; zmiana parametrów wymaga świadomej decyzji i nowej migracji.
- **Nginx** proxuje `/api/` i `/actuator/health`; nie publikuj portów backendu ani bazy.
- **`csrf.spa()` powoduje duplikację cookie** — używany jest zwykły `CsrfTokenRequestAttributeHandler`; nie wracaj do `spa()` bez testu wartości cookie i ciała.
- **MockMvc gubi atrybuty cookie** (`SameSite`, część `JSESSIONID`); politykę cookie weryfikuj rzeczywistym `curl` przez nginx.
- **Kolejność filtrów:** `ApiRequestHeadersFilter` ma `HIGHEST_PRECEDENCE` (413/415 przed auth), a `ApiCsrfRequestMatcher` przepuszcza anonimowe mutacje do autoryzacji, żeby `401` wyprzedziło `403`.
- **`X-Real-IP` jest zaufane tylko za nginx** — nie ufaj `X-Forwarded-For` od klienta i nie zmieniaj resolvera bez proxy.
- **Sesje i limiter są in-memory** — restart wymaga logowania, a wiele replik wymaga Redis/sticky sessions.
- **Test okna limitera używa `MutableClock`** — nie dodawaj `Thread.sleep` ani rzeczywistego czekania 60 s; kontrolowany zegar jest podstawiany jako `@Primary` w `AuthRateLimitWindowIntegrationTests`.
- **Klucz AES to sekret plikowy** — `.secrets/crypto.key` jest ignorowany, montowany tylko do backendu i nigdy nie trafia do Git, obrazu ani `environment`. Brak lub błędny klucz musi blokować start; nie przywracaj zerowego klucza demo.
- **GCM zwraca `ciphertext || tag`** — przy szyfrowaniu odetnij ostatnie 16 B jako tag. Przy deszyfrowaniu przekaż całość do `Cipher.doFinal`; nie używaj `update` na szyfrogramie, bo plaintext mógłby powstać przed weryfikacją tagu.
- **Świeży `Cipher` na każdą operację** — `Cipher` nie jest thread-safe. `SecureRandom` może być współdzielony; nonce musi mieć 12 B i być nowy dla każdego szyfrowania. Nie dodawaj pola z `Cipher`.
- **Jedno miejsce walidacji pakietu** — tylko `PackageCodec` parsuje i buduje `v1.<key_id>.<nonce>.<ciphertext>.<tag>`; wymagany jest kanoniczny base64url bez paddingu i ASCII. AAD to `v1:<ownerId>:<keyId>`, a właściciel pochodzi z sesji.
- **Utrata klucza jest nieodwracalna** — brak automatycznej rotacji i odzyskiwania w MVP. Zmiana pliku po zapisaniu wiadomości czyni je nieczytelnymi; kopia zapasowa jest obowiązkiem operatora.
- **`SESSION_COOKIE_SECURE=false` lokalnie** — wdrożenie za HTTPS musi ustawić `true`, inaczej cookie nie zostanie odesłane lub będzie niebezpieczne.
- **Sesja frontendu tylko w cookie** — `JSESSIONID` jest `HttpOnly`; nie dodawaj `localStorage`/`sessionStorage`/IndexedDB dla użytkownika, hasła ani wiadomości. Stan Reacta jest jedyną kopią po stronie klienta.
- **CSRF w SPA** — token czytaj z cookie `XSRF-TOKEN`, wysyłaj tylko dla mutacji; po logowaniu/wylogowaniu resetuj token, a `403 CSRF_INVALID` obsłuż jedną ponowną próbą po `/api/auth/csrf`.
- **Case-insensitive macOS** — nie twórz plików różniących się tylko wielkością liter (np. `FormField.tsx` i `formField.ts`), bo import może wskazać zły moduł i komponent będzie `undefined`.
- **Clipboard w testach** — `userEvent.setup()` podstawia własny stub `navigator.clipboard`; nadpisuj go po `setup()`. W przeglądarce kopiowanie wymaga bezpiecznego kontekstu, a UI musi mieć komunikat o ręcznym kopiowaniu.
- **Fokus po błędzie** — nie wywołuj `.focus()` na textarea, gdy `pending` jest jeszcze `true` (pole jest `disabled`); użyj efektu na `fieldError`, jak w `LoginForm`.
- **401 w crypto** — `features/crypto` nie importuje `features/auth`; `CryptoWorkspace` dostaje `onSessionExpired`, a `AuthProvider.expireSession()` czyści CSRF i pokazuje komunikat na logowaniu.
- **401 w messages** — `features/messages` również nie importuje `features/auth`; `MessagesPanel` i `MessageListItem` dostają `onSessionExpired`. `App` montuje panel z `key={state.user.id}`, więc zmiana konta resetuje listę i odszyfrowaną treść.
- **Kursor tylko po sukcesie** — nie przesuwaj kursora przed udaną odpowiedzią; błąd strony musi ponowić ten sam kursor. `hasMore && !nextCursor` traktuj jako błąd, inaczej powstaje pętla.
- **Bez prefetchu treści** — lista pobiera wyłącznie `id`/`createdAt`; `GET /api/messages/{id}` i `POST …/decrypt` wykonuj dopiero po kliknięciu. Nie dodawaj masowego pobierania pakietów ani plaintextu.
- **Deduplikacja po `id`** — kolejne strony mogą powtórzyć rekord; scalaj po identyfikatorze zamiast slepo dopisywać.
- **`404` przy usuwaniu to sukces** — `DELETE /api/messages/{id}` dla cudzej i nieistniejącej wiadomości daje identyczne `404`; UI usuwa pozycję i pokazuje `role="status"` „Wiadomość była już usunięta.”, a nie alert.
- **Kursor po usunięciu się nie zmienia** — usunięcie wiersza nie unieważnia kursora `(createdAt, id)`; nie resetuj go i nie pokazuj pustki, gdy `hasMore=true`. Po usunięciu ostatniej widocznej pozycji dociągnij kolejną stronę osobną funkcją, nie z nieaktualnego domknięcia `handleLoadMore`.
- **Twarde usunięcie** — `deleteByIdAndOwner_Id` zwracające `0` to `MessageNotFoundException`; nie dodawaj `find` + `delete`, `findAll` ani kosza. Usunięcie wiersza nie unieważnia skopiowanego pakietu (klucz i AAD bez zmian).
- **`onSessionExpired` w efekcie** — w `MessagesPanel` callback jest trzymany w `useRef`, żeby nie restartować pierwszego pobrania przy każdej zmianie funkcji z `AuthProvider`.
- **Testy listy** — `src/test/backend.ts` udostępnia router `fetch` po ścieżce; nowe żądanie (np. lista po logowaniu) dodaj jako trasę, a nie kolejny `mockResolvedValueOnce`, żeby nie przesuwać kolejki.
- **Fokus po usunięciu i Anuluj/Escape** — usunięcie wiersza zabiera fokusowany przycisk z DOM. `MessagesPanel` przenosi fokus na „Usuń” następnej pozycji albo nagłówek listy (`tabIndex={-1}`); Anuluj/Escape wracają do przycisku „Usuń”. Nie zostawiaj fokusu na `body`.
- **Długie wyniki a fokus i live region** — `pre role="group" tabIndex={0}` z `aria-label` jest przewijalny z klawiatury i nie jest live regionem; `output` odpadł, bo ma implicit `role="status"`. Samo `aria-label` na `pre` bez roli dawało `aria-prohibited-attr`, a brak `tabIndex` — `scrollable-region-focusable`.
- **Token pierścienia fokusu** — używaj `var(--focus-ring)` (`#1d4ed8` jasny, `#93c5fd` ciemny); `#60a5fa` na jasnym tle miał 2,4:1. Obramowania pól i przycisków secondary muszą mieć ≥ 55% krycia. Zmiana koloru wymaga ponownego pomiaru kontrastu.
- **Nazwy akcji w tej samej minucie** — `createdAt` ma dokładność do minuty, więc etykiety „Pokaż/Odszyfruj/Usuń” zawierają 8 znaków `id`. Test pilnuje unikalności nazw.
- **Odsłuch VoiceOver** — w tym środowisku nie ma automatyzacji mowy; `ariaSnapshot` i role to dowód struktury, nie odsłuchu. Nie oznaczaj testu mowy jako wykonanego bez człowieka.
- **Treść tylko jako tekst** — wynik deszyfrowania renderuj przez `{plaintext}` w `<pre>`; nie używaj `dangerouslySetInnerHTML` ani `innerHTML`.
- **Playwright i ffmpeg** — nagrywanie wideo wymaga `npx playwright install ffmpeg`; bez tego każdy scenariusz kończy się `Executable doesn't exist ... ffmpeg-mac`. `npm run test:e2e` wymaga Dockera, Compose i Chrome (albo `PW_CHANNEL=none` + Chromium).
- **E2E tylko przez nginx** — testy działają na `http://localhost:3000` (`E2E_BASE_URL` nadpisuje), nigdy na `vite preview`; `globalSetup` przerywa przebieg, gdy `/actuator/health` ≠ `UP`.
- **E2E a limiter** — test 5 + 1 prób używa unikalnego, nieistniejącego loginu; klucz limitera to IP + login, więc współdzielone konto demo zostałoby zablokowane na 60 s.
- **Lista nie odświeża się po zapisie** — E2E klika „Odśwież listę”; nie dodawaj automatycznego refetchu tylko dla wygody testu. Sprzątanie loguje się przez API jako `alice` i usuwa wyłącznie zarejestrowane ID (`404` akceptowane).
- **Selektory E2E** — „Odszyfruj” istnieje w formularzu i w każdej pozycji listy: używaj `exact: true` lub `/^Odszyfruj wiadomość/`. Pozycje mają `li[data-message-id]`.
- **ESLint w `e2e/`** — `use` w fixture Playwrighta nie jest Hookiem; dla `e2e/**` wyłączone są `react-hooks/rules-of-hooks` i `no-empty-pattern`. Nie przenoś tego wyjątku na `src/`.
- **Vitest a `e2e/*.spec.ts`** — domyślny glob Vitest łapie specy Playwrighta i `npm test` zgłasza nieudane pliki mimo zielonych testów. `test.include` w `vite.config.ts` ogranicza się do `src/**/*.{test,spec}.{ts,tsx}`; nie usuwaj tego.

## Następny krok

Limitery crypto 60/min i 30/min (szyfrowanie/deszyfrowanie) z `Retry-After` i testem okna na kontrolowanym zegarze. Potem CI z E2E i axe, `docs/PERFORMANCE.md` oraz manualny odsłuch VoiceOver. Warunki wejścia i kolejność opisuje sekcja „Następne kroki” w [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md).
