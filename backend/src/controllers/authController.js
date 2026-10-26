const argon2 = require('argon2');

const { pool } = require('../config/database');

const {
  generateAnonymousName,
} = require('../utils/anonymousNames');

const {
  generateSessionToken,
  hashSessionToken,
  getSessionExpiry,
} = require('../utils/session');


/*
|--------------------------------------------------------------------------
| Register
|--------------------------------------------------------------------------
*/

const register = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { email, password } = req.validated.body;

    await client.query('BEGIN');

    /*
    |--------------------------------------------------------------------------
    | Check existing account
    |--------------------------------------------------------------------------
    */

    const existingUser = await client.query(
      `
        SELECT id
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [email]
    );

    if (existingUser.rowCount > 0) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'An account with this email already exists.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Hash password
    |--------------------------------------------------------------------------
    */

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    /*
    |--------------------------------------------------------------------------
    | Create user
    |--------------------------------------------------------------------------
    */

    const userResult = await client.query(
      `
        INSERT INTO users (
          email,
          password_hash
        )
        VALUES ($1, $2)
        RETURNING
          id,
          account_status,
          created_at
      `,
      [email, passwordHash]
    );

    const user = userResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Generate anonymous identity
    |--------------------------------------------------------------------------
    */

    let anonymousName;

    for (
      let attempt = 0;
      attempt < 5;
      attempt += 1
    ) {
      const candidate =
        generateAnonymousName();

      const existingName =
        await client.query(
          `
            SELECT user_id
            FROM anonymous_profiles
            WHERE anonymous_name = $1
            LIMIT 1
          `,
          [candidate]
        );

      if (existingName.rowCount === 0) {
        anonymousName = candidate;
        break;
      }
    }

    if (!anonymousName) {
      throw new Error(
        'Unable to generate anonymous identity.'
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Create anonymous profile
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        INSERT INTO anonymous_profiles (
          user_id,
          anonymous_name
        )
        VALUES ($1, $2)
      `,
      [user.id, anonymousName]
    );

    await client.query('COMMIT');

    /*
    |--------------------------------------------------------------------------
    | Response
    |--------------------------------------------------------------------------
    */

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',

      user: {
        id: user.id,
        anonymousName,
        accountStatus:
          user.account_status,
        createdAt:
          user.created_at,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};


/*
|--------------------------------------------------------------------------
| Normal User Login
|--------------------------------------------------------------------------
*/

