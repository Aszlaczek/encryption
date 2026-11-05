# Otwarte kwestie

Stan na **2026-11-05**. Dokument uzupełnia README i ADR-y; każda kwestia ma jawnie wskazany status, żeby nie pozostawiać niejawnych założeń dotyczących dostępu i bezpieczeństwa.

## Legenda

| Status | Znaczenie |
|---|---|
| **Przyjęte** | Obowiązuje w MVP; zmiana wymaga aktualizacji dokumentacji i testów. |
| **Otwarte** | Wymaga decyzji przed rozpoczęciem odpowiedniego zadania. |
| **Poza MVP** | Świadomie wyłączone z zakresu. |

## Kwestie

| ID | Kwestia | Decyzja / wartość domyślna | Status | Wpływ |
|---|---|---|---|---|
| Q01 | Model właściciela wiadomości | Jedna wiadomość = jeden właściciel (`owner_id`); brak wyjątków | Przyjęte | Kontrola dostępu, testy R06 |
| Q02 | Udostępnianie wiadomości | Brak ACL i udostępniania między kontami | Poza MVP | Upraszcza model uprawnień |
| Q03 | E2EE | Brak; szyfrowanie po stronie serwera, backend widzi tekst jawny | Poza MVP | ADR-01, model zagrożeń |
| Q04 | Rejestracja i reset hasła | Brak; tylko konta demonstracyjne | Poza MVP | ADR-07 |
| Q05 | Konta demonstracyjne | `alice` / `AliceDemo123!`, `bob` / `BobDemo1234!` | Przyjęte | Testy E2E, README |
| Q06 | Polityka haseł demo | Minimum 12 znaków, BCrypt strength 12 | Przyjęte | Bezpieczeństwo logowania |
| Q07 | Tytuł wiadomości | Usunięty z modelu; brak kolumn `title`, `content`, `plaintext` | Przyjęte | ADR-08, README |
| Q08 | Powiązanie pakietu z właścicielem i kluczem | AAD = `v1:<ownerId>:<keyId>` | Przyjęte | Odszyfrowanie tylko przez właściciela |
| Q09 | Przechowywanie sesji | In-memory, jedna instancja; restart wymaga logowania | Przyjęte | Ograniczenie MVP |
| Q10 | Ochrona CSRF | Cookie `XSRF-TOKEN` + nagłówek `X-XSRF-TOKEN`; odświeżanie po logowaniu | Przyjęte | Testy R02/R06 |
| Q11 | Limity prób | Login 5 nieudanych/min na IP+login; deszyfrowanie 30/min; szyfrowanie 60/min; oba endpointy danej operacji łącznie | Przyjęte | Testy `429` |
| Q12 | Limity danych | Wiadomość 10 000 punktów kodowych / 40 000 B UTF-8; ciphertext 40 000 B; pakiet 56 000 znaków; request 65 536 B (64 KiB) | Przyjęte | Walidacja, R09 |
| Q13 | Klucz szyfrujący | 32 bajty base64 z `APP_CRYPTO_KEY`; `key_id=k1`; walidacja przy starcie | Przyjęte | Bezpieczeństwo, R03 |
| Q14 | Domyślny klucz w Compose | Tylko demo; produkcja wymaga własnego klucza | Przyjęte | Ryzyko wyłącznie demo |
| Q15 | Rotacja kluczy | Poza MVP; `key_id=k1` i `format_version=1` rezerwują miejsce | Poza MVP | Przyszła migracja |
| Q16 | HTTPS lokalnie | Brak; produkcja wymaga TLS i cookie `Secure` | Poza MVP | Środowisko demo |
| Q17 | Kopie zapasowe i retencja | Brak; dane w wolumenie, `down -v` usuwa | Poza MVP | Środowisko demo |
| Q18 | Role i administrator | Brak ról i panelu administracyjnego | Poza MVP | Kontrola dostępu |
| Q19 | Paginacja | Kursorowa, tylko następna strona; domyślnie 10, maksymalnie 50; indeks `(owner_id, created_at desc, id desc)` | Przyjęte | R09, ADR-09 |
| Q20 | Porty lokalne | Frontend `3000` publiczny w Compose; backend `8080` i db `5432` tylko w sieci Compose; poza Compose backend działa na `8080` | Przyjęte | Uruchomienie R05 |
| Q21 | Dokumentacja API | `docs/API.md` jako kanoniczny kontrakt; OpenAPI/springdoc odłożone, ewentualne użycie musi być zgodne z API.md | Przyjęte | R10, ADR-09 |
| Q22 | Wersja Spring Boot | 4.1.2; fallback na 3.5.x tylko przy blokującej niekompatybilności bibliotek | Przyjęte | Wymaga odnotowania w ADR |
| Q23 | Wspierane przeglądarki | Ostatnie dwie wersje Chrome, Firefox, Safari i Edge | Przyjęte | R07/R08 |
| Q24 | Język interfejsu | Polski | Przyjęte | R07/R08 |
| Q25 | Frontend | React + Vite + TypeScript (strict) | Przyjęte | R01 |
| Q26 | CI | GitHub Actions: backend, frontend, E2E | Przyjęte | R10 |
| Q27 | Wiele instancji | Poza MVP; brak Redis i klastrowania sesji | Poza MVP | Ograniczenie architektury |
| Q28 | Logi i observability | Brak plaintextu, kluczy i szyfrogramów w logach; publicznie tylko `actuator/health` | Przyjęte | R06/R10 |
| Q29 | Identyfikatory | UUID v4; domyślnie `gen_random_uuid()` w PostgreSQL | Przyjęte | ADR-08 |
| Q30 | Tag GCM | Osobna kolumna `bytea`, dokładnie 16 B | Przyjęte | ADR-08 |
| Q31 | Format koperty | `v1.<key_id>.<base64url(nonce)>.<base64url(ciphertext)>.<base64url(tag)>`; base64url kanoniczny | Przyjęte | README, ADR-08/ADR-09 |
| Q32 | Migracje | Flyway `V1`/`V2`; seed kont demo w warstwie aplikacji | Przyjęte | R04 |
| Q33 | Model błędów | RFC 9457 `application/problem+json`, `type=about:blank`, stabilny `code`, polski `detail` | Przyjęte | ADR-09, R02/R06 |
| Q34 | Pola właściciela | Brak pól właściciela w DTO; nieznane pola JSON odrzucane; właściciel tylko z sesji | Przyjęte | ADR-09, R06 |
| Q35 | Zasoby obce | Cudza i nieistniejąca wiadomość po `id` → identyczne `404`; cudzy pakiet bez `id` → `422` | Przyjęte | ADR-09, R06 |
| Q36 | Paginacja | Kursor `base64url(epochMicros:uuid)`, tylko następna strona, bez `total` | Przyjęte | ADR-09, R09 |
| Q37 | Błędy pakietu | Zły format → `400`; niepasujący tag/AAD/klucz → `422 DECRYPT_FAILED` | Przyjęte | ADR-09, R03 |
| Q38 | Kolejność CSRF | Dla chronionych zasobów `401` przed `403`; logowanie zawsze wymaga CSRF | Przyjęte | ADR-09, R02/R06 |
| Q39 | Cache i korelacja | `Cache-Control: no-store` na `/api/**`; `X-Request-Id` i `traceId` w błędach | Przyjęte | ADR-09, R06/R10 |
| Q40 | Wersjonowanie API | Brak wersji w URL; zmiany additive, breaking wymaga `/api/v2`; pakiet ma własne `v1` | Przyjęte | ADR-09 |
| Q41 | Toolchain i sekrety | Node 22.19, React 19.3.1, Vite 7.3.7, TS 6.0.3, Spring Boot 4.1.2 / Java 17, ESLint+Prettier, Spotless+Enforcer, `.env.example` i `check-secrets.sh` | Przyjęte | ADR-10, R01/R03/R10 |
| Q42 | Topologia Docker | Tylko `3000:80` publiczne; backend i db wewnętrzne; sieci `edge`/`data`; wolumen `pgdata`; klucz demo nadpisywalny z `.env` | Przyjęte | ADR-11, R05 |
| Q43 | Mapowanie JPA i repozytoria | `created_at` z bazy przez `@Generated`; relacja jednokierunkowa `Message.owner`; repozytoria owner-scoped z kursorem; encje poza API; `ddl-auto=validate` | Przyjęte | ADR-12, R04/R06 |

## Zasady rozstrzygania

1. Kwestia oznaczona jako **Otwarte** musi zostać rozstrzygnięta przed zadaniem, którego dotyczy.
2. Rozstrzygnięcie zmieniające zakres lub bezpieczeństwo wymaga wpisu w `docs/DECISIONS.md`.
3. Nie ukrywamy ograniczeń w kodzie — każde istotne założenie trafia do README, ADR lub tego dokumentu.
4. Kod nie może wprowadzać dostępu szerszego niż opisany w README, nawet jeśli testy tego nie sprawdzają.
