/*
|--------------------------------------------------------------------------
| Professional Matching Requests
|--------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS matching_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    conversation_id UUID NOT NULL
        REFERENCES conversations(id)
        ON DELETE CASCADE,

    category VARCHAR(100) NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'WAITING'
        CHECK (
            status IN (
                'WAITING',
                'MATCHED',
                'ACCEPTED',
                'CANCELLED',
                'EXPIRED'
            )
        ),

    professional_id UUID
        REFERENCES professional_profiles(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    matched_at TIMESTAMPTZ,

    accepted_at TIMESTAMPTZ,

    cancelled_at TIMESTAMPTZ,

    expires_at TIMESTAMPTZ
);

/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

CREATE INDEX IF NOT EXISTS
idx_matching_requests_waiting
ON matching_requests(
    status,
    category,
    created_at
);

CREATE INDEX IF NOT EXISTS
idx_matching_requests_user
ON matching_requests(user_id);

CREATE INDEX IF NOT EXISTS
idx_matching_requests_professional
ON matching_requests(professional_id);

CREATE INDEX IF NOT EXISTS
idx_matching_requests_conversation
ON matching_requests(conversation_id);