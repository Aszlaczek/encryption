# Pamięć projektu

Dokument dla przyszłych agentów i osób wracających do repozytorium po przerwie. Opisuje cel, aktualny stan, historię wykonanych zadań, niezmienniki, pułapki i następne kroki. Nie zastępuje dokumentów kanonicznych — przy sprzeczności rozstrzygają [`API.md`](API.md) (HTTP), [`DATA_MODEL.md`](DATA_MODEL.md) (baza i JPA) oraz [`DECISIONS.md`](DECISIONS.md) (decyzje architektoniczne).

- **Ostatnia aktualizacja:** 2026-11-13
- **Ostatni commit funkcjonalny:** `d960326` — testy izolacji użytkowników i persystencji (ZR-16)
- **Gałąź:** `main`, gotowa do push na `origin/main`
- **Stan drzewa:** czysty po commicie
- **Zadania ukończone:** ZR-01…ZR-16
- **Następne zadanie:** usuwanie wiadomości i limity operacji crypto 60/min i 30/min

## 1. Cel projektu

Aplikacja demonstracyjna do szyfrowania wiadomości, przygotowana jako zadanie rekrutacyjne:

- użytkownik loguje się i widzi wyłącznie własne wiadomości,
- treść wiadomości jest szyfrowana po stronie serwera algorytmem AES-256-GCM,
- w bazie przechowywany jest szyfrogram, nonce, tag i identyfikator klucza — nigdy jawna treść,
- wiadomości nie są udostępniane innym użytkownikom; brak współdzielenia i brak E2EE,
- zasób należący do innego użytkownika jest raportowany jako `404`, żeby nie ujawniać jego istnienia.

Frontend ma polski interfejs (React + Vite + TypeScript), backend to Spring Boot 4.1.2 na Javie 17, baza to PostgreSQL 16, a całość uruchamia Docker Compose.

## 2. Aktualny stan

### Działa i jest zweryfikowane

- Struktura repozytorium, wersje toolchainu i lint/format obu aplikacji.
- Flyway `V1`–`V3` oraz schemat `app_users` i `messages` z ograniczeniami.
- Encje JPA `AppUser` i `Message`, repozytoria owner-scoped, paginacja kursorowa.
- Argon2id z jawnie przypiętymi parametrami oraz normalizacja loginu.
- Dwa konta demonstracyjne (`alice`, `bob`) seedowane tylko w profilu `local`.
- Logowanie `POST /api/auth/login`, sesja serwerowa, `GET /api/auth/me`, `POST /api/auth/logout` i `GET /api/auth/csrf`.
- Rotacja identyfikatora sesji i tokenu CSRF po logowaniu; logout unieważnia tylko bieżącą sesję.
- Limit 5 nieudanych logowań na 60 s na parę IP + login, z `429` i `Retry-After`; wygaśnięcie okna pokryte testem HTTP z kontrolowanym zegarem, bez rzeczywistego oczekiwania.
- Klucz AES-256 generowany jednorazowo do `.secrets/crypto.key`, montowany tylko do backendu jako sekret Compose; walidacja 32 B i `keyId=k1` przy starcie, brak lub błąd blokuje start.
- `CryptoService` i `PackageCodec`: AES-256-GCM, nonce 12 B, tag 128 bitów, AAD `v1:<ownerId>:<keyId>`, kanoniczny base64url i walidacja pakietu; 49 testów jednostkowych, w tym wektor z `docs/API.md`, round-trip Unicode/emoji/nowych linii i granice rozmiaru.
- `POST /api/crypto/encrypt` i `POST /api/crypto/decrypt`: DTO, właściciel z sesyjnego principalu, limity plaintextu/pakietu, CSRF, `no-store`, kontrolowane błędy RFC 9457; cztery integracyjne scenariusze HTTP.
- Zapis, lista, szczegóły i deszyfrowanie zapisanych wiadomości: transakcyjny zapis przez `CryptoService`, scope właściciela z sesji, `404` dla cudzych/brakujących rekordów i kursor `(created_at, id)` zgodny z limitem API 1–50.
- Błędy RFC 9457 z kodami `code`, `Cache-Control: no-store`, `X-Request-Id`, limit 65 536 B i `415` dla złego `Content-Type`; `Codepoints` mapuje się na `TOO_LONG`, a `Utf8Bytes` na `TOO_MANY_BYTES`, bez odbijania wartości wejściowej.
- Compose z trzema zdrowymi kontenerami, nginx jako jedyny publiczny punkt wejścia.
- `/actuator/health` zwraca `200`; anonimowe `/api/messages` zwraca `401`.
- Izolacja dwóch użytkowników i persystencja pokryte `MessageIsolationIntegrationTests` (10 testów): lista, szczegóły, deszyfrowanie zapisanej wiadomości i wklejonego pakietu, sesja, CSRF, SQL injection oraz faktyczne wiersze PostgreSQL i historia Flyway; raport w `docs/TEST_REPORT.md`.

### Jeszcze nie istnieje

- usuwanie wiadomości,
- limity szyfrowania/deszyfrowania (60/min i 30/min),
- frontend logowania i obsługa CSRF w SPA,
- testy E2E, konfiguracja CI, `docs/PERFORMANCE.md`,
- rotacja kluczy i obsługa wielu aktywnych kluczy.

### Stan testów

| Warstwa | Liczba | Uruchomienie |
|---|---:|---|
| Backend (JUnit 5, Testcontainers PostgreSQL 16) | 125 | `cd backend && ./mvnw spotless:check verify` |
| Frontend (Vitest + Testing Library) | 3 | `cd frontend && npm test` |
| E2E | 0 | brak |

Backend potrzebuje uruchomionego Dockera (Testcontainers). Obrazy Compose budują się z `-DskipTests`, więc testy trzeba uruchomić osobno.

## 3. Chronologia zadań

