const { pool } = require('../config/database');


/*
|--------------------------------------------------------------------------
| Create Professional Profile
|--------------------------------------------------------------------------
|
| An authenticated user can apply to become a professional.
|
| IMPORTANT:
| verification_status is NEVER accepted from the client.
|
| Every new application starts as:
|
| PENDING
|
*/

const createProfessionalProfile = async (req, res, next) => {
  try {
    const {
      displayName,
      bio,
      categories,
    } = req.validated.body;

    /*
    |--------------------------------------------------------------------------
    | Check whether user already has a professional profile
    |--------------------------------------------------------------------------
    */

    const existingResult = await pool.query(
      `
        SELECT
          id,
          verification_status
        FROM professional_profiles
        WHERE user_id = $1
      `,
      [req.user.id]
    );

    if (existingResult.rowCount > 0) {
      return res.status(409).json({
        success: false,
        message:
          'You already have a professional profile.',
        professional: {
          id: existingResult.rows[0].id,
          verificationStatus:
            existingResult.rows[0].verification_status,
        },
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Create profile
    |--------------------------------------------------------------------------
    */

    const result = await pool.query(
      `
        INSERT INTO professional_profiles (
          user_id,
          display_name,
          bio,
          categories,
          verification_status,
          availability_status
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          'PENDING',
          'OFFLINE'
        )
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
      [
        req.user.id,
        displayName,
        bio || '',
        categories || [],
      ]
    );

    const professional = result.rows[0];

    return res.status(201).json({
      success: true,

      professional: {
        id: professional.id,
        displayName: professional.display_name,
        bio: professional.bio,
        categories: professional.categories,
        verificationStatus:
          professional.verification_status,
        availabilityStatus:
          professional.availability_status,
        createdAt: professional.created_at,
        updatedAt: professional.updated_at,
      },

      message:
        'Professional application submitted successfully. Your profile is awaiting approval.',
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Get My Professional Profile
|--------------------------------------------------------------------------
|
| Returns the professional profile belonging to the authenticated user.
|
*/

const getMyProfessionalProfile = async (req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id,
          user_id,
          display_name,
          bio,
          categories,
          verification_status,
          availability_status,
          created_at,
          updated_at
        FROM professional_profiles
        WHERE user_id = $1
      `,
      [req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message:
          'You do not have a professional profile.',
      });
    }

    const professional = result.rows[0];

    return res.status(200).json({
      success: true,

      professional: {
        id: professional.id,
        displayName: professional.display_name,
        bio: professional.bio,
        categories: professional.categories,
        verificationStatus:
          professional.verification_status,
        availabilityStatus:
          professional.availability_status,
        createdAt: professional.created_at,
        updatedAt: professional.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Update My Professional Profile
|--------------------------------------------------------------------------
|
| The user can update profile information.
|
| SECURITY:
|
| The client cannot modify:
|
| - verification_status
| - availability_status
| - user_id
| - id
|
| Those fields are controlled by the system.
|
*/

const updateMyProfessionalProfile = async (req, res, next) => {
  try {
    const {
      displayName,
      bio,
      categories,
    } = req.validated.body;

    /*
    |--------------------------------------------------------------------------
    | Build update dynamically
    |--------------------------------------------------------------------------
    */

    const fields = [];
    const values = [];

    if (displayName !== undefined) {
      fields.push(`display_name = $${values.length + 1}`);
      values.push(displayName);
    }

    if (bio !== undefined) {
      fields.push(`bio = $${values.length + 1}`);
      values.push(bio);
    }

    if (categories !== undefined) {
      fields.push(`categories = $${values.length + 1}`);
      values.push(categories);
    }

    /*
    |--------------------------------------------------------------------------
    | Nothing to update
    |--------------------------------------------------------------------------
    */

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          'No profile information was provided for update.',
      });
    }

    fields.push('updated_at = NOW()');

    values.push(req.user.id);

    const userIdPosition = values.length;

    /*
    |--------------------------------------------------------------------------
    | Update profile
    |--------------------------------------------------------------------------
    */

    const result = await pool.query(
      `
        UPDATE professional_profiles
        SET
          ${fields.join(', ')}
        WHERE user_id = $${userIdPosition}
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
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message:
          'You do not have a professional profile.',
      });
    }

    const professional = result.rows[0];

    return res.status(200).json({
      success: true,

      professional: {
        id: professional.id,
        displayName: professional.display_name,
        bio: professional.bio,
        categories: professional.categories,
        verificationStatus:
          professional.verification_status,
        availabilityStatus:
          professional.availability_status,
        createdAt: professional.created_at,
        updatedAt: professional.updated_at,
      },

      message:
        'Professional profile updated successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| Get Professional Dashboard
|--------------------------------------------------------------------------
|
| Returns the authenticated professional's dashboard state.
|
| Includes:
|
| - Professional profile
| - Verification status
| - Availability status
| - Current MATCHED request waiting for acceptance
| - Current ACCEPTED conversation
| - Basic activity counts
|
| The endpoint never exposes conversations belonging to other
| professionals.
|
*/

const getProfessionalDashboard = async (
  req,
  res,
  next
) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | Get professional profile
    |--------------------------------------------------------------------------
    */

    const professionalResult =
      await pool.query(
        `
          SELECT
            id,
            user_id,
            display_name,
            bio,
            categories,
            verification_status,
            availability_status,
            created_at,
            updated_at
          FROM professional_profiles
          WHERE user_id = $1
          LIMIT 1
        `,
        [req.user.id]
      );

    if (professionalResult.rowCount === 0) {
      return res.status(403).json({
        success: false,
        message:
          'You do not have a professional profile.',
      });
    }

    const professional =
      professionalResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Get incoming matched request
    |--------------------------------------------------------------------------
    */

    const incomingResult =
      await pool.query(
        `
          SELECT
            mr.id,
            mr.conversation_id,
            mr.category,
            mr.status,
            mr.created_at,
            mr.matched_at,
            mr.expires_at,

            c.topic,
            c.status AS conversation_status

          FROM matching_requests mr

          INNER JOIN conversations c
            ON c.id = mr.conversation_id

          WHERE mr.professional_id = $1
            AND mr.status = 'MATCHED'
            AND c.deleted_at IS NULL

          ORDER BY mr.matched_at ASC NULLS LAST

          LIMIT 1
        `,
        [professional.id]
      );

    const incomingMatch =
      incomingResult.rowCount > 0
        ? incomingResult.rows[0]
        : null;

    /*
    |--------------------------------------------------------------------------
    | Get active accepted conversation
    |--------------------------------------------------------------------------
    */

    const activeConversationResult =
      await pool.query(
        `
          SELECT
            c.id,
            c.topic,
            c.status,
            c.created_at,
            c.updated_at,

            mr.id AS matching_request_id,
            mr.category,
            mr.accepted_at

          FROM conversations c

          INNER JOIN matching_requests mr
            ON mr.conversation_id = c.id

          WHERE mr.professional_id = $1
            AND mr.status = 'ACCEPTED'
            AND c.status = 'PROFESSIONAL_CONNECTED'
            AND c.deleted_at IS NULL

          ORDER BY c.updated_at DESC

          LIMIT 1
        `,
        [professional.id]
      );

    const activeConversation =
      activeConversationResult.rowCount > 0
        ? activeConversationResult.rows[0]
        : null;

    /*
    |--------------------------------------------------------------------------
    | Activity counts
    |--------------------------------------------------------------------------
    */

    const statsResult =
      await pool.query(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE status = 'MATCHED'
            )::int AS pending_matches,

            COUNT(*) FILTER (
              WHERE status = 'ACCEPTED'
            )::int AS active_matches,

            COUNT(*) FILTER (
              WHERE status = 'COMPLETED'
            )::int AS completed_matches,

            COUNT(*) FILTER (
              WHERE status = 'CANCELLED'
            )::int AS cancelled_matches

          FROM matching_requests
          WHERE professional_id = $1
        `,
        [professional.id]
      );

    const stats = statsResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Response
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      professional: {
        id:
          professional.id,

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

      incomingMatch:
        incomingMatch
          ? {
              id:
                incomingMatch.id,

              conversationId:
                incomingMatch.conversation_id,

              category:
                incomingMatch.category,

              status:
                incomingMatch.status,

              topic:
                incomingMatch.topic,

              conversationStatus:
                incomingMatch.conversation_status,

              createdAt:
                incomingMatch.created_at,

              matchedAt:
                incomingMatch.matched_at,

              expiresAt:
                incomingMatch.expires_at,
            }
          : null,

      activeConversation:
        activeConversation
          ? {
              conversationId:
                activeConversation.id,

              matchingRequestId:
                activeConversation.matching_request_id,

              topic:
                activeConversation.topic,

              category:
                activeConversation.category,

              status:
                activeConversation.status,

              acceptedAt:
                activeConversation.accepted_at,

              createdAt:
                activeConversation.created_at,

              updatedAt:
                activeConversation.updated_at,
            }
          : null,

      stats: {
        pendingMatches:
          stats.pending_matches,

        activeMatches:
          stats.active_matches,

        completedMatches:
          stats.completed_matches,

        cancelledMatches:
          stats.cancelled_matches,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProfessionalProfile,
  getMyProfessionalProfile,
  updateMyProfessionalProfile,
  getProfessionalDashboard,
};