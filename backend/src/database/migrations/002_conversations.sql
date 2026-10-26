-- ============================================================
-- JUST TALK
-- Migration 002: Conversations and Messages
-- ============================================================


-- ============================================================
-- CONVERSATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,

    topic VARCHAR(150),

    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    ended_at TIMESTAMPTZ,

    deleted_at TIMESTAMPTZ,

    CONSTRAINT conversations_user_fk
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT conversations_status_check
        CHECK (
            status IN (
                'ACTIVE',
                'WAITING_FOR_PROFESSIONAL',
                'PROFESSIONAL_CONNECTED',
                'ENDED',
                'DELETED'
            )
        )
);


-- ============================================================
-- MESSAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    conversation_id UUID NOT NULL,

    sender_type VARCHAR(30) NOT NULL,

    sender_user_id UUID,

    content TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    deleted_at TIMESTAMPTZ,

    CONSTRAINT messages_conversation_fk
        FOREIGN KEY (conversation_id)
        REFERENCES conversations(id)
        ON DELETE CASCADE,

    CONSTRAINT messages_sender_user_fk
        FOREIGN KEY (sender_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT messages_sender_type_check
        CHECK (
            sender_type IN (
                'USER',
                'PROFESSIONAL',
                'SYSTEM'
            )
        ),

    CONSTRAINT messages_content_length_check
        CHECK (
            char_length(content) BETWEEN 1 AND 5000
        )
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_conversations_user_id
    ON conversations(user_id);

CREATE INDEX IF NOT EXISTS idx_conversations_status
    ON conversations(status);

CREATE INDEX IF NOT EXISTS idx_conversations_created_at
    ON conversations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
    ON messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_created_at
    ON messages(created_at);

CREATE INDEX IF NOT EXISTS idx_messages_sender_user_id
    ON messages(sender_user_id);


-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS conversations_updated_at
ON conversations;

CREATE TRIGGER conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();