| Zadanie | Commit | Data | Zakres | Dowód |
|---|---|---|---|---|
| — | `c788f1b` | 2026-11-04 | Pierwszy commit repozytorium | — |
| ZR-01 | `b1e9fbe` | 2026-11-04 | Potwierdzenie MVP, ADR-01 i ADR-07: jeden właściciel wiadomości, brak współdzielenia, brak E2EE, szyfrowanie po stronie serwera | Dokumenty zakresu i decyzji |
| — | `220e21a` | 2026-11-04 | Szkielet Spring Boot (Maven wrapper, aplikacja, konfiguracja) | `./mvnw verify` |
| ZR-02 | `2ab856e` | 2026-11-04 | Model danych i migracje `V1`/`V2`: `app_users`, `messages`, FK, CHECK-i, indeks | `./scripts/validate-schema.sh` |
| — | `aae267a` | 2026-11-04 | Ignorowanie artefaktów narzędzi agentowych | `git status` |
| ZR-03 | `c27981f` | 2026-11-04 | Kontrakt API, DTO, kody błędów, format pakietu, kursor, walidator dokumentacji | `node scripts/validate-api-contract.mjs` |
| ZR-04 | `5cf29ca` | 2026-11-04 | Szkielety frontendu i backendu, przypięte wersje, ESLint/Prettier/Spotless, skan sekretów | `npm run lint`, `./mvnw verify`, `./scripts/check-secrets.sh` |
| ZR-05 | `fedf9ba` | 2026-11-05 | Compose, nginx, wieloetapowe obrazy, sieci `edge`/`data`, healthchecki, wolumen `pgdata` | `docker compose up -d --build`, 3 kontenery healthy |
| ZR-06 | `65504f2` | 2026-11-05 | Encje JPA, repozytoria owner-scoped, testy schematu i kursora | `./mvnw verify` — 7/7, `validate-schema.sh` |
| ZR-07 | `eca5f3a` | 2026-11-05 | Argon2id, `AppUserDetailsService`, konta demo tylko w profilu `local`, migracja `V3` (komentarz kolumny) | `./mvnw verify` — 17/17, Compose, psql |
| ZR-08 | `fb2c9b5` | 2026-11-06 | Logowanie, sesja, CSRF, `/me`, logout, rotacja, limiter, RFC 9457, limity transportu | `./mvnw verify` — 41/41, curl przez nginx, Compose |
| ZR-09 | `a372022` | 2026-11-06 | Test HTTP wygaśnięcia okna limitera z kontrolowanym `Clock`; bez rzeczywistego oczekiwania 60 s | `./mvnw spotless:check verify` — 42/42, `AuthRateLimitWindowIntegrationTests` 1/1 |
| ZR-10 | `3712052` | 2026-11-07 | Generacja klucza AES, sekret plikowy tylko w backendzie, walidacja 32 B i `keyId=k1`, blokada startu | `./mvnw spotless:check verify` — 57/57, Compose, restart, brak/błędny klucz |
| ZR-11 | `01bcd76` | 2026-11-08 | `CryptoService` i `PackageCodec`: AES-256-GCM, nonce 12 B, tag 128 bitów, AAD, walidacja pakietu, typowane błędy | `./mvnw spotless:check verify` — 97/97; 40 nowych testów; Compose health=200; brak importów HTTP/JPA |
| ZR-12 | `a8acf35` | 2026-11-08 | Testy jednostkowe kryptografii: round-trip Unicode/emoji/spacji/nowych linii, 100 unikalnych nonce, tag/nonce z innego szyfrogramu, granice UTF-8, Base64 i minimum ciphertext | `./mvnw spotless:check verify` — 106/106; 9 nowych testów; AAD właściciela odrzucony |
| ZR-13 | `7c10342` | 2026-11-08 | DTO i endpointy bezstanowego szyfrowania/deszyfrowania, sesyjny właściciel AAD, limity i mapowanie błędów domenowych na RFC 9457 | `./mvnw spotless:check verify` — 110/110; 4 scenariusze HTTP; walidator kontraktu i skan sekretów OK |
| ZR-14 | `66fce7a` | 2026-11-08 | Transakcyjny zapis, lista z kursorem, szczegóły i deszyfrowanie zapisanych wiadomości z kontrolą owner scope | `./mvnw spotless:check verify` — 113/113; 3 scenariusze HTTP; skan sekretów, walidator kontraktu i diff check OK |
| ZR-15 | `a310d9e` | 2026-11-08 | Stabilne kody Bean Validation dla punktów kodowych i bajtów UTF-8; testy granic hasła/tekstu, RFC 9457 i brak echo odrzuconych treści | `./mvnw spotless:check verify` — 115/115; `AuthIntegrationTests`, `CryptoControllerIntegrationTests`, `MessageControllerIntegrationTests` — 24/24; skan sekretów i walidator API OK |
| ZR-16 | `d960326` | 2026-11-13 | Testy izolacji A/B i persystencji: lista, szczegóły, decrypt zapisanej wiadomości i wklejonego pakietu, sesja, CSRF, SQL injection, faktyczne wiersze bazy i Flyway | `./mvnw -Dtest=MessageIsolationIntegrationTests test` — 10/10; `./mvnw spotless:check verify` — 125/125; kontrola mutacyjna 8/10 FAIL po usunięciu owner scope; raport `docs/TEST_REPORT.md` |

### ZR-01 — zakres i decyzje

Ustalono, że wiadomość ma dokładnie jednego właściciela. Nie ma udostępniania, współdzielenia ani szyfrowania end-to-end; serwer szyfruje i odszyfrowuje dane. Zasoby obcego użytkownika mają zwracać `404`. Brak rejestracji — tylko dwa publiczne konta demonstracyjne.

### ZR-02 — model danych

Powstały migracje:

- `V1__create_app_users.sql` — tabela `app_users`, unikalny login, wymuszenie `username = lower(btrim(username))`, format loginu, niepusty hash.
- `V2__create_messages.sql` — tabela `messages`, FK do właściciela z `on delete cascade`, ograniczenia długości nonce (12 B), ciphertext (1–40 000 B), tag (16 B), format `key_id`, dodatni `format_version`, algorytm `AES-256-GCM`, indeks `(owner_id, created_at, id)`.

### ZR-03 — kontrakt API

`docs/API.md` definiuje 12 endpointów, DTO, kody błędów RFC 9457 i format pakietu:

```text
v1.<key_id>.<base64url(nonce)>.<base64url(ciphertext)>.<base64url(tag)>
```

AAD ma postać `v1:<ownerId>:<keyId>`. Limity: 10 000 code points / 40 000 B plaintextu, 56 000 znaków pakietu, 65 536 B żądania. Paginacja jest kursorowa, a kursor wskazuje ostatni element strony. Walidator `scripts/validate-api-contract.mjs` sprawdza przykłady JSON, pakiety, wektor AES-256-GCM, endpointy, kody błędów i spójność dokumentów.

### ZR-04 — szkielet repozytorium

- Frontend: React 19.3.1, Vite 7.3.7, TypeScript 6.0.3, ESLint 10.14.0, Prettier 3.9.10, Vitest 5.1.0, jsdom 29.0.0.
- Backend: Spring Boot 4.1.2, Java 17 (target), Maven wrapper 3.10.0, Spotless, Testcontainers 2.0.5.
- Trzy testy frontendu: nagłówek, link do repozytorium, landmark `main` i skip link.
- `scripts/check-secrets.sh` skanuje trackowane pliki; `.env.example` zawiera wyłącznie placeholdery.

### ZR-05 — Docker Compose

- `frontend` publikuje tylko `3000:80`; nginx serwuje SPA i proxuje `/api/` oraz `/actuator/health` do `backend:8080`.
- `backend` i `db` nie mają mapowania portów na hosta.
- Sieci: `edge` (frontend ↔ backend) i `data` (`internal: true`, backend ↔ db).
- Wolumen `pgdata` przechowuje dane PostgreSQL.
- Wszystkie usługi mają healthchecki i `restart: unless-stopped`.
- Obrazy są wieloetapowe: Maven → JRE 17 oraz Node → nginx.

### ZR-06 — JPA i repozytoria

