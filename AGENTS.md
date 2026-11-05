# AGENTS.md — instrukcje dla agentów

Ten plik jest automatycznie ładowany przez OpenCode. Zawiera skrót; szczegółowa historia i kontekst znajdują się w [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md).

## Cel projektu

Aplikacja do szyfrowania wiadomości między zalogowanymi użytkownikami: frontend React + Vite + TypeScript (UI po polsku), backend Spring Boot 4.1.2 / Java 17, PostgreSQL 16, uruchamiane przez Docker Compose. Hasła są hashowane Argon2id, a treść wiadomości szyfrowana po stronie serwera AES-256-GCM. Szczegóły wymagań: [`README.md`](README.md), kontrakt HTTP: [`docs/API.md`](docs/API.md).

## Aktualny stan (2026-11-05)

- Ostatni commit: `eca5f3a` — ZR-07 (Argon2id + konta demo w profilu `local`); `main == origin/main`, drzewo czyste.
- Ukończone: ZR-01…ZR-07 (zakres/ADR, szkielet backendu, schemat i migracje, kontrakt API, szkielety repo, Compose, encje JPA, hashowanie i konta demo).
- **Nie ma jeszcze** kontrolerów REST, `SecurityFilterChain` zgodnego z kontraktem, logowania, sesji, CSRF, `CryptoService` ani endpointów wiadomości. `GET /api/messages` zwraca `401`.
- Testy: 17/17 backendu (`./mvnw verify`), 3 frontendu (`npm test`). Brak testów E2E, CI i `docs/PERFORMANCE.md`.

## Najpierw przeczytaj

1. [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md) — chronologia, decyzje, pułapki, następne kroki.
2. [`README.md`](README.md) — status, uruchomienie, dowody R01–R10.
3. [`docs/API.md`](docs/API.md) — **kanoniczny** kontrakt HTTP, DTO, błędy, format pakietu, kursor.
4. [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — schemat, mapowanie JPA, migracje, Argon2id.
5. [`docs/DECISIONS.md`](docs/DECISIONS.md) — ADR-01…ADR-13.
6. [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md) — Q01…Q44 (rozstrzygnięte i otwarte).

Gdy dokumenty się różnią, rozstrzyga `docs/API.md` dla HTTP i `docs/DATA_MODEL.md` dla bazy. Zmiana zachowania wymaga aktualizacji dokumentu i ADR w **tym samym commicie**.

## Stack i topologia

- Frontend: React 19.3.1, Vite 7.3.7, TypeScript 6.0.3, ESLint 10, Prettier 3, Vitest 5 + jsdom.
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

# Cały stos
docker compose up -d --build      # pierwszy start / przebudowa
docker compose up -d              # kolejne starty
docker compose ps                 # 3 kontenery powinny być healthy
curl -i http://localhost:3000/actuator/health
curl -i http://localhost:3000/api/messages   # obecnie 401

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

## Następny krok

Implementacja logowania, sesji i CSRF zgodnie z `docs/API.md` (`GET /api/auth/csrf`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `SecurityFilterChain`), a następnie DTO, serwis i endpointy wiadomości oraz `CryptoService`. Po nich: testy E2E, CI i dokument wydajnościowy. Warunki wejścia i kolejność opisuje sekcja „Następne kroki” w [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md).
