# Decyzje architektoniczne (ADR)

Dokument zbiera decyzje przyjęte w ramach zadania rekrutacyjnego. Numeracja jest zgodna z dokumentacją w Notion; numery nieużyte w tym dokumencie pozostają zarezerwowane.

| ADR | Temat | Status | Data |
|---|---|---|---|
| [ADR-01](#adr-01--jeden-właściciel-wiadomości-brak-udostępniania-brak-e2ee) | Jeden właściciel wiadomości, brak udostępniania, brak E2EE | Accepted | 2026-11-04 |
| [ADR-07](#adr-07--konta-demonstracyjne-zamiast-publicznej-rejestracji) | Konta demonstracyjne zamiast publicznej rejestracji | Accepted | 2026-11-04 |
| [ADR-08](#adr-08--model-danych-i-migracje) | Model danych i migracje | Accepted | 2026-11-04 |
| [ADR-09](#adr-09--kontrakt-api-dto-i-format-pakietu) | Kontrakt API, DTO i format pakietu | Accepted | 2026-11-04 |
| [ADR-10](#adr-10--wersje-toolchain-i-higiena-sekretów) | Wersje, toolchain i higiena sekretów | Accepted | 2026-11-04 |
| [ADR-11](#adr-11--topologia-docker-compose) | Topologia Docker Compose | Accepted | 2026-11-05 |
| [ADR-12](#adr-12--mapowanie-jpa-i-repozytoria) | Mapowanie JPA i repozytoria | Accepted | 2026-11-05 |
| [ADR-13](#adr-13--argon2id-i-konta-demo-w-profilu-local) | Argon2id i konta demo w profilu local | Accepted | 2026-11-05 |
| [ADR-14](#adr-14--logowanie-sesja-i-csrf) | Logowanie, sesja i CSRF | Accepted | 2026-11-06 |
| [ADR-15](#adr-15--zarządzanie-kluczem-szyfrującym) | Zarządzanie kluczem szyfrującym | Accepted | 2026-11-07 |
| [ADR-16](#adr-16--cryptoservice-i-kodek-pakietu) | CryptoService i kodek pakietu | Accepted | 2026-11-07 |

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
   - klucz 32 bajty przechowywany przez backend i ładowany z pliku sekretu `APP_CRYPTO_KEY_FILE` (preferowane) lub `APP_CRYPTO_KEY` (lokalnie); szczegóły w ADR-15.
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

> **Aktualizacja 2026-11-05:** punkty 2, 3 i 6 (flaga `APP_DEMO_USERS`, BCrypt) zostały zastąpione przez ADR-13. Konta są seedowane tylko w profilu `local`, a hasła hashuje Argon2id.

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
9. Migracje `V1__create_app_users.sql`, `V2__create_messages.sql` i `V3__update_password_hash_comment.sql` są walidowane na PostgreSQL 16. Seed kont demo pozostaje w warstwie aplikacji.

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

## ADR-10 — Wersje, toolchain i higiena sekretów

### Status

**Accepted** — 2026-11-04.

### Kontekst

Repozytorium musi budować się powtarzalnie u rekrutera i w CI. Wersje muszą być wzajemnie zgodne, a konfiguracja nie może zależeć od tego, jakie JDK, Node albo wtyczki ma akurat zainstalowane recenzent. Jednocześnie repozytorium nie może zawierać sekretów, a oba moduły muszą mieć czytelny podział odpowiedzialności.

### Decyzja

1. Frontend: React 19.3.1, React DOM 19.3.1, Vite 7.3.7, `@vitejs/plugin-react` 5.2.0, TypeScript 6.0.3, Vitest 5.1.0, jsdom 29.0.0.
2. Wersje frontendu są dokładne (bez `^` i `~`), a `package-lock.json` jest commitowany. Node jest przypięty przez `.nvmrc` = `22` i `engines` = `>=22.13.0 <23`.
3. Backend: Spring Boot 4.1.2 jako parent, `java.version=17`, Maven wrapper 3.10.0, zależności zarządzane przez BOM Spring Boota. BouncyCastle 1.86 jest pinowany jawnie, ponieważ BOM go nie zarządza, a `Argon2PasswordEncoder` go wymaga.
4. Testy backendu używają Testcontainers 2.0.5 i obrazu `postgres:16-alpine`; Flyway wykonuje `V1`–`V3` w testowym kontekście.
5. Lint i format: ESLint flat config + Prettier dla frontendu; Spotless (formatter Eclipse) + Maven Enforcer dla backendu. `spotless:check` jest częścią `verify`.
6. Sekrety: `.env` i pokrewne pliki są ignorowane, w repozytorium jest tylko `.env.example` z placeholderami, a `scripts/check-secrets.sh` skanuje pliki trackowane i untracked.
7. Podział modułów: backend package-by-feature (`auth`, `crypto`, `message`, `common.*`), frontend `app`/`features`/`shared`.
8. Świadomie nie dodajemy Lomboka, OpenAPI ani CI w tym zadaniu.

### Konsekwencje

**Pozytywne:**

- Build jest powtarzalny: dokładne wersje npm, lockfile, wrapper Mavena i BOM.
- Projekt buduje się na JDK 27, a target pozostaje Java 17; Spring Boot 4.1.2 wspiera oba.
- Formatter Eclipse działa na JDK 27, w przeciwieństwie do formatterów opartych o wewnętrzne API javac.
- Test kontekstu realnie uruchamia PostgreSQL 16 i migracje, a nie tylko kompiluje kod.
- Skan sekretów ma test negatywny i wykrywa niepuste `APP_CRYPTO_KEY`.
- Granice modułów są widoczne w strukturze katalogów i `package-info.java`.

**Negatywne:**

- TypeScript jest przypięty do 6.0.3, mimo że dostępny jest 7.x; wynika to z zakresu wsparcia `typescript-eslint`.
- Vite 7 i plugin-react 5 są starsze niż Vite 8 i plugin-react 6; aktualizacja wymaga osobnej weryfikacji.
- jsdom 29 jest starszy niż 30 z powodu wymagań Node 22.22.2.
- `check-secrets.sh` jest heurystyczny i nie przeszukuje historii Git.
- Brak CI oznacza, że kontrole trzeba uruchamiać lokalnie do czasu dodania workflow.

### Odrzucone alternatywy

- **Palantir Java Format 2.103.0** — test na JDK 27 zakończył się `NoSuchFieldError: JCTree$JCCompilationUnit.endPositions`; formatter wymagałby obejść z `--add-exports`.
- **Google Java Format 2.0.0** — ten sam mechanizm wewnętrznego API javac, więc to samo ryzyko.
- **TypeScript 7.0.2** — `typescript-eslint` 8.72 wspiera `<6.1.0`; build lintu nie byłby wspierany.
- **Vite 8 + plugin-react 6** — nowsza para, ale wybrano stabilną i sprawdzoną 7/5.
- **jsdom 30** — wymaga Node `^22.22.2`, a środowisko ma 22.19.0.
- **Checkstyle** — duplikuje częściowo Spotless i generuje szum; Enforcer pilnuje wersji Java i Mavena.
- **Commitowany `.env` z wartościami demo** — zbyt łatwo zastąpić placeholder prawdziwym sekretem.

### Powiązane wymagania

R01, R03, R10.

---

## ADR-11 — Topologia Docker Compose

### Status

**Accepted** — 2026-11-05.

### Kontekst

R05 wymaga uruchomienia całego stosu jedną komendą, przy trzech kryteriach: przeglądarka korzysta z jednego origin, backend łączy się z bazą po nazwie serwisu, a baza nie ma publicznego portu w domyślnej konfiguracji. Host deweloperski to macOS `arm64`, więc obrazy muszą być dostępne także dla tej architektury. Endpointy API nie są jeszcze zaimplementowane, więc weryfikacja dotyczy topologii, a nie logiki biznesowej.

### Decyzja

1. Trzy usługi: `db` (PostgreSQL 16), `backend` (Spring Boot) i `frontend` (nginx).
2. Publiczny jest wyłącznie `frontend`: `3000:80`. `backend` ma `expose: 8080`, a `db` nie ma żadnego portu.
3. Dwie sieci: `edge` (frontend + backend) oraz `data` (`internal: true`, backend + db). Baza nie jest osiągalna z frontendu.
4. Dane trwałe: nazwany wolumen `pgdata`; projekt Compose nazywa się `encryption`.
5. Obrazy wieloetapowe: `maven:3.10.0-eclipse-temurin-17` → `eclipse-temurin:17-jre` (użytkownik nie-root) oraz `node:22.19-alpine` → `nginx:1.29-alpine`. Runtime zawiera tylko jar albo `dist/`.
6. Healthchecki (`pg_isready`, `curl /actuator/health`, `wget /`), `depends_on: service_healthy` i `restart: unless-stopped`.
7. nginx serwuje SPA z fallbackiem, proxuje `/api/` i `/actuator/health` do `backend:8080`, przekazuje `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` i ustawia `client_max_body_size 128k`.
8. Przekroczenie limitu nginx zwraca jako `application/problem+json` z `code: PAYLOAD_TOO_LARGE`, a nie jako HTML.
9. `APP_CRYPTO_KEY` pochodzi z `.env` lub środowiska; gdy go brak, Compose używa stałego zerowego klucza demo. Klucz demo jest jawny i przeznaczony wyłącznie do demonstracji. **Zmienione przez ADR-15:** Compose wymaga pliku sekretu `.secrets/crypto.key`; brak klucza blokuje start, a materiał klucza nie jest przekazywany przez environment.
10. `POSTGRES_*` mają domyślne wartości demo (`change-me`), więc start nie wymaga `.env`.
11. Testy nie są uruchamiane w obrazie (`-DskipTests`), bo Testcontainers wymagają Dockera hosta; pozostają osobną kontrolą.
12. TLS, CI i implementacja endpointów są poza zakresem tego zadania.

### Konsekwencje

**Pozytywne:**

- Przeglądarka i API mają jedno origin, więc CORS nie jest potrzebny.
- Baza i backend nie zwiększają publicznej powierzchni ataku.
- Sieć `data` izoluje bazę od frontendu.
- Wolumen przeżywa `docker compose down`, co potwierdzono testem trwałości.
- Obrazy są powtarzalne, multi-arch i zawierają tylko artefakty runtime.
- Healthchecki dają jednoznaczny sygnał gotowości i kolejność startu.
- Błędy 413 zachowują kontrakt problem+json.

**Negatywne:**

- Domyślne hasła i klucz są demonstracyjne; wymagają świadomej konfiguracji poza demo.
- **Zmienione przez ADR-15:** klucz nie jest już demonstracyjny ani domyślny. Compose wymaga wygenerowanego pliku sekretu, a jego utrata uniemożliwia odszyfrowanie danych.
- Debugowanie backendu wymaga `docker compose exec` albo sieci Compose.
- Brak TLS i cookie `Secure` w lokalnym Compose.
- Zmiana `APP_CRYPTO_KEY` po zapisaniu wiadomości uniemożliwia ich odszyfrowanie.
- Obraz backendu jest większy niż wariant alpine, ponieważ `eclipse-temurin:17-jre` jest oparty o Ubuntu.
- Build obrazu nie uruchamia testów, więc zielony build nie zastępuje `./mvnw verify`.

### Odrzucone alternatywy

- **Publikacja backendu na `8080`** — dodatkowa publiczna ścieżka i dwa origin; utrudnia debugowanie tylko pozornie.
- **Publikacja PostgreSQL na `5432`** — narusza kryterium braku publicznego portu bazy.
- **Jedna sieć dla wszystkich usług** — frontend mógłby łączyć się z bazą; brak izolacji.
- **`eclipse-temurin:17-jre-alpine`** — obraz jest publikowany tylko dla `linux/amd64`; na hoście `arm64` wymagałby emulacji.
- **Uruchamianie testów w buildzie obrazu** — Testcontainers potrzebują Dockera hosta; build stałby się wolny i zależny od środowiska.
- **Wymagany klucz w `.env`** — `docker compose up -d` bez konfiguracji kończyłby się błędem, wbrew kryterium uruchomienia. **ADR-15 zmienia to świadomie:** klucz jest wymaganym plikiem sekretu, a pierwszy start wymaga jednorazowej generacji.
- **Losowy klucz generowany przy starcie** — po restarcie stare wiadomości byłyby nieczytelne.
- **TLS w Compose** — generowałby samopodpisane certyfikaty i szum; produkcja wymaga zewnętrznego terminatora TLS.

### Powiązane wymagania

R05, R10.

---

## ADR-12 — Mapowanie JPA i repozytoria

### Status

**Accepted** — 2026-11-05.

### Kontekst

Schemat `app_users` i `messages` powstał w ZR-02 jako migracje Flyway. ZR-06 wymaga warstwy JPA, która odwzorowuje ten schemat bez rozjeżdżania się z nim, oraz repozytoriów umożliwiających zapis i odczyt zaszyfrowanych wiadomości. Kontrakt API (`docs/API.md`) mówi, że `createdAt` generuje baza (`now()`), a każdy odczyt jest ograniczony do właściciela z sesji. Encje nie mogą wyciec do API.

### Decyzja

1. Dwie encje w pakietach feature: `auth.AppUser` (`app_users`) i `message.Message` (`messages`). Nie tworzymy wspólnego pakietu `domain` ani encji technicznych.
2. `id` jest mapowane jako `UUID` z `GenerationType.UUID` (v4). Domyślna wartość `gen_random_uuid()` w migracji pozostaje dla insertów spoza JPA.
3. `created_at` jest generowane przez bazę: `@Generated(event = EventType.INSERT)` + `insertable = false, updatable = false`. Nie używamy `@CreationTimestamp`, bo timestamp powstawałby w JVM, niezgodnie z kontraktem.
4. `nonce`, `ciphertext` i `tag` to `byte[]` → `bytea`; `format_version` to `short` → `smallint`; `created_at` to `Instant` → `timestamptz`. Hibernate działa w UTC (`hibernate.jdbc.time_zone=UTC`).
5. Relacja jest jednokierunkowa: `Message.owner` (`@ManyToOne(fetch = LAZY, optional = false)`). `AppUser` nie ma kolekcji wiadomości, żeby uniknąć N+1 i przypadkowej serializacji historii użytkownika.
6. Repozytoria są owner-scoped. `AppUserRepository` udostępnia tylko `findByUsername` i `existsByUsername`. `MessageRepository` udostępnia `findByIdAndOwner_Id`, `findByOwner_IdOrderByCreatedAtDescIdDesc`, `findNextPage` oraz `deleteByIdAndOwner_Id`; nie ma metod `findAll` ani wyszukiwania po samym `id`.
7. Zapytanie kursorowe realizuje warunek `(created_at, id) < (:createdAt, :id)` z sortowaniem `created_at desc, id desc`, zgodnie z `docs/API.md`. Tie-breaker po `id` zapobiega gubieniu i duplikowaniu wierszy o tym samym czasie.
8. `deleteByIdAndOwner_Id` jest jawnym `@Modifying @Transactional @Query` i zwraca liczbę usuniętych wierszy; dzięki temu usunięcie cudzej wiadomości jest bezpieczne i policzalne.
9. `spring.jpa.hibernate.ddl-auto=validate`. Hibernate nigdy nie tworzy ani nie zmienia schematu; jedynym źródłem prawdy są migracje Flyway.
10. Encje nie są zwracane z kontrolerów. W tym zadaniu nie powstają DTO ani endpointy; mapowanie na DTO należy do zadania z warstwą API.
11. Testy integracyjne używają Testcontainers PostgreSQL 16 i `@ServiceConnection`. Jeden test obejmuje też drugie `flyway.migrate()` i porównanie fingerprintu schematu, żeby wykryć niejawne zmiany.

### Konsekwencje

**Pozytywne:**

- Mapowanie jest weryfikowane przez `ddl-auto=validate` przy każdym starcie kontekstu.
- `created_at` ma jedną semantykę: czas bazy, wspólny dla JPA i SQL.
- Brak dwukierunkowej relacji upraszcza model i ogranicza ryzyko wycieku danych.
- Zapytania owner-scoped są gotowe pod endpointy i trudniej przypadkowo zwrócić cudze dane.
- Test powtarzalnego startu wykrywa rozjazd migracji i mapowania.

**Negatywne:**

- `@Generated` wymaga, żeby baza faktycznie ustawiała `created_at`; insert z jawną wartością przez JPA nie jest przewidziany.
- Brak `AppUser.messages` oznacza, że operacje na wiadomościach użytkownika wymagają jawnego repozytorium.
- `MessageRepository` nie jest jeszcze używany przez serwis; jego API może się zmienić wraz z implementacją endpointów.
- Testy Testcontainers wymagają Dockera hosta i nie działają w buildzie obrazu.

### Odrzucone alternatywy

- **`@CreationTimestamp`** — timestamp z JVM, niespójny z `now()` i kontraktem API.
- **`ddl-auto=update`** — niejawne zmiany schematu i brak kontroli nad migracjami.
- **Relacja dwukierunkowa `AppUser.messages`** — N+1, ryzyko serializacji i większa powierzchnia błędów.
- **Metody `findAll` i `findById` w repozytorium wiadomości** — zbyt łatwo pominąć filtr właściciela.
- **Zwracanie encji z API** — ujawnia mapowanie i ułatwia przypadkowy wyciek pól; DTO powstaną osobno.

### Powiązane wymagania

R04, R06, R10.

---

## ADR-13 — Argon2id i konta demo w profilu local

### Status

**Accepted** — 2026-11-05.

### Kontekst

ZR-07 wymaga kont demonstracyjnych i hashowania haseł, a R02/R06 obejmują logowanie oraz kontrolę dostępu. Wcześniejszy ADR-07 zakładał BCrypt i flagę `APP_DEMO_USERS`. Zadanie wymaga Argon2id oraz seedu wyłącznie w profilu lokalnym, więc sama flaga środowiskowa nie wystarcza: przypadkowe uruchomienie z `APP_DEMO_USERS=true` poza demo nadal tworzyłoby konta. Potrzebny jest mechanizm powiązany z profilem Springa i jawnie opisany w konfiguracji.

### Decyzja

1. Hasła są hashowane **Argon2id** przez bean `PasswordEncoder` w `common/security/PasswordEncoderConfig`.
2. Parametry są przypięte jawnie: salt 16 B, hash 32 B, parallelism 1, memory 16 384 KiB (16 MiB), iterations 2. Odpowiadają domyślnym parametrom Spring Security (`defaultsForSpringSecurity_v5_8`), ale nie korzystamy z fabryki, żeby aktualizacja biblioteki nie zmieniła kosztu w ciszy.
3. `org.bouncycastle:bcprov-jdk18on:1.86` jest jawną zależnością, bo `Argon2PasswordEncoder` wymaga BouncyCastle, a BOM Spring Boota nie zarządza tą biblioteką. Wersja jest pinowana w `pom.xml`.
4. Hash Argon2id dla tych parametrów ma 97 znaków i mieści się w istniejącej kolumnie `password_hash varchar(100)`. Nie zmieniamy typu kolumny; migracja `V3` poprawia wyłącznie jej komentarz z BCrypt na Argon2id.
5. Login jest normalizowany w jednym miejscu (`UsernameNormalizer`: `trim` + `toLowerCase(Locale.ROOT)`). Baza nadal wymusza `username = lower(btrim(username))` i unikalność.
6. Dwa konta (`alice`, `bob`) są zdefiniowane w `application-local.properties`; `DemoUserProperties` waliduje obecność i niepustość danych. Hasła demo są jawne i przeznaczone wyłącznie do demonstracji.
7. `DemoUserSeeder` działa tylko z adnotacją `@Profile("local")`, jest transakcyjny i idempotentny. Istniejących kont nie nadpisuje i nie loguje haseł ani hashy.
8. Compose ustawia `SPRING_PROFILES_ACTIVE=${SPRING_PROFILES_ACTIVE:-local}`. Domyślnie stos jest lokalny, ale wdrożenie może wybrać inny profil; poza `local` seeder w ogóle nie powstaje.
9. `AppUserDetailsService` udostępnia konta Spring Security, normalizuje login, respektuje `enabled` i zwraca zapisany hash. Nie implementujemy jeszcze endpointu logowania ani pełnego `SecurityFilterChain`.
10. Limit hasła w kontrakcie API rośnie z 1–72 B do 1–128 B; 72 B było ograniczeniem BCrypt, którego Argon2id nie ma. Limit pozostaje walidacją wejścia, a nie właściwością algorytmu.
11. Testy jednostkowe i integracyjne sprawdzają parametry hasha, dopasowanie poprawnego i błędnego hasła, hashe w bazie, idempotencję oraz brak seedu poza profilem `local`.

### Konsekwencje

**Pozytywne:**

- Hasła w bazie są hashami Argon2id, a nie tekstem jawnym.
- Koszt hashowania jest jawny i niezależny od przyszłych zmian domyślnych parametrów biblioteki.
- Seed jest powiązany z profilem, więc przypadkowa flaga środowiskowa nie utworzy kont demo.
- Idempotencja pozwala bezpiecznie restartować stos bez resetowania haseł.
- Normalizacja jest spójna w seedzie, `UserDetailsService` i bazie.
- 97-znakowy hash mieści się w istniejącej kolumnie, więc zmiana algorytmu nie wymaga przebudowy tabeli.

**Negatywne:**

- Argon2id zużywa 16 MiB pamięci na weryfikację hasła; przy wielu równoległych logowaniach rośnie zapotrzebowanie na RAM.
- BouncyCastle zwiększa rozmiar artefaktu runtime.
- Hasła demo są jawne w repozytorium; profil `local` jest domyślny w Compose i nie może być używany jako konfiguracja produkcyjna.
- Brak endpointu logowania oznacza, że konta są gotowe, ale niedostępne jeszcze przez API.
- Zmiana parametrów Argon2id w przyszłości wymaga świadomej decyzji i ponownego hashowania; `varchar(100)` daje ograniczony zapas.

### Odrzucone alternatywy

- **Pozostawienie BCrypt** — niezgodne z wymaganiem Argon2id i słabsze przy obecnych rekomendacjach.
- **`APP_DEMO_USERS=true` jako jedyna brama** — łatwo włączyć poza demo; profil Springa jest jednoznaczny.
- **Seed kont w migracji SQL** — mieszanie danych demo z migracjami, brak profilu, ryzyko plaintextu lub statycznych hashy w SQL.
- **Hardkodowanie kont w klasie Java** — mniej czytelne niż konfiguracja i trudniejsze do nadpisania.
- **Edycja `V1__create_app_users.sql`** — zmieniłaby checksum Flyway i zepsuła istniejące bazy; dlatego komentarz poprawia `V3`.
- **`defaultsForSpringSecurity_v5_8()` bez własnych stałych** — parametry mogłyby zmienić się przy aktualizacji biblioteki.
- **Limit hasła 72 B** — ograniczenie BCrypt, nie Argon2id; podniesiono do 128 B.

### Powiązane wymagania

R02, R06, R10.

---

## ADR-14 — Logowanie, sesja i CSRF

### Status

**Accepted** — 2026-11-06.

### Kontekst

ZR-08 implementuje sekcję 4 i 6 kontraktu: `GET /api/auth/csrf`, `POST /api/auth/login`, `GET /api/auth/me` i `POST /api/auth/logout`. Domyślna konfiguracja Spring Security nie wystarcza:

- form login przekierowuje i nie zwraca JSON, a kontrakt wymaga `application/problem+json`,
- domyślna kolejność filtrów zwraca `403` przed `401` dla anonimowych mutacji, podczas gdy kontrakt wymaga `401` przed `403`,
- logowanie musi zawsze wymagać CSRF, także bez sesji,
- po logowaniu trzeba obrócić identyfikator sesji i token CSRF,
- błędy logowania nie mogą ujawniać istnienia konta,
- limit 5 nieudanych prób na 60 s wymaga własnego mechanizmu.

Jednocześnie sesje i limity są przechowywane w pamięci, bo MVP działa jako jedna instancja.

### Decyzja

1. `SecurityConfig` tworzy jeden `SecurityFilterChain` dla `/api/**` i `/actuator/health`. Form login, HTTP Basic i domyślny logout są wyłączone. Polityka sesji to `IF_REQUIRED`, a kontekst bezpieczeństwa jest zapisywany jawnie przez `HttpSessionSecurityContextRepository` z `requireExplicitSave(true)`.
2. Logowanie jest ręcznym kontrolerem JSON (`AuthController.login`) korzystającym z `AuthenticationManager` i `DaoAuthenticationProvider`. `AppUserDetailsService` zwraca `AppUserPrincipal` z `UUID id`, dzięki czemu `/me` i odpowiedź logowania nie potrzebują dodatkowego zapytania do bazy.
3. Po udanym logowaniu `AuthService`:
   - wywołuje `request.changeSessionId()`, jeśli sesja już istnieje (ochrona przed session fixation),
   - tworzy nowy `SecurityContext` i zapisuje go przez `SecurityContextRepository`,
   - generuje nowy token CSRF i zapisuje go przez `CookieCsrfTokenRepository`,
   - zwraca `UserResponse` bez encji i bez hasha.
4. CSRF używa cookie `XSRF-TOKEN` (`Path=/`, `SameSite=Lax`, bez `HttpOnly`, `Secure` zależne od `SESSION_COOKIE_SECURE`) i nagłówka `X-XSRF-TOKEN`. Używamy zwykłego `CsrfTokenRequestAttributeHandler`, a nie `csrf.spa()`, żeby wartość w ciele odpowiedzi była równa wartości cookie i nie powstawały zdublowane cookie. Token jest zapisywany także wtedy, gdy `GET /api/auth/csrf` rozwiąże token odroczony.
5. `ApiCsrfRequestMatcher` realizuje kolejność z kontraktu: metody bezpieczne nie wymagają CSRF; `POST /api/auth/login` wymaga CSRF zawsze; mutacje z uwierzytelnionym principalem wymagają CSRF; mutacje anonimowe są przepuszczane do autoryzacji, żeby odpowiedź brzmiała `401`, a nie `403`.
6. `ApiAuthenticationEntryPoint` zwraca `401 UNAUTHENTICATED`, a `ApiAccessDeniedHandler` zwraca `403 CSRF_INVALID` dla `CsrfException` i `403 ACCESS_DENIED` dla pozostałych odmów. Oba używają wspólnego formatu RFC 9457.
7. `LoginRateLimiter` jest komponentem in-memory: maksymalnie 5 nieudanych prób w oknie 60 s dla pary IP + znormalizowany login. Szósta próba daje `429 RATE_LIMITED` i `Retry-After`; udane logowanie zeruje licznik. `Clock` jest wstrzykiwany, a liczba kluczy jest ograniczona (LRU), żeby mapa nie rosła bez końca. Wygaśnięcie okna jest weryfikowane testem HTTP `AuthRateLimitWindowIntegrationTests`, który podstawia `@Primary MutableClock` i przesuwa czas o 61 s zamiast czekać rzeczywistą minutę.
8. IP klienta pochodzi z `X-Real-IP` ustawianego przez nginx; poza Compose używany jest `request.getRemoteAddr()`. Nie ufamy dowolnemu `X-Forwarded-For` od klienta.
9. `DaoAuthenticationProvider` ma `hideUserNotFoundExceptions=true` i `alwaysPerformAdditionalChecksOnUser=true`. Błędne hasło, nieistniejący login i konto wyłączone dają identyczne `401 INVALID_CREDENTIALS`; hasła i hashe nie trafiają do logów.
10. Cookie sesji: `JSESSIONID`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` przez `SESSION_COOKIE_SECURE` (domyślnie `false` lokalnie). Sesja wygasa po 30 minutach, działa wyłącznie na cookie. Logout unieważnia tylko bieżącą sesję i czyści oba cookie (`Max-Age=0`).
11. `ApiRequestHeadersFilter` działa przed Spring Security: generuje serwerowy `X-Request-Id`, ustawia `Cache-Control: no-store` i `X-Content-Type-Options: nosniff` dla `/api/**`, odrzuca ciało większe niż 65 536 B (`413`) oraz żądania mutujące bez `application/json` w UTF-8 (`415`, z wyjątkiem `POST /api/auth/logout`, który nie ma ciała).
12. Jackson 3 odrzuca nieznane pola (`FAIL_ON_UNKNOWN_PROPERTIES`) i duplikaty kluczy (`STRICT_DUPLICATE_DETECTION`). Encje nigdy nie są zwracane z API.
13. Zmiana nie wymaga migracji bazy; schemat `V1`–`V3` pozostaje bez zmian.

### Konsekwencje

**Pozytywne:**

- Kontrakt auth jest zaimplementowany i sprawdzony przez 42 testy backendu oraz rzeczywiste żądania przez nginx.
- `401` ma pierwszeństwo przed `403`, a logowanie zawsze wymaga CSRF.
- Rotacja sesji i tokenu ogranicza skutki przejęcia identyfikatora.
- Błędy logowania nie ujawniają istnienia konta ani stanu `enabled`.
- Limit prób chroni przed prostym brute force bez blokowania innych kont na tym samym IP.
- Odpowiedzi błędów są jednolite i skorelowane z `X-Request-Id`.

**Negatywne:**

- Sesje i limiter są lokalne dla instancji; restart wymaga logowania, a wiele replik wymagałoby Redis lub sticky sessions.
- `X-Real-IP` jest zaufane tylko dlatego, że backend nie jest publikowany, a nginx nadpisuje nagłówek. Bez proxy trzeba zmienić resolver.
- Ręczne logowanie wymaga utrzymywania rotacji sesji i CSRF w `AuthService`; form login robiłby część z tego automatycznie.
- Cookie `XSRF-TOKEN` jest czytelne dla JavaScriptu z założenia; bezpieczeństwo opiera się na `SameSite` i nagłówku, nie na `HttpOnly`.
- `Secure` jest wyłączone lokalnie; wdrożenie bez TLS lub bez `SESSION_COOKIE_SECURE=true` byłoby niebezpieczne.
- Rate limiter nie jest trwały i nie współdzieli stanu między procesami.

### Odrzucone alternatywy

- **Form login Spring Security** — przekierowania i brak kontroli nad kształtem JSON; kontrakt wymaga problem details i własnych kodów.
- **`csrf.spa()`** — w tej konfiguracji powoduje duplikację cookie i rozjazd wartości w ciele odpowiedzi; prosty handler jest przewidywalny.
- **Poleganie na domyślnym `CsrfFilter` i domyślnym `AccessDeniedHandler`** — daje `403` przed `401` i inne ciało błędu.
- **JWT i sesja bezstanowa** — sprzeczne z wymaganiem sesji serwerowej, unieważniania i rotacji po logowaniu.
- **Limit prób w bazie lub Redis** — nadmiar dla jednej instancji; Redis jest poza MVP.
- **Ufanie `X-Forwarded-For` bez proxy** — klient mógłby obejść limit, podmieniając nagłówek.
- **Ignorowanie nieznanych pól JSON** — pozwalałoby klientowi sugerować `ownerId`; kontrakt wymaga odrzucenia.
- **Token CSRF wyłącznie w sesji** — frontend nie odczytałby go bez dodatkowego endpointu; cookie + treść odpowiedzi są zgodne z kontraktem.
- **Brak rotacji sesji przy ponownym logowaniu** — pozostawiałby ważny stary identyfikator.

### Powiązane wymagania

R02, R06, R10.

---

## ADR-15 — Zarządzanie kluczem szyfrującym

### Status

**Accepted** — 2026-11-07. Zastępuje demonstracyjny domyślny klucz z ADR-11 pkt 9.

### Kontekst

AES-256-GCM wymaga klucza 32-bajtowego. Klucz nie może być zapisany w repozytorium ani w obrazie, a jego przypadkowa zmiana lub utrata uniemożliwia odszyfrowanie istniejących wiadomości. MVP nie ma KMS, HSM ani automatycznej rotacji, więc potrzebny jest prosty, powtarzalny mechanizm: jednorazowa generacja, trwały plik poza Git i montaż tylko do backendu.

Wcześniejszy Compose używał zerowego klucza demo, co nie spełnia wymagania „brak lub błędny klucz blokuje start”. Nowe wymaganie jest ważniejsze niż wygoda pierwszego uruchomienia.

### Decyzja

1. Klucz jest generowany jednorazowo przez `./scripts/generate-crypto-key.sh` jako 32 losowe bajty z `openssl rand -base64 32`.
2. Domyślna lokalizacja to `.secrets/crypto.key`; katalog ma mode 700, plik mode 600. Skrypt odmawia nadpisania istniejącego pliku.
3. `.secrets/` jest ignorowany przez Git i wykluczony z kontekstu obrazu backendu. Materiał klucza nigdy nie trafia do repozytorium ani do warstwy obrazu.
4. Docker Compose używa sekretu plikowego `crypto_key` i montuje go **tylko do usługi `backend`** jako `/run/secrets/crypto_key`. `db` i `frontend` nie mają tego montażu, a `APP_CRYPTO_KEY` nie jest przekazywany przez `environment`.
5. Backend preferuje `APP_CRYPTO_KEY_FILE`. `APP_CRYPTO_KEY` pozostaje wyłącznie jako wygodny fallback dla lokalnego uruchomienia i testów; Compose go nie ustawia.
6. `CryptoProperties` wiąże `app.crypto.key-id`, `app.crypto.key-file` i `app.crypto.key`. `CryptoKey` waliduje base64, dokładnie 32 bajty oraz znany `keyId`.
7. Jedynym znanym `keyId` w MVP jest `k1`. Nieznany identyfikator, brak klucza, brak pliku, zły base64 lub zła długość powodują wyjątek podczas tworzenia beana i blokują start aplikacji.
8. Komunikaty błędów i `toString()` nie zawierają materiału klucza. Log startu zawiera wyłącznie `keyId` i długość.
9. Restart i ponowne utworzenie kontenera nie generują nowego klucza; plik pozostaje na hoście i jest montowany ponownie.
10. Brak automatycznej rotacji w MVP. Zmiana klucza jest operacją świadomą i oznacza brak dostępu do danych zaszyfrowanych starym kluczem. Kopia zapasowa pliku jest obowiązkiem operatora.
11. Testy używają deterministycznego, nieprodukcyjnego klucza w `src/test/resources/config/application.properties`; nie jest to sekret i nie jest używany poza testami.

### Konsekwencje

**Pozytywne:**

- Brak lub błędny klucz jest wykrywany przed obsługą ruchu.
- Klucz nie jest widoczny w `docker inspect` jako zmienna środowiskowa, w Git ani w obrazie.
- Restart zachowuje ten sam klucz, więc istniejące wiadomości pozostają czytelne.
- Jednoznaczny `keyId=k1` przygotowuje miejsce na przyszłą rotację i wiele kluczy.
- Testy startowe nie wymagają ręcznego czekania ani zewnętrznego KMS.

**Negatywne:**

- Pierwszy start Compose wymaga dodatkowego kroku: wygenerowania klucza.
- Utrata `.secrets/crypto.key` jest nieodwracalna dla istniejących danych; MVP nie ma odzyskiwania ani rotacji.
- Sekret jest plikiem na hoście; jego bezpieczeństwo zależy od uprawnień i backupu operatora.
- `APP_CRYPTO_KEY` jako fallback jest mniej bezpieczny niż plik i nie jest używany w Compose.
- Brak KMS/HSM i wielu aktywnych kluczy.

### Odrzucone alternatywy

- **Zerowy klucz demo jako domyślny** — nie spełnia wymagania blokady startu i zachęca do przypadkowego użycia w demo.
- **Klucz w `.env` lub `environment`** — widoczny w konfiguracji procesu i łatwiejszy do wycieku; plik sekretu jest lepiej izolowany.
- **Losowy klucz przy każdym starcie** — po restarcie istniejące wiadomości byłyby nieczytelne.
- **Klucz w obrazie** — narusza wymaganie „poza obrazem” i utrudnia rotację.
- **Automatyczna rotacja w MVP** — wymaga wielu aktywnych kluczy, migracji pakietów i polityki backupu; poza zakresem.
- **KMS/HSM** — nadmiar dla jednej instancji demonstracyjnej.

### Powiązane wymagania

R03, R05, R06.

---

## ADR-16 — CryptoService i kodek pakietu

### Status

**Accepted** — 2026-11-07. Implementuje format i AAD z ADR-09 oraz klucz z ADR-15.

### Kontekst

ZR-11 wymaga AES-256-GCM, nonce 12 B, tagu 128 bitów, jednoznacznego AAD oraz walidacji pakietu przed deszyfrowaniem. Kryptografia musi być testowalna bez HTTP i bazy, a błędy muszą dać się później jednoznacznie zmapować na kody z `docs/API.md`. Jednocześnie nie wolno współdzielić mutowalnego `Cipher` między żądaniami ani zwrócić plaintextu przed weryfikacją tagu.

### Decyzja

1. `CryptoService` jest bezstanowy i zależy wyłącznie od `CryptoKey` oraz `PackageCodec`. Nie importuje HTTP, MVC ani JPA.
2. Algorytm to `AES/GCM/NoPadding`, tag 128 bitów, nonce 12 B. Każda operacja tworzy nowy `Cipher`; współdzielony jest tylko thread-safe `SecureRandom`.
3. Szyfrowanie korzysta z `Cipher.doFinal`, a wynik JCE (`ciphertext || tag`) jest dzielony na ostatnich 16 bajtach. Deszyfrowanie przekazuje całość `ciphertext || tag` do jednego `doFinal`; nie używa `update` na szyfrogramie, żeby plaintext nie powstał przed weryfikacją tagu.
4. `AEADBadTagException` jest mapowany na `CryptoException` z kodem `DECRYPT_FAILED`. Komunikat nie zawiera plaintextu, pakietu, szyfrogramu ani klucza.
5. AAD ma postać `v1:<ownerId>:<keyId>` i jest kodowany jako UTF-8. `ownerId` przekazuje wywołujący (docelowo z sesji), a `keyId` pochodzi z pakietu i musi być równy kluczowi załadowanemu w `CryptoKey`.
6. `PackageCodec` jest jedynym miejscem parsowania i budowania pakietu. Waliduje kolejno: przycięcie ASCII whitespace, limit 56 000 znaków, pięć segmentów, wersję `v1`, format `key_id`, kanoniczny base64url bez paddingu oraz długości nonce/ciphertext/tag. Whitelistę znanego `key_id` egzekwuje `CryptoService`.
7. Błędy domenowe korzystają z `CryptoError` (`INVALID_PACKAGE_FORMAT`, `UNSUPPORTED_PACKAGE_VERSION`, `UNKNOWN_KEY_ID`, `DECRYPT_FAILED`). Warstwa web mapuje błędy formatu, wersji i klucza na `400`, a nieudane uwierzytelnienie tagu/AAD na `422 DECRYPT_FAILED`, używając bezpiecznych komunikatów RFC 9457 bez plaintextu i pakietu.
8. Produkcyjne szyfrowanie zawsze generuje nowy nonce. Deterministyczna metoda `encryptWithNonce` jest package-private i służy wyłącznie do odtworzenia opublikowanego wektora testowego.
9. Plaintext jest kodowany jako UTF-8. Serwis odrzuca `null`, pusty tekst i więcej niż 40 000 B UTF-8; limit 10 000 punktów kodowych pozostaje walidacją DTO.
10. `CryptoService` i `PackageCodec` są rejestrowane jako bean-y w `CryptoConfiguration`, obok istniejącego `CryptoKey`.

### Konsekwencje

**Pozytywne:**

- Brak współdzielonego mutowalnego `Cipher` eliminuje wyścigi i przypadkowe mieszanie stanu między żądaniami.
- Plaintext nie jest zwracany, jeśli tag lub AAD się nie zgadzają.
- Kodek jest testowalny w izolacji i nie zna HTTP ani bazy.
- Opublikowany wektor AES-GCM jest odtwarzalny w teście bez produkcyjnego sterowania nonce.
- Kody błędów są stabilne i gotowe do mapowania w endpointach.
- Endpointy `/api/crypto/encrypt` i `/api/crypto/decrypt` przekazują do kryptografii wyłącznie UUID z `AppUserPrincipal`; odpowiedzi API nie są cache'owane.

**Negatywne:**

- Każda operacja tworzy nowy obiekt `Cipher`; narzut jest akceptowalny dla MVP.
- `PackageCodec` i `CryptoService` dzielą odpowiedzialność za walidację: składnia w kodeku, znany klucz w serwisie.
- Testowy seam `encryptWithNonce` istnieje w kodzie produkcyjnym, choć jest package-private.
- Brak rotacji i wielu aktywnych kluczy; nadal działa wyłącznie `k1`.

### Odrzucone alternatywy

- **Współdzielony `Cipher` lub `ThreadLocal<Cipher>`** — więcej stanu i ryzyko błędów; nowy `Cipher` jest prostszy i bezpieczny.
- **Deszyfrowanie przez `update` + `doFinal`** — częściowy plaintext mógłby zostać ujawniony przed sprawdzeniem tagu.
- **Losowy klucz przy starcie** — uniemożliwiłby odczyt wcześniejszych wiadomości.
- **Parsowanie pakietu w kontrolerze lub serwisie wiadomości** — rozproszyłoby walidację i ułatwiło obejście limitów.
- **Wyjątki HTTP w pakiecie crypto** — sprzęgłyby kryptografię z warstwą web.
- **BouncyCastle jako provider AES** — JCE wystarcza; BouncyCastle pozostaje dla Argon2id.

### Powiązane wymagania

R03, R06.

### Uzupełnienie ZR-13 — mapowanie błędów HTTP

**Accepted — 2026-11-08.** Warstwa web mapuje typowane błędy kryptograficzne z ADR-16 na kontrakt HTTP: niepoprawna struktura, wersja i nieznany identyfikator klucza to `400`; błędny tag lub AAD to `422 DECRYPT_FAILED`. Tekst odpowiedzi jest stały i nie zawiera wartości wejściowej. Test integracyjny potwierdza `422` dla pakietu innego użytkownika i brak pola plaintext w błędzie.

## ADR-17 — Owner-scoped API zapisanych wiadomości

### Status

**Accepted — 2026-11-08 (ZR-14).**

### Decyzja

1. `POST /api/messages` szyfruje przez istniejący `CryptoService` i zapisuje `EncryptedPayload` w jednej transakcji; DTO nie zawiera właściciela.
2. Właściciel pochodzi wyłącznie z `AppUserPrincipal`. Wszystkie odczyty bazują na owner-scoped metodach `MessageRepository`; cudze i brakujące rekordy zwracają `404 MESSAGE_NOT_FOUND`.
3. Lista używa `created_at DESC, id DESC` i kursora base64url `epochMicros:uuid`, limitu 1–50 zgodnego z kanonicznym `docs/API.md` (wartość 50 ma pierwszeństwo przed rozbieżną wzmianką 100 w karcie Notion).
4. `GET /api/messages/{id}` zwraca wyłącznie DTO z pakietem. `POST /api/messages/{id}/decrypt` nie przyjmuje ciała, wymaga sesji oraz CSRF i zwraca plaintext tylko właścicielowi.
5. Błędny zapisany pakiet jest mapowany do stałego `500 MESSAGE_UNDECRYPTABLE`; nie ujawniamy tekstu ani szczegółów szyfru.
6. ZR-14 nie zmienia schematu ani migracji Flyway.

### Konsekwencje

- Dane są szyfrowane tą samą ścieżką co endpoint crypto i nie trafiają jako plaintext do bazy.
- Kursor pozwala pobierać strony stabilnie bez `total`; warunek pozycji jest zawsze ograniczony właścicielem.
- Usuwanie wiadomości oraz limity operacji szyfrujących pozostają w osobnym zakresie.

### Powiązane wymagania

R04, R06, R09.

## ADR-18 — Stabilne kody walidacji i brak odbicia wejścia

### Status

**Accepted — 2026-11-08 (ZR-15).**

### Decyzja

1. Bean Validation pozostaje źródłem walidacji DTO; limity znaków Unicode w treści mierzymy punktami kodowymi, a osobne ograniczenia UTF-8 mierzymy po bajtach.
2. Naruszenie `Codepoints` zwraca `400 VALIDATION_FAILED` z kodem pola `TOO_LONG`; naruszenie `Utf8Bytes` zwraca `TOO_MANY_BYTES`. Limit JSON transportu nadal jest mierzony bajtami i daje `413 PAYLOAD_TOO_LARGE`.
3. Treść błędu i komunikat pola są stałe i nie zawierają odrzuconej wartości; `ApiExceptionHandler` nie loguje oczekiwanych błędów walidacji ani ciał żądań.
4. Błędy MVC oraz błędy Spring Security/filtrów korzystają ze wspólnego `ApiProblem` RFC 9457; odpowiedzi API zachowują `Cache-Control: no-store`, a `X-Request-Id` jest generowany przez serwer i korelowany z `traceId`.
5. Nie konfigurujemy loggera żądań z treścią body dla ścieżek API. Nieznane pola i zduplikowane klucze JSON pozostają odrzucane.

### Konsekwencje

- Klient otrzymuje stabilne kody maszynowe bez plaintextu, pakietu, hasła ani sekretów w odpowiedzi.
- Granica 40 000 B plaintextu pokrywa się z 10 000 maksymalnymi punktami kodowymi Unicode; przypadek ponad oba limity może wskazać pierwszy naruszony constraint, lecz zawsze zwraca kontrolowany `VALIDATION_FAILED` bez wartości wejściowej.
- Różne warstwy transportu i walidacji zachowują rozróżnialne statusy `413`, `415` oraz `400`.

### Powiązane wymagania

R06, R10.

---

## ADR-19 — Klient API i sesja SPA

### Status

**Accepted — 2026-11-13 (ZR-17).**

### Decyzja

1. Frontend używa jednego klienta `apiRequest` w `src/shared/api/`: `fetch` z `credentials: 'same-origin'`, `cache: 'no-store'`, JSON i parsowaniem błędów RFC 9457 do `ApiError` (`status`, `code`, `detail`, `fieldErrors`, `retryAfterSeconds`).
2. Sesja pozostaje wyłącznie po stronie backendu w cookie `JSESSIONID` (`HttpOnly`, `SameSite=Lax`). Frontend nie zapisuje użytkownika, hasła ani wiadomości w `localStorage`, `sessionStorage` ani IndexedDB; stan sesji żyje tylko w pamięci Reacta.
3. Token CSRF jest czytany z cookie `XSRF-TOKEN` i wysyłany jako `X-XSRF-TOKEN` tylko dla metod mutujących. Gdy cookie nie istnieje, klient pobiera token z `GET /api/auth/csrf`. Po udanym logowaniu i wylogowaniu token w pamięci jest resetowany, ponieważ backend go rotuje.
4. Odpowiedź `403 CSRF_INVALID` powoduje jednorazowe odświeżenie tokenu i jedną ponowną próbę tego samego żądania. Druga odpowiedź `403` jest zwracana jako błąd; klient nie zapętla retry.
5. `GET /api/auth/me` przy starcie rozstrzyga stan sesji: `200` → zalogowany, `401` → anonimowy bez błędu, `5xx`/sieć → ekran błędu z ręcznym retry. `401` z wylogowania oznacza sesję już wygasłą i kończy się stanem anonimowym.
6. Formularz logowania używa `<label>`, hintów, `aria-describedby` (hint + błąd), `aria-invalid`, `aria-busy` i fokusu na alercie lub pierwszym błędnym polu. Login jest trimowany, hasło nigdy nie jest trimowane. `400` mapuje `errors[]` na pola, `401` daje komunikat bez rozróżniania konta, a `429` pokazuje `Retry-After`.
7. Tryb developerski Vite proxuje `/api` i `/actuator` na `http://localhost:8080`; cel można nadpisać przez `VITE_API_PROXY_TARGET`. W Compose ten sam origin zapewnia nginx.

### Konsekwencje

- Odświeżenie strony zachowuje sesję dzięki cookie, ale frontend nie ma kopii danych uwierzytelniających, która mogłaby wyciec przez XSS.
- Rotacja CSRF po logowaniu jest obsłużona bez przechowywania tokenu w storage; ewentualny rozjazd naprawia jednorazowy retry.
- Formularz jest dostępny dla czytników ekranu i klawiatury, a błędy pól są powiązane z konkretnym `input`.
- Testy komponentów mockują `fetch`; realną integrację z nginx, cookie i CSRF potwierdza smoke Playwright. Formalne E2E i axe pozostają osobnym zadaniem.

### Powiązane wymagania

R01, R02, R08.

---

## ADR-20 — Formularze szyfrowania i deszyfrowania w SPA

### Status

**Accepted — 2026-11-13 (ZR-18).**

### Decyzja

1. Formularze żyją w `features/crypto`: `api.ts` (trzy żądania), `limits.ts`, `messages.ts`, `format.ts`, `EncryptPanel`, `DecryptPanel` i `CryptoWorkspace`. `shared/ui/CopyButton` jest wspólnym komponentem prezentacyjnym.
2. `features/crypto` nie importuje `features/auth`. `CryptoWorkspace` przyjmuje `onSessionExpired`, a kompozycję z `SessionPanel` wykonuje `App.tsx`, który może spinać oba moduły.
3. Szyfrowanie i deszyfrowanie są dwiema sekcjami widocznymi jednocześnie. „Szyfruj” wywołuje `POST /api/crypto/encrypt` i nic nie zapisuje; „Szyfruj i zapisz” wywołuje `POST /api/messages` i pokazuje `id`, `<time dateTime>` oraz pakiet. Akcje są rozdzielone, bo zapis jest operacją trwałą.
4. Wyniki są renderowane wyłącznie jako tekst: pakiet w `<output>`, odszyfrowana treść w `<pre>`. Zakazane jest `dangerouslySetInnerHTML` i jakiekolwiek wstrzykiwanie HTML; testy sprawdzają, że payload `<img onerror>` pozostaje tekstem i nie tworzy elementu.
5. Kopiowanie używa `navigator.clipboard.writeText`. Brak API lub odrzucenie daje komunikat o ręcznym kopiowaniu; nie ma fallbacku do `execCommand` ani zapisu w storage. Kopiowany jest pakiet i odszyfrowana treść.
6. Klient pomocniczo waliduje 1–10 000 punktów kodowych i 40 000 B UTF-8 plaintextu oraz 56 000 znaków pakietu. Serwer pozostaje źródłem prawdy; klient nie odrzuca pakietu na podstawie własnej interpretacji formatu, żeby komunikaty `INVALID_PACKAGE_FORMAT` i `DECRYPT_FAILED` pochodziły z backendu.
7. Błędy są mapowane w jednym miejscu: `VALIDATION_FAILED` trafia do pola, `INVALID_PACKAGE_FORMAT` i `DECRYPT_FAILED` mają osobne komunikaty, `429` pokazuje `Retry-After`, `403` po retry informuje o odświeżeniu strony, a błąd sieci nie udaje błędu serwera.
8. `401` z chronionego endpointu kończy sesję: `AuthProvider.expireSession()` czyści stan i token CSRF, ustawia anonimowość i komunikat „Sesja wygasła. Zaloguj się ponownie.” na formularzu logowania.
9. Fokus po błędzie pola ustawia efekt na `fieldError`, a nie wywołanie w `catch`, ponieważ textarea jest wtedy jeszcze `disabled`. Liczniki są częścią `aria-describedby`; komunikaty używają `role="status"` lub `role="alert"`.

### Konsekwencje

- Użytkownik może zaszyfrować tekst, skopiować pakiet i odszyfrować go na tym samym koncie bez zapisywania wiadomości.
- Zapis jest świadomą, osobną akcją, a wynik zawiera identyfikator i czas utworzenia.
- Treść wiadomości nigdy nie trafia do DOM jako znaczniki, co ogranicza XSS po stronie klienta.
- Rozdzielenie modułów pozwala rozwijać listę wiadomości bez zależności cyklicznych; `messages` pozostaje pustym modułem do kolejnego zadania.
- Limity po stronie klienta są wyłącznie UX; zmiana limitów nadal wymaga aktualizacji `docs/API.md` i backendu.

### Powiązane wymagania

R01, R03, R08.

---

## ADR-21 — Lista zapisanych wiadomości i podgląd na żądanie

### Status

**Accepted — 2026-11-13 (ZR-19).**

### Decyzja

1. Lista żyje w `features/messages`: `api.ts` (`listMessages`, `getMessage`, `decryptMessage`), `errors.ts`, `MessagesPanel` i `MessageListItem`. `formatDateTime`/`formatNumber` przeniesiono do `shared/format.ts`, żeby crypto i messages korzystały z jednego formattera.
2. `features/messages` nie importuje `features/auth` ani `features/crypto`. `MessagesPanel` przyjmuje `onSessionExpired`, a `App.tsx` montuje go z `key={state.user.id}`, dzięki czemu zmiana konta lub wylogowanie odmontowuje panel i usuwa listę oraz odszyfrowaną treść z DOM.
3. Pierwsza strona to `GET /api/messages?limit=10`. Lista pokazuje wyłącznie `id` i `createdAt`; pakiet (`GET /api/messages/{id}`) i plaintext (`POST /api/messages/{id}/decrypt`) są pobierane dopiero po kliknięciu przy wybranej wiadomości. Nie ma masowego pobierania pakietów ani plaintextu.
4. Paginacja jest kursorowa i jednokierunkowa: „Pobierz więcej” wysyła `nextCursor` z poprzedniej odpowiedzi. Kursor przesuwa się dopiero po sukcesie, więc błąd strony zachowuje wczytane pozycje i ponawia ten sam kursor. Pozycje są deduplikowane po `id`, a `hasMore && !nextCursor` jest błędem zamiast pętlą.
5. Stany interfejsu: `role="status"` podczas ładowania, komunikat o pustej liście, `role="alert"` z fokusem dla błędu pierwszej i kolejnej strony. „Odśwież listę” wraca do pierwszej strony, a „Pobierz więcej” znika po wyczerpaniu danych.
6. Wyniki są renderowane wyłącznie jako tekst: pakiet w `<output>`, plaintext w `<pre>`. Obowiązuje zakaz `dangerouslySetInnerHTML` i `innerHTML`; testy oraz smoke sprawdzają, że `<img onerror>` nie tworzy elementu i nie wykonuje handlera.
7. `401` z listy, szczegółów lub deszyfrowania kończy sesję przez `onSessionExpired`; pozostałe błędy (`404`, `INVALID_CURSOR`, `403`, `429`, `MESSAGE_UNDECRYPTABLE`, sieć) są mapowane lokalnie i nie czyszczą już wczytanych danych.
8. Testy integracyjne korzystają z routera `fetch` po ścieżce (`src/test/backend.ts`) zamiast kolejki `mockResolvedValueOnce`, ponieważ po zalogowaniu pojawiło się dodatkowe żądanie listy.
9. Usuwanie wiadomości pozostaje poza zakresem ZR-19; nie dodano `DELETE` ani przycisku usuwania.

### Konsekwencje

- Użytkownik widzi tylko własne wiadomości, może przewijać historię i świadomie odszyfrować pojedynczy rekord.
- Otwarcie listy nie ujawnia treści w DOM ani w odpowiedziach HTTP; plaintext powstaje dopiero po jawnej akcji.
- Błąd kolejnej strony nie gubi danych i nie przeskakuje kursora, co upraszcza retry.
- Panel jest odmontowywany przy zmianie użytkownika, więc nie trzeba ręcznie czyścić stanu przy wylogowaniu.
- Brak prefetchu oznacza więcej żądań przy przeglądaniu wielu wiadomości, ale jest to świadomy kompromis bezpieczeństwa i wydajności.
- Usuwanie i limiter crypto nadal wymagają osobnego zadania.

### Powiązane wymagania

R01, R04, R09.

---

## Zasady zmian decyzji

- Zmiana zaakceptowanej decyzji wymaga nowego wpisu lub wyraźnego oznaczenia poprzedniego jako `Superseded`.
- Nie usuwamy wcześniejszych uzasadnień; zachowujemy historię.
- Każda zmiana musi wskazać wpływ na zakres, bezpieczeństwo i testy.