- `AppUser` i `Message` odwzorowują schemat przy `spring.jpa.hibernate.ddl-auto=validate`.
- `Message.created_at` generuje baza przez `@Generated(event = INSERT)` i `insertable = false`.
- Relacja `Message.owner` jest jednokierunkowa; brak tabeli `user_messages` i kolekcji zwrotnej.
- Repozytoria są owner-scoped; nie ma `findAll()` dla wiadomości.
- Kursor używa `(created_at, id)` z tie-breakerem po `id`.
- Siedem testów integracyjnych potwierdza migracje, powtarzalność schematu, UNIQUE, FK/cascade, CHECK-i długości, scope repozytoriów i paginację.

### ZR-07 — hasła i konta demo

- `PasswordEncoderConfig` zwraca Argon2id: salt 16 B, hash 32 B, parallelism 1, memory 16 384 KiB, iterations 2. Parametry są przypięte jawnie, mimo że odpowiadają domyślnym wartościom Spring Security.
- `org.bouncycastle:bcprov-jdk18on:1.86` jest jawną zależnością, bo BOM Spring Boota jej nie zarządza, a `Argon2PasswordEncoder` jej wymaga.
- Hash Argon2id ma 97 znaków i mieści się w `password_hash varchar(100)`.
- `UsernameNormalizer` wykonuje `trim` + `toLowerCase(Locale.ROOT)`; baza wymusza to samo.
- `application-local.properties` definiuje `alice` / `AliceDemo123!` i `bob` / `BobDemo1234!`.
- `DemoUserSeeder` działa tylko z `@Profile("local")`, jest transakcyjny i idempotentny; nie nadpisuje istniejących haseł i nie loguje sekretów.
- `AppUserDetailsService` normalizuje login, respektuje `enabled` i zwraca hash do weryfikacji.
- Compose ustawia `SPRING_PROFILES_ACTIVE=${SPRING_PROFILES_ACTIVE:-local}`.
- Migracja `V3__update_password_hash_comment.sql` zmienia wyłącznie komentarz kolumny z BCrypt na Argon2id; struktura i dane pozostają bez zmian.

Weryfikacja ZR-07:

```text
./mvnw spotless:check verify   -> 17/17 testów, BUILD SUCCESS
./scripts/validate-schema.sh   -> V1, V2, V3; validation_result = OK
profil prod, czysta baza       -> 0 kont demo
profil local, czysta baza      -> 2 konta; hash 97 znaków; brak plaintextu
restart backendu               -> nadal 2 konta; hashe bez zmian
Compose                        -> 3 kontenery healthy
/actuator/health               -> 200
/api/messages                  -> 401 (brak endpointów)
```

### ZR-08 — logowanie, sesja i CSRF

- `SecurityFilterChain` obejmuje `/api/**` i `/actuator/health`; form login, HTTP Basic i domyślny logout są wyłączone. Sesja jest serwerowa (`IF_REQUIRED`) i zapisywana jawnie przez `HttpSessionSecurityContextRepository`.
- `AuthController` udostępnia `GET /api/auth/csrf`, `POST /api/auth/login`, `GET /api/auth/me` i `POST /api/auth/logout`.
- `AppUserPrincipal` przenosi `UUID id`, login, hash i `enabled`; `/me` nie wykonuje dodatkowego zapytania do bazy.
- Po logowaniu `AuthService` rotuje identyfikator sesji (`changeSessionId`), zapisuje nowy kontekst i generuje nowy token CSRF.
- `ApiCsrfRequestMatcher` realizuje kolejność `401` przed `403`: anonimowe mutacje nie są blokowane przez CSRF, logowanie zawsze wymaga tokenu, a mutacje zalogowanych — również.
- `CookieCsrfTokenRepository` używa `XSRF-TOKEN` (`Path=/`, `SameSite=Lax`, bez `HttpOnly`) i nagłówka `X-XSRF-TOKEN`. Używany jest zwykły `CsrfTokenRequestAttributeHandler`, nie `csrf.spa()`.
- `LoginRateLimiter` trzyma w pamięci 5 nieudanych prób na 60 s dla pary IP + znormalizowany login; szósta próba daje `429 RATE_LIMITED` z `Retry-After`, a sukces zeruje licznik.
- Błędne hasło, nieistniejący login i konto wyłączone dają identyczne `401 INVALID_CREDENTIALS`; `DaoAuthenticationProvider` ma włączone ukrywanie braku użytkownika i dodatkowe kontrole.
- `ApiRequestHeadersFilter` działa przed Spring Security: dodaje `X-Request-Id`, `Cache-Control: no-store`, `nosniff`, zwraca `413` powyżej 65 536 B i `415` dla mutacji bez JSON UTF-8 (poza logoutem).
- `ApiExceptionHandler` mapuje walidację, nieznane pola, zły JSON, `405` i nieoczekiwane błędy na RFC 9457; Jackson 3 odrzuca nieznane pola i duplikaty kluczy.
- Cookie `Secure` jest sterowane przez `SESSION_COOKIE_SECURE` (`false` lokalnie, `true` za HTTPS). Sesja wygasa po 30 minutach. Bez migracji bazy.

Weryfikacja ZR-08:

```text
./mvnw spotless:check verify   -> 41/41 testów, BUILD SUCCESS
GET /api/auth/csrf             -> 200; cookie XSRF-TOKEN; brak sesji
POST /api/auth/login           -> 200; nowy JSESSIONID i XSRF-TOKEN
GET /api/auth/me               -> 200; poprawny użytkownik
POST /api/auth/logout          -> 204 z CSRF; 403 bez CSRF; 401 bez sesji
rotacja                        -> sessionId i token CSRF zmienione; stary token -> 403
limit prób                     -> 5x 401, 6. próba 429 + Retry-After: 60
błędne dane                    -> identyczne 401 poza traceId
walidacja/transport            -> 400, 413, 415, 401 dla anonimowego /api/unknown
Compose                        -> 3 kontenery healthy; publiczne tylko 3000:80
```

### ZR-09 — weryfikacja wygaśnięcia okna limitera

- `AuthRateLimitWindowIntegrationTests` przechodzi pełną ścieżkę HTTP: CSRF, pięć nieudanych logowań, szósta próba i ponowne logowanie po wygaśnięciu okna.
- Test podstawia `@Primary MutableClock` przez zagnieżdżoną `@TestConfiguration`, więc `LoginRateLimiter` widzi kontrolowany czas zamiast zegara systemowego.
- Po pięciu próbach `401 INVALID_CREDENTIALS` szósta zwraca `429 RATE_LIMITED` z `Retry-After: 60`.
- Przesunięcie zegara o `WINDOW + 1 s` (61 s) pozwala zalogować się poprawnie (`200`, `username=alice`); nie ma `Thread.sleep` ani rzeczywistego czekania.
- Nagłówek `X-Real-IP` jest ustawiony na stały adres, żeby klucz limitera był deterministyczny.
- Semantyka limitera i kod produkcyjny pozostają bez zmian; zadanie dodaje wyłącznie test i dokumentację.

Weryfikacja ZR-09:

