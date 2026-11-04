# Decyzje architektoniczne (ADR)

Dokument zbiera decyzje przyjęte w ramach zadania rekrutacyjnego. Numeracja jest zgodna z dokumentacją w Notion; numery nieużyte w tym dokumencie pozostają zarezerwowane.

| ADR | Temat | Status | Data |
|---|---|---|---|
| [ADR-01](#adr-01--jeden-właściciel-wiadomości-brak-udostępniania-brak-e2ee) | Jeden właściciel wiadomości, brak udostępniania, brak E2EE | Accepted | 2026-11-04 |
| [ADR-07](#adr-07--konta-demonstracyjne-zamiast-publicznej-rejestracji) | Konta demonstracyjne zamiast publicznej rejestracji | Accepted | 2026-11-04 |

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
   - losowy IV 12 bajtów dla każdej operacji,
   - tag uwierzytelniający 128 bitów,
   - klucz 32 bajty przechowywany przez backend i ładowany z `APP_CRYPTO_KEY`.
4. Backend przetwarza tekst jawny. **Nie jest to E2EE.**
5. Wszystkie operacje odczytu, deszyfrowania i usuwania są filtrowane po `owner_id`. Próba dostępu do cudzego zasobu zwraca `404`, aby nie ujawniać jego istnienia.
6. Pakiet szyfrogramu jest powiązany z właścicielem przez AAD w postaci `v1:<ownerId>`. Inne konto nie odszyfruje pakietu nawet po jego przechwyceniu.
7. Treść wiadomości jest przechowywana wyłącznie jako szyfrogram. Tytuł jest przechowywany jawnie i widoczny tylko dla właściciela.
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
- Tytuł wiadomości nie jest szyfrowany; jest jawny i musi być traktowany jako mniej wrażliwy niż treść.

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

## Zasady zmian decyzji

- Zmiana zaakceptowanej decyzji wymaga nowego wpisu lub wyraźnego oznaczenia poprzedniego jako `Superseded`.
- Nie usuwamy wcześniejszych uzasadnień; zachowujemy historię.
- Każda zmiana musi wskazać wpływ na zakres, bezpieczeństwo i testy.
