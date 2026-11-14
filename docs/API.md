# Kontrakt API, DTO i format pakietu

> **Zadanie:** ZR-03 — DTO, API i format pakietu.
> **Data:** 2026-11-04.
> **Wymagania:** R02, R03, R04, R06.
> **Zależności:** ZR-01 (`b1e9fbe`) i ZR-02 (`2ab856e`) — potwierdzone.
> **Status:** kontrakt zamknięty i zweryfikowany statycznie. Endpointy crypto oraz `POST/GET /api/messages`, `GET /api/messages/{id}`, `POST /api/messages/{id}/decrypt` i `DELETE /api/messages/{id}` są zaimplementowane. Limiter operacji crypto pozostaje w kolejnym zadaniu.

Ten dokument jest **kanonicznym źródłem prawdy** dla kontraktu HTTP. Jeśli README, `docs/DATA_MODEL.md` lub kod są z nim sprzeczne, pierwszeństwo ma ten plik, a rozbieżność należy poprawić w tym samym commicie.

## 1. Zakres

Kontrakt obejmuje:

- logowanie, wylogowanie, sesję i CSRF,
- szyfrowanie z zapisem i bez zapisu,
- deszyfrowanie zapisanej wiadomości i wklejonego pakietu,
- listę własnych wiadomości z paginacją, szczegóły i usuwanie,
- DTO żądań i odpowiedzi,
- jednolity format błędów i statusy HTTP,
- limity wejścia, format pakietu, wersję i `key_id`,
- zasady bezpieczeństwa wynikające z modelu dostępu.

Poza zakresem tego dokumentu:

- implementacja endpointów i klas Java,
- OpenAPI/springdoc,
- rejestracja, reset hasła i zmiana hasła,
- udostępnianie wiadomości i E2EE,
- rotacja kluczy,
- wersjonowanie API w URL.

## 2. Konwencje

| Obszar | Zasada |
|---|---|
| Bazowy adres | `/api`; frontend i backend w jednym origin przez nginx |
| Format | JSON UTF-8, `Content-Type: application/json` dla żądań z ciałem |
| Błędy | `application/problem+json` zgodnie z RFC 9457 |
| Cache | `Cache-Control: no-store` na wszystkich odpowiedziach `/api/**` |
| Identyfikator żądania | `X-Request-Id` w każdej odpowiedzi, generowany przez serwer; ta sama wartość w `traceId` błędu; wartość od klienta jest ignorowana |
| Identyfikatory | UUID kanoniczny, małe litery, 36 znaków; żądania przyjmują dowolny case i normalizują |
| Daty | ISO-8601 UTC z literą `Z`, np. `2026-11-04T12:34:56.789Z`; klient nie zakłada stałej liczby cyfr ułamkowych |
| Nieznane pola JSON | odrzucane — `400 VALIDATION_FAILED`, `errors[].code = UNKNOWN_FIELD` |
| Nieznane parametry zapytania | ignorowane; właściciel nigdy nie pochodzi z parametru |
| Zduplikowane klucze JSON | odrzucane — `400 MALFORMED_JSON` |
| `Accept` | ignorowany; API zawsze zwraca JSON |
| `Content-Type` | wyłącznie `application/json`; inny lub inne charset niż UTF-8 → `415` |
| CORS | brak; API nie jest przeznaczone do wywołań cross-origin |
| Wersjonowanie | brak wersji w URL; zmiany additive, breaking wymagałyby `/api/v2` |

`createdAt` jest generowany przez bazę (`now()`), a nie przez aplikację. `nextCursor` jest nieprzezroczysty dla klienta.

## 3. Endpointy

| Metoda | Ścieżka | Sesja | CSRF | Sukces | Opis |
|---|---|---:|---:|---|---|
| `GET` | `/api/auth/csrf` | nie | nie | `200` | token CSRF i cookie |
| `POST` | `/api/auth/login` | nie | tak | `200` | logowanie |
| `POST` | `/api/auth/logout` | tak | tak | `204` | wylogowanie bieżącej sesji |
| `GET` | `/api/auth/me` | tak | nie | `200` | bieżący użytkownik |
| `POST` | `/api/crypto/encrypt` | tak | tak | `200` | szyfrowanie bez zapisu |
| `POST` | `/api/crypto/decrypt` | tak | tak | `200` | deszyfrowanie wklejonego pakietu |
| `POST` | `/api/messages` | tak | tak | `201` | szyfrowanie z zapisem |
| `GET` | `/api/messages` | tak | nie | `200` | lista własnych wiadomości |
| `GET` | `/api/messages/{id}` | tak | nie | `200` | szczegóły i pakiet |
| `POST` | `/api/messages/{id}/decrypt` | tak | tak | `200` | deszyfrowanie zapisanej wiadomości |
| `DELETE` | `/api/messages/{id}` | tak | tak | `204` | usunięcie własnej wiadomości |
| `GET` | `/actuator/health` | nie | nie | `200`/`503` | healthcheck infrastruktury |

`GET /actuator/health` nie jest częścią kontraktu biznesowego. Publicznie udostępniany jest wyłącznie ten endpoint actuatora.

## 4. Sesja, logowanie i CSRF

### 4.1 Cookie i sesja

| Cookie | `HttpOnly` | `SameSite` | `Path` | `Secure` | Przeznaczenie |
|---|---:|---|---|---|---|
| `JSESSIONID` | tak | `Lax` | `/` | produkcja | identyfikator sesji |
| `XSRF-TOKEN` | nie | `Lax` | `/` | produkcja | token CSRF czytelny dla JavaScript |