```text
./mvnw -Dtest=AuthRateLimitWindowIntegrationTests test -> 1/1, BUILD SUCCESS
./mvnw spotless:check verify -> 42/42, BUILD SUCCESS
5 nieudanych logowań         -> 401 INVALID_CREDENTIALS
6. próba                     -> 429 RATE_LIMITED, Retry-After: 60
zegar +61 s                  -> 200, username=alice
curl przez nginx :3000       -> 5x 401, 6. próba 429 + Retry-After: 60
po 61 s przez nginx          -> 200, username=alice
```

### ZR-10 — konfiguracja i trwałość klucza AES

- `scripts/generate-crypto-key.sh` generuje jednorazowo `.secrets/crypto.key` (32 B, base64, mode 600) i odmawia nadpisania.
- Compose montuje plik jako sekret `crypto_key` tylko do backendu pod `/run/secrets/crypto_key`; `db` i `frontend` nie mają tego montażu, a `APP_CRYPTO_KEY` nie jest przekazywany przez `environment`.
- `CryptoProperties` wiąże `app.crypto.key-id`, `app.crypto.key-file` i `app.crypto.key`. `CryptoKey` waliduje base64, dokładnie 32 B i `keyId=k1`; `CryptoConfiguration` tworzy bean eager, więc błąd blokuje start.
- `APP_CRYPTO_KEY_FILE` jest preferowane; `APP_CRYPTO_KEY` pozostaje fallbackiem dla lokalnego uruchomienia i testów.
- Testy `CryptoKeyTests` (10) i `CryptoKeyStartupTests` (5) pokrywają poprawne źródła, brak klucza, zły base64, 16/33 B, nieznany `keyId`, brak pliku i brak wycieku klucza w `toString`.
- `.secrets/` jest ignorowany przez Git i wykluczony z kontekstu obrazu; `check-secrets.sh` pilnuje braku trackowanych plików kluczy.

Weryfikacja ZR-10:

```text
./scripts/generate-crypto-key.sh -> 32 B po dekodowaniu, mode 600; drugi raz exit 1
./mvnw spotless:check verify     -> 57/57, BUILD SUCCESS
docker compose config            -> sekret tylko backend; brak APP_CRYPTO_KEY w environment
docker compose up -d --build     -> 3 kontenery healthy; log: Crypto key loaded for keyId=k1 (32 bytes)
restart i down/up                -> sha256 sekretu bez zmian; kontenery healthy
brak źródła klucza               -> exit 1; czytelny błąd startu
16 B / keyId=k2                  -> exit 1; walidacja długości / znanego keyId
db, frontend, obraz bez Compose  -> brak /run/secrets/crypto_key
```

### ZR-11 — CryptoService i kodek pakietu

- `CryptoService` jest bezstanowy i zależy tylko od `CryptoKey` i `PackageCodec`; nie ma importów HTTP ani JPA.
- Szyfrowanie używa `AES/GCM/NoPadding`, nonce 12 B z `SecureRandom` i tagu 128 bitów. Każda operacja tworzy nowy `Cipher`; nie ma współdzielonego mutowalnego `Cipher`.
- Wynik JCE (`ciphertext || tag`) jest dzielony na ostatnich 16 B. Deszyfrowanie przekazuje całość do jednego `doFinal`; `AEADBadTagException` daje `DECRYPT_FAILED` bez plaintextu.
- AAD to `v1:<ownerId>:<keyId>` w UTF-8; `ownerId` pochodzi od wywołującego, a `keyId` z pakietu i musi być równy kluczowi w `CryptoKey`.
- `PackageCodec` waliduje przycięcie ASCII whitespace, limit 56 000 znaków, pięć segmentów, wersję `v1`, format `key_id`, kanoniczny base64url i długości nonce/ciphertext/tag. Whitelistę `k1` egzekwuje serwis.
- `CryptoException` z `CryptoError` (`INVALID_PACKAGE_FORMAT`, `UNSUPPORTED_PACKAGE_VERSION`, `UNKNOWN_KEY_ID`, `DECRYPT_FAILED`) nie zależy od HTTP; mapowanie na RFC 9457 powstanie z endpointami.
- Produkcyjne szyfrowanie zawsze generuje nowy nonce; package-private `encryptWithNonce` służy tylko do odtworzenia wektora testowego.
- Testy: `PackageCodecTests` (23) i `CryptoServiceTests` (26) — łącznie 49 po ZR-12; w tym wektor z `docs/API.md`, 64 równoległe szyfrowania i odrzucenie złego tagu/AAD/klucza.

Weryfikacja ZR-11 (implementacja 2026-11-07, weryfikacja 2026-11-08; JDK 27.0.1, Maven 3.10.0, Docker 29.9.1, Testcontainers 2.0.5, PostgreSQL 16.15):

```text
./mvnw -Dtest=PackageCodecTests,CryptoServiceTests test -> 40/40 (22 + 18), BUILD SUCCESS
./mvnw spotless:check verify                             -> 97/97, BUILD SUCCESS
grep HTTP/JPA w pakiecie crypto                          -> brak importów (NO_HTTP_OR_PERSISTENCE_IMPORTS)
./scripts/check-secrets.sh                               -> OK, brak sekretów w trackowanych plikach
node scripts/validate-api-contract.mjs                   -> OK, wektor AES-GCM i format pakietu zgodne
docker compose up -d --build; docker compose restart backend
                                                         -> 3 kontenery healthy, health=200, /api/messages=401
                                                            log: Crypto key loaded for keyId=k1 (32 bytes)
                                                            log: Started BackendApplication in 2.451 seconds
```

Asercje pokryte przez 40 testów ZR-11:

```text
decrypt wektora                                          -> "Zażółć gęślą jaźń 🔐"
re-encrypt z nonce AAECAwQFBgcICQoL                      -> identyczny pakiet v1.k1...
64 równoległe szyfrowania                                -> 64 unikalne nonce, wszystkie odszyfrowane
zły tag / obcy owner / inny klucz                        -> DECRYPT_FAILED, brak plaintextu
v2 / k2 / zły base64url                                  -> UNSUPPORTED_PACKAGE_VERSION / UNKNOWN_KEY_ID / INVALID_PACKAGE_FORMAT
40 000 B / 40 001 B plaintext                            -> sukces / IllegalArgumentException
```

### ZR-12 — testy jednostkowe kryptografii

- Dodano 9 testów: 8 w `CryptoServiceTests` i 1 w `PackageCodecTests`; kod produkcyjny bez zmian.
- Round-trip obejmuje polskie znaki, emoji (w tym variation selector), spacje brzegowe, `\n`, `\r\n`, tabulator, CJK i znak łączony; długość ciphertextu jest równa długości UTF-8 plaintextu.
- Nonce: 100 szyfrowań identycznego tekstu daje 100 unikalnych nonce i 100 unikalnych pakietów.
- Negatywne: tag i nonce z innego szyfrogramu, zmieniony tag w pełnym pakiecie, padding `=`, standardowy base64 `+`/`/`, 10 001 emoji (40 004 B), obcy właściciel przez AAD.
- Granice: 10 000 emoji = 40 000 B i 10 000 punktów kodowych przechodzi; 1-bajtowy ciphertext jest poprawny w kodeku.
- Kryterium AAD: `rejectsDifferentOwner` odrzuca pakiet przy innym `ownerId` jako `DECRYPT_FAILED`, bez ujawnienia plaintextu.

