# Raport testów izolacji użytkowników, persystencji i usuwania (ZR-16, ZR-20)

- **Data:** 2026-11-13 (ZR-16), 2026-11-14 (ZR-20)
- **Zadania:** ZR-16 — izolacja dwóch użytkowników i persystencja; ZR-20 — usuwanie własnych wiadomości
- **Wymagania:** R02, R04, R06
- **Zależności potwierdzone:** ZR-09 (`a372022`), ZR-13 (`7c10342`), ZR-14 (`66fce7a`), ZR-15 (`a310d9e`); dla ZR-20 dodatkowo ZR-19 (`bd0da9b`)
- **Commit funkcjonalny:** ZR-16 `d960326`; ZR-20 `449e97b`
- **Klasy testowe:** `MessageIsolationIntegrationTests` (ZR-16, 11 testów po ZR-20), `MessageControllerIntegrationTests` (ZR-20, 5 testów)

## 1. Środowisko

| Element | Wartość |
|---|---|
| System | macOS (arm64) |
| JDK | 27.0.1 (target projektu: 17) |
| Maven | 3.10.0 (wrapper) |
| Spring Boot | 4.1.2 |
| Testcontainers | 2.0.5 |
| PostgreSQL | 16.15 (`postgres:16-alpine`) |
| Docker | 29.9.1 |
| Profil aplikacji | `local` (konta demo `alice` = A, `bob` = B) |
| Baza | rzeczywisty PostgreSQL w kontenerze, Flyway `V1`–`V3`, `ddl-auto=validate` |

## 2. Komendy i wyniki

```text
cd backend && ./mvnw -Dtest=MessageIsolationIntegrationTests test
  -> Tests run: 10, Failures: 0, Errors: 0, Skipped: 0; BUILD SUCCESS

cd backend && ./mvnw spotless:check verify
  -> Tests run: 125, Failures: 0, Errors: 0, Skipped: 0; BUILD SUCCESS
     (115 testów sprzed ZR-16 + 10 nowych; bez zmian kodu produkcyjnego)

./scripts/check-secrets.sh
  -> OK: brak sekretów w trackowanych plikach

node scripts/validate-api-contract.mjs
  -> OK: 28 przykładów JSON, 12 endpointów, 19 kodów głównych, 8 kodów pól,
         5 pakietów, 1 przykład paginacji, wektor AES-256-GCM zgodny

git diff --check
  -> OK
```

## 3. Macierz testów

| Test | Scenariusz | Oczekiwanie | Wynik |
|---|---|---|---|
| `listAndDetailsNeverExposeAnotherUsersMessage` | A zapisuje wiadomość; B listuje z `ownerId=A` i pobiera szczegóły po `id` | lista B pusta; szczegóły `404 MESSAGE_NOT_FOUND`; brak plaintextu i pakietu w ciele | PASS |
| `storedMessageDecryptIsOwnerScoped` | B próbuje odszyfrować zapisaną wiadomość A; A i B odszyfrowują własne | B `404`; A/B `200` z własnym plaintextem | PASS |
| `pastedForeignPackageIsRejectedWithoutRevealingPlaintext` (5 przypadków) | B wkleja pakiet A do `POST /api/crypto/decrypt`; A robi to samo | B `422 DECRYPT_FAILED` bez plaintextu; A `200` | PASS |
| `sessionAndCsrfGuardsProtectEveryOwnerScopedOperation` | anonimowe list/get/decrypt/encrypt, B bez CSRF i z błędnym tokenem | `401` przed `403`; `403 CSRF_INVALID`; B z poprawnym CSRF nadal `404` | PASS |
| `databaseStoresOnlyEncryptedEnvelopesAndFlywayHistoryIsApplied` | 3 wiadomości (2× A, 1× B); odczyt faktycznych wierszy i historii Flyway | tylko koperty; brak kolumn plaintext; 3 udane migracje | PASS |
| `sqlInjectionAndOwnerParametersCannotWidenScope` | payloady SQL injection w `id`, `limit`, `cursor` i nieznane pole `ownerId` | `400` z kontrolowanym kodem; brak zmiany danych; zakres B bez zmian | PASS |