- Sesja wygasa po 30 minutach bezczynności.
- Sesje są przechowywane w pamięci; restart backendu wymaga ponownego logowania.
- Jeden użytkownik może mieć wiele równoległych sesji; wylogowanie unieważnia tylko bieżącą.
- Po logowaniu identyfikator sesji i token CSRF są rotowane.
- W środowisku lokalnym (HTTP) cookie nie ma flagi `Secure`; produkcja wymaga TLS.

### 4.2 CSRF

Operacje zmieniające stan wymagają nagłówka `X-XSRF-TOKEN` o wartości równej cookie `XSRF-TOKEN`.

- `GET /api/auth/csrf` zwraca token również w ciele odpowiedzi, żeby frontend nie musiał parsować cookie.
- Token jest nieprzezroczysty; klient nie zakłada jego długości ani formatu.
- Po logowaniu klient ponownie pobiera token lub czyta nowe cookie.
- Brak lub niezgodność tokenu → `403 CSRF_INVALID`.

### 4.3 Kolejność kontroli

| Sytuacja | Wynik |
|---|---|
| brak sesji, endpoint chroniony, dowolna metoda | `401 UNAUTHENTICATED` |
| brak sesji, `POST /api/auth/login`, brak/zły CSRF | `403 CSRF_INVALID` |
| sesja istnieje, metoda niebezpieczna, brak/zły CSRF | `403 CSRF_INVALID` |
| brak sesji, `GET /api/auth/me` lub `POST /api/auth/logout` | `401 UNAUTHENTICATED` |
| brak sesji, `GET /api/auth/csrf` | `200` |

Dla chronionych zasobów **401 ma pierwszeństwo przed 403**. CSRF dotyczy zalogowanych żądań oraz logowania. To świadome odejście od domyślnej kolejności Spring Security, opisane w ADR-09.

### 4.4 Logowanie

- Login jest normalizowany: `trim` (białe znaki ASCII) + `toLowerCase(Locale.ROOT)`.
- Hasło nie jest przycinane ani normalizowane; spacje są znaczące.
- Hasła są weryfikowane Argon2id (salt 16 B, hash 32 B, parallelism 1, memory 16 MiB, iterations 2); limit wejścia wynosi 1–128 B UTF-8.
- Błędne hasło, nieistniejący login i konto wyłączone zwracają **identyczną** odpowiedź `401 INVALID_CREDENTIALS`.
- Dla nieistniejącego loginu backend wykonuje kosztowne porównanie z atrapą hasha, żeby nie ujawniać istnienia konta czasem odpowiedzi.
- Po przekroczeniu 5 nieudanych prób w ciągu 60 sekund dla pary IP + znormalizowany login (szósta i kolejna próba) → `429 RATE_LIMITED`.
- Udane logowanie zeruje licznik nieudanych prób.
- Limit nie ujawnia, czy konto istnieje.
- Adres IP do limitu pochodzi z zaufanego proxy (nginx), a nie z dowolnego nagłówka klienta.

### 4.5 Wylogowanie

- Wymaga aktywnej sesji; brak sesji → `401`.
- Unieważnia sesję po stronie serwera i czyści oba cookie (`Max-Age=0`).
- Nie unieważnia innych sesji tego użytkownika.

## 5. DTO

### 5.1 Katalog

| DTO Java | Pole JSON | Typ | Wymagane | Ograniczenia |
|---|---|---|---:|---|
| `CsrfResponse` | `token` | string | tak | nieprzezroczysty, 16–128 znaków |
| | `headerName` | string | tak | zawsze `X-XSRF-TOKEN` |
| | `cookieName` | string | tak | zawsze `XSRF-TOKEN` |
| `LoginRequest` | `username` | string | tak | po normalizacji 1–50 znaków; bez kontroli formatu poza długością |
| | `password` | string | tak | 1–128 B UTF-8; bez przycinania; limit wejścia, nie ograniczenie Argon2id |
| `UserResponse` | `id` | UUID | tak | kanoniczny UUID |
| | `username` | string | tak | znormalizowany login |
| `EncryptRequest` | `plaintext` | string | tak | 1–10 000 punktów kodowych, ≤40 000 B UTF-8, nie blank |
| `CreateMessageRequest` | `plaintext` | string | tak | jak wyżej; **brak pola właściciela** |
| `PackageResponse` | `package` | string | tak | poprawny pakiet `v1...` |
| `DecryptPackageRequest` | `package` | string | tak | ≤56 000 znaków po przycięciu |
| `PlaintextResponse` | `plaintext` | string | tak | dokładnie odszyfrowany tekst |
| `MessageResponse` | `id` | UUID | tak | kanoniczny UUID |
| | `createdAt` | string | tak | ISO-8601 UTC |
| | `package` | string | tak | pakiet złożony z koperty |
| `MessageSummary` | `id` | UUID | tak | kanoniczny UUID |
| | `createdAt` | string | tak | ISO-8601 UTC |
| `MessagePageResponse` | `items` | array | tak | 0–50 elementów `MessageSummary` |
| | `nextCursor` | string \| null | tak | `null` na ostatniej stronie |
| | `hasMore` | boolean | tak | czy istnieje następna strona |
| `ApiProblem` | `type` | string | tak | zawsze `about:blank` |
| | `title` | string | tak | standardowa angielska nazwa statusu HTTP |
| | `status` | integer | tak | ten sam co status HTTP |
| | `code` | string | tak | stabilny kod maszynowy, np. `VALIDATION_FAILED` |
| | `detail` | string | tak | polski komunikat, bez danych wejściowych |
| | `instance` | string | tak | ścieżka żądania bez query string |
| | `traceId` | string | tak | 32 małe znaki hex; równy `X-Request-Id` |
| | `errors` | array | nie | tylko błędy walidacji |
| `FieldViolation` | `field` | string | tak | nazwa pola JSON |
| | `code` | string | tak | kod z tabeli kodów pól |
| | `message` | string | tak | polski komunikat |

### 5.2 Reguła właściciela