### ZR-13 — API szyfrowania i deszyfrowania

- Dodano `POST /api/crypto/encrypt` i `POST /api/crypto/decrypt` oraz DTO zgodne z kontraktem. Właściciel jest pobierany wyłącznie z `AppUserPrincipal`; ciało żądania nie przyjmuje identyfikatora właściciela.
- Walidacja plaintextu sprawdza ASCII blank, maksymalnie 10 000 punktów kodowych i 40 000 B UTF-8. Pakiet ma limit 56 000 znaków i jest walidowany przez `PackageCodec`.
- `ApiExceptionHandler` mapuje format, wersję i nieznany klucz na `400`, a nieudane uwierzytelnienie AES-GCM na `422 DECRYPT_FAILED`. Odpowiedzi błędów nie zawierają tekstu jawnego ani pakietu. Filtr API ustawia `Cache-Control: no-store`; chronione POST-y wymagają sesji i CSRF.
- Zależności ZR-08, ZR-11 i ZR-12 potwierdzono commitami `fb2c9b5`, `01bcd76` i `a8acf35` (HEAD przed zmianami: `6ea408f`).

Weryfikacja ZR-13 (2026-11-08; JDK 27.0.1, Maven 3.10.0, Docker 29.9.1, Testcontainers 2.0.5, PostgreSQL 16.15):

```text
./mvnw -Dtest=CryptoControllerIntegrationTests test -> 4/4, BUILD SUCCESS
./mvnw spotless:check verify                       -> 110/110, BUILD SUCCESS
./scripts/check-secrets.sh                         -> OK
node scripts/validate-api-contract.mjs             -> OK (28 przykładów JSON, 12 endpointów, wektor AES-GCM)
git diff --check                                   -> OK
```

Round-trip zalogowanej Alice zakończył się `200`, a odpowiedź zawierała odszyfrowany oryginalny tekst i `no-store`. Anonimowy klient otrzymał `401 UNAUTHENTICATED`. Pakiet Alice przesłany z sesji Boba zwrócił `422 DECRYPT_FAILED` bez plaintextu; błędna struktura zwróciła `400 INVALID_PACKAGE_FORMAT`. Limity 10 001 code points (400 validation) i 10 000 emoji/40 000 B (sukces) zostały sprawdzone.

### ZR-14 — zapis, lista i odczyt wiadomości

- Dodano `POST /api/messages`, `GET /api/messages`, `GET /api/messages/{id}` i `POST /api/messages/{id}/decrypt`. Zapis szyfruje przez istniejący `CryptoService` wewnątrz transakcyjnego serwisu i zapisuje tylko kopertę; brak plaintextu w schemacie i odpowiedziach listy.
- Właściciel jest pobierany z principalu sesji. Repozytoria są wyłącznie owner-scoped; nieistniejący i cudzy UUID mają identyczne `404 MESSAGE_NOT_FOUND`. Zapisane, nieodszyfrowywalne koperty dają `500 MESSAGE_UNDECRYPTABLE` bez szczegółów.
- Paginacja używa `created_at DESC, id DESC` i nieprzezroczystego kanonicznego base64url kursora `epochMicros:uuid`. Publiczny limit pozostaje 1–50 zgodnie z `docs/API.md`; opis limitu 100 w karcie Notion rozbiega się z kanonicznym kontraktem.
- Deszyfrowanie zapisanej wiadomości to POST bez ciała, wymaga sesji i CSRF; filtr transportowy dopuszcza tę ścieżkę bez wymaganego `Content-Type`. Nie zmieniano migracji ani schematu.
- Zależności ZR-06, ZR-08, ZR-11 oraz ZR-13 są obecne: `65504f2`, `fb2c9b5`, `01bcd76` i `7c10342`.
- Integracyjne `MessageControllerIntegrationTests` sprawdzają zapis szyfrogramu, odczyt pakietu i decrypt, izolację Alice/Bob, kursor dwóch stron bez duplikatów, limit 50, złe kursory/ID, anonimowe 401 oraz 404 dla obcego/brakującego rekordu.

Weryfikacja ZR-14 (2026-11-08; JDK 27.0.1, Maven 3.10.0, Docker 29.9.1, Testcontainers 2.0.5, PostgreSQL 16.15):

```text
./mvnw -Dtest=MessageControllerIntegrationTests test -> 3/3, BUILD SUCCESS
./mvnw spotless:check verify                       -> 113/113, BUILD SUCCESS
./scripts/check-secrets.sh                         -> OK, brak sekretów w trackowanych plikach
node scripts/validate-api-contract.mjs             -> OK (28 przykładów JSON, 12 endpointów, kursor)
git diff --check                                   -> OK
```

Weryfikacja HTTP potwierdziła zapis tylko koperty i metadanych (brak kolumn plaintext/content/body; ciphertext różni się od jawnego UTF-8), round-trip, owner scope dla listy i szczegółów, 401 anonimowego klienta, CSRF dla decrypt, 404 dla cudzej/brakującej wiadomości, stabilny kursor bez duplikatów oraz `500 MESSAGE_UNDECRYPTABLE` dla celowo uszkodzonego tagu. Parametr `ownerId` nie rozszerza zakresu listy.

Weryfikacja ZR-12 (2026-11-08; JDK 27.0.1, Maven 3.10.0, Docker 29.9.1, Testcontainers 2.0.5, PostgreSQL 16.15):

```text
./mvnw -Dtest=PackageCodecTests,CryptoServiceTests test -> 49/49 (23 + 26), BUILD SUCCESS
./mvnw spotless:check verify                             -> 106/106, BUILD SUCCESS
./scripts/check-secrets.sh                               -> OK, brak sekretów w trackowanych plikach
node scripts/validate-api-contract.mjs                   -> OK, wektor AES-GCM i format pakietu zgodne
git diff --check                                         -> OK
```

## 4. Architektura i układ repozytorium

```text
.
├── AGENTS.md                 # krótkie instrukcje ładowane automatycznie
├── README.md                 # status, uruchomienie, dowody wymagań
├── docker-compose.yml
├── docs/
│   ├── API.md                # kanoniczny kontrakt HTTP
│   ├── DATA_MODEL.md         # schemat, JPA, migracje
│   ├── DECISIONS.md          # ADR-01, ADR-07…ADR-17
│   ├── OPEN_QUESTIONS.md     # Q01…Q45
│   ├── TEST_REPORT.md        # raport testów negatywnych ZR-16 (izolacja A/B, persystencja)
│   └── PROJECT_MEMORY.md     # ten dokument
├── scripts/
│   ├── check-secrets.sh
│   ├── validate-api-contract.mjs
│   ├── validate-schema.sh
│   └── validate-schema.sql
├── backend/                  # Spring Boot, Java 17, Maven wrapper
└── frontend/                 # React, Vite, TypeScript, nginx
```

