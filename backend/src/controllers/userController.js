const { pool } = require('../config/database');


/*
|--------------------------------------------------------------------------
| Get Current User
|--------------------------------------------------------------------------
|
| Returns only information belonging to the authenticated user.
|
| IMPORTANT:
| password_hash is NEVER returned.
|
*/

const getCurrentUser = async (req, res, next) => {
  try {
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

          ap.anonymous_name

        FROM users u

        LEFT JOIN anonymous_profiles ap
          ON ap.user_id = u.id

        WHERE u.id = $1
          AND u.deleted_at IS NULL

        LIMIT 1
      `,
      [req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
    }

    const user = result.rows[0];

    return res.status(200).json({
      success: true,

      user: {
        id: user.id,

        anonymousName:
          user.anonymous_name,

        email:
          user.email,

        phone:
          user.phone,

        accountStatus:
          user.account_status,

        emailVerified:
          user.email_verified,

        phoneVerified:
          user.phone_verified,

        role:
          user.role,

        createdAt:
          user.created_at,

        updatedAt:
          user.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Get My Conversations
|--------------------------------------------------------------------------
|
| Returns conversation metadata belonging ONLY to the authenticated user.
|
| Message content is intentionally NOT returned by this endpoint.
|
*/

const getMyConversations = async (
  req,
  res,
  next
) => {
  try {
    const {
      limit,
      offset,
    } = req.validated.query;

    const result = await pool.query(
      `
        SELECT
          c.id,
          c.topic,
          c.status,
          c.created_at,
          c.updated_at,
          c.ended_at,

          (
            SELECT COUNT(*)
            FROM messages m
            WHERE m.conversation_id = c.id
              AND m.deleted_at IS NULL
          )::int AS message_count,

          (
            SELECT MAX(m.created_at)
            FROM messages m
            WHERE m.conversation_id = c.id
              AND m.deleted_at IS NULL
          ) AS last_message_at

        FROM conversations c

        WHERE c.user_id = $1
          AND c.deleted_at IS NULL

        ORDER BY c.updated_at DESC

        LIMIT $2
        OFFSET $3
      `,
      [
        req.user.id,
        limit + 1,
        offset,
      ]
    );

    const hasMore =
      result.rows.length > limit;

    const conversations =
      result.rows
        .slice(0, limit)
        .map((conversation) => ({
          id:
            conversation.id,

          topic:
            conversation.topic,

          status:
            conversation.status,

          messageCount:
            conversation.message_count,

          lastMessageAt:
            conversation.last_message_at,

          createdAt:
            conversation.created_at,

          updatedAt:
            conversation.updated_at,

          endedAt:
            conversation.ended_at,
        }));

    return res.status(200).json({
      success: true,

      conversations,

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
| Get Active Conversation
|--------------------------------------------------------------------------
|
| Returns the authenticated user's most recent active conversation.
|
| Active conversation states:
|
| ACTIVE
| WAITING_FOR_PROFESSIONAL
| PROFESSIONAL_CONNECTED
|
| Matching request information is included when an active request exists.
|
*/

const getActiveConversation = async (
  req,
  res,
  next
) => {
  try {
    const result = await pool.query(
      `
        SELECT
          c.id,
          c.topic,
          c.status,
          c.created_at,
          c.updated_at,
          c.ended_at,

          mr.id AS matching_request_id,
          mr.category AS matching_category,
          mr.status AS matching_status,
          mr.professional_id,
          mr.created_at AS matching_created_at,
          mr.matched_at,
          mr.accepted_at,
          mr.expires_at,

          pp.display_name AS professional_display_name

        FROM conversations c

        LEFT JOIN LATERAL (
          SELECT
            m.*
          FROM matching_requests m
          WHERE m.conversation_id = c.id
            AND m.user_id = c.user_id
            AND m.status IN (
              'WAITING',
              'MATCHED',
              'ACCEPTED'
            )
          ORDER BY m.created_at DESC
          LIMIT 1
        ) mr
          ON TRUE

        LEFT JOIN professional_profiles pp
          ON pp.id = mr.professional_id

        WHERE c.user_id = $1
          AND c.deleted_at IS NULL
          AND c.status IN (
            'ACTIVE',
            'WAITING_FOR_PROFESSIONAL',
            'PROFESSIONAL_CONNECTED'
          )

        ORDER BY c.updated_at DESC

        LIMIT 1
      `,
      [req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(200).json({
        success: true,
        activeConversation: null,
      });
    }

    const row = result.rows[0];

    return res.status(200).json({
      success: true,

      activeConversation: {
        conversation: {
          id: row.id,

          topic:
            row.topic,

          status:
            row.status,

          createdAt:
            row.created_at,

          updatedAt:
            row.updated_at,

          endedAt:
            row.ended_at,
        },

        matchingRequest:
          row.matching_request_id
            ? {
                id:
                  row.matching_request_id,

                category:
                  row.matching_category,

                status:
                  row.matching_status,

                createdAt:
                  row.matching_created_at,

                matchedAt:
                  row.matched_at,

                acceptedAt:
                  row.accepted_at,

                expiresAt:
                  row.expires_at,
              }
            : null,

        professional:
          row.professional_id
            ? {
                id:
                  row.professional_id,

                displayName:
                  row.professional_display_name,
              }
            : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| Delete My Conversation
|--------------------------------------------------------------------------
|
| Soft-deletes a conversation owned by the authenticated user.
|
| Matching lifecycle:
|
| WAITING  -> CANCELLED
| MATCHED  -> CANCELLED
| ACCEPTED -> COMPLETED
|
| Messages are soft-deleted rather than physically removed.
|
*/

const deleteMyConversation = async (
  req,
  res,
  next
) => {
  const client = await pool.connect();

  try {
    const {
      conversationId,
    } = req.validated.params;

    await client.query('BEGIN');

    /*
    |--------------------------------------------------------------------------
    | Lock and verify conversation ownership
    |--------------------------------------------------------------------------
    */

    const conversationResult =
      await client.query(
        `
          SELECT
            id,
            status
          FROM conversations
          WHERE id = $1
            AND user_id = $2
            AND deleted_at IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [
          conversationId,
          req.user.id,
        ]
      );

    if (conversationResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        success: false,
        message: 'Conversation not found.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Find an active matching request
    |--------------------------------------------------------------------------
    */

    const matchingResult =
      await client.query(
        `
          SELECT
            id,
            status,
            professional_id
          FROM matching_requests
          WHERE conversation_id = $1
            AND user_id = $2
            AND status IN (
              'WAITING',
              'MATCHED',
              'ACCEPTED'
            )
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `,
        [
          conversationId,
          req.user.id,
        ]
      );

    let matchingRequest = null;

    /*
    |--------------------------------------------------------------------------
    | Close active matching request
    |--------------------------------------------------------------------------
    */

    if (matchingResult.rowCount > 0) {
      const request =
        matchingResult.rows[0];

      const nextStatus =
        request.status === 'ACCEPTED'
          ? 'COMPLETED'
          : 'CANCELLED';

      const cancelledAt =
        nextStatus === 'CANCELLED'
          ? new Date()
          : null;

      const updatedMatchingResult =
        await client.query(
          `
            UPDATE matching_requests
            SET
              status = $1,
              cancelled_at = CASE
                WHEN $1 = 'CANCELLED'
                  THEN COALESCE(cancelled_at, $2)
                ELSE cancelled_at
              END
            WHERE id = $3
            RETURNING
              id,
              status,
              professional_id
          `,
          [
            nextStatus,
            cancelledAt,
            request.id,
          ]
        );

      matchingRequest =
        updatedMatchingResult.rows[0];

      /*
      |--------------------------------------------------------------------------
      | Release the assigned professional
      |--------------------------------------------------------------------------
      |
      | Only release them if they are not attached to another active
      | matching request.
      |
      */

      if (
        matchingRequest.professional_id
      ) {
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
            matchingRequest.professional_id,
            matchingRequest.id,
          ]
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Soft-delete messages
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        UPDATE messages
        SET
          deleted_at = COALESCE(
            deleted_at,
            NOW()
          )
        WHERE conversation_id = $1
          AND deleted_at IS NULL
      `,
      [conversationId]
    );

    /*
    |--------------------------------------------------------------------------
    | Soft-delete conversation
    |--------------------------------------------------------------------------
    */

    const deletedConversationResult =
      await client.query(
        `
          UPDATE conversations
          SET
            status = 'DELETED',
            deleted_at = NOW(),
            ended_at = COALESCE(
              ended_at,
              NOW()
            ),
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            status,
            deleted_at,
            ended_at
        `,
        [conversationId]
      );

    const deletedConversation =
      deletedConversationResult.rows[0];

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,

      conversation: {
        id:
          deletedConversation.id,

        status:
          deletedConversation.status,

        deletedAt:
          deletedConversation.deleted_at,

        endedAt:
          deletedConversation.ended_at,
      },

      matchingRequest:
        matchingRequest
          ? {
              id:
                matchingRequest.id,

              status:
                matchingRequest.status,
            }
          : null,

      message:
        'Conversation deleted successfully.',
    });
  } catch (error) {
    await client.query('ROLLBACK');

    next(error);
  } finally {
    client.release();
  }
};

module.exports = {
  getCurrentUser,
  getMyConversations,
  getActiveConversation,
  deleteMyConversation,
};