**Właściciel pochodzi wyłącznie z sesji.** Żaden DTO żądania nie zawiera pola `ownerId`, `owner_id`, `userId`, `keyId`, `formatVersion`, `nonce`, `ciphertext` ani `tag`.

- Serwer bierze `ownerId` z principal sesji.
- Wszystkie zapytania są filtrowane po tym identyfikatorze.
- Próba przesłania pola właściciela jest odrzucana jako nieznane pole (`400`), a nie ignorowana.
- Parametry zapytania takie jak `?ownerId=...` są ignorowane i nie zmieniają zakresu danych.

### 5.3 Uwagi implementacyjne dla DTO

- `package` jest słowem kluczowym Javy; komponent rekordu nazywa się `packageValue` i ma `@JsonProperty("package")`.
- Limit `plaintext` jest liczony w punktach kodowych, a nie w `String.length()` (UTF-16). Wymaga własnego walidatora, np. `@Codepoints(max = 10000)`.
- Limit bajtów UTF-8 wymaga osobnego walidatora, np. `@Utf8Bytes(max = 40000)`.
- `package` jest walidowany przez `PackageCodec`, a nie wyłącznie przez adnotacje Bean Validation.
- `blank` oznacza wyłącznie białe znaki ASCII (`SP`, `HT`, `LF`, `VT`, `FF`, `CR`); NBSP i inne znaki Unicode są traktowane jako treść.
- Nieznane pola JSON wymagają `FAIL_ON_UNKNOWN_PROPERTIES = true`; duplikaty kluczy wymagają `STRICT_DUPLICATE_DETECTION`.

## 6. Endpointy — szczegóły

Wspólne nagłówki odpowiedzi:

```http
Content-Type: application/json
Cache-Control: no-store
X-Request-Id: b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b
```

### 6.1 `GET /api/auth/csrf`

