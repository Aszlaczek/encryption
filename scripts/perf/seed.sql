-- ZR-23: deterministic performance dataset (100 000 encrypted messages).
-- Run inside the Compose database:
--   docker compose exec -T db psql -v ON_ERROR_STOP=1 -U encryption -d encryption \
--     < scripts/perf/seed.sql
--
-- Users perf_* copy alice's Argon2id hash, so they use the demo password
-- `AliceDemo123!`. The demo accounts are never modified. Cleanup is in cleanup.sql.
-- The script is idempotent: existing perf_ messages/users are removed first.

\set ON_ERROR_STOP on

begin;

delete from app_users where username in
    ('perf_heavy', 'perf_a', 'perf_b', 'perf_c', 'perf_d', 'perf_e', 'perf_crypto');

insert into app_users (username, password_hash)
select name, (select password_hash from app_users where username = 'alice')
from (values
    ('perf_heavy'),
    ('perf_a'),
    ('perf_b'),
    ('perf_c'),
    ('perf_d'),
    ('perf_e'),
    ('perf_crypto')
) as perf(name);

commit;

-- Size mix: 90% 128-512 B, 9% 8192 B, 1% 40000 B.
-- created_at: one deterministic value per row and owner, spread from 2026-01-01.
-- nonce/tag come from md5() so every row has unique 12 B / 16 B values while all
-- CHECK constraints stay satisfied.
insert into messages
    (owner_id, nonce, ciphertext, tag, key_id, format_version, algorithm, created_at)
select
    owner.id,
    decode(substr(md5(owner.username || ':' || series.i || ':nonce'), 1, 24), 'hex'),
    decode(repeat('ab', case
        when series.i % 100 = 0 then 40000
        when series.i % 100 < 10 then 8192
        else 128 + (series.i * 37 % 385)
    end), 'hex'),
    decode(substr(md5(owner.username || ':' || series.i || ':tag'), 1, 32), 'hex'),
    'k1',
    1,
    'AES-256-GCM',
    timestamptz '2026-01-01 00:00:00+00' + (series.i || ' minutes')::interval
from (values
    ('perf_heavy', 50000),
    ('perf_a', 10000),
    ('perf_b', 10000),
    ('perf_c', 10000),
    ('perf_d', 10000),
    ('perf_e', 10000)
) as dataset(username, message_count)
join app_users owner on owner.username = dataset.username
cross join lateral generate_series(1, dataset.message_count) as series(i);

analyze app_users;
vacuum (analyze) messages;

select u.username, count(m.id) as messages, pg_size_pretty(sum(octet_length(m.ciphertext))) as ciphertext
from app_users u
left join messages m on m.owner_id = u.id
where u.username like 'perf\_%'
group by u.username
order by u.username;
