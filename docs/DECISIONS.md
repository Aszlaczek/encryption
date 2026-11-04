# Decyzje architektoniczne (ADR)

Dokument zbiera decyzje przyjęte w ramach zadania rekrutacyjnego. Numeracja jest zgodna z dokumentacją w Notion; numery nieużyte w tym dokumencie pozostają zarezerwowane.

| ADR | Temat | Status | Data |
|---|---|---|---|
| [ADR-01](#adr-01--jeden-właściciel-wiadomości-brak-udostępniania-brak-e2ee) | Jeden właściciel wiadomości, brak udostępniania, brak E2EE | Accepted | 2026-11-04 |
| [ADR-07](#adr-07--konta-demonstracyjne-zamiast-publicznej-rejestracji) | Konta demonstracyjne zamiast publicznej rejestracji | Accepted | 2026-11-04 |
| [ADR-08](#adr-08--model-danych-i-migracje) | Model danych i migracje | Accepted | 2026-11-04 |
| [ADR-09](#adr-09--kontrakt-api-dto-i-format-pakietu) | Kontrakt API, DTO i format pakietu | Accepted | 2026-11-04 |

---

## ADR-01 — Jeden właściciel wiadomości, brak udostępniania, brak E2EE

### Status

**Accepted** — 2026-11-04.

### Kontekst

MVP ma umożliwić logowanie, szyfrowanie i deszyfrowanie wiadomości oraz zapis i odczyt szyfrogramów. Zakres nie obejmuje współdzielenia wiadomości ani kryptografii po stronie klienta.

Bez jednoznacznej decyzji pojawiłyby się niejawne założenia dotyczące tego, kto może odczytać wiadomość, czy istnieje administrator oraz czy backend widzi tekst jawny.

### Decyzja

1. Każda wiadomość ma **dokładnie jednego właściciela** reprezentowanego przez `owner_id`.
2. Nie istnieje ACL, mechanizm udostępniania, role ani konto administracyjne z szerszym dostępem.
3. Szyfrowanie odbywa się **po stronie serwera**:
   - algorytm AES-256-GCM,
   - losowy nonce 12 bajtów dla każdej operacji,
   - tag uwierzytelniający 128 bitów,
   - klucz 32 bajty przechowywany przez backend i ładowany z `APP_CRYPTO_KEY`.
4. Backend przetwarza tekst jawny. **Nie jest to E2EE.**
5. Wszystkie operacje odczytu, deszyfrowania i usuwania są filtrowane po `owner_id`. Próba dostępu do cudzego zasobu zwraca `404`, aby nie ujawniać jego istnienia.
6. Pakiet szyfrogramu jest powiązany z właścicielem i kluczem przez AAD w postaci `v1:<ownerId>:<keyId>`. Inne konto nie odszyfruje pakietu nawet po jego przechwyceniu.
7. Treść wiadomości jest przechowywana wyłącznie jako szyfrogram. W tabeli `messages` nie ma kolumny `title`, `content` ani `plaintext`.
8. Tekst jawny nie jest zapisywany w logach, `localStorage` ani w treści błędów. Odpowiedzi deszyfrowania mają `Cache-Control: no-store`.

### Konsekwencje

**Pozytywne:**

- Prosty model uprawnień: właściciel albo `404`.
- Brak wymiany kluczy i problemu wielu urządzeń.
- Natychmiastowy odczyt i deszyfrowanie po stronie serwera.
- Możliwość testowania kontroli dostępu na poziomie API i bazy.

**Negatywne:**

- Backend i klucz są zaufane. Kompromitacja serwera lub klucza ujawnia treść wiadomości.
- Brak współdzielenia jest celowym ograniczeniem MVP.
- Przejście na E2EE wymagałoby nowego protokołu, zarządzania kluczami po stronie klienta i obsługi utraty klucza.
- Wszystkie treści użytkownika są szyfrowane; jawne pozostają wyłącznie metadane techniczne (`id`, `owner_id`, `created_at`, `key_id`, `format_version`, `algorithm`).

### Odrzucone alternatywy

- **E2EE** — poza zakresem MVP; wymaga zarządzania kluczami po stronie klienta, odzyskiwania dostępu i obsługi wielu urządzeń.
- **Udostępnianie i ACL** — wymaga zaproszeń, ról, odbierania uprawnień i dodatkowych testów; poza MVP.
- **Szyfrowanie wyłącznie po stronie klienta** — uniemożliwia serwerowe wyszukiwanie i paginację po metadanych, a backend nadal musiałby przechowywać zaszyfrowane pakiety.

### Powiązane wymagania

R01, R02, R03, R04, R06, R10.

---

## ADR-07 — Konta demonstracyjne zamiast publicznej rejestracji

### Status

**Accepted** — 2026-11-04.

### Kontekst

Celem zadania jest ocena przepływu szyfrowania, kontroli dostępu i jakości implementacji, a nie systemu rejestracji. Publiczna rejestracja zwiększa zakres, ryzyko nadużyć i liczbę scenariuszy testowych (weryfikacja e-mail, polityka haseł, ochrona przed spamem).

### Decyzja

1. Brak publicznej rejestracji, resetu hasła i panelu administracyjnego.
2. Dwa konta demonstracyjne (`alice`, `bob`) są seedowane **tylko** przy `APP_DEMO_USERS=true` (profil lokalny/demo).
3. Hasła są hashowane BCrypt; minimalna długość hasła demonstracyjnego wynosi 12 znaków.
4. Poświadczenia są opisane w README i traktowane jako publiczne.
5. Seed jest idempotentny i nie nadpisuje istniejących kont.
6. W środowisku produkcyjnym flaga `APP_DEMO_USERS` jest wyłączona, a konta demo nie powstają.

### Konsekwencje

**Pozytywne:**

- Oceniający może zalogować się i przetestować aplikację bez konfiguracji.
- Mniejszy zakres i mniej powierzchni ataku niż przy publicznej rejestracji.
- Powtarzalne dane demonstracyjne ułatwiają testy E2E.

**Negatywne:**

- Hasła demo są jawne w repozytorium; nie wolno używać ich poza środowiskiem demonstracyjnym.
- Brak samoobsługowego zakładania kont.
- Późniejsze dodanie rejestracji wymaga weryfikacji e-mail, polityki haseł i ochrony przed nadużyciami.

### Odrzucone alternatywy

- **Otwarta rejestracja** — zwiększa zakres i ryzyko nadużyć; poza MVP.
- **System zaproszeń** — wymaga panelu administracyjnego i zarządzania zaproszeniami; poza MVP.

### Powiązane wymagania

R01, R02, R05, R06, R10.

---

## ADR-08 — Model danych i migracje

### Status

**Accepted** — 2026-11-04.

### Kontekst

Pierwotny szkic zakładał tabele `User`, `Message` i `UserMessage`. Nie rozstrzygał jednoznacznie typu identyfikatorów, normalizacji loginu, wersjonowania koperty ani sposobu powiązania wielu kont z wiadomością. MVP wymaga jednego właściciela, braku udostępniania, braku tekstu jawnego w bazie i stabilnej paginacji.

### Decyzja

1. Docelowe tabele to `app_users` i `messages`.
2. Identyfikatory są typu `uuid` (v4), z domyślną wartością `gen_random_uuid()`.
3. `messages.owner_id` jest kluczem obcym do `app_users.id` z `on delete cascade`; relacja jest 1:N.
4. Tabela `user_messages` nie istnieje — nie ma udostępniania w MVP.
5. Nie istnieją kolumny `password`, `content`, `plaintext`, `body` ani `title`.
6. Koperta wiadomości składa się z `nonce` (12 B), `ciphertext` (1–40 000 B), `tag` (16 B), `key_id` i `format_version`; algorytm jest jawny jako `AES-256-GCM`.
7. `username` jest normalizowany do małych liter i przycinany; unikalność i format wymusza baza.
8. Indeks `idx_messages_owner_created_id` obsługuje paginację `(owner_id, created_at desc, id desc)`.
9. Migracje `V1__create_app_users.sql` i `V2__create_messages.sql` są walidowane na PostgreSQL 16. Seed kont demo pozostaje w warstwie aplikacji.

### Konsekwencje

**Pozytywne:**

- Model 1:N jest prostszy niż wiele-do-wielu i odpowiada zakresowi MVP.
- Brak kolumn plaintext i hasła jawnego eliminuje całą klasę błędów.
- UUID utrudnia enumerację identyfikatorów.
- Ograniczenia CHECK i FK działają niezależnie od kodu aplikacji.
- Indeks wspiera paginację i porządek `created_at desc, id desc`.

**Negatywne:**

- UUID v4 nie jest sortowalny po czasie; porządek zapewnia `created_at` i `id`.
- Brak tytułu oznacza, że lista wiadomości jest identyfikowana datą i UUID.
- Osobna kolumna `tag` wymaga składania koperty w warstwie API.
- `algorithm` jest ograniczony CHECK-iem do `AES-256-GCM`; nowy algorytm wymaga migracji.
- Seed kont demo jest aplikacyjny, więc wymaga uruchomienia aplikacji, a nie samej migracji.

### Odrzucone alternatywy

- **`user_messages` i relacja wiele-do-wielu** — zbędne bez udostępniania.
- **`BIGINT` jako identyfikator publiczny** — umożliwia enumerację.
- **Tag doklejony do ciphertext** — prostsze API, ale słabsze ograniczenia w bazie.
- **Jawny `title`** — narusza zasadę braku tekstu jawnego użytkownika w modelu.
- **`citext` dla username** — dodatkowe rozszerzenie bazy przy prostym `lower(btrim(...))`.

### Powiązane wymagania

R04, R06, R09.

---

## ADR-09 — Kontrakt API, DTO i format pakietu

### Status

**Accepted** — 2026-11-04.

### Kontekst

Frontend, backend i testy E2E potrzebują jednego, jednoznacznego kontraktu. Bez niego pojawiają się niejawne różnice w statusach HTTP, nazwach pól, paginacji, formacie błędów i sposobie przekazywania właściciela wiadomości. Model danych z ZR-02 ustala schemat i kopertę, ale nie rozstrzyga warstwy HTTP.

### Decyzja

1. API jest REST-owe, JSON UTF-8, pod ścieżką `/api`; nie ma wersji w URL.
2. Uwierzytelnianie opiera się na sesji `JSESSIONID` i tokenie CSRF `X-XSRF-TOKEN`; nie ma JWT.
3. Dla chronionych zasobów `401` ma pierwszeństwo przed `403`; logowanie zawsze wymaga CSRF.
4. Błędy używają RFC 9457 (`application/problem+json`), `type = about:blank` i stabilnego pola `code`; `title` jest angielską nazwą statusu, `detail` jest polski.
5. Właściciel pochodzi wyłącznie z sesji. Żaden DTO żądania nie ma pola właściciela, a nieznane pola JSON są odrzucane.
6. Cudza i nieistniejąca wiadomość po `id` dają identyczne `404`. Cudzy pakiet wklejony bez `id` daje `422`, bo nie ma zasobu do ukrycia.
7. Paginacja jest kursorowa, tylko „następna strona”, oparta o `(created_at desc, id desc)`; brak `total` i numerów stron.
8. Pakiet ma format `v1.<key_id>.<base64url(nonce)>.<base64url(ciphertext)>.<base64url(tag)>`; base64url jest kanoniczny i bez paddingu; AAD to `v1:<ownerId>:<keyId>`.
9. Zły format pakietu daje `400` z kodem `INVALID_PACKAGE_FORMAT` lub pokrewnym; poprawny format z niepasującym tagiem, AAD lub kluczem daje `422 DECRYPT_FAILED`.
10. Wszystkie odpowiedzi `/api/**` mają `Cache-Control: no-store` i `X-Request-Id`; błędy nie powtarzają danych wejściowych.
11. `docs/API.md` jest kanonicznym kontraktem. OpenAPI/springdoc jest odłożone; jeśli powstanie, musi być zgodne z tym dokumentem.
12. ZR-03 definiuje DTO na poziomie kontraktu. Klasy Java i adnotacje walidacyjne powstają w zadaniu backendowym, razem z zależnościami Web/Security/Validation.

### Konsekwencje

**Pozytywne:**

- Frontend i backend mają jednoznaczne pola, statusy i kody błędów.
- Właściciel nie może zostać nadpisany przez DTO.
- Kursor wykorzystuje istniejący indeks i jest stabilny przy wstawianiu nowych wiadomości.
- `404` dla obcych zasobów nie ujawnia ich istnienia.
- Wektor AES-GCM i walidator dokumentacji dają powtarzalny dowód poprawności formatu.
- Kontrakt można wykorzystać w testach MockMvc, MSW i Playwright.

**Negatywne:**

- Brak OpenAPI oznacza ręczne utrzymywanie dokumentu; ogranicza to walidator i przegląd.
- Paginacja kursorowa nie pozwala przeskoczyć do dowolnej strony.
- `401` przed `403` wymaga niestandardowej konfiguracji CSRF względem domyślnego Spring Security.
- `422` dla błędu tagu wymaga od klienta odróżnienia błędu formatu od błędu kryptograficznego.
- DTO istnieją najpierw jako dokumentacja, więc kod backendu musi zostać z nimi zgodny w kolejnym zadaniu.

### Odrzucone alternatywy

- **GraphQL** — nadmiarowy względem trzech przepływów i utrudnia kontrolę statusów HTTP.
- **JWT zamiast sesji** — zwiększa zakres, utrudnia unieważnianie i nie pasuje do CSRF opartego o cookie.
- **Paginacja offsetowa** — mniej stabilna przy równoległych zapisach i słabiej wykorzystuje indeks.
- **`403` dla cudzego zasobu** — ujawnia istnienie zasobu.
- **`400` dla błędu tagu GCM** — zaciera granicę między złym formatem a nieudaną weryfikacją kryptograficzną.
- **Pole `ownerId` w DTO** — otwiera drogę do nadpisania właściciela i łamie zasadę sesyjną.
- **OpenAPI-first z generowaniem kodu** — dodatkowe narzędzia i ryzyko niekompatybilności ze Spring Boot 4.1.2; odłożone.

### Powiązane wymagania

R02, R03, R04, R06, R10.

---

## Zasady zmian decyzji

- Zmiana zaakceptowanej decyzji wymaga nowego wpisu lub wyraźnego oznaczenia poprzedniego jako `Superseded`.
- Nie usuwamy wcześniejszych uzasadnień; zachowujemy historię.
- Każda zmiana musi wskazać wpływ na zakres, bezpieczeństwo i testy.