Ustawia cookie `XSRF-TOKEN` i zwraca token.

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store
Set-Cookie: XSRF-TOKEN=3f1c2a9e-7b4d-4c8a-9e2f-1a2b3c4d5e6f; Path=/; SameSite=Lax
```

```json
{
  "token": "3f1c2a9e-7b4d-4c8a-9e2f-1a2b3c4d5e6f",
  "headerName": "X-XSRF-TOKEN",
  "cookieName": "XSRF-TOKEN"
}
```

Statusy: `200`, `500`.

### 6.2 `POST /api/auth/login`

```http
POST /api/auth/login
Content-Type: application/json
X-XSRF-TOKEN: 3f1c2a9e-7b4d-4c8a-9e2f-1a2b3c4d5e6f
```

```json
{
  "username": "alice",
  "password": "AliceDemo123!"
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store
Set-Cookie: JSESSIONID=...; Path=/; HttpOnly; SameSite=Lax
Set-Cookie: XSRF-TOKEN=...; Path=/; SameSite=Lax
```

```json
{
  "id": "8f14e45f-ea0b-4d1c-9b2a-6f7c8d9e0a1b",
  "username": "alice"
}
```

Statusy: `200`, `400`, `401`, `403`, `413`, `415`, `429`, `500`.

- `400` — brak pola, blank, zbyt długi login/hasło, nieznane pole, zły JSON.
- `401 INVALID_CREDENTIALS` — błędne dane lub konto wyłączone.
- `403 CSRF_INVALID` — brak/zły token.
- `429 RATE_LIMITED` — przekroczony limit prób; nagłówek `Retry-After`.

Ponowne logowanie przy aktywnej sesji jest dozwolone: tworzy nową sesję i rotuje identyfikatory.

### 6.3 `POST /api/auth/logout`

Bez ciała. Wymaga sesji i CSRF.

```http
HTTP/1.1 204 No Content
Set-Cookie: JSESSIONID=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax
Set-Cookie: XSRF-TOKEN=; Path=/; Max-Age=0; SameSite=Lax
```

Statusy: `204`, `401`, `403`, `500`.

### 6.4 `GET /api/auth/me`

```json
{
  "id": "8f14e45f-ea0b-4d1c-9b2a-6f7c8d9e0a1b",
  "username": "alice"
}
```

Statusy: `200`, `401`, `500`.

### 6.5 `POST /api/crypto/encrypt` — szyfrowanie bez zapisu

```json
{
  "plaintext": "Zażółć gęślą jaźń 🔐"
}
```

```json
{
  "package": "v1.k1.AAECAwQFBgcICQoL.0qr27sNOSnsG_3KCOZoblzioLbrV_EpMCk_E-xKhnw.aESjuIBJ6PPj48-yE2GTKg"
}
```

- AAD: `v1:<sessionOwnerId>:k1`.
- Nonce jest losowy przy każdym wywołaniu; powyższy pakiet to wektor testowy z sekcji 9.4, nie wynik tego konkretnego żądania.
- Nic nie jest zapisywane w bazie.

Statusy: `200`, `400`, `401`, `403`, `413`, `415`, `429`, `500`.

### 6.6 `POST /api/crypto/decrypt` — wklejony pakiet

```json
{
  "package": "v1.k1.AAECAwQFBgcICQoL.0qr27sNOSnsG_3KCOZoblzioLbrV_EpMCk_E-xKhnw.aESjuIBJ6PPj48-yE2GTKg"
}
```

```json
{
  "plaintext": "Zażółć gęślą jaźń 🔐"
}
```

- AAD jest budowane z **sesyjnego** właściciela i `keyId` z pakietu.
- Pakiet utworzony przez inne konto ma poprawny format, ale nie przejdzie weryfikacji tagu → `422 DECRYPT_FAILED`.
- Pakiet nie jest wyszukiwany w bazie; działa również po usunięciu wiadomości, jeśli właściciel się zgadza.

Statusy: `200`, `400`, `401`, `403`, `413`, `415`, `422`, `429`, `500`.

### 6.7 `POST /api/messages` — szyfrowanie z zapisem

```json
{
  "plaintext": "Zażółć gęślą jaźń 🔐"
}
```

```http
HTTP/1.1 201 Created
Content-Type: application/json
Location: /api/messages/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d
Cache-Control: no-store
```

```json
{
  "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "createdAt": "2026-11-04T12:34:56.789Z",
  "package": "v1.k1.AAECAwQFBgcICQoL.0qr27sNOSnsG_3KCOZoblzioLbrV_EpMCk_E-xKhnw.aESjuIBJ6PPj48-yE2GTKg"
}
```

- `owner_id` pochodzi z sesji.
- Zapis obejmuje `nonce`, `ciphertext`, `tag`, `key_id=k1`, `format_version=1`, `algorithm=AES-256-GCM`.
- Pakiet w odpowiedzi jest rekonstruowany z zapisanej koperty.
- Brak klucza idempotencji: ponowne wysłanie tego samego żądania tworzy nową wiadomość.

Statusy: `201`, `400`, `401`, `403`, `413`, `415`, `429`, `500`.

### 6.8 `GET /api/messages` — lista

```http
GET /api/messages?limit=10
```

```json
{
  "items": [
    {
      "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "createdAt": "2026-11-04T12:34:56.789Z"
    },
    {
      "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
      "createdAt": "2026-11-04T12:30:00.000Z"
    }
  ],
  "nextCursor": "MTc5Mzc5NTQwMDAwMDAwMDpiMmMzZDRlNS1mNmE3LTRiOGMtOWQwZS0xZjJhM2I0YzVkNmU",
  "hasMore": true
}
```

- `limit` domyślnie `10`, zakres `1–50`.
- Brak `total` i numerów stron; UI używa „pobierz więcej”.
- Lista nie zawiera pakietu ani szyfrogramu — szczegóły pobiera się osobno.

Statusy: `200`, `400`, `401`, `500`.

### 6.9 `GET /api/messages/{id}`

```json
{
  "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "createdAt": "2026-11-04T12:34:56.789Z",
  "package": "v1.k1.AAECAwQFBgcICQoL.0qr27sNOSnsG_3KCOZoblzioLbrV_EpMCk_E-xKhnw.aESjuIBJ6PPj48-yE2GTKg"
}
```

- `{id}` musi być UUID; inaczej `400 INVALID_MESSAGE_ID`.
- Wiadomość nieistniejąca i cudza dają identyczne `404 MESSAGE_NOT_FOUND`.

Statusy: `200`, `400`, `401`, `404`, `500`.

### 6.10 `POST /api/messages/{id}/decrypt`

Bez ciała. Wymaga sesji i CSRF.

```json
{
  "plaintext": "Zażółć gęślą jaźń 🔐"
}
```

- Żądanie nie ma ciała; serwer nie odczytuje ewentualnego ciała.
- `POST`, a nie `GET`, żeby tekst jawny nie był przypadkowo prefetchowany lub cache’owany przez przeglądarkę i żeby operacja jasno podlegała CSRF oraz limitowi.
- Serwer ładuje wiadomość po `id` i `owner_id` z sesji.
- AAD jest budowane z zapisanego `owner_id` i `key_id`.
- Jeśli dane w bazie są uszkodzone lub nie da się ich odszyfrować bieżącym kluczem → `500 MESSAGE_UNDECRYPTABLE` bez szczegółów.

Statusy: `200`, `400`, `401`, `403`, `404`, `429`, `500`.

### 6.11 `DELETE /api/messages/{id}`

```http
HTTP/1.1 204 No Content
```

- Twarde usunięcie wiersza; brak kosza i miękkiego usuwania.
- Cudza i nieistniejąca wiadomość → identyczne `404`.
- Ponowne usunięcie tej samej wiadomości → `404`.

Statusy: `204`, `400`, `401`, `403`, `404`, `500`.

### 6.12 `GET /actuator/health`

```json
{
  "status": "UP"
}
```

Statusy: `200` (`UP`), `503` (`DOWN`). Poza kontraktem biznesowym; bez szczegółów wewnętrznych.

## 7. Błędy

### 7.1 Format Problem Details

```http
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json
Cache-Control: no-store
X-Request-Id: b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b
```

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "detail": "Żądanie zawiera nieobsługiwane pole.",
  "instance": "/api/messages",
  "traceId": "b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b",
  "errors": [
    {
      "field": "ownerId",
      "code": "UNKNOWN_FIELD",
      "message": "Pole nie jest obsługiwane; właściciel pochodzi z sesji."
    }
  ]
}
```

- `type` zawsze `about:blank`.
- `title` to standardowa angielska nazwa statusu HTTP, nie tłumaczenie.
- `detail` jest po polsku i **nigdy** nie zawiera plaintextu, pakietu, szyfrogramu ani klucza.
- `errors` występuje tylko dla błędów walidacji.
- `instance` to sama ścieżka, bez query string i hosta.

### 7.2 Główne kody błędów

| Status | Kod | Znaczenie |
|---|---|---|
| `400` | `MALFORMED_JSON` | niepoprawny JSON, zły typ pola, zły typ główny lub duplikat klucza |
| `400` | `VALIDATION_FAILED` | brak, null, blank, zła długość, zły format lub nieznane pole |
| `400` | `INVALID_CURSOR` | kursor niezgodny z formatem |
| `400` | `INVALID_MESSAGE_ID` | `{id}` nie jest UUID |
| `400` | `INVALID_PACKAGE_FORMAT` | zła struktura, długość lub base64url pakietu |
| `400` | `UNSUPPORTED_PACKAGE_VERSION` | wersja inna niż `v1` |
| `400` | `UNKNOWN_KEY_ID` | `keyId` nie jest skonfigurowany |
| `401` | `UNAUTHENTICATED` | brak lub wygaśnięcie sesji |
| `401` | `INVALID_CREDENTIALS` | błędne dane logowania lub konto wyłączone |
| `403` | `CSRF_INVALID` | brak lub niezgodny token CSRF |
| `404` | `MESSAGE_NOT_FOUND` | wiadomość nie istnieje lub należy do innego użytkownika |
| `404` | `NOT_FOUND` | nieznana ścieżka |
| `405` | `METHOD_NOT_ALLOWED` | metoda nieobsługiwana dla ścieżki; nagłówek `Allow` |
| `413` | `PAYLOAD_TOO_LARGE` | ciało żądania większe niż 65 536 B |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | zły `Content-Type` lub charset |
| `422` | `DECRYPT_FAILED` | poprawny format, ale tag, AAD lub klucz nie pasują |
| `429` | `RATE_LIMITED` | przekroczony limit; nagłówek `Retry-After` |
| `500` | `INTERNAL_ERROR` | nieoczekiwany błąd serwera |
| `500` | `MESSAGE_UNDECRYPTABLE` | zapisana wiadomość nie daje się odszyfrować |

### 7.3 Kody pól

| Kod | Znaczenie |
|---|---|
| `REQUIRED` | pole nieobecne lub `null` |
| `BLANK` | pusty string albo same białe znaki |
| `TOO_SHORT` | krótsze niż minimum |
| `TOO_LONG` | dłuższe niż maksimum |
| `TOO_MANY_BYTES` | przekroczony limit bajtów UTF-8 |
| `INVALID_FORMAT` | zły format wartości |
| `OUT_OF_RANGE` | liczba poza zakresem |
| `UNKNOWN_FIELD` | pole nieobsługiwane |

### 7.4 Kolejność błędów

Gdy żądanie narusza kilka reguł, obowiązuje kolejność:

1. `413 PAYLOAD_TOO_LARGE`,
2. `415 UNSUPPORTED_MEDIA_TYPE`,
3. `401 UNAUTHENTICATED` / `403 CSRF_INVALID`,
4. `400` — składnia JSON, walidacja pól, format pakietu, kursor, UUID,
5. `429 RATE_LIMITED`,
6. `404 MESSAGE_NOT_FOUND`,
7. `422 DECRYPT_FAILED`,
8. `500`.

Dla logowania `401 INVALID_CREDENTIALS` występuje po `429`, bo limit prób musi działać przed weryfikacją hasła.

### 7.5 Macierz statusów

| Endpoint | 2xx | 400 | 401 | 403 | 404 | 413 | 415 | 422 | 429 | 500 |
|---|---|---|---|---|---|---|---|---|---|---|
| `GET /api/auth/csrf` | `200` | — | — | — | — | — | — | — | — | `500` |
| `POST /api/auth/login` | `200` | `400` | `401` | `403` | — | `413` | `415` | — | `429` | `500` |
| `POST /api/auth/logout` | `204` | — | `401` | `403` | — | — | — | — | — | `500` |
| `GET /api/auth/me` | `200` | — | `401` | — | — | — | — | — | — | `500` |
| `POST /api/crypto/encrypt` | `200` | `400` | `401` | `403` | — | `413` | `415` | — | `429` | `500` |
| `POST /api/crypto/decrypt` | `200` | `400` | `401` | `403` | — | `413` | `415` | `422` | `429` | `500` |
| `POST /api/messages` | `201` | `400` | `401` | `403` | — | `413` | `415` | — | `429` | `500` |
| `GET /api/messages` | `200` | `400` | `401` | — | — | — | — | — | — | `500` |
| `GET /api/messages/{id}` | `200` | `400` | `401` | — | `404` | — | — | — | — | `500` |
| `POST /api/messages/{id}/decrypt` | `200` | `400` | `401` | `403` | `404` | — | — | — | `429` | `500` |
| `DELETE /api/messages/{id}` | `204` | `400` | `401` | `403` | `404` | — | — | — | — | `500` |

### 7.6 Przykłady błędów

Nieznane pole właściciela:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "detail": "Żądanie zawiera nieobsługiwane pole.",
  "instance": "/api/messages",
  "traceId": "b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b",
  "errors": [
    {
      "field": "ownerId",
      "code": "UNKNOWN_FIELD",
      "message": "Pole nie jest obsługiwane; właściciel pochodzi z sesji."
    }
  ]
}
```

Zbyt długi tekst:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "detail": "Pole 'plaintext' przekracza dozwolony rozmiar.",
  "instance": "/api/messages",
  "traceId": "b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b",
  "errors": [
    {
      "field": "plaintext",
      "code": "TOO_LONG",
      "message": "Maksymalnie 10 000 punktów kodowych."
    }
  ]
}
```

