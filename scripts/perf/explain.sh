#!/usr/bin/env bash
# ZR-23: query plans for the message list on the real Compose database.
#   ./scripts/perf/explain.sh [owner] [near-offset] [deep-offset]
# Offsets are 0-based row numbers; the cursor points at that row and the plan shows
# the following page. Defaults: perf_heavy, 990 (page 100 at limit 10) and 49890
# (near the end of 50 000 rows).
set -euo pipefail

OWNER="${1:-perf_heavy}"
NEAR_OFFSET="${2:-990}"
DEEP_OFFSET="${3:-49890}"

psql_db() {
    docker compose exec -T db psql -v ON_ERROR_STOP=1 -U encryption -d encryption "$@"
}

OWNER_ID="$(psql_db -tAc "select id from app_users where username = '${OWNER}'")"
if [ -z "$OWNER_ID" ]; then
    echo "Brak użytkownika ${OWNER}; uruchom najpierw scripts/perf/seed.sql." >&2
    exit 1
fi

cursor_at() {
    psql_db -tAc "
        select m.created_at, m.id
        from messages m
        where m.owner_id = '${OWNER_ID}'
        order by m.created_at desc, m.id desc
        offset $1 limit 1"
}

NEAR="$(cursor_at "$NEAR_OFFSET")"
DEEP="$(cursor_at "$DEEP_OFFSET")"
NEAR_TS="${NEAR%%|*}"
NEAR_ID="${NEAR##*|}"
DEEP_TS="${DEEP%%|*}"
DEEP_ID="${DEEP##*|}"

psql_db <<SQL
\echo '=== 1. Pierwsza strona, wszystkie kolumny encji (stan wyjściowy) ==='
explain (analyze, buffers, costs off)
select *
from messages
where owner_id = '${OWNER_ID}'
order by created_at desc, id desc
limit 11;

\echo '=== 2. Pierwsza strona, projekcja id + created_at ==='
explain (analyze, buffers, costs off)
select id, created_at
from messages
where owner_id = '${OWNER_ID}'
order by created_at desc, id desc
limit 11;

\echo '=== 3. Kursor OR (stan wyjściowy), offset ${NEAR_OFFSET} ==='
explain (analyze, buffers, costs off)
select *
from messages
where owner_id = '${OWNER_ID}'
  and (created_at < '${NEAR_TS}' or (created_at = '${NEAR_TS}' and id < '${NEAR_ID}'))
order by created_at desc, id desc
limit 11;

\echo '=== 4. Kursor row-value, offset ${NEAR_OFFSET} ==='
explain (analyze, buffers, costs off)
select id, created_at
from messages
where owner_id = '${OWNER_ID}'
  and (created_at, id) < ('${NEAR_TS}', '${NEAR_ID}')
order by created_at desc, id desc
limit 11;

\echo '=== 5. Kursor OR, głęboko (offset ${DEEP_OFFSET}) ==='
explain (analyze, buffers, costs off)
select *
from messages
where owner_id = '${OWNER_ID}'
  and (created_at < '${DEEP_TS}' or (created_at = '${DEEP_TS}' and id < '${DEEP_ID}'))
order by created_at desc, id desc
limit 11;

\echo '=== 6. Kursor row-value, głęboko (offset ${DEEP_OFFSET}) ==='
explain (analyze, buffers, costs off)
select id, created_at
from messages
where owner_id = '${OWNER_ID}'
  and (created_at, id) < ('${DEEP_TS}', '${DEEP_ID}')
order by created_at desc, id desc
limit 11;

\echo '=== 7. Dla porównania: OFFSET ${DEEP_OFFSET} bez kursora ==='
explain (analyze, buffers, costs off)
select id, created_at
from messages
where owner_id = '${OWNER_ID}'
order by created_at desc, id desc
offset ${DEEP_OFFSET}
limit 11;
SQL