const login = async (req, res, next) => {
  try {
    const { email, password } =
      req.validated.body;

    /*
    |--------------------------------------------------------------------------
    | Find user account
    |--------------------------------------------------------------------------
    */

    const result = await pool.query(
      `
        SELECT
          u.id,
          u.password_hash,
          u.account_status,
          ap.anonymous_name
        FROM users u
        INNER JOIN anonymous_profiles ap
          ON ap.user_id = u.id
        WHERE u.email = $1
          AND u.deleted_at IS NULL
        LIMIT 1
      `,
      [email]
    );

    /*
    |--------------------------------------------------------------------------
    | Avoid revealing whether an account exists
    |--------------------------------------------------------------------------
    */

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message:
          'Invalid email or password.',
      });
    }

    const user = result.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Check account status
    |--------------------------------------------------------------------------
    */

    if (
      user.account_status !== 'ACTIVE'
    ) {
      return res.status(403).json({
        success: false,
        message:
          'This account is not currently available.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Verify password
    |--------------------------------------------------------------------------
    */

    const passwordValid =
      await argon2.verify(
        user.password_hash,
        password
      );

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message:
          'Invalid email or password.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Create secure session
    |--------------------------------------------------------------------------
    */

    const sessionToken =
      generateSessionToken();

    const tokenHash =
      hashSessionToken(sessionToken);

    const expiresAt =
      getSessionExpiry();

    await pool.query(
      `
        INSERT INTO sessions (
          user_id,
          session_token_hash,
          expires_at
        )
        VALUES ($1, $2, $3)
      `,
      [
        user.id,
        tokenHash,
        expiresAt,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | Update last login
    |--------------------------------------------------------------------------
    */

    await pool.query(
      `
        UPDATE users
        SET last_login_at = NOW()
        WHERE id = $1
      `,
      [user.id]
    );

    /*
    |--------------------------------------------------------------------------
    | Set secure HTTP-only cookie
    |--------------------------------------------------------------------------
    */

    res.cookie(
      'just_talk_session',
      sessionToken,
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          'production',

        sameSite: 'lax',

        expires: expiresAt,

        path: '/',
      }
    );

    /*
    |--------------------------------------------------------------------------
    | Response
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      accountType: 'user',

      user: {
        id: user.id,
        anonymousName:
          user.anonymous_name,
      },

      professional: null,
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Professional Login
|--------------------------------------------------------------------------
*/

const professionalLogin = async (
  req,
  res,
  next
) => {
  try {
    const { email, password } =
      req.validated.body;

    /*
    |--------------------------------------------------------------------------
    | Find professional account
    |--------------------------------------------------------------------------
    */

    const result = await pool.query(
      `
        SELECT
          u.id,
          u.password_hash,
          u.account_status,

          pp.id AS professional_profile_id,
          pp.display_name,
          pp.verification_status,
          pp.availability_status

        FROM users u

        INNER JOIN professional_profiles pp
          ON pp.user_id = u.id

        WHERE u.email = $1
          AND u.deleted_at IS NULL

        LIMIT 1
      `,
      [email]
    );

    /*
    |--------------------------------------------------------------------------
    | Avoid revealing whether an account exists
    |--------------------------------------------------------------------------
    */

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message:
          'Invalid email or password.',
      });
    }

    const professional =
      result.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Check account status
    |--------------------------------------------------------------------------
    */

    if (
      professional.account_status !==
      'ACTIVE'
    ) {
      return res.status(403).json({
        success: false,
        message:
          'This account is not currently available.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Verify password
    |--------------------------------------------------------------------------
    */

    const passwordValid =
      await argon2.verify(
        professional.password_hash,
        password
      );

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message:
          'Invalid email or password.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Create secure session
    |--------------------------------------------------------------------------
    */

    const sessionToken =
      generateSessionToken();

    const tokenHash =
      hashSessionToken(sessionToken);

    const expiresAt =
      getSessionExpiry();

    await pool.query(
      `
        INSERT INTO sessions (
          user_id,
          session_token_hash,
          expires_at
        )
        VALUES ($1, $2, $3)
      `,
      [
        professional.id,
        tokenHash,
        expiresAt,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | Update last login
    |--------------------------------------------------------------------------
    */

    await pool.query(
      `
        UPDATE users
        SET last_login_at = NOW()
        WHERE id = $1
      `,
      [professional.id]
    );

    /*
    |--------------------------------------------------------------------------
    | Set secure HTTP-only session cookie
    |--------------------------------------------------------------------------
    */

    res.cookie(
      'just_talk_session',
      sessionToken,
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          'production',

        sameSite: 'lax',

        expires: expiresAt,

        path: '/',
      }
    );

    /*
    |--------------------------------------------------------------------------
    | Return professional information
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,
      message:
        'Professional login successful.',
      accountType: 'professional',

      user: {
        id: professional.id,
        anonymousName: null,
      },

      professional: {
        id:
          professional.professional_profile_id,

        displayName:
          professional.display_name,

        verificationStatus:
          professional.verification_status,

        availabilityStatus:
          professional.availability_status,
      },
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Admin Login
|--------------------------------------------------------------------------
*/

const adminLogin = async (
  req,
  res,
  next
) => {
  try {
    const { email, password } =
      req.validated.body;

    /*
    |--------------------------------------------------------------------------
    | Find admin account
    |--------------------------------------------------------------------------
    |
    | Admin login is intentionally separate from
    | normal user and professional authentication.
    |
    | We identify the account by role = ADMIN.
    | An anonymous profile is NOT required.
    |
    */

    const result = await pool.query(
      `
        SELECT
          u.id,
          u.password_hash,
          u.account_status,
          u.role
        FROM users u
        WHERE u.email = $1
          AND u.deleted_at IS NULL
          AND u.role = 'ADMIN'
        LIMIT 1
      `,
      [email]
    );

    /*
    |--------------------------------------------------------------------------
    | Avoid revealing whether an admin account exists
    |--------------------------------------------------------------------------
    */

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message:
          'Invalid email or password.',
      });
    }

    const admin = result.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Check account status
    |--------------------------------------------------------------------------
    */

    if (
      admin.account_status !==
      'ACTIVE'
    ) {
      return res.status(403).json({
        success: false,
        message:
          'This account is not currently available.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Verify password
    |--------------------------------------------------------------------------
    */

    const passwordValid =
      await argon2.verify(
        admin.password_hash,
        password
      );

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message:
          'Invalid email or password.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Create secure session
    |--------------------------------------------------------------------------
    */

    const sessionToken =
      generateSessionToken();

    const tokenHash =
      hashSessionToken(sessionToken);

    const expiresAt =
      getSessionExpiry();

    await pool.query(
      `
        INSERT INTO sessions (
          user_id,
          session_token_hash,
          expires_at
        )
        VALUES ($1, $2, $3)
      `,
      [
        admin.id,
        tokenHash,
        expiresAt,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | Update last login
    |--------------------------------------------------------------------------
    */

    await pool.query(
      `
        UPDATE users
        SET last_login_at = NOW()
        WHERE id = $1
      `,
      [admin.id]
    );

    /*
    |--------------------------------------------------------------------------
    | Set secure HTTP-only session cookie
    |--------------------------------------------------------------------------
    */

    res.cookie(
      'just_talk_session',
      sessionToken,
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          'production',

        sameSite: 'lax',

        expires: expiresAt,

        path: '/',
      }
    );

    /*
    |--------------------------------------------------------------------------
    | Response
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,
      message:
        'Admin login successful.',
      accountType: 'admin',

      user: {
        id: admin.id,
        anonymousName: null,
      },

      professional: null,
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Logout
|--------------------------------------------------------------------------
*/

const logout = async (
  req,
  res,
  next
) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | Revoke current session
    |--------------------------------------------------------------------------
    */

    await pool.query(
      `
        UPDATE sessions
        SET revoked_at = NOW()
        WHERE id = $1
          AND revoked_at IS NULL
      `,
      [req.session.id]
    );

    /*
    |--------------------------------------------------------------------------
    | Clear session cookie
    |--------------------------------------------------------------------------
    */

    res.clearCookie(
      'just_talk_session',
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          'production',

        sameSite: 'lax',

        path: '/',
      }
    );

    return res.status(200).json({
      success: true,
      message:
        'Logout successful.',
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Current User
|--------------------------------------------------------------------------
*/

const me = async (
  req,
  res
) => {
  return res.status(200).json({
    success: true,

    accountType:
      req.user.accountType ||
      'user',

    user: {
      id: req.user.id,

      anonymousName:
        req.user.anonymousName ||
        null,
    },

    professional:
      req.user.professional ||
      null,
  });
};


/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
  register,
  login,
  professionalLogin,
  adminLogin,
  logout,
  me,
};