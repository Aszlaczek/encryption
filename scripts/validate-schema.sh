#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="zr02-schema-check-$$"
IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-encryption}"

cleanup() {
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Start tymczasowego PostgreSQL: $IMAGE"
docker run -d --rm --name "$CONTAINER" \
    -e POSTGRES_USER="$DB_USER" \
    -e POSTGRES_PASSWORD=test \
    -e POSTGRES_DB="$DB_NAME" \
    "$IMAGE" >/dev/null

ready=false
for _ in $(seq 1 60); do
    if docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 1
done

if [ "$ready" != "true" ]; then
    echo "PostgreSQL nie wystartował w wyznaczonym czasie." >&2
    exit 1
fi

for migration in "$ROOT_DIR"/backend/src/main/resources/db/migration/V*.sql; do
    echo "Aplikowanie $(basename "$migration")"
    docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" \
        < "$migration" >/dev/null
done

echo "Uruchamianie kontroli schematu"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" \
    < "$ROOT_DIR/scripts/validate-schema.sql"

echo "Struktura tabel:"
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
    -c '\d+ app_users' -c '\d+ messages'
