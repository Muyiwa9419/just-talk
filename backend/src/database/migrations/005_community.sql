-- ============================================
-- JUST TALK — COMMUNITY
-- Migration 005
-- ============================================

CREATE TABLE IF NOT EXISTS community_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(120) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS community_posts (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    anonymous_profile_id INTEGER
        REFERENCES anonymous_profiles(id)
        ON DELETE SET NULL,

    category_id INTEGER NOT NULL
        REFERENCES community_categories(id)
        ON DELETE RESTRICT,

    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED'
        CHECK (
            status IN (
                'PUBLISHED',
                'HIDDEN',
                'UNDER_REVIEW',
                'REMOVED'
            )
        ),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS community_comments (
    id SERIAL PRIMARY KEY,

    post_id INTEGER NOT NULL
        REFERENCES community_posts(id)
        ON DELETE CASCADE,

    user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    anonymous_profile_id INTEGER
        REFERENCES anonymous_profiles(id)
        ON DELETE SET NULL,

    parent_comment_id INTEGER
        REFERENCES community_comments(id)
        ON DELETE CASCADE,

    content TEXT NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED'
        CHECK (
            status IN (
                'PUBLISHED',
                'HIDDEN',
                'UNDER_REVIEW',
                'REMOVED'
            )
        ),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS community_reactions (
    id SERIAL PRIMARY KEY,

    post_id INTEGER NOT NULL
        REFERENCES community_posts(id)
        ON DELETE CASCADE,

    user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    reaction_type VARCHAR(30) NOT NULL DEFAULT 'UNDERSTAND',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(post_id, user_id, reaction_type)
);

CREATE TABLE IF NOT EXISTS community_reports (
    id SERIAL PRIMARY KEY,

    reporter_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    post_id INTEGER
        REFERENCES community_posts(id)
        ON DELETE CASCADE,

    comment_id INTEGER
        REFERENCES community_comments(id)
        ON DELETE CASCADE,

    reason VARCHAR(50) NOT NULL,

    description TEXT,

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (
            status IN (
                'PENDING',
                'REVIEWED',
                'DISMISSED',
                'ACTIONED'
            )
        ),

    reviewed_by INTEGER
        REFERENCES users(id)
        ON DELETE SET NULL,

    reviewed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CHECK (
        post_id IS NOT NULL OR comment_id IS NOT NULL
    )
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_community_posts_user
ON community_posts(user_id);

CREATE INDEX IF NOT EXISTS idx_community_posts_category
ON community_posts(category_id);

CREATE INDEX IF NOT EXISTS idx_community_posts_status
ON community_posts(status);

CREATE INDEX IF NOT EXISTS idx_community_posts_created
ON community_posts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_comments_post
ON community_comments(post_id);

CREATE INDEX IF NOT EXISTS idx_community_comments_parent
ON community_comments(parent_comment_id);

CREATE INDEX IF NOT EXISTS idx_community_reports_status
ON community_reports(status);

-- ============================================
-- DEFAULT CATEGORIES
-- ============================================

INSERT INTO community_categories
    (name, slug, description, icon)
VALUES
    (
        'Relationships',
        'relationships',
        'Dating, friendship, marriage and relationship experiences.',
        '💙'
    ),
    (
        'Family',
        'family',
        'Family situations, parenting, expectations and conflicts.',
        '🏠'
    ),
    (
        'Career & Money',
        'career-money',
        'Work, unemployment, business, career and financial experiences.',
        '💼'
    ),
    (
        'School & Education',
        'school-education',
        'School, university, exams and educational experiences.',
        '🎓'
    ),
    (
        'Personal Growth',
        'personal-growth',
        'Confidence, habits, self-development and life experiences.',
        '🌱'
    ),
    (
        'Wellbeing',
        'wellbeing',
        'Stress, loneliness, emotional experiences and general wellbeing.',
        '🫂'
    ),
    (
        'Legal & Social Issues',
        'legal-social',
        'Legal questions and difficult social situations.',
        '⚖️'
    ),
    (
        'Sexual Health',
        'sexual-health',
        'Questions and experiences around sexual health.',
        '❤️'
    ),
    (
        'General',
        'general',
        'Everything else.',
        '💬'
    )
ON CONFLICT (slug) DO NOTHING;