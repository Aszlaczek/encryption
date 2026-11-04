\set ON_ERROR_STOP on

\echo '1/10 Poprawne dane...'
insert into app_users (username, password_hash)
values ('alice', '$2a$12$01234567890123456789012345678901234567890123456789012');

insert into messages (owner_id, nonce, ciphertext, tag, key_id, format_version)
values (
    (select id from app_users where username = 'alice'),
    decode(repeat('00', 12), 'hex'),
    decode('deadbeef', 'hex'),
    decode(repeat('11', 16), 'hex'),
    'k1',
    1
);

\echo '2/10 Unikalność username...'
do $$
begin
    begin
        insert into app_users (username, password_hash) values ('alice', 'x');
        raise exception 'Oczekiwano naruszenia unikalności username';
    exception
        when unique_violation then null;
    end;
end
$$;

\echo '3/10 Normalizacja username (wielkie litery)...'
do $$
begin
    begin
        insert into app_users (username, password_hash) values ('Alice', 'x');
        raise exception 'Oczekiwano naruszenia CHECK dla username';
    exception
        when check_violation then null;
    end;
end
$$;

\echo '4/10 Długość nonce...'
do $$
begin
    begin
        insert into messages (owner_id, nonce, ciphertext, tag, key_id)
        values (
            (select id from app_users where username = 'alice'),
            decode('00', 'hex'),
            decode('aa', 'hex'),
            decode(repeat('11', 16), 'hex'),
            'k1'
        );
        raise exception 'Oczekiwano naruszenia CHECK dla nonce';
    exception
        when check_violation then null;
    end;
end
$$;

\echo '5/10 Długość tagu...'
do $$
begin
    begin
        insert into messages (owner_id, nonce, ciphertext, tag, key_id)
        values (
            (select id from app_users where username = 'alice'),
            decode(repeat('00', 12), 'hex'),
            decode('aa', 'hex'),
            decode('11', 'hex'),
            'k1'
        );
        raise exception 'Oczekiwano naruszenia CHECK dla tagu';
    exception
        when check_violation then null;
    end;
end
$$;

\echo '6/10 Pusty ciphertext...'
do $$
begin
    begin
        insert into messages (owner_id, nonce, ciphertext, tag, key_id)
        values (
            (select id from app_users where username = 'alice'),
            decode(repeat('00', 12), 'hex'),
            decode('', 'hex'),
            decode(repeat('11', 16), 'hex'),
            'k1'
        );
        raise exception 'Oczekiwano naruszenia CHECK dla pustego ciphertext';
    exception
        when check_violation then null;
    end;
end
$$;

\echo '7/10 Maksymalny ciphertext...'
do $$
begin
    begin
        insert into messages (owner_id, nonce, ciphertext, tag, key_id)
        values (
            (select id from app_users where username = 'alice'),
            decode(repeat('00', 12), 'hex'),
            decode(repeat('aa', 40001), 'hex'),
            decode(repeat('11', 16), 'hex'),
            'k1'
        );
        raise exception 'Oczekiwano naruszenia CHECK dla zbyt dużego ciphertext';
    exception
        when check_violation then null;
    end;
end
$$;

\echo '8/10 Klucz obcy owner_id...'
do $$
begin
    begin
        insert into messages (owner_id, nonce, ciphertext, tag, key_id)
        values (
            '00000000-0000-0000-0000-000000000000',
            decode(repeat('00', 12), 'hex'),
            decode('aa', 'hex'),
            decode(repeat('11', 16), 'hex'),
            'k1'
        );
        raise exception 'Oczekiwano naruszenia klucza obcego owner_id';
    exception
        when foreign_key_violation then null;
    end;
end
$$;

\echo '9/10 Kaskadowe usuwanie wiadomości...'
insert into app_users (username, password_hash) values ('bob', 'x');
insert into messages (owner_id, nonce, ciphertext, tag, key_id)
values (
    (select id from app_users where username = 'bob'),
    decode(repeat('00', 12), 'hex'),
    decode('aa', 'hex'),
    decode(repeat('11', 16), 'hex'),
    'k1'
);

do $$
declare
    bob_id uuid;
begin
    select id into bob_id from app_users where username = 'bob';
    delete from app_users where id = bob_id;

    if exists (select 1 from messages where owner_id = bob_id) then
        raise exception 'Kaskada nie usunęła wiadomości użytkownika';
    end if;
end
$$;

\echo '10/10 Indeks, klucz obcy i brak kolumn plaintext...'
do $$
begin
    if not exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and tablename = 'messages'
          and indexname = 'idx_messages_owner_created_id'
    ) then
        raise exception 'Brak indeksu idx_messages_owner_created_id';
    end if;

    if not exists (
        select 1
        from information_schema.table_constraints
        where constraint_schema = 'public'
          and constraint_name = 'messages_owner_fk'
          and constraint_type = 'FOREIGN KEY'
    ) then
        raise exception 'Brak klucza obcego messages_owner_fk';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name in ('app_users', 'messages')
          and column_name in ('password', 'content', 'plaintext', 'body', 'title')
    ) then
        raise exception 'Znaleziono zabronioną kolumnę plaintext/password/title';
    end if;

    if exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'user_messages'
    ) then
        raise exception 'Tabela user_messages nie powinna istnieć w modelu 1:N';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'messages'
          and column_name = 'owner_id'
          and is_nullable = 'YES'
    ) then
        raise exception 'Kolumna owner_id musi być NOT NULL';
    end if;
end
$$;

\echo 'Wszystkie kontrole schematu zakończone powodzeniem.'
select 'OK' as validation_result;