### 3.1 Przypadki parametryzowane (plaintext A)

Dla każdego z poniższych tekstów B nie otrzymuje plaintextu ani pakietu, a zaszyfrowany wiersz nie zawiera bajtów plaintextu:

```text
"Zażółć gęślą jaźń 🔐"
"<script>alert('xss')</script>"
"'; DROP TABLE messages; --"
"linia 1\nlinia 2\t\"cudzysłów\" \\backslash"
"długi sekret " + 1 000 × "x"
```

## 4. Raport testów negatywnych

| Aktor | Operacja | Wynik | Plaintext A w odpowiedzi | Dowód |
|---|---|---|---|---|
| B | `GET /api/messages?limit=50&ownerId=<A>` | `200`, `items=[]`, `hasMore=false` | nie | asercja braku treści i pakietu |
| B | `GET /api/messages/{idA}` | `404 MESSAGE_NOT_FOUND` | nie | identyczny `code` i `detail` jak dla losowego UUID |
| B | `POST /api/messages/{idA}/decrypt` + CSRF | `404 MESSAGE_NOT_FOUND` | nie | brak pola `plaintext` |
| B | `POST /api/crypto/decrypt` z pakietem A | `422 DECRYPT_FAILED` | nie | `detail` bez szczegółów, brak pakietu w odpowiedzi |
| anonim | `GET /api/messages`, `GET /api/messages/{idA}` | `401 UNAUTHENTICATED` | nie | `401` przed `403` |
| anonim | `POST /api/messages/{idA}/decrypt`, `POST /api/crypto/decrypt` | `401 UNAUTHENTICATED` | nie | brak CSRF nie zmienia statusu na `403` |
| B | `POST /api/messages/{idA}/decrypt` bez CSRF | `403 CSRF_INVALID` | nie | token wymagany dla mutacji |
| B | `POST /api/messages/{idA}/decrypt` z błędnym `X-XSRF-TOKEN` | `403 CSRF_INVALID` | nie | porównanie tokenu |
| B | `POST /api/messages` bez CSRF | `403 CSRF_INVALID` | nie | brak zapisu |
| B | `GET /api/messages/{id}` z `1' OR '1'='1` i wariantem UUID | `400 INVALID_MESSAGE_ID` | nie | brak błędu SQL, tabela nadal istnieje |
| B | `GET /api/messages?limit=10; DROP TABLE messages` | `400 VALIDATION_FAILED` | nie | brak błędu SQL |
| B | `GET /api/messages?cursor=' OR 1=1 --` | `400 INVALID_CURSOR` | nie | kursor odrzucony przed zapytaniem |
| B | `POST /api/messages` z polem `ownerId=A` | `400 VALIDATION_FAILED`, `UNKNOWN_FIELD` | nie | właściciel wyłącznie z sesji; liczba wierszy bez zmian |

## 5. Asercje bazy danych

- `messages` zawiera wyłącznie `nonce` (12 B), `ciphertext` (1–40 000 B), `tag` (16 B), `key_id=k1`, `format_version=1`, `algorithm=AES-256-GCM`, `owner_id` i `created_at`.
- `information_schema.columns` dla `messages` nie zawiera kolumn `plaintext`, `content`, `body`, `message`, `secret`, `title`.
- Bajty plaintextu nie występują w `ciphertext`; `ciphertext` nie jest równe bajtom UTF-8 plaintextu.
- `owner_id` wiersza odpowiada `id` z `GET /api/auth/me` dla sesji A; B widzi wyłącznie własny wiersz.
- `flyway_schema_history`: dokładnie wersje `1`, `2`, `3`, wszystkie `success = true`, brak nieudanych migracji.
- Zapytania weryfikacyjne używają parametrów wiązanych (`?::uuid`, `?::bytea`), a nie konkatenacji.

