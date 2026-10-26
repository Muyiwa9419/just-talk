
-- =========================================================
-- JUST TALK
-- COMMUNITY REPORTS
-- =========================================================

CREATE TABLE IF NOT EXISTS community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  post_id UUID NOT NULL
    REFERENCES community_posts(id)
    ON DELETE CASCADE,

  reporter_user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  reason VARCHAR(50) NOT NULL,

  details TEXT,

  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',

  reviewed_by UUID
    REFERENCES users(id)
    ON DELETE SET NULL,

  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT community_reports_reason_check
    CHECK (
      reason IN (
        'HARASSMENT',
        'HATE_OR_ABUSE',
        'THREATS',
        'SEXUAL_CONTENT',
        'SPAM',
        'SCAM',
        'SELF_HARM',
        'OTHER'
      )
    ),

  CONSTRAINT community_reports_status_check
    CHECK (
      status IN (
        'PENDING',
        'REVIEWED',
        'DISMISSED',
        'ACTION_TAKEN'
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_community_reports_post_id
  ON community_reports(post_id);

CREATE INDEX IF NOT EXISTS idx_community_reports_reporter_user_id
  ON community_reports(reporter_user_id);

CREATE INDEX IF NOT EXISTS idx_community_reports_status
  ON community_reports(status);

CREATE INDEX IF NOT EXISTS idx_community_reports_created_at
  ON community_reports(created_at DESC);
