-- ZR-07: password hashing changed from BCrypt to Argon2id.
-- This migration only corrects the column comment; the table structure is unchanged.

comment on column app_users.password_hash is
    'Argon2id password hash; never a plaintext password.';