## 6. Kontrola mutacyjna (dowód, że testy wykrywają regresję)

Celowo usunięto warunek właściciela w `MessageService.find`:

```java
// przed: messageRepository.findByIdAndOwner_Id(id, ownerId)
// mutacja: messageRepository.findById(id)
```

Wynik: `Tests run: 10, Failures: 8` — testy wykryły wyciek danych A do sesji B (lista/szczegóły/decrypt oraz warianty parametryzowane). Po przywróceniu kodu: `Tests run: 10, Failures: 0`. Kod produkcyjny nie został zmieniony w ramach zadania.

## 7. Dziennik wykonania

| Data | Zmiana | Uzasadnienie | Problem i rozwiązanie | Testy | Następny krok |
|---|---|---|---|---|---|
| 2026-11-13 | Dodano `MessageIsolationIntegrationTests` (10 testów); bez zmian kodu produkcyjnego. Zaktualizowano `README.md`, `docs/PROJECT_MEMORY.md`, `AGENTS.md` i dodano ten raport. | Domknięcie R02, R04 i R06: izolacja A/B, sesja, CSRF, parametryzacja i faktyczny rekord PostgreSQL. | Payload SQL injection zawierający `;` i spacje w ścieżce był odrzucany przez warstwę kontenera (puste `400`, bez RFC 9457). Rozwiązanie: w ścieżce testować payloady bez surowych średników (`1' OR '1'='1`, wariant UUID), a próby `DROP TABLE` przenieść do parametrów `limit`/`cursor` i nieznanego pola `ownerId`. | `./mvnw -Dtest=MessageIsolationIntegrationTests test` — 10/10; `./mvnw spotless:check verify` — 125/125; frontend 3/3; kontrola mutacyjna 8/10 FAIL, po przywróceniu 10/10. | `DELETE /api/messages/{id}` oraz limitery crypto 60/min i 30/min. |

## 8. ZR-20 — usuwanie własnych wiadomości

### 8.1 Komendy i wyniki

Weryfikacja 2026-11-14; JDK 27.0.1 (target 17), Maven 3.10.0, Spring Boot 4.1.2, Testcontainers 2.0.5, PostgreSQL 16.15, Docker 29.9.1.

```text
cd backend && ./mvnw spotless:check verify   -> Tests run: 128, Failures: 0, Errors: 0, Skipped: 0; BUILD SUCCESS
./scripts/check-secrets.sh                   -> OK
node scripts/validate-api-contract.mjs       -> OK (28 przykładów JSON, 12 endpointów, wektor AES-GCM)
git diff --check                             -> OK
```

Pełny przebieg 128 testów obejmuje 126 testów sprzed ZR-20 i 2 nowe w `MessageControllerIntegrationTests` (`MessageIsolationIntegrationTests` rośnie z 10 do 11).

### 8.2 Macierz testów ZR-20

| Test | Scenariusz | Oczekiwanie | Wynik |
|---|---|---|---|
| `deleteIsOwnerScopedAndRemovesOnlyTheOwnersRow` | A ma 2 wiadomości; `DELETE` pierwszej z CSRF; później `GET` i `DELETE` tego samego `id` | `204` bez ciała i `no-store`; liczba wierszy A spada o 1, drugi wiersz zostaje; `GET` i ponowny `DELETE` → `404 MESSAGE_NOT_FOUND` | PASS |
| `deleteRequiresValidIdSessionAndCsrf` | `DELETE` bez sesji, bez CSRF, z `not-a-uuid` i z losowym UUID | `401 UNAUTHENTICATED` przed `403`; `403 CSRF_INVALID`; `400 INVALID_MESSAGE_ID`; `404 MESSAGE_NOT_FOUND`; brak usunięcia wiersza | PASS |
| `deleteNeverTouchesAnotherUsersMessage` | B wysyła `DELETE /api/messages/{idA}` z poprawnym CSRF; A sprawdza `GET` i listę | B dostaje identyczne `404 MESSAGE_NOT_FOUND` jak dla losowego UUID; `GET` i lista A nadal `200`, wiersz A nietknięty | PASS |

