# Model danych i migracje

Dokument opisuje model danych MVP, migracje projektowe oraz uzasadnienie zmian względem pierwotnego szkicu `User/Message/UserMessage`.

- **Zadanie:** ZR-02 — model danych i migracje projektowe; ZR-06 — encje JPA, repozytoria i testy schematu; ZR-07 — Argon2id i konta demo.
- **Data:** 2026-11-04 (model), 2026-11-05 (JPA, testy, Argon2id).
- **Wymagania:** R02, R04, R06, R09.
- **Status:** model, migracje, mapowanie JPA i hashowanie zweryfikowane na PostgreSQL 16. Flyway wykonuje `V1`–`V3`, Hibernate startuje z `ddl-auto=validate`, a testy jednostkowe i integracyjne potwierdzają ograniczenia, repozytoria, konta demo oraz owner-scoped API wiadomości (`cd backend && ./mvnw spotless:check verify`). ZR-14 nie zmienia schematu.
- **Kontrakt API:** [`docs/API.md`](API.md) — kanoniczny kontrakt HTTP, DTO, błędów i paginacji.

## Cele modelu

- Jeden właściciel wiadomości, relacja 1:N, bez udostępniania.
- Brak kolumn przechowujących hasło jawne lub treść jawną wiadomości.
- UUID jako identyfikatory publiczne — brak enumeracji kolejnych ID.
- Jawna wersja koperty (`format_version`) i identyfikator klucza (`key_id`).
- Ograniczenia integralności wymuszane przez bazę, nie tylko przez aplikację.
- Indeks wspierający paginację po właścicielu i czasie.

## ERD

```mermaid
erDiagram
    APP_USERS ||--o{ MESSAGES : owns

    APP_USERS {
        uuid id PK
        varchar username UK
        varchar password_hash
        boolean enabled
        timestamptz created_at
    }

    MESSAGES {
        uuid id PK
        uuid owner_id FK
        bytea nonce
        bytea ciphertext
        bytea tag
        varchar key_id
        smallint format_version
        varchar algorithm
        timestamptz created_at
    }
```

`APP_USERS` 1 — N `MESSAGES`. Tabela `user_messages` nie istnieje.

## Tabele

### `app_users`

| Kolumna | Typ | Null | Domyślnie | Opis |
|---|---|---|---|---|
| `id` | `uuid` | nie | `gen_random_uuid()` | Klucz główny |
| `username` | `varchar(50)` | nie | — | Znormalizowany login |
| `password_hash` | `varchar(100)` | nie | — | Hash Argon2id (97 znaków), nigdy hasło jawne |
| `enabled` | `boolean` | nie | `true` | Czy konto jest aktywne |
| `created_at` | `timestamptz` | nie | `now()` | Data utworzenia |

Ograniczenia:

- `app_users_username_unique` — unikalność loginu,
- `app_users_username_normalized` — `username = lower(btrim(username))`,
- `app_users_username_format` — `^[a-z0-9][a-z0-9._-]{2,49}$`,
- `app_users_password_hash_not_blank` — hash nie może być pusty.

### `messages`

| Kolumna | Typ | Null | Domyślnie | Opis |
|---|---|---|---|---|
| `id` | `uuid` | nie | `gen_random_uuid()` | Klucz główny |
| `owner_id` | `uuid` | nie | — | Właściciel, FK do `app_users.id` |
| `nonce` | `bytea` | nie | — | Nonce AES-GCM, dokładnie 12 B |
| `ciphertext` | `bytea` | nie | — | Szyfrogram, 1–40 000 B |
| `tag` | `bytea` | nie | — | Tag GCM, dokładnie 16 B |
| `key_id` | `varchar(32)` | nie | — | Identyfikator klucza, np. `k1` |
| `format_version` | `smallint` | nie | `1` | Wersja formatu koperty |
| `algorithm` | `varchar(32)` | nie | `AES-256-GCM` | Algorytm szyfrowania |
| `created_at` | `timestamptz` | nie | `now()` | Data utworzenia |

Ograniczenia:

