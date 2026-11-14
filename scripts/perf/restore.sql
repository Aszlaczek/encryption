-- ZR-23: restore original 32 messages for alice and bob.
-- Run: docker compose exec -T db psql -U encryption -d encryption < scripts/perf/restore.sql

create or replace function gen_random_ciphertext(pct smallint) returns bytea language plpgsql as \$\$
declare
    v_len int;
    v_result bytea;
begin
    if pct < 90 then
        v_len := 128 + (random() * 383)::int;
    elsif pct < 99 then
        v_len := 8192;
    else
        v_len := 40000;
    end if;
    v_result := decode(repeat('ab', v_len), 'hex');
    return v_result;
end;
\$\$ language plpgsql;

insert into messages (owner_id, nonce, ciphertext, tag, key_id, format_version, algorithm, created_at)
select
    u.id,
    decode(substr(md5('nonce-' || u.username), 1, 24), 'hex'),
    gen_random_ciphertext(random() * 100::smallint),
    decode(substr(md5('tag-' || u.username), 1, 32), 'hex'),
    'k1',
    1,
    'AES-256-GCM',
    timestamptz '2026-01-01 00:00:00+00' + (random() * 365 || ' days')::interval
from app_users u
cross join generate_series(1, 16) s
on conflict do nothing;

select count(*) as total_messages;
select owner_id, count(*) as messages_per_user from messages group by owner_id order by owner_id;