const { pool } = require('../config/database');


/*
|--------------------------------------------------------------------------
| Require Admin
|--------------------------------------------------------------------------
|
| This middleware must run AFTER requireAuth.
|
| requireAuth establishes:
|
| req.user.id
|
| This middleware then checks the user's role directly in the database.
|
*/

const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const result = await pool.query(
      `
        SELECT
          id,
          role,
          account_status
        FROM users
        WHERE id = $1
      `,
      [req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: 'User account not found.',
      });
    }

    const user = result.rows[0];

    if (user.account_status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Your account is not active.',
      });
    }

    if (user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Administrator access required.',
      });
    }

    req.admin = {
      id: user.id,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};


module.exports = {
  requireAdmin,
};