#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${CRYPTO_KEY_FILE:-.secrets/crypto.key}"

case "$target" in
    /*) ;;
    *) target="$repo_root/$target" ;;
esac

if [ -e "$target" ] || [ -L "$target" ]; then
    printf 'Klucz już istnieje: %s\n' "$target" >&2
    printf 'Odmawiam nadpisania. Usuń plik ręcznie tylko świadomie — stare wiadomości staną się nieczytelne.\n' >&2
    exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
    printf 'BŁĄD: wymagany jest openssl.\n' >&2
    exit 1
fi

umask 077
mkdir -p "$(dirname "$target")"
openssl rand -base64 32 | tr -d '\n' >"$target"
chmod 600 "$target"

decoded_bytes="$(openssl base64 -d -A -in "$target" | wc -c | tr -d '[:space:]')"
if [ "$decoded_bytes" -ne 32 ]; then
    rm -f "$target"
    printf 'BŁĄD: wygenerowany klucz ma %s bajtów zamiast 32.\n' "$decoded_bytes" >&2
    exit 1
fi

printf 'Wygenerowano klucz AES-256: %s (32 B, base64, mode 600).\n' "$target"
printf 'keyId=%s. Nie commituj tego pliku i zrób jego kopię zapasową.\n' "${APP_CRYPTO_KEY_ID:-k1}"
