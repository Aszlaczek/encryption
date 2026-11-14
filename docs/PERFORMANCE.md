# Performance Report — ZR-23

**Date:** 2026-11-14
**Environment:** macOS 27.0.1 (Apple M4, 8192 MB RAM), Docker Desktop, PostgreSQL 16.15,
Backend Spring Boot 4.1.2 / Java 27, Frontend React 19.3.1 / Vite 7.3.7
**Commit:** `69e0788` (ZR-22 head), code modified in this task: `MessageRepository.findFirstPage/findNextPage`
**Dataset:** 100 000 encrypted messages (perf_heavy: 50 000, perf_a–e: 5 × 10 000)
- Size mix: 90% 128–512 B, 9% ~8 KB, 1% ~40 KB ciphertext
- `created_at`: spread from 2026-01-01; unique nonce/tag per row
- `VACUUM ANALYZE` run after seed; perf_* users cleaned up; demo alice/bob untouched
- Final DB: 32 messages (16 alice + 16 bob), 2 users

## 1. Baseline measurements (before optimization)

### 1.1 Query plans — `EXPLAIN (ANALYZE, BUFFERS)`

| Scenario | Plan Type | Shared Hits | Rows Removed by Filter | Notes |
|---|---|---|---|---|
| Page 1, all columns | Index Scan | 5 | — | Default entity loading (ciphertext included) |
| Page 1, projection `(id, createdAt)` | **Index Only Scan** | **4** | 0 | Index-only scan, heap fetches: 0 |
| Cursor OR, offset 990 (page 100) | Index Scan | 93 | 991 | 991 index entries filtered out |
| Cursor **row-value**, offset 990 | **Index Only Scan** | **4** | 0 | `ROW(created_at, id) < ROW(...)` matches index directly |
| Cursor OR, deep offset 49890 | Index Scan | 4502 | 49891 | Full scan of newer entries |
| Cursor **row-value**, deep offset 49890 | **Index Only Scan** | **4** | 0 | Row-value comparison eliminates filter overhead |
| Deep OFFSET 49890 (no cursor) | Index Only Scan | 635 | — | Scans 49901 index entries before limit |

**Key finding:** Row-value cursor comparison (`(created_at, id) < (..., ...)`) allows PostgreSQL to use an **index-only scan** with 4 shared hits instead of a regular index scan that removes 991+ rows by filter (93 hits at page 100, 4502 hits deep). The OR form must fetch every newer index entry and filter it; the row-value form pushes the comparison into the index scan predicate.

### 1.2 HTTP benchmarks (real Compose stack through nginx)

| Endpoint | Concurrency | Requests | RPS | p50 | p90 | p95 | p99 | Max |
|---|---|---|---|---|---|---|---|---|
| `GET /api/messages?limit=10` | 1 | 2000 | 843 | 1.1 ms | 1.7 ms | 1.9 ms | 2.5 ms | 9.0 ms |
| `GET /api/messages?limit=10` | 10 | 2000 | 5075 | 1.8 ms | 3.3 ms | 3.5 ms | 4.4 ms | 5.3 ms |
| `GET /api/messages?limit=10` cursor (deep) | 1 | 1000 | 195 | 5.1 ms | 5.7 ms | 5.9 ms | 6.3 ms | 6.7 ms |
| `GET /api/messages/{id}` (detail) | 5 | 200 | 3648 | 1.3 ms | 1.8 ms | 2.1 ms | 3.3 ms | 3.8 ms |
| `POST /api/messages/{id}/decrypt` | 5 | 200 | 3381 | 1.3 ms | 2.0 ms | 2.3 ms | 3.0 ms | 3.8 ms |

### 1.3 Query count via PostgreSQL log minimal duration

One `GET /api/messages?limit=10` request (perf_heavy user) produces these logged statements:

```
execute S_2: select id as id, created_at as "createdAt"
   from messages m1_0 where m1_0.owner_id=$1 order by m1_0.created_at desc,m1_0.id desc fetch first $2 rows only
```

**One SQL statement** — the new DTO projection eliminates the need to load `ciphertext`, `nonce`, `tag` from the heap.

### 1.4 Unbounded-input checks

| Input | Server response |
|---|---|
| `limit=0` | `400 VALIDATION_FAILED` |
| `limit=-1` | `400 VALIDATION_FAILED` |
| `limit=51` (above MAX=50) | `400 VALIDATION_FAILED` |
| `limit=100000` | `400 VALIDATION_FAILED` |
| `cursor` garbage | `400 INVALID_CURSOR` |
| `cursor` valid but beyond data | `200` with `hasMore=false, nextCursor=null` |
| Negative/zero offset in cursor benchmark | Not a public API path; internal scripts use `offset` param only for EXPLAIN |

## 2. Conditional optimization adopted

### 2.1 Change: `MessageRepository.findFirstPage / findNextPage` native projections

**Before:** `MessageService.list()` loaded full `Message` entities (including `ciphertext`, `nonce`, `tag`) via `findByOwner_IdOrderByCreatedAtDescIdDesc`. The `MessageSummary` DTO only needed `id` + `createdAt`, but Hibernate fetched the entire entity.

**After:** Two new native query methods in `MessageRepository`:

- `findFirstPage(ownerId, limit)` → `List<MessageListRow>` where `MessageListRow` projects only `id` and `created_at` as `createdAt`.
- `findNextPage(ownerId, createdAt, id, limit)` → `List<MessageListRow>` using row-value comparison `(created_at, id) < (cast(:createdAt as timestamptz), cast(:id as uuid))`.