Niepoprawny pakiet:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "code": "INVALID_PACKAGE_FORMAT",
  "detail": "Pakiet musi składać się z pięciu segmentów rozdzielonych kropką.",
  "instance": "/api/crypto/decrypt",
  "traceId": "b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b"
}
```

Brak sesji:

```json
{
  "type": "about:blank",
  "title": "Unauthorized",
  "status": 401,
  "code": "UNAUTHENTICATED",
  "detail": "Wymagane jest zalogowanie.",
  "instance": "/api/messages",
  "traceId": "b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b"
}
```

Błędne dane logowania:

```json
{
  "type": "about:blank",
  "title": "Unauthorized",
  "status": 401,
  "code": "INVALID_CREDENTIALS",
  "detail": "Nieprawidłowy login lub hasło.",
  "instance": "/api/auth/login",
  "traceId": "b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b"
}
```

Brak CSRF:

```json
{
  "type": "about:blank",
  "title": "Forbidden",
  "status": 403,
  "code": "CSRF_INVALID",
  "detail": "Brak lub nieprawidłowy token CSRF.",
  "instance": "/api/messages",
  "traceId": "b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b"
}
```

Cudza wiadomość:

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "code": "MESSAGE_NOT_FOUND",
  "detail": "Nie znaleziono wiadomości.",
  "instance": "/api/messages/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "traceId": "b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b"
}
```

