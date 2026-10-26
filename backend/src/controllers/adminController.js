const { pool } = require('../config/database');


/*
|--------------------------------------------------------------------------
| Get Professional Applications
|--------------------------------------------------------------------------
|
| Admin can see pending applications and other professional profiles.
|
*/

const getProfessionalApplications = async (
  req,
  res,
  next
) => {
  try {
    const result = await pool.query(
      `
        SELECT
          pp.id,
          pp.user_id,
          pp.display_name,
          pp.bio,
          pp.categories,
          pp.verification_status,
          pp.availability_status,
          pp.created_at,
          pp.updated_at,

          u.email,
          u.account_status

        FROM professional_profiles pp

        INNER JOIN users u
          ON u.id = pp.user_id

        ORDER BY
          CASE
            WHEN pp.verification_status = 'PENDING'
              THEN 0
            ELSE 1
          END,
          pp.created_at ASC
      `
    );

    return res.status(200).json({
      success: true,

      professionals: result.rows.map(
        (professional) => ({
          id: professional.id,
          userId: professional.user_id,

          displayName:
            professional.display_name,

          email: professional.email,

          bio: professional.bio,

          categories:
            professional.categories,

          verificationStatus:
            professional.verification_status,

          availabilityStatus:
            professional.availability_status,

          accountStatus:
            professional.account_status,

          createdAt:
            professional.created_at,

          updatedAt:
            professional.updated_at,
        })
      ),
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Approve Professional
|--------------------------------------------------------------------------
|
| PENDING -> APPROVED
|
| When approved, the professional remains OFFLINE.
|
| They must explicitly become AVAILABLE before receiving matches.
|
*/

const approveProfessional = async (
  req,
  res,
  next
) => {
  try {
    const { professionalId } =
      req.validated.params;

    const result = await pool.query(
      `
        UPDATE professional_profiles
        SET
          verification_status = 'APPROVED',
          availability_status = 'OFFLINE',
          updated_at = NOW()
        WHERE id = $1
          AND verification_status = 'PENDING'
        RETURNING
          id,
          user_id,
          display_name,
          bio,
          categories,
          verification_status,
          availability_status,
          created_at,
          updated_at
      `,
      [professionalId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message:
          'Pending professional application not found.',
      });
    }

    const professional = result.rows[0];

    return res.status(200).json({
      success: true,

      professional: {
        id: professional.id,

        userId:
          professional.user_id,

        displayName:
          professional.display_name,

        bio:
          professional.bio,

        categories:
          professional.categories,

        verificationStatus:
          professional.verification_status,

        availabilityStatus:
          professional.availability_status,

        createdAt:
          professional.created_at,

        updatedAt:
          professional.updated_at,
      },

      message:
        'Professional application approved successfully.',
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Reject Professional
|--------------------------------------------------------------------------
|
| PENDING -> REJECTED
|
*/

const rejectProfessional = async (
  req,
  res,
  next
) => {
  try {
    const { professionalId } =
      req.validated.params;

    const result = await pool.query(
      `
        UPDATE professional_profiles
        SET
          verification_status = 'REJECTED',
          availability_status = 'OFFLINE',
          updated_at = NOW()
        WHERE id = $1
          AND verification_status = 'PENDING'
        RETURNING
          id,
          user_id,
          display_name,
          bio,
          categories,
          verification_status,
          availability_status,
          created_at,
          updated_at
      `,
      [professionalId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message:
          'Pending professional application not found.',
      });
    }

    const professional = result.rows[0];

    return res.status(200).json({
      success: true,

      professional: {
        id: professional.id,

        userId:
          professional.user_id,

        displayName:
          professional.display_name,

        bio:
          professional.bio,

        categories:
          professional.categories,

        verificationStatus:
          professional.verification_status,

        availabilityStatus:
          professional.availability_status,

        createdAt:
          professional.created_at,

        updatedAt:
          professional.updated_at,
      },

      message:
        'Professional application rejected.',
    });
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| Get Admin Dashboard
|--------------------------------------------------------------------------
|
| Returns high-level system statistics for the admin dashboard.
|
| Private conversation message contents are NOT included.
|
*/

const getAdminDashboard = async (
  req,
  res,
  next
) => {
  try {
    const result = await pool.query(`
      SELECT
        (
          SELECT COUNT(*)::int
          FROM users
          WHERE deleted_at IS NULL
        ) AS total_users,

        (
          SELECT COUNT(*)::int
          FROM users
          WHERE deleted_at IS NULL
            AND account_status = 'ACTIVE'
        ) AS active_users,

        (
          SELECT COUNT(*)::int
          FROM users
          WHERE deleted_at IS NULL
            AND account_status = 'SUSPENDED'
        ) AS suspended_users,

        (
          SELECT COUNT(*)::int
          FROM conversations
          WHERE deleted_at IS NULL
        ) AS total_conversations,

        (
          SELECT COUNT(*)::int
          FROM conversations
          WHERE deleted_at IS NULL
            AND status IN (
              'ACTIVE',
              'WAITING_FOR_PROFESSIONAL',
              'PROFESSIONAL_CONNECTED'
            )
        ) AS active_conversations,

        (
          SELECT COUNT(*)::int
          FROM conversations
          WHERE deleted_at IS NULL
            AND status = 'ENDED'
        ) AS completed_conversations,

        (
          SELECT COUNT(*)::int
          FROM professional_profiles
          WHERE verification_status = 'PENDING'
        ) AS pending_professionals,

        (
          SELECT COUNT(*)::int
          FROM professional_profiles
          WHERE verification_status = 'APPROVED'
        ) AS approved_professionals,

        (
          SELECT COUNT(*)::int
          FROM professional_profiles
          WHERE verification_status = 'APPROVED'
            AND availability_status = 'AVAILABLE'
        ) AS available_professionals,

        (
          SELECT COUNT(*)::int
          FROM professional_profiles
          WHERE verification_status = 'APPROVED'
            AND availability_status = 'BUSY'
        ) AS busy_professionals,

        (
          SELECT COUNT(*)::int
          FROM matching_requests
          WHERE status IN (
            'WAITING',
            'MATCHED',
            'ACCEPTED'
          )
        ) AS active_matching_requests,

        (
          SELECT COUNT(*)::int
          FROM matching_requests
          WHERE status = 'COMPLETED'
        ) AS completed_matching_requests,

        (
          SELECT COUNT(*)::int
          FROM matching_requests
          WHERE status = 'CANCELLED'
        ) AS cancelled_matching_requests,

        (
          SELECT COUNT(*)::int
          FROM matching_requests
          WHERE status = 'EXPIRED'
        ) AS expired_matching_requests
    `);

    const dashboard = result.rows[0];

    return res.status(200).json({
      success: true,

      dashboard: {
        users: {
          total:
            dashboard.total_users,

          active:
            dashboard.active_users,

          suspended:
            dashboard.suspended_users,
        },

        conversations: {
          total:
            dashboard.total_conversations,

          active:
            dashboard.active_conversations,

          completed:
            dashboard.completed_conversations,
        },

        professionals: {
          pending:
            dashboard.pending_professionals,

          approved:
            dashboard.approved_professionals,

          available:
            dashboard.available_professionals,

          busy:
            dashboard.busy_professionals,
        },

        matching: {
          active:
            dashboard.active_matching_requests,

          completed:
            dashboard.completed_matching_requests,

          cancelled:
            dashboard.cancelled_matching_requests,

          expired:
            dashboard.expired_matching_requests,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| Get Admin Users
|--------------------------------------------------------------------------
|
| Returns users for the admin dashboard.
|
| Password hashes are NEVER returned.
|
*/

const getAdminUsers = async (
  req,
  res,
  next
) => {
  try {
    const {
      limit,
      offset,
      status,
    } = req.validated.query;

    const values = [];
    const conditions = [
      'u.deleted_at IS NULL',
    ];

    if (status !== undefined) {
      values.push(status);
      conditions.push(
        `u.account_status = $${values.length}`
      );
    }

    values.push(limit + 1);
    const limitPosition = values.length;

    values.push(offset);
    const offsetPosition = values.length;

    const result = await pool.query(
      `
        SELECT
          u.id,
          u.email,
          u.phone,
          u.account_status,
          u.email_verified,
          u.phone_verified,
          u.role,
          u.created_at,
          u.updated_at,
          u.last_login_at,

          (
            SELECT COUNT(*)
            FROM conversations c
            WHERE c.user_id = u.id
              AND c.deleted_at IS NULL
          )::int AS conversation_count,

          (
            SELECT pp.verification_status
            FROM professional_profiles pp
            WHERE pp.user_id = u.id
            LIMIT 1
          ) AS professional_verification_status

        FROM users u

        WHERE ${conditions.join(' AND ')}

        ORDER BY u.created_at DESC

        LIMIT $${limitPosition}
        OFFSET $${offsetPosition}
      `,
      values
    );

    const hasMore =
      result.rows.length > limit;

    const users =
      result.rows
        .slice(0, limit)
        .map((user) => ({
          id: user.id,

          email: user.email,

          phone: user.phone,

          accountStatus:
            user.account_status,

          emailVerified:
            user.email_verified,

          phoneVerified:
            user.phone_verified,

          role:
            user.role,

          professionalVerificationStatus:
            user.professional_verification_status,

          conversationCount:
            user.conversation_count,

          createdAt:
            user.created_at,

          updatedAt:
            user.updated_at,

          lastLoginAt:
            user.last_login_at,
        }));

    return res.status(200).json({
      success: true,

      users,

      pagination: {
        limit,
        offset,
        hasMore,
      },
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Suspend User
|--------------------------------------------------------------------------
|
| ACTIVE -> SUSPENDED
|
| All active sessions are revoked immediately.
|
*/

const suspendUser = async (
  req,
  res,
  next
) => {
  const client = await pool.connect();

  try {
    const { userId } =
      req.validated.params;

    /*
    |--------------------------------------------------------------------------
    | Prevent admin self-suspension
    |--------------------------------------------------------------------------
    */

    if (userId === req.admin.id) {
      return res.status(400).json({
        success: false,
        message:
          'You cannot suspend your own administrator account.',
      });
    }

    await client.query('BEGIN');

    /*
    |--------------------------------------------------------------------------
    | Lock target account
    |--------------------------------------------------------------------------
    */

    const userResult =
      await client.query(
        `
          SELECT
            id,
            email,
            account_status,
            role
          FROM users
          WHERE id = $1
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [userId]
      );

    if (userResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    const user = userResult.rows[0];

    if (user.account_status === 'SUSPENDED') {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message: 'User account is already suspended.',
      });
    }

    if (user.account_status === 'DEACTIVATED') {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'A deactivated account cannot be suspended.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Find professional profile, if this user is a professional
    |--------------------------------------------------------------------------
    */

    const professionalResult =
      await client.query(
        `
          SELECT
            id
          FROM professional_profiles
          WHERE user_id = $1
          LIMIT 1
        `,
        [userId]
      );

    const professionalId =
      professionalResult.rowCount > 0
        ? professionalResult.rows[0].id
        : null;

    /*
    |--------------------------------------------------------------------------
    | Find active matching requests involving this user
    |--------------------------------------------------------------------------
    |
    | A suspended user can be involved in two ways:
    |
    | 1. As the requester (matching_requests.user_id)
    | 2. As the professional (matching_requests.professional_id)
    |
    */

    const activeRequestsResult =
      await client.query(
        `
          SELECT
            id,
            user_id,
            conversation_id,
            status,
            professional_id
          FROM matching_requests
          WHERE status IN (
            'WAITING',
            'MATCHED',
            'ACCEPTED'
          )
          AND (
            user_id = $1
            OR (
              $2::uuid IS NOT NULL
              AND professional_id = $2
            )
          )
          FOR UPDATE
        `,
        [
          userId,
          professionalId,
        ]
      );

    /*
    |--------------------------------------------------------------------------
    | Resolve active matching requests
    |--------------------------------------------------------------------------
    */

    for (
      const request
      of activeRequestsResult.rows
    ) {
      await client.query(
  `
    UPDATE matching_requests
    SET
      status = CASE
        WHEN status = 'ACCEPTED'
          THEN 'COMPLETED'
        ELSE 'CANCELLED'
      END,

      cancelled_at = CASE
        WHEN status IN (
          'WAITING',
          'MATCHED'
        )
          THEN COALESCE(
            cancelled_at,
            NOW()
          )
        ELSE cancelled_at
      END

    WHERE id = $1
  `,
  [request.id]
);
      /*
      |--------------------------------------------------------------------------
      | End the affected conversation
      |--------------------------------------------------------------------------
      */

      await client.query(
        `
          UPDATE conversations
          SET
            status = 'ENDED',
            ended_at = COALESCE(
              ended_at,
              NOW()
            ),
            updated_at = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
            AND status IN (
              'ACTIVE',
              'WAITING_FOR_PROFESSIONAL',
              'PROFESSIONAL_CONNECTED'
            )
        `,
        [request.conversation_id]
      );

      /*
      |--------------------------------------------------------------------------
      | Release assigned professional
      |--------------------------------------------------------------------------
      */

      if (request.professional_id) {
        await client.query(
          `
            UPDATE professional_profiles pp
            SET
              availability_status = 'AVAILABLE',
              updated_at = NOW()
            WHERE pp.id = $1
              AND pp.verification_status = 'APPROVED'
              AND pp.availability_status = 'BUSY'
              AND NOT EXISTS (
                SELECT 1
                FROM matching_requests mr
                WHERE mr.professional_id = pp.id
                  AND mr.status IN (
                    'MATCHED',
                    'ACCEPTED'
                  )
                  AND mr.id <> $2
              )
          `,
          [
            request.professional_id,
            request.id,
          ]
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | End any other active conversations owned by the user
    |--------------------------------------------------------------------------
    |
    | This handles conversations that were created but never matched.
    |
    */

    await client.query(
      `
        UPDATE conversations
        SET
          status = 'ENDED',
          ended_at = COALESCE(
            ended_at,
            NOW()
          ),
          updated_at = NOW()
        WHERE user_id = $1
          AND deleted_at IS NULL
          AND status IN (
            'ACTIVE',
            'WAITING_FOR_PROFESSIONAL',
            'PROFESSIONAL_CONNECTED'
          )
      `,
      [userId]
    );

    /*
    |--------------------------------------------------------------------------
    | Suspend account
    |--------------------------------------------------------------------------
    */

    const suspendedResult =
      await client.query(
        `
          UPDATE users
          SET
            account_status = 'SUSPENDED',
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            email,
            account_status,
            updated_at
        `,
        [userId]
      );

    /*
    |--------------------------------------------------------------------------
    | Revoke all active sessions
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        UPDATE sessions
        SET
          revoked_at = COALESCE(
            revoked_at,
            NOW()
          )
        WHERE user_id = $1
          AND revoked_at IS NULL
      `,
      [userId]
    );

    /*
    |--------------------------------------------------------------------------
    | Disable professional availability
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        UPDATE professional_profiles
        SET
          availability_status = 'OFFLINE',
          updated_at = NOW()
        WHERE user_id = $1
      `,
      [userId]
    );

    await client.query('COMMIT');

    const suspended =
      suspendedResult.rows[0];

    return res.status(200).json({
      success: true,

      user: {
        id:
          suspended.id,

        email:
          suspended.email,

        accountStatus:
          suspended.account_status,

        updatedAt:
          suspended.updated_at,
      },

      message:
        'User account suspended, active sessions revoked, and active conversations terminated.',
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
| Reactivate User
|--------------------------------------------------------------------------
|
| SUSPENDED -> ACTIVE
|
*/

const reactivateUser = async (
  req,
  res,
  next
) => {
  try {
    const { userId } =
      req.validated.params;

    const result = await pool.query(
      `
        UPDATE users
        SET
          account_status = 'ACTIVE',
          updated_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
          AND account_status = 'SUSPENDED'
        RETURNING
          id,
          email,
          account_status,
          updated_at
      `,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message:
          'Suspended user account not found.',
      });
    }

    const user = result.rows[0];

    return res.status(200).json({
      success: true,

      user: {
        id: user.id,

        email:
          user.email,

        accountStatus:
          user.account_status,

        updatedAt:
          user.updated_at,
      },

      message:
        'User account reactivated successfully.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdminDashboard,
  getAdminUsers,
  suspendUser,
  reactivateUser,
  getProfessionalApplications,
  approveProfessional,
  rejectProfessional,
};