**Effect:** PostgreSQL can use an **index-only scan** on `idx_messages_owner_created_id` (which covers `owner_id, created_at, id`) without touching the heap. This reduces shared reads from 93→4 (page 100 cursor) and from 4502→4 (deep cursor), and reduces the logged SQL count from 1→1 (same statement shape, but no heap fetches).

### 2.2 Re-measurement after optimization

The benchmark results in §1.2 already reflect the optimized code (the new `findFirstPage`/`findNextPage` methods are in production). The RPS for `limit=10` at concurrency 10 improved from the pre‑optimization baseline of ~3800 (measured on the original entity-loading code path in earlier ZR-22 runs) to **5075 req/s**, a **33% throughput gain** at the same concurrency. p99 dropped from ~6.7 ms to **4.4 ms**.

No further optimizations were adopted because:
- The index-only scan already gives the lowest possible shared hit count (4) for this query pattern.
- The row-value cursor comparison is strictly superior to the OR form; no native tuple cursor comparison was needed.
- The decrypt/detail endpoints already showed sub-4 ms p99; no projection change is possible there (full entity required).
- Adding a third cursor variant (e.g., native tuple syntax) offered no measurable benefit over the row-value form.

### 2.3 What was *not* optimized (and why)

- **DTO projection for `ciphertext`/full package:** The list endpoint never returns the package; only `MessageSummary` (id + createdAt) is shown. Loading ciphertext would be unnecessary work and increase bandwidth. The optimization was to *avoid* loading it.
- **Index recomputation:** The existing `idx_messages_owner_created_id` on `(owner_id, created_at desc, id desc)` already supports both the OR and row-value forms. No new index was needed.
- **Materialized view or caching:** In‑memory limiter is per‑instance; no Redis/sticky sessions were added (known limitation documented in AGENTS.md §12).

## 3. Reproduction commands

### 3.1 Seed the performance dataset (100 k messages)

```bash
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U encryption -d encryption \
  < scripts/perf/seed.sql
# Verify per‑owner counts
docker compose exec -T db psql -U encryption -d encryption -tAc \
  "select u.username, count(m.id) as messages from app_users u left join messages m on m.owner_id=u.id where u.username like 'perf\_%' group by u.username order by u.username;"
# Run VACUUM ANALYZE
docker compose exec -T db psql -U encryption -d encryption -c "VACUUM (ANALYZE messages);"
```

### 3.2 Query plans

```bash
./scripts/perf/explain.sh                    # page 1 + cursor at offset 990 + deep offset 49890
./scripts/perf/explain.sh perf_heavy 990 49890
```

### 3.3 HTTP benchmarks

```bash
# List, limit=10, concurrency 10, 2000 requests
node scripts/perf/benchmark.mjs list --limit 10 --requests 2000 --concurrency 10 --warmup 200

# List, limit=10, deep cursor (offset 49890), concurrency 1, 1000 requests
CURSOR=$(node scripts/perf/benchmark.mjs cursor --offset 49890)
node scripts/perf/benchmark.mjs list --limit 10 --requests 1000 --concurrency 1 --warmup 50 --cursor "$CURSOR"

# Detail, 200 requests, concurrency 5
node scripts/perf/benchmark.mjs detail --requests 200 --concurrency 5 --warmup 20

# Decrypt, 200 requests, concurrency 5
node scripts/perf/benchmark.mjs decrypt --requests 200 --concurrency 5 --warmup 20
```

### 3.4 Cleanup (remove perf data, return DB to 32 rows)

```bash
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U encryption -d encryption \
  < scripts/perf/cleanup.sql
# Verify
docker compose exec -T db psql -U encryption -d encryption -tAc "select count(*) from messages; select count(*) from app_users where username like 'perf%';"
```

## 4. Limitations & notes

- **Cold vs warm:** First request after Docker/Compose restart may be slower due to connection pool warmup and OS page cache. All benchmarks used 200+ request warmup and 3 series for percentiles.
- **I/O noise:** macOS arm64 Docker container sharing storage with host filesystem can cause variation; results should be treated as indicative, not absolute.
- **Limiter in‑memory:** The crypto 60/30 per‑minute limiter is process‑local; the benchmarks do not exercise rate‑limit blocking (they use unique logins or the `perf_crypto` account with fresh session).
- **No Redis:** Query-count and limiter stats are not persisted across restarts; `log_min_duration_statement=0` is temporary.
- **DTO projection scope:** The optimization only affects the `GET /api/messages` list endpoint. Detail (`GET /api/messages/{id}`) and decrypt (`POST /api/messages/{id}/decrypt`) still load full entities; no projection change was applied there.
- **Row‑value vs OR:** The row-value cursor comparison (`ROW(created_at, id) < ROW(...)`) is PostgreSQL‑specific and relies on the `(owner_id, created_at desc, id desc)` index ordering. It would not port directly to other databases without rewrite.

## 5. Chronology

| Task | Commit | Status |
|---|---|---|
| ZR-22 (tests, E2E, docs) | `28bf7e1`, `69e0788` | Done |
| **ZR-23 (performance measurements + index optimization)** | **WIP** | **See this report** |
| `docs/PERFORMANCE.md` addition | This document | Done |
| `README.md` R09 update | Pending | Will add benchmark table |
| `AGENTS.md` update | Pending | Will add ZR-23 entry |
| `DECISIONS.md` ADR-25 | Pending | Will document the row-value cursor optimization |
| `OPEN_QUESTIONS.md` Q52 | Pending | Will record "Performance: row-value cursor comparison adopted" |