Backend stosuje podział package-by-feature:

- `auth/` — `AppUser`, `AppUserPrincipal`, repozytorium, normalizacja, konta demo, `AuthService`, `LogoutService`, limiter,
- `auth/api/` — DTO i kontroler `/api/auth`,
- `message/` — `Message`, repozytorium, serwis owner-scoped, kursor i API wiadomości,
- `crypto/` — `CryptoProperties`, `CryptoKey`, `CryptoService`, `PackageCodec`, `EncryptedPayload` i błędy domenowe AES-256-GCM,
- `common/security/` — `PasswordEncoderConfig`, `SecurityFilterChain`, CSRF, obsługa `401`/`403`,
- `common/web/` — RFC 9457, limity transportu, nagłówki, walidatory.

Frontend ma pustą strukturę feature'ów (`auth/`, `crypto/`, `messages/`) oraz `shared/api`, `shared/ui`. Jedyny ekran to statyczny `App.tsx` z nagłówkiem, statusem projektu i linkiem do repozytorium.

## 5. Baza danych i migracje

### `app_users`

| Kolumna | Typ | Ograniczenia |
|---|---|---|
| `id` | `uuid` | PK, UUID v4 |
| `username` | `varchar(50)` | UNIQUE, `lower(btrim(username))`, format `^[a-z0-9][a-z0-9._-]{2,49}$` |
| `password_hash` | `varchar(100)` | niepusty, Argon2id (97 znaków) |
| `enabled` | `boolean` | domyślnie `true` |
| `created_at` | `timestamptz` | domyślnie `now()` |

### `messages`

| Kolumna | Typ | Ograniczenia |
|---|---|---|
| `id` | `uuid` | PK, UUID v4 |
| `owner_id` | `uuid` | FK → `app_users.id`, `on delete cascade` |
| `nonce` | `bytea` | dokładnie 12 B |
| `ciphertext` | `bytea` | 1–40 000 B |
| `tag` | `bytea` | dokładnie 16 B |
| `key_id` | `varchar(32)` | format `^[a-z0-9][a-z0-9_-]{0,31}$` |
| `format_version` | `integer` | `>= 1` |
| `algorithm` | `varchar(32)` | wyłącznie `AES-256-GCM` |
| `created_at` | `timestamptz` | generowane przez bazę |

Indeks `idx_messages_owner_created_id` obsługuje paginację `(owner_id, created_at, id)`.

Migracje:

- `V1__create_app_users.sql`
- `V2__create_messages.sql`
- `V3__update_password_hash_comment.sql` (tylko komentarz kolumny)

**Nie wolno edytować zastosowanych migracji.** Flyway przechowuje checksum w `flyway_schema_history`; każda zmiana wymaga nowej migracji `V4+` i aktualizacji testów, które liczą wpisy (obecnie 3).

## 6. Uwierzytelnianie i konta

- Algorytm: Argon2id.
- Parametry: salt 16 B, hash 32 B, parallelism 1, memory 16 384 KiB, iterations 2.
- Prefiks hasha: `$argon2id$v=19$m=16384,t=2,p=1$`; długość 97 znaków.
- Normalizacja loginu: `trim` + `toLowerCase(Locale.ROOT)`.
- Hasło nie jest przycinane; limit wejścia w kontrakcie to 1–128 B UTF-8.
- Konta demo: `alice` / `AliceDemo123!`, `bob` / `BobDemo1234!`.
- Seed: `DemoUserSeeder`, tylko `@Profile("local")`, idempotentny, bez nadpisywania.
- Poza profilem `local` seeder nie powstaje; czysta baza z profilem `prod` ma 0 kont demo.
- Logowanie: `POST /api/auth/login` z JSON i wymaganym CSRF; login normalizowany, hasło nie.
- Sesja: `JSESSIONID`, `HttpOnly`, `SameSite=Lax`, `Path=/`, 30 min bezczynności, tylko cookie; `Secure` przez `SESSION_COOKIE_SECURE`.
- CSRF: cookie `XSRF-TOKEN` + nagłówek `X-XSRF-TOKEN`; token i identyfikator sesji rotują po logowaniu.
- Wylogowanie: `POST /api/auth/logout`, unieważnia tylko bieżącą sesję i czyści oba cookie.
- Limit: 5 nieudanych prób na 60 s na IP + znormalizowany login; `429` z `Retry-After`.
- Błędne hasło, nieistniejący login i konto wyłączone dają identyczne `401 INVALID_CREDENTIALS`.
- IP do limitera: `X-Real-IP` od nginx, poza Compose `remoteAddr`.

Konfiguracja:

- `application.properties` — datasource z env, `ddl-auto=validate`, `open-in-view=false`, Flyway, tylko health endpoint.
- `application-local.properties` — dane dwóch kont demo.
- Compose — `SPRING_PROFILES_ACTIVE` domyślnie `local`, nadpisywalny.

## 7. Kontrakt API — stan

`docs/API.md` jest kanonicznym kontraktem.

- **Gotowe:** auth, `POST /api/crypto/encrypt`, `POST /api/crypto/decrypt`, `POST/GET /api/messages`, `GET /api/messages/{id}`, `POST /api/messages/{id}/decrypt`; sesja, CSRF, błędy RFC 9457 i `no-store`.
- **Do wykonania:** `DELETE /api/messages/{id}`, limity szyfrowania/deszyfrowania 60/min i 30/min.
- Właściciel we wszystkich ścieżkach pochodzi wyłącznie z sesji.

Założenia formatu:

```text
pakiet: v1.<key_id>.<base64url(nonce)>.<base64url(ciphertext)>.<base64url(tag)>
AAD:    v1:<ownerId>:<keyId>
```

## 8. Inwentarz testów

### Backend — 125 testów

