-- ZR-23: remove the performance dataset. Messages disappear through ON DELETE CASCADE.
--   docker compose exec -T db psql -v ON_ERROR_STOP=1 -U encryption -d encryption \
--     < scripts/perf/cleanup.sql

\set ON_ERROR_STOP on

begin;

delete from app_users where username in
    ('perf_heavy', 'perf_a', 'perf_b', 'perf_c', 'perf_d', 'perf_e', 'perf_crypto');

commit;

vacuum (analyze) messages;
vacuum (analyze) app_users;

select count(*) as remaining_messages from messages;
select count(*) as remaining_users from app_users;