- `messages_owner_fk` — `owner_id` → `app_users.id` `on delete cascade`,
- `messages_nonce_length` — `octet_length(nonce) = 12`,
- `messages_ciphertext_length` — `octet_length(ciphertext) between 1 and 40000`,
- `messages_tag_length` — `octet_length(tag) = 16`,
- `messages_key_id_format` — `^[a-z0-9][a-z0-9_-]{0,31}$`,
- `messages_format_version_positive` — `format_version >= 1`,
- `messages_algorithm_supported` — `algorithm = 'AES-256-GCM'`.

### Indeks

```sql
create index idx_messages_owner_created_id
    on messages (owner_id, created_at desc, id desc);
```

Indeks obsługuje listę własnych wiadomości i stabilną paginację: `where owner_id = ? order by created_at desc, id desc`. Paginacja jest kursorowa i używa pary `(created_at, id)` jako pozycji; szczegóły w [`docs/API.md`](API.md#8-paginacja).

## Brak danych jawnych

W modelu **nie występują** kolumny:

- `password` — jest tylko `password_hash`,
- `content` / `plaintext` / `body` — jest tylko `ciphertext`,
- `title` — tytuł został usunięty z modelu.

Wszystkie treści użytkownika są przechowywane wyłącznie w zaszyfrowanej kopercie. Jawne pozostają metadane techniczne: `id`, `owner_id`, `created_at`, `key_id`, `format_version`, `algorithm`.

## Normalizacja `username`

- Aplikacja wykonuje `trim` i `toLowerCase(Locale.ROOT)` przed seedem kont i logowaniem.
- Baza wymusza `username = lower(btrim(username))`.
- Unikalność dotyczy znormalizowanej wartości, więc `Alice` i `alice` nie mogą istnieć jednocześnie.
- Dozwolone znaki: `a-z`, `0-9`, `.`, `_`, `-`; długość 3–50.
- Świadomie nie użyto `citext` — mniej zależności i prostsze migracje.
- Konta demo: `alice`, `bob`.

## Koperta kryptograficzna

Format pakietu:

```text
v1.<key_id>.<base64url(nonce)>.<base64url(ciphertext)>.<base64url(tag)>
```

- `v1` odpowiada `format_version = 1`,
- `key_id` odpowiada kolumnie `key_id`, np. `k1`,
- `nonce` ma 12 bajtów,
- `ciphertext` ma 1–40 000 bajtów,
- `tag` ma 16 bajtów,
- base64url jest kanoniczny, bez paddingu `=`,
- cały pakiet ma maksymalnie 56 000 znaków,
- AAD: `v1:<ownerId>:<keyId>`.

Dzięki AAD pakiet jest powiązany z właścicielem i kluczem. Inne konto nie odszyfruje pakietu nawet po jego przechwyceniu. Pełna gramatyka, kolejność walidacji i wektor testowy AES-256-GCM znajdują się w [`docs/API.md`](API.md#9-pakiet-i-aad).

## Limity

| Element | Limit |
|---|---|
| Plaintext | 10 000 punktów kodowych |
| Plaintext UTF-8 | maks. 40 000 bajtów |
| Ciphertext | maks. 40 000 bajtów |
| Nonce | 12 bajtów |
| Tag | 16 bajtów |
| Pakiet | maks. 56 000 znaków |
| Żądanie HTTP | maks. 65 536 B (64 KiB) |
| Paginacja | domyślnie 10, maks. 50 |

Limit 56 000 znaków pakietu wynika z base64url dla 40 000 B ciphertext (ok. 53 336 znaków) plus nonce, tag, `key_id` i separatory.

## Uzasadnienie zmian względem szkicu `User/Message/UserMessage`

| Szkic | Model docelowy | Uzasadnienie |
|---|---|---|
| `User` | `app_users` | Jawna nazwa tabeli, UUID, normalizacja loginu, tylko `password_hash` |
| `Message` | `messages` | Zamiast treści jawnej przechowywana jest koperta: `nonce`, `ciphertext`, `tag`, `key_id`, `format_version` |
| `UserMessage` | usunięte | MVP nie ma udostępniania; relacja wiele-do-wielu jest zbędna, a `owner_id` realizuje 1:N |
| `id bigint` | `id uuid` | Brak enumeracji identyfikatorów; UUID v4 |
| `iv` | `nonce` | Poprawna terminologia AES-GCM |
| `key_version` | `key_id` + `format_version` | Możliwość wskazania klucza i wersji formatu koperty |
| `password` | `password_hash` | Brak hasła jawnego w bazie |
| `title` | usunięte | Brak jakiegokolwiek tekstu jawnego użytkownika w modelu |

## Warstwa JPA

Mapowanie jest weryfikowane przez `spring.jpa.hibernate.ddl-auto=validate`; Hibernate nie tworzy ani nie zmienia schematu.

### Encje

| Encja | Tabela | Pola |
|---|---|---|
| `auth.AppUser` | `app_users` | `UUID id`, `String username`, `String passwordHash`, `boolean enabled`, `Instant createdAt` |
| `message.Message` | `messages` | `UUID id`, `AppUser owner`, `byte[] nonce`, `byte[] ciphertext`, `byte[] tag`, `String keyId`, `short formatVersion`, `String algorithm`, `Instant createdAt` |

- `id` — `GenerationType.UUID` (v4); domyślne `gen_random_uuid()` pozostaje dla insertów SQL.
- `created_at` — `@Generated(event = EventType.INSERT)` + `insertable = false, updatable = false`; wartość pochodzi z bazy, nie z JVM.
- `nonce`, `ciphertext`, `tag` — `byte[]` mapowane na `bytea`.
- `format_version` — `short` mapowany na `smallint`.
- `created_at` — `Instant` mapowany na `timestamptz`; Hibernate używa UTC.
- Relacja jest jednokierunkowa: `Message.owner` (`@ManyToOne(fetch = LAZY, optional = false)`); `AppUser` nie ma kolekcji wiadomości.
- Encje są wewnętrzne dla warstwy trwałości i nie są zwracane z API.

### Repozytoria

| Repozytorium | Metody |
|---|---|
| `AppUserRepository` | `findByUsername`, `existsByUsername` |
| `MessageRepository` | `findByIdAndOwner_Id`, `findByOwner_IdOrderByCreatedAtDescIdDesc`, `findNextPage`, `deleteByIdAndOwner_Id` |

Wszystkie operacje na wiadomościach są ograniczone parametrem właściciela. `findNextPage` realizuje warunek `(created_at, id) < (:createdAt, :id)` z sortowaniem `created_at desc, id desc`, zgodnie z paginacją w [`docs/API.md`](API.md#8-paginacja). `deleteByIdAndOwner_Id` jest jawnym `@Modifying @Transactional @Query` i zwraca liczbę usuniętych wierszy.

## Migracje

```text
backend/src/main/resources/db/migration/
├── V1__create_app_users.sql
├── V2__create_messages.sql
└── V3__update_password_hash_comment.sql
```

- `V1` tworzy `app_users` i ograniczenia loginu/hasła.
- `V2` tworzy `messages`, FK, CHECK-i i indeks.
- `V3` zmienia wyłącznie komentarz kolumny `password_hash` z BCrypt na Argon2id; nie zmienia struktury ani danych.
- Konta demo nie są seedowane w SQL. Seed aplikacyjny jest idempotentny, działa tylko w profilu `local` i korzysta z `application-local.properties`; hasła hashuje `PasswordEncoder` (Argon2id).

## Konta demo i hashowanie

- `PasswordEncoder` to Argon2id z parametrami: salt 16 B, hash 32 B, parallelism 1, memory 16 384 KiB, iterations 2.
- Parametry odpowiadają domyślnym wartościom Spring Security, ale są przypięte jawnie w `PasswordEncoderConfig`.
- Hash ma 97 znaków i mieści się w `varchar(100)`.
- `UsernameNormalizer` wykonuje `trim` i `toLowerCase(Locale.ROOT)`; baza wymusza to samo przez `lower(btrim(username))`.
- `DemoUserSeeder` (`@Profile("local")`) tworzy `alice` i `bob`, jeśli nie istnieją. Nie nadpisuje istniejących haseł i nie loguje sekretów.
- `AppUserDetailsService` ładuje konto po znormalizowanym loginie i respektuje `enabled`.
- Poza profilem `local` seeder nie powstaje; na czystej bazie z profilem `prod` liczba kont demo wynosi 0.

## Weryfikacja

Wykonano na PostgreSQL 16 w tymczasowym kontenerze Docker:

```bash
./scripts/validate-schema.sh
```

Wynik:

- `V1__create_app_users.sql` — zastosowana,
- `V2__create_messages.sql` — zastosowana,
- 10/10 kontroli schematu — OK,
- `validation_result = OK`,
- potwierdzono:
  - poprawny insert użytkownika i wiadomości,
  - odrzucenie duplikatu `username`,
  - odrzucenie wielkich liter w `username`,
  - odrzucenie nieprawidłowej długości `nonce`,
  - odrzucenie nieprawidłowej długości `tag`,
  - odrzucenie pustego i zbyt dużego `ciphertext`,
  - odrzucenie nieistniejącego `owner_id`,
  - kaskadowe usunięcie wiadomości po usunięciu użytkownika,
  - istnienie indeksu `idx_messages_owner_created_id`,
  - istnienie FK `messages_owner_fk`,
  - brak kolumn `password`, `content`, `plaintext`, `title`,
  - brak tabeli `user_messages`,
  - `owner_id` jest `NOT NULL`.

Struktura tabel została dodatkowo sprawdzona przez `\d+ app_users` i `\d+ messages`.

Testy schematu (`PersistenceIntegrationTests`, Testcontainers PostgreSQL 16, `cd backend && ./mvnw verify`):

- pusta baza — Flyway stosuje `V1`, `V2` i `V3`; istnieją `app_users`, `messages` i `flyway_schema_history`,
- powtórny start — `flyway.migrate()` wykonuje 0 migracji, `pending` jest puste, `applied` liczy 3 wpisy, a fingerprint kolumn, indeksów i ograniczeń nie zmienia się,
- `ddl-auto=validate` — kontekst startuje bez błędów walidacji mapowania,
- UNIQUE `username` — duplikat kończy się `23505`,
- FK `owner_id` — nieistniejący użytkownik kończy się `23503`; `on delete cascade` usuwa wiadomości,
- długości — `nonce` 11/13 B, `tag` 15/17 B oraz `ciphertext` 0/40 001 B kończą się `23514`; poprawne wartości są przyjmowane,
- repozytoria — `createdAt` z encji jest zgodne z bazą, odczyt i usunięcie cudzej wiadomości nie zwracają danych,
- kursor — pierwsza strona, `nextCursor` z ostatniego elementu i druga strona bez duplikatów; tie-breaker po `id`.

Wynik: `Tests run: 7, Failures: 0, Errors: 0, Skipped: 0`, `BUILD SUCCESS`.

Testy ZR-07 (10 testów jednostkowych i integracyjnych):

- Argon2id — hash ma prefiks `$argon2id$v=19$m=16384,t=2,p=1$` i 97 znaków; mieści się w `varchar(100)`,
- dopasowanie — poprawne hasło `matches=true`, błędne `false`, dwa hashe tego samego hasła różnią się solą,
- normalizacja — `"  ALICE  "` → `alice`, puste dane i `null` obsłużone zgodnie z testem,
- seed `local` — dokładnie `alice` i `bob`, hashe w bazie, brak jawnych wartości,
- idempotencja — ponowne uruchomienie seedu nie zmienia liczby kont ani istniejącego hasha,
- brak seedu poza `local` — 0 kont, brak beana seedera, `UserDetailsService` nie znajduje kont demo.

Wynik łączny: `Tests run: 17, Failures: 0, Errors: 0, Skipped: 0`, `BUILD SUCCESS`.

## Ograniczenia i następne kroki

- Flyway jest podłączony po stronie backendu i wykonuje `V1`–`V3` przy starcie oraz w testach Testcontainers.
- Encje i repozytoria nie są jeszcze wykorzystywane przez API; DTO, serwis i endpointy powstaną w kolejnych zadaniach.
- Seed kont demo pozostaje w warstwie aplikacji, nie w migracji SQL, i działa tylko w profilu `local`.
- Argon2id zużywa 16 MiB pamięci na weryfikację hasła; przy wielu równoległych logowaniach rośnie zapotrzebowanie na RAM.
- Limit `varchar(100)` daje ograniczony zapas na przyszłe zmiany parametrów Argon2id; ich podniesienie wymaga nowej migracji.
- Rotacja kluczy jest poza MVP; `key_id` i `format_version` rezerwują miejsce na przyszłe wersje.