| Klasa | Liczba | Co sprawdza |
|---|---:|---|
| `PersistenceIntegrationTests` | 7 | migracje i walidacja mapowania, powtarzalność schematu, UNIQUE loginu, FK/cascade, CHECK-i długości, scope repozytoriów, kursor |
| `AuthIntegrationTests` | 16 | CSRF, login, `/me`, logout, rotacja sesji i tokenu, `401` przed `403`, nierozróżnialne błędy, walidacja i granica 128 B hasła, `413`/`415`, `429`, nieznane ścieżki, `X-Request-Id` |
| `AuthRateLimitWindowIntegrationTests` | 1 | wygaśnięcie okna limitera z kontrolowanym `Clock`, bez rzeczywistego czekania |
| `CryptoKeyTests` | 10 | klucz inline/plik, priorytet pliku, brak klucza, zły base64, 16/33 B, nieznany `keyId`, brak pliku, brak wycieku w `toString` |
| `CryptoKeyStartupTests` | 5 | poprawny start i blokada kontekstu dla braku klucza, złego base64, złej długości i nieznanego `keyId` |
| `PackageCodecTests` | 23 | wektor i kanoniczny base64url, przycinanie ASCII, wersja, `key_id`, długości nonce/tag/ciphertext, minimum 1 B i maksimum 40 000 B, defensywne kopie |
| `CryptoServiceTests` | 26 | AES-GCM round-trip Unicode/emoji/spacji/nowych linii, świeże nonce (także 100× ten sam tekst), zły tag/nonce/AAD/klucz, wersja, Base64, granice 40 000 B |
| `CryptoControllerIntegrationTests` | 5 | szyfrowanie/deszyfrowanie HTTP, sesja, CSRF, izolacja pakietów, granica 40 000 B i brak echo błędnej treści |
| `MessageControllerIntegrationTests` | 3 | zapis bez plaintextu, owner scope, szczegóły/decrypt, paginacja kursorowa, 404, auth i CSRF |
| `MessageIsolationIntegrationTests` | 10 | izolacja A/B na liście, szczegółach, decrypt zapisanej wiadomości i wklejonego pakietu (5 payloadów), sesja i CSRF, SQL injection/XSS, faktyczne wiersze PostgreSQL, koperty i historia Flyway |
| `DemoUserSeedingIntegrationTests` | 4 | dwa konta z hashami Argon2id, dopasowanie haseł, idempotencja bez nadpisywania, brak plaintextu w bazie, principal z `id` |
| `LoginRateLimiterTests` | 5 | blokada szóstej próby, okno 60 s, reset po sukcesie, niezależność kluczy IP/login, starzenie wpisów |
| `UsernameNormalizerTests` | 3 | trim/lowercase, puste dane, `null` |
| `DemoUserSeedingDisabledIntegrationTests` | 2 | brak seedera i kont poza profilem `local`, `UserDetailsService` nie znajduje kont demo |
| `AppUserPrincipalTests` | 2 | dane principal sesji, `ROLE_USER`, konto wyłączone |
| `ApiProblemFactoryTests` | 2 | RFC 9457, `traceId`, `instance`, lista błędów pól |
| `PasswordEncoderConfigTests` | 1 | parametry Argon2id, długość 97, dopasowanie poprawnego i błędnego hasła, sól, hasło 128 B |

### Frontend — 3 testy

`frontend/src/app/App.test.tsx`: nagłówek `Szyfrowanie wiadomości`, link do repozytorium, landmark `main` i skip link.

### Braki

- Brak testów E2E (Playwright) i testów dostępności (axe).
- Brak CI (`.github/workflows` nie istnieje).
- Brak `docs/PERFORMANCE.md`.
- Brak testów wydajnościowych i przeciążeniowych.

## 9. Decyzje i otwarte kwestie

### Przyjęte ADR

| ADR | Temat | Istota |
|---|---|---|
| ADR-01 | Model dostępu | Jeden właściciel wiadomości, brak współdzielenia, brak E2EE, szyfrowanie serwerowe, obcy zasób = `404` |
| ADR-07 | Konta demonstracyjne | Brak rejestracji; `alice` i `bob`; poświadczenia publiczne (punkty 2, 3 i 6 zastąpione przez ADR-13) |
| ADR-08 | Schemat | `app_users` + `messages`, UUID v4, relacja 1:N, brak `user_messages`, brak kolumn plaintext |
| ADR-09 | Kontrakt HTTP | JSON REST pod `/api`, `JSESSIONID` + `X-XSRF-TOKEN`, RFC 9457 z `code`, `401` przed `403`, właściciel z sesji, kursor, format pakietu, AAD, limity |
| ADR-10 | Toolchain | Przypięte wersje frontendu i backendu, Java 17, Maven 3.10.0, Testcontainers 2.0.5, BouncyCastle 1.86 |
| ADR-11 | Docker | Tylko `3000:80` publiczne, sieci `edge`/`data`, obrazy wieloetapowe, `pgdata`, healthchecki, proxy nginx |
| ADR-12 | JPA | `created_at` z bazy, jednokierunkowy `Message.owner`, repozytoria owner-scoped, brak encji w API |
| ADR-13 | Argon2id i konta demo | Parametry Argon2id, BouncyCastle, hash 97 znaków, seed tylko w profilu `local`, limit hasła 128 B |
| ADR-14 | Logowanie, sesja i CSRF | Ręczny login JSON, sesja serwerowa, rotacja sesji i CSRF, `401` przed `403`, limiter 5/60 s, cookie `HttpOnly`/`SameSite=Lax`, `SESSION_COOKIE_SECURE` |
| ADR-15 | Klucz szyfrujący | Jednorazowa generacja 32 B, sekret plikowy tylko w backendzie, walidacja `keyId=k1`, brak fallbacku demo, utrata klucza = utrata danych, brak rotacji w MVP |

### Otwarte kwestie

`docs/OPEN_QUESTIONS.md` zawiera Q01–Q45. Ostatnie przyjęte ustalenia:

- Q06 — polityka haseł demo i parametry Argon2id,
- Q32 — migracje `V1`–`V3` i seed w warstwie aplikacji,
- Q43 — mapowanie JPA i repozytoria,
- Q44 — źródło i profil kont demo,
- Q45 — logowanie, sesja, CSRF i limiter.

Przed rozpoczęciem nowego zadania sprawdź, czy nie ma otwartego pytania dotyczącego jego zakresu.

## 10. Niezmienniki

Te zasady wynikają z ADR i nie powinny być zmieniane bez nowej decyzji:

1. Właściciel wiadomości pochodzi wyłącznie z sesji; żadne DTO ani parametr nie może go wskazywać.
2. Baza nie przechowuje jawnej treści wiadomości ani jawnych haseł.
3. `created_at` generuje baza; aplikacja go nie ustawia.
4. Relacja `Message.owner` jest jednokierunkowa.
5. Repozytoria wiadomości są owner-scoped; brak `findAll()`.
6. `ddl-auto=validate`; źródłem prawdy jest Flyway.
7. Zastosowanych migracji nie wolno edytować; zmiany tylko przez `V4+`.
8. Encje nie są zwracane z API — tylko DTO.
9. Kolejność kontroli: `401` przed `403`; mutacje wymagają CSRF.
10. Argon2id ma parametry z `PasswordEncoderConfig`; hash musi mieścić się w `varchar(100)`.
11. Konta demo powstają tylko w profilu `local`; seed jest idempotentny.
12. Format pakietu, AAD i limity są zgodne z `docs/API.md`.
13. Publiczny jest tylko port `3000`; backend i baza pozostają w sieci Compose.
14. Sekrety nie trafiają do repozytorium; `.env.example` zawiera placeholdery.
15. Logowanie zawsze wymaga CSRF; po logowaniu rotują się identyfikator sesji i token CSRF.
16. `JSESSIONID` jest `HttpOnly` i `SameSite=Lax`; `Secure` włącza się przez `SESSION_COOKIE_SECURE` i jest wymagane poza lokalnym HTTP.

## 11. Pułapki i lekcje