Zbyt duże żądanie:

```json
{
  "type": "about:blank",
  "title": "Content Too Large",
  "status": 413,
  "code": "PAYLOAD_TOO_LARGE",
  "detail": "Żądanie przekracza 65 536 bajtów.",
  "instance": "/api/messages",
  "traceId": "b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b"
}
```

Zły typ zawartości:

```json
{
  "type": "about:blank",
  "title": "Unsupported Media Type",
  "status": 415,
  "code": "UNSUPPORTED_MEDIA_TYPE",
  "detail": "Wymagany jest Content-Type: application/json w UTF-8.",
  "instance": "/api/messages",
  "traceId": "b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b"
}
```

Nieudane odszyfrowanie pakietu:

```json
{
  "type": "about:blank",
  "title": "Unprocessable Content",
  "status": 422,
  "code": "DECRYPT_FAILED",
  "detail": "Nie udało się odszyfrować pakietu.",
  "instance": "/api/crypto/decrypt",
  "traceId": "b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b"
}
```

Przekroczony limit:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 42
Content-Type: application/problem+json
Cache-Control: no-store
```

```json
{
  "type": "about:blank",
  "title": "Too Many Requests",
  "status": 429,
  "code": "RATE_LIMITED",
  "detail": "Zbyt wiele żądań. Spróbuj ponownie później.",
  "instance": "/api/crypto/decrypt",
  "traceId": "b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b"
}
```

Błąd wewnętrzny:

```json
{
  "type": "about:blank",
  "title": "Internal Server Error",
  "status": 500,
  "code": "INTERNAL_ERROR",
  "detail": "Wystąpił nieoczekiwany błąd. Skontaktuj się z administratorem, podając traceId.",
  "instance": "/api/messages",
  "traceId": "b7d1f0c2e4a94f0e8c3d5a6b7e8f9a0b"
}
```

## 8. Paginacja

### 8.1 Format kursora

```text
cursor = base64url_nopad("<createdAtEpochMicros>:<messageUuid>")
```

- `createdAtEpochMicros` — dodatnia dziesiętna liczba mikrosekund od epoki, bez zer wiodących,
- `messageUuid` — kanoniczny UUID małymi literami,
- base64url bez paddingu, kanoniczny,
- maksymalnie 512 znaków w parametrze,
- kursor jest niepodpisany i nie zawiera danych osobowych; nie może rozszerzyć zakresu poza sesyjnego właściciela.

Przykład:

```text
MTc5Mzc5NTQwMDAwMDAwMDpiMmMzZDRlNS1mNmE3LTRiOGMtOWQwZS0xZjJhM2I0YzVkNmU
```

Po dekodowaniu:

```text
1793795400000000:b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e
```

### 8.2 Zachowanie

- Pierwsza strona: brak kursora.
- Kolejna strona: `cursor` równe `nextCursor` z poprzedniej odpowiedzi.
- `nextCursor` wskazuje ostatni element zwróconej strony.
- `hasMore = true` oznacza, że istnieje co najmniej jeden starszy element.
- Ostatnia strona: `nextCursor = null`, `hasMore = false`.
- Pusta lista: `items = []`, `nextCursor = null`, `hasMore = false`.
- Sortowanie: `created_at DESC, id DESC`.
- Zapytanie: `where owner_id = ? and (created_at, id) < (?, ?) order by created_at desc, id desc limit ?`.
- Brak stron wstecz i brak `total`.

Niepoprawny kursor → `400 INVALID_CURSOR`.

## 9. Pakiet i AAD

### 9.1 Format

```text
v1.<key_id>.<base64url(nonce)>.<base64url(ciphertext)>.<base64url(tag)>
```

Gramatyka:

```text
package    = "v1" "." key-id "." nonce "." ciphertext "." tag
key-id     = [a-z0-9][a-z0-9_-]{0,31}          ; 1–32 znaki
nonce      = 16 znaków base64url                ; 12 B
ciphertext = 2–53 334 znaki base64url           ; 1–40 000 B
tag        = 22 znaki base64url                 ; 16 B
base64url  = [A-Za-z0-9_-], bez paddingu "="
```

### 9.2 Segmenty

| Segment | Wartość | Ograniczenie |
|---|---|---|
| 1 | `v1` | literał; odpowiada `format_version = 1` |
| 2 | `key_id` | `^[a-z0-9][a-z0-9_-]{0,31}$`; obecnie `k1` |
| 3 | nonce | 12 B, base64url bez paddingu |
| 4 | ciphertext | 1–40 000 B, base64url bez paddingu |
| 5 | tag | 16 B, base64url bez paddingu |
| całość | pakiet | ≤56 000 znaków, wyłącznie ASCII, bez wewnętrznych białych znaków |

Base64url jest **kanoniczny**: po zdekodowaniu ponowne zakodowanie musi dać identyczny tekst. Padding `=` jest niedozwolony.

### 9.3 AAD

```text
v1:<ownerId>:<keyId>
```

- `v1` — literał wersji,
- `ownerId` — kanoniczny UUID małymi literami,
- `keyId` — identyfikator z pakietu.

AAD jest kodowane jako UTF-8. Dla szyfrowania bez zapisu i dla wklejonego pakietu używany jest właściciel z sesji. Dla zapisanej wiadomości używany jest `owner_id` z rekordu, który musi być równy właścicielowi sesji.

### 9.4 Wektor testowy

Klucz zerowy służy **wyłącznie** do testów. Nie wolno używać go poza repozytorium. Nonce w wektorze jest stały, co w prawdziwym systemie byłoby katastrofalne — tutaj jest to celowe, żeby wynik był powtarzalny. Pole `ownerId` w wektorze jest parametrem kryptograficznym (AAD), a nie polem DTO żądania.

```json
{
  "keyBase64": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  "ownerId": "8f14e45f-ea0b-4d1c-9b2a-6f7c8d9e0a1b",
  "keyId": "k1",
  "nonceBase64Url": "AAECAwQFBgcICQoL",
  "aad": "v1:8f14e45f-ea0b-4d1c-9b2a-6f7c8d9e0a1b:k1",
  "plaintext": "Zażółć gęślą jaźń 🔐",
  "package": "v1.k1.AAECAwQFBgcICQoL.0qr27sNOSnsG_3KCOZoblzioLbrV_EpMCk_E-xKhnw.aESjuIBJ6PPj48-yE2GTKg"
}
```

Oczekiwany wynik: odszyfrowanie daje `plaintext`, a ponowne zaszyfrowanie z tym samym nonce i AAD daje identyczny ciphertext i tag.

### 9.5 Walidacja pakietu

Kolejność:

1. przycięcie białych znaków ASCII z początku i końca (`SP`, `HT`, `LF`, `VT`, `FF`, `CR`),
2. długość ≤56 000 znaków,
3. podział na dokładnie 5 segmentów,
4. wersja `v1`,
5. format `key_id`,
6. znany `key_id`,
7. kanoniczny base64url,
8. długości nonce, ciphertext i tagu.

Błędy 1–3, 5, 7–8 → `400 INVALID_PACKAGE_FORMAT`. Błąd 4 → `400 UNSUPPORTED_PACKAGE_VERSION`. Błąd 6 → `400 UNKNOWN_KEY_ID`.

### 9.6 Szyfrowanie i deszyfrowanie

- Algorytm: AES-256-GCM.
- Klucz: 32 B z pliku sekretu `APP_CRYPTO_KEY_FILE` (preferowane) lub `APP_CRYPTO_KEY` (lokalnie), base64; walidowany przy starcie razem z `keyId=k1`.
- Nonce: 12 B z CSPRNG, nowy dla każdej operacji szyfrowania.
- Tag: 128 bitów.
- Brak kompresji, paddingu i dodatkowego opakowania.
- Tekst jawny nie jest normalizowany Unicode; szyfrowane są dokładnie otrzymane bajty UTF-8.
- Białe znaki na początku i końcu tekstu jawnego są zachowywane; serwer nie przycina `plaintext`.
- W bazie przechowywane są osobno `nonce`, `ciphertext`, `tag`, `key_id`, `format_version`; pakiet jest rekonstruowany.
- Kolumna `algorithm` jest zawsze równa `AES-256-GCM`; inna wartość przy odczycie to błąd integralności (`500`).
- `format_version` i `key_id` w bazie muszą być zgodne z pakietem; niespójność przy odczycie to błąd integralności (`500`).
- Usunięcie wiadomości nie unieważnia skopiowanego wcześniej pakietu.

## 10. Limity

| Element | Limit | Egzekwowanie | Błąd |
|---|---|---|---|
| Ciało żądania | 65 536 B (64 KiB) | filtr przed parsowaniem | `413 PAYLOAD_TOO_LARGE` |
| `plaintext` — punkty kodowe | 1–10 000 | walidator aplikacyjny | `400 VALIDATION_FAILED` |
| `plaintext` — UTF-8 | ≤40 000 B | walidator aplikacyjny | `400 VALIDATION_FAILED` |
| `plaintext` — blank | niedozwolony | walidator aplikacyjny | `400 VALIDATION_FAILED` |
| `package` | ≤56 000 znaków | walidacja pakietu | `400 INVALID_PACKAGE_FORMAT` |
| nonce | 12 B | walidacja pakietu | `400 INVALID_PACKAGE_FORMAT` |
| ciphertext | 1–40 000 B | walidacja pakietu | `400 INVALID_PACKAGE_FORMAT` |
| tag | 16 B | walidacja pakietu | `400 INVALID_PACKAGE_FORMAT` |
| `limit` | 1–50, domyślnie 10 | kontroler | `400 VALIDATION_FAILED` |
| `cursor` | ≤512 znaków | kontroler | `400 INVALID_CURSOR` |
| `username` (login) | 1–50 po normalizacji | walidator aplikacyjny | `400 VALIDATION_FAILED` |
| `password` | 1–128 B UTF-8 | walidator aplikacyjny | `400 VALIDATION_FAILED` |

Walidacje DTO nie odbijają odrzuconej wartości w błędzie. W `errors[].code` limit punktów kodowych mapuje się na `TOO_LONG`, a limit bajtów UTF-8 na `TOO_MANY_BYTES`; przy naruszeniu kilku reguł dla jednego pola serwer zwraca pierwszy raportowany constraint. Limit ciała żądania jest odrębny i daje `413` przed walidacją DTO.

Limity szybkości:

| Operacja | Limit | Klucz | Odpowiedź |
|---|---|---|---|
| Logowanie | 5 nieudanych prób / 60 s | IP + znormalizowany login | `429` + `Retry-After` |
| Deszyfrowanie | 30 / 60 s | użytkownik (oba endpointy łącznie) | `429` + `Retry-After` |
| Szyfrowanie | 60 / 60 s | użytkownik (oba endpointy łącznie) | `429` + `Retry-After` |

- Limity są przechowywane w pamięci i resetują się po restarcie.
- `Retry-After` to liczba sekund do końca okna.
- Limit logowania nie ujawnia, czy konto istnieje.

## 11. Bezpieczeństwo

- Właściciel wyłącznie z sesji; brak pola właściciela w DTO; nieznane pola odrzucane.
- Każde zapytanie o wiadomość filtruje po `owner_id`.
- Cudzy i nieistniejący zasób po `id` dają identyczne `404`.
- Cudzy pakiet wklejony bez `id` daje `422`, bo nie istnieje zasób do ukrycia.
- Plaintext, pakiet, szyfrogram i klucze nie trafiają do logów, metryk ani treści błędów.
- Wszystkie odpowiedzi `/api/**` mają `Cache-Control: no-store`.
- Odpowiedzi mają `X-Content-Type-Options: nosniff`.
- Plaintext jest danymi, nie HTML; frontend renderuje go jako tekst i nie używa `dangerouslySetInnerHTML`.
- SQL wyłącznie przez parametry JPA; brak dynamicznego składania SQL z danych użytkownika.
- Cookies sesji są `HttpOnly`; cookie CSRF musi być czytelne dla JavaScript.
- Brak CORS i brak wywołań cross-origin.
- Backend widzi tekst jawny — **nie jest to E2EE**.
- Sesje i limity są lokalne dla jednej instancji; brak Redis i klastrowania.

## 12. Mapowanie implementacyjne

Planowany podział pakietów (package-by-feature):

| Pakiet | Zawartość |
|---|---|
| `com.szlaczek.backend.auth.api` | `CsrfResponse`, `LoginRequest`, `UserResponse` |
| `com.szlaczek.backend.auth` | kontroler auth, serwis sesji, seed kont demo |
| `com.szlaczek.backend.crypto.api` | `EncryptRequest`, `PackageResponse`, `DecryptPackageRequest`, `PlaintextResponse` |
| `com.szlaczek.backend.crypto` | `CryptoService`, `PackageCodec`, walidacja pakietu |
| `com.szlaczek.backend.message.api` | `CreateMessageRequest`, `MessageResponse`, `MessageSummary`, `MessagePageResponse` |
| `com.szlaczek.backend.message` | kontroler, serwis, repozytorium, kursor |
| `com.szlaczek.backend.common.web` | `ApiProblem`, `FieldViolation`, `ProblemFactory`, filtry `X-Request-Id` i `Cache-Control` |
| `com.szlaczek.backend.common.security` | konfiguracja sesji, CSRF, limity, obsługa 401/403 |

Uwagi dla implementacji:

- Kolejność 401 przed 403 wymaga konfiguracji CSRF tak, żeby nieuwierzytelnione żądania do chronionych zasobów nie były blokowane przez CSRF przed autoryzacją; logowanie zawsze wymaga CSRF.
- `package` jako komponent rekordu: `packageValue` + `@JsonProperty("package")`.
- Walidatory `plaintext`: punkty kodowe i bajty UTF-8.
- `PackageCodec` powinien być jedynym miejscem parsującym i budującym pakiet.
- `createdAt` pochodzi z bazy; nie używać zegara aplikacji do odpowiedzi.
- Kursor budować z pełną precyzją mikrosekundową z bazy.
- Błędy mapować w jednym `@RestControllerAdvice`, bez ujawniania wyjątków.
- Nie logować ciał żądań dla `/api/crypto/**` i `/api/messages/**`.

## 13. Weryfikacja

Kontrakt jest weryfikowany statycznie skryptem:

```bash
node scripts/validate-api-contract.mjs
```

Skrypt sprawdza:

- poprawność wszystkich bloków JSON w tym dokumencie,
- kompletność endpointów i tabeli kodów błędów,
- strukturę, długości i kanoniczność każdego pakietu w dokumentacji,
- odszyfrowanie i ponowne zaszyfrowanie wektora AES-256-GCM,
- odrzucenie wektora przy AAD innego właściciela,
- brak pól właściciela w przykładach żądań,
- spójność AAD i limitów z README i `docs/DATA_MODEL.md`.

Wynik uruchomienia (2026-11-04, Node.js v22.19.0):

```text
OK: 28 przykładów JSON, 12 endpointów, 19 kodów głównych, 8 kodów pól, 5 pakietów, 1 przykład paginacji, wektor AES-256-GCM zgodny.
```

Potwierdzono: poprawność wszystkich bloków JSON, kompletność tabeli endpointów, opisanie każdego kodu użytego w przykładach, strukturę i długości pakietów, odszyfrowanie i ponowne zaszyfrowanie wektora, odrzucenie AAD innego właściciela oraz zgodność `nextCursor` z ostatnim elementem strony. Dodatkowo `git diff --check` nie zgłasza błędów whitespace.

**Ograniczenia weryfikacji ZR-03:**

- brak uruchomionego backendu, więc nie wykonano `curl` ani testów kontraktowych,
- OpenAPI nie jest generowane,
- paginacja jest zaprojektowana, ale nie zaimplementowana,
- testy integracyjne i E2E należą do kolejnych zadań.

## 14. Checklista akceptacji

| Kryterium | Dowód |
|---|---|
| Kontrakt obejmuje szyfrowanie z zapisem | `POST /api/messages` — sekcja 6.7 |
| Kontrakt obejmuje szyfrowanie bez zapisu | `POST /api/crypto/encrypt` — sekcja 6.5 |
| Kontrakt obejmuje wklejanie pakietu | `POST /api/crypto/decrypt` — sekcja 6.6 |
| Właściciel pochodzi z sesji, nie z DTO | sekcja 5.2, brak pól właściciela, przykład `ownerId` → `400` |
| Statusy HTTP są jednoznaczne | macierz w sekcji 7.5 |
| Przykłady błędów są jednoznaczne | katalog kodów i przykłady w sekcjach 7.2–7.6 |
| Wersja i `key_id` są opisane | sekcje 9.1–9.3 |
| Limity wejścia są opisane | sekcja 10 |
