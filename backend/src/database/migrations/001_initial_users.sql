-- ============================================================
-- JUST TALK
-- Migration 001: Users, Anonymous Profiles and Sessions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- USERS
-- Private account information
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email VARCHAR(255) UNIQUE,

    phone VARCHAR(30) UNIQUE,

    password_hash TEXT NOT NULL,

    account_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    email_verified BOOLEAN NOT NULL DEFAULT FALSE,

    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    last_login_at TIMESTAMPTZ,

    deleted_at TIMESTAMPTZ,

    CONSTRAINT users_contact_required
        CHECK (
            email IS NOT NULL
            OR phone IS NOT NULL
        ),

    CONSTRAINT users_account_status_check
        CHECK (
            account_status IN (
                'ACTIVE',
                'SUSPENDED',
                'DEACTIVATED',
                'PENDING_DELETION'
            )
        )
);


-- ============================================================
-- ANONYMOUS PROFILES
-- Public-facing identity inside Just Talk
-- ============================================================

CREATE TABLE IF NOT EXISTS anonymous_profiles (
    user_id UUID PRIMARY KEY,

    anonymous_name VARCHAR(80) NOT NULL UNIQUE,

    avatar_key VARCHAR(100),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT anonymous_profiles_user_fk
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);


-- ============================================================
-- SESSIONS
-- Authentication/session records
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,

    session_token_hash TEXT NOT NULL UNIQUE,

    expires_at TIMESTAMPTZ NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    last_used_at TIMESTAMPTZ,

    revoked_at TIMESTAMPTZ,

    ip_hash TEXT,

    user_agent_hash TEXT,

    CONSTRAINT sessions_user_fk
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_account_status
    ON users(account_status);

CREATE INDEX IF NOT EXISTS idx_users_deleted_at
    ON users(deleted_at);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
    ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_sessions_active
    ON sessions(user_id, expires_at)
    WHERE revoked_at IS NULL;


-- ============================================================
-- UPDATED_AT FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS users_updated_at
ON users;

CREATE TRIGGER users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


DROP TRIGGER IF EXISTS anonymous_profiles_updated_at
ON anonymous_profiles;

CREATE TRIGGER anonymous_profiles_updated_at
BEFORE UPDATE ON anonymous_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();