1. **Checksum Flyway.** `V1` zawierała komentarz „BCrypt”. Nie można było jej poprawić, więc powstała `V3` zmieniająca wyłącznie komentarz. Testy liczące migracje trzeba było podnieść z 2 do 3.
2. **BouncyCastle poza BOM.** `Argon2PasswordEncoder` wymaga BouncyCastle, ale Spring Boot BOM nie zarządza tą biblioteką. Wersja `1.86` jest pinowana jawnie; usunięcie jej lub poleganie na wersji przechodniej może zepsuć build.
3. **Profil zamiast flagi.** Wcześniejsza koncepcja `APP_DEMO_USERS=true` została zastąpiona profilem `local`, bo przypadkowa flaga środowiskowa mogła utworzyć konta demo poza środowiskiem demonstracyjnym.
4. **Rejestracja properties.** `DemoUserProperties` jest włączane tylko w `DemoUserConfiguration` z `@Profile("local")`. Globalne `@EnableConfigurationProperties` sprawiłoby, że aplikacja bez tego profilu nie wystartuje z powodu braku wymaganych właściwości.
5. **Testcontainers.** Testy backendu wymagają Dockera. W środowisku bez Dockera `./mvnw verify` nie jest dowodem poprawności.
6. **Build bez testów.** Obrazy Docker budują się z `-DskipTests`; zielony `docker compose up` nie oznacza, że testy przechodzą.
7. **Domyślny profil w Compose.** `local` jest wygodny dla demonstracji, ale wdrożenie produkcyjne musi jawnie ustawić inny `SPRING_PROFILES_ACTIVE`.
8. **Pamięć Argon2id.** Każda weryfikacja hasła zużywa 16 MiB; wiele równoległych logowań może wyczerpać RAM kontenera.
9. **Ograniczony zapas kolumny.** `varchar(100)` pasuje do obecnych 97 znaków, ale podniesienie parametrów Argon2id może wymagać nowej migracji.
10. **Spójność dokumentów.** `docs/API.md`, `docs/DATA_MODEL.md` i `README.md` opisują te same limity i format pakietu; walidator kontraktu wyłapuje część rozjazdów, ale zmiany trzeba propagować ręcznie w tym samym commicie.
11. **Historia w README.** Wpisy wyników starszych zadań muszą pozostać oznaczone jako stan historyczny (np. „stan ZR-06”), żeby nie sugerowały, że migracja `V3` istniała wcześniej.
12. **Sekrety demo.** Hasła `alice` i `bob` są jawne i przeznaczone wyłącznie do demonstracji; nie wolno ich używać w innych środowiskach.
13. **`csrf.spa()` i duplikacja cookie.** W tej konfiguracji `csrf.spa()` powodował dwa cookie `XSRF-TOKEN` i rozjazd wartości w ciele odpowiedzi. Używany jest zwykły `CsrfTokenRequestAttributeHandler`, a `GET /api/auth/csrf` polega na zapisie tokenu odroczonego przez `CsrfFilter`.
14. **MockMvc a atrybuty cookie.** `MockHttpServletResponse` gubi `SameSite` i część atrybutów `JSESSIONID` przy `addCookie`; testy MockMvc nie są dowodem polityki cookie. Trzeba to sprawdzić rzeczywistym `curl` przez nginx.
15. **Kolejność filtrów.** `ApiRequestHeadersFilter` ma `HIGHEST_PRECEDENCE`, żeby `413`/`415` wyprzedzały uwierzytelnienie. `ApiCsrfRequestMatcher` musi widzieć kontekst z sesji, ale anonimowe mutacje muszą przejść do autoryzacji, inaczej `403` wyprzedzi `401`.
16. **Zaufanie `X-Real-IP`.** Nagłówek jest bezpieczny tylko dlatego, że backend nie jest publikowany, a nginx go nadpisuje. Poza Compose limiter używa `remoteAddr`.
17. **Rotacja przed zapisem kontekstu.** Przy ponownym logowaniu najpierw `changeSessionId()`, potem zapis kontekstu i nowy CSRF; odwrotna kolejność pozostawia ważny stary identyfikator lub stary token.
18. **Klucz AES jest sekretem plikowym.** `.secrets/crypto.key` jest ignorowany, montowany tylko do backendu i nigdy nie trafia do obrazu ani `environment`. Brak lub błąd klucza blokuje start; nie przywracaj zerowego klucza demo.
19. **Utrata klucza jest nieodwracalna.** Brak automatycznej rotacji i odzyskiwania w MVP; zmiana pliku po zapisaniu wiadomości czyni je nieczytelnymi. Kopia zapasowa jest obowiązkiem operatora.

## 12. Następne kroki

Kolejność rekomendowana:

1. ~~**Logowanie, sesja i CSRF**~~ — wykonane w ZR-08: `SecurityFilterChain`, endpointy auth, rotacja, limiter, RFC 9457.
2. ~~**Walidacja i błędy**~~ — wykonane w ZR-08 dla auth i transportu; kolejne DTO dołączą własne walidatory.
3. ~~**Konfiguracja i trwałość klucza**~~ — wykonane w ZR-10: generacja, sekret Compose tylko w backendzie, walidacja startowa, ADR-15.
4. ~~**Kryptografia**~~ — wykonane w ZR-11 i pokryte testami jednostkowymi w ZR-12: `CryptoService` AES-256-GCM, `PackageCodec`, format pakietu, AAD, walidacja nonce/tag/długości, wektory z `docs/API.md`.
5. ~~**Zapis, lista i odczyt wiadomości**~~ — wykonane w ZR-14; izolacja A/B i persystencja pokryte testami w ZR-16. Pozostaje endpoint usuwania oraz limity operacji crypto 60/min i 30/min.
6. **Frontend** — formularz logowania, obsługa CSRF, lista i edytor wiadomości, stany błędów, testy komponentów.
7. **E2E** — Playwright: logowanie, izolacja użytkowników, CRUD, wylogowanie, błędy walidacji.
8. **CI i wydajność** — workflow GitHub Actions, `docs/PERFORMANCE.md`, testy obciążeniowe i analiza pamięci Argon2id.

Warunki wejścia do kolejnego zadania:

- drzewo czyste i `main == origin/main`,
- 125/125 testów backendu i 3/3 frontendu,
- Compose z trzema zdrowymi kontenerami,
- dokumentacja i ADR zaktualizowane w tym samym commicie,
- wpis do Notion z rzeczywistym hashem commita i wynikami komend.

## 13. Jak utrzymywać ten dokument

Po każdym ukończonym zadaniu:

1. Dopisz wiersz do tabeli chronologii (zadanie, commit, data, zakres, dowód).
2. Zaktualizuj „Aktualny stan”, „Stan testów” i „Następne kroki”.
3. Dopisz nowe pułapki, jeśli wystąpiły.
4. Zaktualizuj `AGENTS.md`, jeśli zmieniły się komendy, niezmienniki lub następny krok.
5. Nie kopiuj całych dokumentów kanonicznych — linkuj do nich i opisuj tylko to, co zmieniło się w projekcie.
6. Commit i push razem ze zmianą, której dotyczy pamięć.
