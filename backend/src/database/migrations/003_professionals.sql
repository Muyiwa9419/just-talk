/*
|--------------------------------------------------------------------------
| Professional Profiles
|--------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS professional_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL UNIQUE
        REFERENCES users(id)
        ON DELETE CASCADE,

    display_name VARCHAR(100) NOT NULL,

    bio TEXT,

    categories TEXT[] NOT NULL DEFAULT '{}',

    verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (
            verification_status IN (
                'PENDING',
                'APPROVED',
                'REJECTED',
                'SUSPENDED'
            )
        ),

    availability_status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE'
        CHECK (
            availability_status IN (
                'OFFLINE',
                'AVAILABLE',
                'BUSY'
            )
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

CREATE INDEX IF NOT EXISTS
idx_professional_profiles_verification_status
ON professional_profiles(verification_status);

CREATE INDEX IF NOT EXISTS
idx_professional_profiles_availability_status
ON professional_profiles(availability_status);

CREATE INDEX IF NOT EXISTS
idx_professional_profiles_available
ON professional_profiles(
    verification_status,
    availability_status
);