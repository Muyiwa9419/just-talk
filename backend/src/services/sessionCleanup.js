const { pool } = require('../config/database');

/*
|--------------------------------------------------------------------------
| Session Cleanup
|--------------------------------------------------------------------------
|
| Removes:
|
| 1. Sessions that have expired.
| 2. Revoked sessions older than 7 days.
|
| Recently revoked sessions are retained for a short period so they remain
| available for operational/security auditing.
|
*/

const cleanupSessions = async () => {
  try {
    const result = await pool.query(
      `
        DELETE FROM sessions
        WHERE expires_at <= NOW()
           OR (
             revoked_at IS NOT NULL
             AND revoked_at <= NOW() - INTERVAL '7 days'
           )
        RETURNING id
      `
    );

    if (result.rowCount > 0) {
      console.log(
        `Session cleanup: removed ${result.rowCount} expired/revoked session(s).`
      );
    }
  } catch (error) {
    console.error(
      'Session cleanup failed:',
      error.message
    );
  }
};

module.exports = {
  cleanupSessions,
};