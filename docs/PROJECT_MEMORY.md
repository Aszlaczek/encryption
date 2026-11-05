# Pamięć projektu

Dokument dla przyszłych agentów i osób wracających do repozytorium po przerwie. Opisuje cel, aktualny stan, historię wykonanych zadań, niezmienniki, pułapki i następne kroki. Nie zastępuje dokumentów kanonicznych — przy sprzeczności rozstrzygają [`API.md`](API.md) (HTTP), [`DATA_MODEL.md`](DATA_MODEL.md) (baza i JPA) oraz [`DECISIONS.md`](DECISIONS.md) (decyzje architektoniczne).

- **Ostatnia aktualizacja:** 2026-11-05
- **Ostatni commit:** `eca5f3a` — `feat(auth): Argon2id i konta demo tylko w profilu lokalnym (ZR-07)`
- **Gałąź:** `main`, zsynchronizowana z `origin/main`
- **Stan drzewa:** czysty
- **Zadania ukończone:** ZR-01…ZR-07
- **Następne zadanie:** logowanie, sesja i CSRF zgodnie z `docs/API.md`

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
- Compose z trzema zdrowymi kontenerami, nginx jako jedyny publiczny punkt wejścia.
- `/actuator/health` zwraca `200`; `/api/messages` zwraca `401`, bo endpointy nie istnieją.

### Jeszcze nie istnieje

- kontrolery REST i warstwa serwisowa,
- `SecurityFilterChain` zgodny z kontraktem (sesja, CSRF, kolejność `401`/`403`),
- endpointy `auth`, `crypto` i `messages`,
- `CryptoService` i walidacja formatu pakietu w czasie żądania,
- DTO i mapowanie błędów RFC 9457 z kodami `code`,
- testy E2E, konfiguracja CI, `docs/PERFORMANCE.md`,
- rotacja kluczy i obsługa wielu aktywnych kluczy.

### Stan testów

| Warstwa | Liczba | Uruchomienie |
|---|---:|---|
| Backend (JUnit 5, Testcontainers PostgreSQL 16) | 17 | `cd backend && ./mvnw verify` |
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

## 4. Architektura i układ repozytorium

```text
.
├── AGENTS.md                 # krótkie instrukcje ładowane automatycznie
├── README.md                 # status, uruchomienie, dowody wymagań
├── docker-compose.yml
├── docs/
│   ├── API.md                # kanoniczny kontrakt HTTP
│   ├── DATA_MODEL.md         # schemat, JPA, migracje
│   ├── DECISIONS.md          # ADR-01, ADR-07…ADR-13
│   ├── OPEN_QUESTIONS.md     # Q01…Q44
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

- `auth/` — `AppUser`, repozytorium, normalizacja, konta demo, `UserDetailsService`,
- `message/` — `Message`, `MessageRepository`, w przyszłości serwis i kontroler,
- `crypto/` — obecnie tylko pakiet; docelowo AES-256-GCM i format pakietu,
- `common/security/` — `PasswordEncoderConfig`, docelowo konfiguracja bezpieczeństwa,
- `common/web/` — obecnie tylko pakiet; docelowo błędy RFC 9457 i nagłówki.

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
- Brak endpointu logowania: konta i `UserDetailsService` są gotowe, ale API nadal zwraca `401`.

Konfiguracja:

- `application.properties` — datasource z env, `ddl-auto=validate`, `open-in-view=false`, Flyway, tylko health endpoint.
- `application-local.properties` — dane dwóch kont demo.
- Compose — `SPRING_PROFILES_ACTIVE` domyślnie `local`, nadpisywalny.

## 7. Kontrakt API — stan

`docs/API.md` jest kompletny jako kontrakt, ale **nie jest jeszcze zaimplementowany**. Obejmuje:

- `GET /api/auth/csrf`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`,
- `POST /api/crypto/encrypt`, `POST /api/crypto/decrypt`,
- `GET/POST /api/messages`, `GET/DELETE /api/messages/{id}`,
- sesję `JSESSIONID`, nagłówek `X-XSRF-TOKEN`,
- błędy RFC 9457 z stabilnym polem `code`,
- kolejność kontroli: `401` przed `403`,
- właściciela wyłącznie z sesji,
- kursor paginacji i limity rozmiarów.

Założenia formatu:

```text
pakiet: v1.<key_id>.<base64url(nonce)>.<base64url(ciphertext)>.<base64url(tag)>
AAD:    v1:<ownerId>:<keyId>
```

## 8. Inwentarz testów

### Backend — 17 testów

| Klasa | Liczba | Co sprawdza |
|---|---:|---|
| `PersistenceIntegrationTests` | 7 | migracje i walidacja mapowania, powtarzalność schematu, UNIQUE loginu, FK/cascade, CHECK-i długości, scope repozytoriów, kursor |
| `DemoUserSeedingIntegrationTests` | 4 | dwa konta z hashami Argon2id, dopasowanie haseł, idempotencja bez nadpisywania, brak plaintextu w bazie |
| `DemoUserSeedingDisabledIntegrationTests` | 2 | brak seedera i kont poza profilem `local`, `UserDetailsService` nie znajduje kont demo |
| `UsernameNormalizerTests` | 3 | trim/lowercase, puste dane, `null` |
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

### Otwarte kwestie

`docs/OPEN_QUESTIONS.md` zawiera Q01–Q44. Ostatnie przyjęte ustalenia:

- Q06 — polityka haseł demo i parametry Argon2id,
- Q32 — migracje `V1`–`V3` i seed w warstwie aplikacji,
- Q43 — mapowanie JPA i repozytoria,
- Q44 — źródło i profil kont demo.

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

## 12. Następne kroki

Kolejność rekomendowana:

1. **Logowanie, sesja i CSRF** — `SecurityFilterChain`, `GET /api/auth/csrf`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; testy integracyjne `401`/`403`, rotacji sesji i CSRF.
2. **Walidacja i błędy** — DTO, walidator wejścia, RFC 9457 z kodami `code`, mapowanie wyjątków, kolejność kontroli.
3. **Kryptografia** — `CryptoService` AES-256-GCM, format pakietu, AAD, walidacja nonce/tag/długości; wektory testowe z `docs/API.md`.
4. **Endpointy wiadomości** — create/list/get/delete, owner scope, `404` dla obcych zasobów, paginacja kursorowa, limity.
5. **Frontend** — formularz logowania, obsługa CSRF, lista i edytor wiadomości, stany błędów, testy komponentów.
6. **E2E** — Playwright: logowanie, izolacja użytkowników, CRUD, wylogowanie, błędy walidacji.
7. **CI i wydajność** — workflow GitHub Actions, `docs/PERFORMANCE.md`, testy obciążeniowe i analiza pamięci Argon2id.

Warunki wejścia do kolejnego zadania:

- drzewo czyste i `main == origin/main`,
- 17/17 testów backendu i 3/3 frontendu,
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
