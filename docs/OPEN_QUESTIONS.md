# Otwarte kwestie

Stan na **2026-11-04**. Dokument uzupełnia README i ADR-y; każda kwestia ma jawnie wskazany status, żeby nie pozostawiać niejawnych założeń dotyczących dostępu i bezpieczeństwa.

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
| Q11 | Limity prób | Login 5/min na IP+login; deszyfrowanie 30/min; szyfrowanie 60/min | Przyjęte | Testy `429` |
| Q12 | Limity danych | Wiadomość 10 000 punktów kodowych / 40 000 B UTF-8; ciphertext 40 000 B; pakiet 56 000 znaków; request 64 KB | Przyjęte | Walidacja, R09 |
| Q13 | Klucz szyfrujący | 32 bajty base64 z `APP_CRYPTO_KEY`; `key_id=k1`; walidacja przy starcie | Przyjęte | Bezpieczeństwo, R03 |
| Q14 | Domyślny klucz w Compose | Tylko demo; produkcja wymaga własnego klucza | Przyjęte | Ryzyko wyłącznie demo |
| Q15 | Rotacja kluczy | Poza MVP; `key_id=k1` i `format_version=1` rezerwują miejsce | Poza MVP | Przyszła migracja |
| Q16 | HTTPS lokalnie | Brak; produkcja wymaga TLS i cookie `Secure` | Poza MVP | Środowisko demo |
| Q17 | Kopie zapasowe i retencja | Brak; dane w wolumenie, `down -v` usuwa | Poza MVP | Środowisko demo |
| Q18 | Role i administrator | Brak ról i panelu administracyjnego | Poza MVP | Kontrola dostępu |
| Q19 | Paginacja | Domyślnie 10, maksymalnie 50; indeks `(owner_id, created_at desc, id desc)` | Przyjęte | R09 |
| Q20 | Porty lokalne | Frontend `3000`, backend `8080`, konfigurowalne przez `.env` | Przyjęte | Uruchomienie R05 |
| Q21 | Dokumentacja API | OpenAPI/springdoc, jeśli kompatybilne z Spring Boot 4.1.2; w przeciwnym razie `docs/API.md` | Otwarte | R10, decyzja w zadaniu backendowym |
| Q22 | Wersja Spring Boot | 4.1.2; fallback na 3.5.x tylko przy blokującej niekompatybilności bibliotek | Przyjęte | Wymaga odnotowania w ADR |
| Q23 | Wspierane przeglądarki | Ostatnie dwie wersje Chrome, Firefox, Safari i Edge | Przyjęte | R07/R08 |
| Q24 | Język interfejsu | Polski | Przyjęte | R07/R08 |
| Q25 | Frontend | React + Vite + TypeScript (strict) | Przyjęte | R01 |
| Q26 | CI | GitHub Actions: backend, frontend, E2E | Przyjęte | R10 |
| Q27 | Wiele instancji | Poza MVP; brak Redis i klastrowania sesji | Poza MVP | Ograniczenie architektury |
| Q28 | Logi i observability | Brak plaintextu, kluczy i szyfrogramów w logach; publicznie tylko `actuator/health` | Przyjęte | R06/R10 |
| Q29 | Identyfikatory | UUID v4; domyślnie `gen_random_uuid()` w PostgreSQL | Przyjęte | ADR-08 |
| Q30 | Tag GCM | Osobna kolumna `bytea`, dokładnie 16 B | Przyjęte | ADR-08 |
| Q31 | Format koperty | `v1.<key_id>.<nonce>.<ciphertext>.<tag>` | Przyjęte | README, ADR-08 |
| Q32 | Migracje | Flyway `V1`/`V2`; seed kont demo w warstwie aplikacji | Przyjęte | R04 |

## Zasady rozstrzygania

1. Kwestia oznaczona jako **Otwarte** musi zostać rozstrzygnięta przed zadaniem, którego dotyczy.
2. Rozstrzygnięcie zmieniające zakres lub bezpieczeństwo wymaga wpisu w `docs/DECISIONS.md`.
3. Nie ukrywamy ograniczeń w kodzie — każde istotne założenie trafia do README, ADR lub tego dokumentu.
4. Kod nie może wprowadzać dostępu szerszego niż opisany w README, nawet jeśli testy tego nie sprawdzają.
