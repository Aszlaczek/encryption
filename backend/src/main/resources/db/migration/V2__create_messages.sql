-- ZR-02: encrypted messages
-- The table stores only the encrypted envelope. There is intentionally no plaintext,
-- content or title column. One user owns many messages (1:N); user_messages is not used.

create table messages (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    nonce bytea not null,
    ciphertext bytea not null,
    tag bytea not null,
    key_id varchar(32) not null,
    format_version smallint not null default 1,
    algorithm varchar(32) not null default 'AES-256-GCM',
    created_at timestamptz not null default now(),

    constraint messages_owner_fk
        foreign key (owner_id) references app_users (id) on delete cascade,
    constraint messages_nonce_length check (octet_length(nonce) = 12),
    constraint messages_ciphertext_length check (octet_length(ciphertext) between 1 and 40000),
    constraint messages_tag_length check (octet_length(tag) = 16),
    constraint messages_key_id_format check (key_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
    constraint messages_format_version_positive check (format_version >= 1),
    constraint messages_algorithm_supported check (algorithm = 'AES-256-GCM')
);

create index idx_messages_owner_created_id
    on messages (owner_id, created_at desc, id desc);

comment on table messages is
    'Encrypted message envelopes. No plaintext message content is stored.';
comment on column messages.owner_id is
    'Single owner of the message; ownership is enforced by application queries.';
comment on column messages.nonce is
    'AES-GCM nonce (IV), exactly 12 bytes.';
comment on column messages.ciphertext is
    'AES-GCM ciphertext, at most 40000 bytes.';
comment on column messages.tag is
    'AES-GCM authentication tag, exactly 16 bytes.';
comment on column messages.key_id is
    'Identifier of the key used for encryption, e.g. k1.';
comment on column messages.format_version is
    'Envelope format version; 1 for the current format.';