Testy używają rzeczywistego PostgreSQL w kontenerze i `ddl-auto=validate`; nie zmieniono schematu ani migracji `V1`–`V3`.

### 8.3 Rzeczywisty scenariusz curl przez nginx

A = `alice`, B = `bob`; dwa komunikaty A zapisane przez `POST /api/messages`, identyfikatory `ec2c1cbd…` i `700d3bb7…`.

| Aktor | Operacja | Wynik | Dowód |
|---|---|---|---|
| A | `DELETE /api/messages/{own}` + CSRF | `204`, puste ciało | `body_bytes=0`, `Cache-Control: no-store` |
| A | `GET /api/messages/{own}` po usunięciu | `404 MESSAGE_NOT_FOUND` | brak pakietu i plaintextu |
| A | ponowny `DELETE` tego samego `id` | `404 MESSAGE_NOT_FOUND` | idempotentny efekt końcowy |
| B | `DELETE /api/messages/{idA}` + CSRF | `404 MESSAGE_NOT_FOUND` | ten sam `code` i `detail` co dla nieistniejącej |
| A | `GET /api/messages/{idA}` po próbie B | `200` | wiersz A nietknięty |
| A | `DELETE` losowego UUID | `404 MESSAGE_NOT_FOUND` | brak rozróżnienia od cudzej |
| A | `DELETE /api/messages/not-a-uuid` | `400 INVALID_MESSAGE_ID` | błąd RFC 9457 |
| A | `DELETE` bez `X-XSRF-TOKEN` | `403 CSRF_INVALID` | wiersz nadal istnieje |
| anonim | `DELETE` z poprawnym `id` | `401 UNAUTHENTICATED` | `401` przed `403` |
| — | `psql` po scenariuszu | usunięty wiersz `0`, zachowany `1` | `select count(*) from messages` |

### 8.4 Asercje bazy po usunięciu

- Usunięty `id` nie istnieje już w `messages`; pozostały wiersz A nadal ma `owner_id` A, poprawny `nonce`, `ciphertext`, `tag` i `key_id=k1`.
- Brak kolumn z plaintextem — usunięcie nie zmienia modelu danych, tylko usuwa wiersz.
- Migracje `V1`–`V3` bez zmian; `flyway_schema_history` bez nowych wpisów, wszystkie `success = true`.

### 8.5 Ograniczenia ZR-20

- Usunięcie jest twarde i nieodwracalne; nie ma kosza ani miękkiego usuwania.
- Skopiowany wcześniej pakiet pozostaje ważny, bo klucz AES i `ownerId` w AAD się nie zmieniają; unieważnienie wymagałoby rotacji klucza.
- Limiter `DELETE` nie istnieje; ochrona opiera się na sesji, CSRF i owner scope.
- Testy MockMvc nie weryfikują atrybutów cookie; politykę `JSESSIONID`/`XSRF-TOKEN` potwierdza curl przez nginx.

## 9. Ograniczenia

- MockMvc nie jest dowodem atrybutów cookie (`SameSite`, `HttpOnly`); politykę `JSESSIONID`/`XSRF-TOKEN` weryfikują istniejące testy auth i `curl` przez nginx.
- Testy nie obejmują limiterów 60/30 na minutę dla crypto — ta funkcja nie jest jeszcze zaimplementowana (kolejne zadanie).
- Brak testów E2E i testów obciążeniowych; sesje i przyszłe limitery są in-memory (jedna instancja).
- Testy wymagają uruchomionego Dockera (Testcontainers).
