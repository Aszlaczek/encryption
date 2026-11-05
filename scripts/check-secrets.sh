#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

failures=0

fail() {
    printf 'BŁĄD: %s\n' "$1" >&2
    failures=$((failures + 1))
}

# 1. Only `.env.example` may be tracked; real environment files must stay local.
tracked_env_files="$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -vE '(^|/)\.env\.example$' || true)"
if [ -n "$tracked_env_files" ]; then
    fail "trackowane pliki środowiskowe: ${tracked_env_files}"
fi

# 2. High-signal secret patterns. `git grep` covers tracked and untracked files,
#    but skips ignored files such as the local `.env`.
scan() {
    local description="$1"
    local pattern="$2"
    local matches
    local status=0

    matches="$(git grep --untracked -nIE -e "$pattern" -- . \
        ':!*.lock' \
        ':!frontend/package-lock.json' \
        ':!scripts/check-secrets.sh')" || status=$?

    if [ "$status" -gt 1 ]; then
        fail "nie udało się przeskanować repozytorium (git grep, kod ${status})"
        return
    fi

    if [ -n "$matches" ]; then
        printf '%s\n' "$matches" >&2
        fail "$description"
    fi
}

scan "prywatny klucz w repozytorium" '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----'
scan "token GitHub" 'gh[pousr]_[A-Za-z0-9]{30,}'
scan "klucz AWS" 'AKIA[0-9A-Z]{16}'
scan "klucz Google API" 'AIza[0-9A-Za-z_-]{35}'
scan "niepuste APP_CRYPTO_KEY" 'APP_CRYPTO_KEY=[A-Za-z0-9+/]{40,}={0,2}'

# The Compose default is a public, all-zero demo key, not a secret. It may exist
# only in docker-compose.yml and the published AES test vector in docs/API.md
# (and this script); anywhere else it is a mistake.
demo_key='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
demo_key_matches="$(git grep --untracked -nF -e "$demo_key" -- . \
    ':!docker-compose.yml' \
    ':!docs/API.md' \
    ':!scripts/check-secrets.sh' || true)"
if [ -n "$demo_key_matches" ]; then
    printf '%s\n' "$demo_key_matches" >&2
    fail "klucz demo poza docker-compose.yml"
fi

database_passwords="$(git grep --untracked -nIE '^(POSTGRES_PASSWORD|DB_PASSWORD)=[^[:space:]]+' -- . \
    ':!scripts/check-secrets.sh' | grep -vE '=(change-me|changeme|password)$' || true)"
if [ -n "$database_passwords" ]; then
    printf '%s\n' "$database_passwords" >&2
    fail "nieplaceholderowe hasło bazy w repozytorium"
fi

# 3. The example file must exist and must not contain a real key.
if [ ! -f .env.example ]; then
    fail "brak pliku .env.example"
elif grep -qE '^APP_CRYPTO_KEY=.+' .env.example; then
    fail "APP_CRYPTO_KEY w .env.example nie jest pusty"
fi

if [ "$failures" -ne 0 ]; then
    printf '\nWykryto %d problem(ów) związanych z sekretami.\n' "$failures" >&2
    exit 1
fi

printf 'OK: brak sekretów w trackowanych plikach; .env.example zawiera tylko placeholdery.\n'
