const { pool } = require('../config/database');

const {
  hashSessionToken,
} = require('../utils/session');

const requireAuth = async (
  req,
  res,
  next
) => {
  try {
    const sessionToken =
      req.cookies.just_talk_session;

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const tokenHash =
      hashSessionToken(sessionToken);

    const result = await pool.query(
      `
        SELECT
          s.id AS session_id,
          s.user_id,
          s.expires_at,

          u.role,
          u.account_status,

          ap.anonymous_name,

          pp.id AS professional_profile_id,
          pp.display_name,
          pp.verification_status,
          pp.availability_status

        FROM sessions s

        INNER JOIN users u
          ON u.id = s.user_id

        LEFT JOIN anonymous_profiles ap
          ON ap.user_id = u.id

        LEFT JOIN professional_profiles pp
          ON pp.user_id = u.id

        WHERE s.session_token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
          AND u.deleted_at IS NULL
          AND u.account_status = 'ACTIVE'

        LIMIT 1
      `,
      [tokenHash]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message:
          'Session is invalid or expired.',
      });
    }

    const session =
      result.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Determine account type
    |--------------------------------------------------------------------------
    |
    | ADMIN must be checked first.
    | PROFESSIONAL is determined by the user's
    | professional profile.
    | Everyone else is treated as a normal USER.
    |
    */

    let accountType = 'user';

    if (session.role === 'ADMIN') {
      accountType = 'admin';
    } else if (
      session.professional_profile_id
    ) {
      accountType = 'professional';
    }

    /*
    |--------------------------------------------------------------------------
    | Store authenticated user
    |--------------------------------------------------------------------------
    */

    req.user = {
      id: session.user_id,

      accountType,

      role: session.role,

      anonymousName:
        session.anonymous_name || null,

      professional:
        session.professional_profile_id
          ? {
              id:
                session.professional_profile_id,

              displayName:
                session.display_name,

              verificationStatus:
                session.verification_status,

              availabilityStatus:
                session.availability_status,
            }
          : null,
    };

    /*
    |--------------------------------------------------------------------------
    | Store session information
    |--------------------------------------------------------------------------
    */

    req.session = {
      id: session.session_id,
      expiresAt: session.expires_at,
    };

    /*
    |--------------------------------------------------------------------------
    | Update last used timestamp
    |--------------------------------------------------------------------------
    */

    await pool.query(
      `
        UPDATE sessions
        SET last_used_at = NOW()
        WHERE id = $1
      `,
      [session.session_id]
    );

    return next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requireAuth,
};