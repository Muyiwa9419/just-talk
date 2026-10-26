const { pool } = require('../config/database');


/*
|--------------------------------------------------------------------------
| Create Conversation
|--------------------------------------------------------------------------
*/

const createConversation = async (
  req,
  res,
  next
) => {
  const client = await pool.connect();

  try {
    const {
      topic,
      message,
    } = req.validated.body;

    await client.query('BEGIN');

    /*
    |--------------------------------------------------------------------------
    | Create conversation
    |--------------------------------------------------------------------------
    */

    const conversationResult =
      await client.query(
        `
          INSERT INTO conversations (
            user_id,
            topic
          )
          VALUES ($1, $2)
          RETURNING
            id,
            topic,
            status,
            created_at
        `,
        [
          req.user.id,
          topic,
        ]
      );

    const conversation =
      conversationResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Create first message
    |--------------------------------------------------------------------------
    */

    const messageResult =
      await client.query(
        `
          INSERT INTO messages (
            conversation_id,
            sender_type,
            sender_user_id,
            content
          )
          VALUES ($1, 'USER', $2, $3)
          RETURNING
            id,
            sender_type,
            content,
            created_at
        `,
        [
          conversation.id,
          req.user.id,
          message,
        ]
      );

    const firstMessage =
      messageResult.rows[0];

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,

      conversation: {
        id: conversation.id,
        topic: conversation.topic,
        status: conversation.status,
        createdAt: conversation.created_at,
      },

      message: {
        id: firstMessage.id,
        sender: 'user',
        text: firstMessage.content,
        timestamp:
          firstMessage.created_at,
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
| Get One Conversation
|--------------------------------------------------------------------------
*/

const getConversation = async (
  req,
  res,
  next
) => {
  try {
    const {
      conversationId,
    } = req.validated.params;

    /*
    |--------------------------------------------------------------------------
    | Conversation access
    |--------------------------------------------------------------------------
    |
    | Access is allowed for:
    |
    | 1. The original requester
    | 2. The professional who accepted the matching request
    |
    */

    const conversationResult =
      await pool.query(
        `
          SELECT
            c.id,
            c.topic,
            c.status,
            c.created_at,
            c.updated_at,
            c.ended_at,

            CASE
              WHEN c.user_id = $2
                THEN 'USER'
              ELSE 'PROFESSIONAL'
            END AS viewer_role

          FROM conversations c

          WHERE c.id = $1
            AND c.deleted_at IS NULL

            AND (
              c.user_id = $2

              OR EXISTS (
                SELECT 1
                FROM matching_requests mr

                INNER JOIN professional_profiles pp
                  ON pp.id = mr.professional_id

                WHERE mr.conversation_id = c.id
                  AND mr.status = 'ACCEPTED'
                  AND pp.user_id = $2
              )
            )

          LIMIT 1
        `,
        [
          conversationId,
          req.user.id,
        ]
      );

    if (
      conversationResult.rowCount === 0
    ) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found.',
      });
    }

    const conversation =
      conversationResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Get messages
    |--------------------------------------------------------------------------
    */

    const messagesResult =
      await pool.query(
        `
          SELECT
            id,
            sender_type,
            sender_user_id,
            content,
            created_at
          FROM messages
          WHERE conversation_id = $1
            AND deleted_at IS NULL
          ORDER BY created_at ASC
        `,
        [conversationId]
      );

    const messages =
      messagesResult.rows.map(
        (item) => ({
          id: item.id,

          sender:
            item.sender_type === 'USER'
              ? 'user'
              : item.sender_type === 'SYSTEM'
              ? 'justtalk'
              : 'professional',

          text: item.content,

          timestamp:
            item.created_at,
        })
      );

    return res.status(200).json({
      success: true,

      conversation: {
        id: conversation.id,

        topic:
          conversation.topic,

        status:
          conversation.status,

        createdAt:
          conversation.created_at,

        updatedAt:
          conversation.updated_at,

        endedAt:
          conversation.ended_at,
      },

      messages,
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Send Message
|--------------------------------------------------------------------------
*/

const sendMessage = async (
  req,
  res,
  next
) => {
  try {
    const {
      conversationId,
    } = req.validated.params;

    const {
      message,
    } = req.validated.body;

    /*
    |--------------------------------------------------------------------------
    | Verify conversation access
    |--------------------------------------------------------------------------
    |
    | USER:
    |   Must own the conversation.
    |
    | PROFESSIONAL:
    |   Must have an ACCEPTED matching request for the conversation.
    |
    */

    const conversationResult =
      await pool.query(
        `
          SELECT
            c.id,
            c.status,

            CASE
              WHEN c.user_id = $2
                THEN 'USER'
              ELSE 'PROFESSIONAL'
            END AS viewer_role

          FROM conversations c

          WHERE c.id = $1
            AND c.deleted_at IS NULL

            AND (
              c.user_id = $2

              OR EXISTS (
                SELECT 1
                FROM matching_requests mr

                INNER JOIN professional_profiles pp
                  ON pp.id = mr.professional_id

                WHERE mr.conversation_id = c.id
                  AND mr.status = 'ACCEPTED'
                  AND pp.user_id = $2
              )
            )

          LIMIT 1
        `,
        [
          conversationId,
          req.user.id,
        ]
      );

    if (
      conversationResult.rowCount === 0
    ) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found.',
      });
    }

    const conversation =
      conversationResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Prevent messages after conversation has ended
    |--------------------------------------------------------------------------
    */

    if (
      conversation.status ===
        'ENDED' ||
      conversation.status ===
        'DELETED'
    ) {
      return res.status(409).json({
        success: false,
        message:
          'This conversation is no longer active.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Determine sender type
    |--------------------------------------------------------------------------
    */

    const senderType =
      conversation.viewer_role ===
        'PROFESSIONAL'
        ? 'PROFESSIONAL'
        : 'USER';

    /*
    |--------------------------------------------------------------------------
    | Insert message
    |--------------------------------------------------------------------------
    */

    const result =
      await pool.query(
        `
          INSERT INTO messages (
            conversation_id,
            sender_type,
            sender_user_id,
            content
          )
          VALUES ($1, $2, $3, $4)
          RETURNING
            id,
            sender_type,
            content,
            created_at
        `,
        [
          conversationId,
          senderType,
          req.user.id,
          message,
        ]
      );

    const savedMessage =
      result.rows[0];

    return res.status(201).json({
      success: true,

      message: {
        id: savedMessage.id,

        sender:
          savedMessage.sender_type ===
            'PROFESSIONAL'
            ? 'professional'
            : 'user',

        text:
          savedMessage.content,

        timestamp:
          savedMessage.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| End Conversation
|--------------------------------------------------------------------------
*/

const endConversation = async (
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
    | Verify conversation ownership
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

    if (
      conversationResult.rowCount === 0
    ) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        success: false,
        message: 'Conversation not found.',
      });
    }

    const conversation =
      conversationResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Prevent ending an already-ended conversation
    |--------------------------------------------------------------------------
    */

    if (
      conversation.status === 'ENDED'
    ) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'This conversation has already ended.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | End conversation
    |--------------------------------------------------------------------------
    */

    const endedConversationResult =
      await client.query(
        `
          UPDATE conversations
          SET
            status = 'ENDED',
            ended_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            status,
            ended_at,
            updated_at
        `,
        [conversationId]
      );

    const endedConversation =
      endedConversationResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Complete the accepted matching request
    |--------------------------------------------------------------------------
    */

    const matchingResult =
  await client.query(
    `
      UPDATE matching_requests
      SET
        status = CASE
          WHEN status IN ('WAITING', 'MATCHED')
            THEN 'CANCELLED'
          WHEN status = 'ACCEPTED'
            THEN 'COMPLETED'
          ELSE status
        END,

        cancelled_at = CASE
          WHEN status IN ('WAITING', 'MATCHED')
            THEN NOW()
          ELSE cancelled_at
        END

      WHERE conversation_id = $1
        AND user_id = $2
        AND status IN (
          'WAITING',
          'MATCHED',
          'ACCEPTED'
        )

      RETURNING
        id,
        status,
        professional_id
    `,
    [
      conversationId,
      req.user.id,
    ]
  );

    /*
    |--------------------------------------------------------------------------
    | Release the professional
    |--------------------------------------------------------------------------
    |
    | Once the session ends, the professional becomes AVAILABLE again.
    | They must still be APPROVED to remain eligible for matching.
    |
    */

    if (matchingResult.rowCount > 0) {
  for (const matchingRequest of matchingResult.rows) {
    if (!matchingRequest.professional_id) {
      continue;
    }

    await client.query(
      `
        UPDATE professional_profiles
        SET
          availability_status = 'AVAILABLE',
          updated_at = NOW()
        WHERE id = $1
          AND verification_status = 'APPROVED'
          AND availability_status = 'BUSY'
      `,
      [matchingRequest.professional_id]
    );
  }
}

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,

      conversation: {
        id: endedConversation.id,

        status:
          endedConversation.status,

        endedAt:
          endedConversation.ended_at,
      },

      matchingRequest:
  matchingResult.rowCount > 0
    ? {
        id:
          matchingResult.rows[0].id,

        status:
          matchingResult.rows[0].status,
      }
    : null,

      message:
        'Conversation ended successfully.',
    });
  } catch (error) {
    await client.query('ROLLBACK');

    next(error);
const { pool } = require('../config/database');


/*
|--------------------------------------------------------------------------
| Create Conversation
|--------------------------------------------------------------------------
*/

const createConversation = async (
  req,
  res,
  next
) => {
  const client = await pool.connect();

  try {
    const {
      topic,
      message,
    } = req.validated.body;

    await client.query('BEGIN');

    /*
    |--------------------------------------------------------------------------
    | Create conversation
    |--------------------------------------------------------------------------
    */

    const conversationResult =
      await client.query(
        `
          INSERT INTO conversations (
            user_id,
            topic
          )
          VALUES ($1, $2)
          RETURNING
            id,
            topic,
            status,
            created_at
        `,
        [
          req.user.id,
          topic,
        ]
      );

    const conversation =
      conversationResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Create first message
    |--------------------------------------------------------------------------
    */

    const messageResult =
      await client.query(
        `
          INSERT INTO messages (
            conversation_id,
            sender_type,
            sender_user_id,
            content
          )
          VALUES ($1, 'USER', $2, $3)
          RETURNING
            id,
            sender_type,
            content,
            created_at
        `,
        [
          conversation.id,
          req.user.id,
          message,
        ]
      );

    const firstMessage =
      messageResult.rows[0];

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,

      conversation: {
        id: conversation.id,
        topic: conversation.topic,
        status: conversation.status,
        createdAt: conversation.created_at,
      },

      message: {
        id: firstMessage.id,
        sender: 'user',
        text: firstMessage.content,
        timestamp:
          firstMessage.created_at,
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
| Get One Conversation
|--------------------------------------------------------------------------
*/

const getConversation = async (
  req,
  res,
  next
) => {
  try {
    const {
      conversationId,
    } = req.validated.params;

    /*
    |--------------------------------------------------------------------------
    | Determine conversation access and viewer role
    |--------------------------------------------------------------------------
    |
    | USER:
    |   The authenticated user owns the conversation.
    |
    | PROFESSIONAL:
    |   The authenticated user owns the professional profile that
    |   accepted the matching request for this conversation.
    |
    */

    const conversationResult =
      await pool.query(
        `
          SELECT
            c.id,
            c.topic,
            c.status,
            c.created_at,
            c.updated_at,
            c.ended_at,

            CASE
              WHEN c.user_id = $2
                THEN 'USER'

              WHEN EXISTS (
                SELECT 1
                FROM matching_requests mr
                INNER JOIN professional_profiles pp
                  ON pp.id = mr.professional_id
                WHERE mr.conversation_id = c.id
                  AND mr.status = 'ACCEPTED'
                  AND pp.user_id = $2
              )
                THEN 'PROFESSIONAL'

              ELSE NULL
            END AS viewer_role

          FROM conversations c

          WHERE c.id = $1
            AND c.deleted_at IS NULL

            AND (
              c.user_id = $2

              OR EXISTS (
                SELECT 1
                FROM matching_requests mr

                INNER JOIN professional_profiles pp
                  ON pp.id = mr.professional_id

                WHERE mr.conversation_id = c.id
                  AND mr.status = 'ACCEPTED'
                  AND pp.user_id = $2
              )
            )

          LIMIT 1
        `,
        [
          conversationId,
          req.user.id,
        ]
      );

    if (
      conversationResult.rowCount === 0
    ) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found.',
      });
    }

    const conversation =
      conversationResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Get messages
    |--------------------------------------------------------------------------
    */

    const messagesResult =
      await pool.query(
        `
          SELECT
            id,
            sender_type,
            sender_user_id,
            content,
            created_at
          FROM messages
          WHERE conversation_id = $1
            AND deleted_at IS NULL
          ORDER BY created_at ASC
        `,
        [conversationId]
      );

    const messages =
      messagesResult.rows.map(
        (item) => ({
          id: item.id,

          sender:
            item.sender_type === 'USER'
              ? 'user'
              : item.sender_type === 'SYSTEM'
              ? 'justtalk'
              : 'professional',

          text: item.content,

          timestamp:
            item.created_at,
        })
      );

    return res.status(200).json({
      success: true,

      conversation: {
        id: conversation.id,

        topic:
          conversation.topic,

        status:
          conversation.status,

        createdAt:
          conversation.created_at,

        updatedAt:
          conversation.updated_at,

        endedAt:
          conversation.ended_at,
      },

      messages,
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Send Message
|--------------------------------------------------------------------------
*/

const sendMessage = async (
  req,
  res,
  next
) => {
  try {
    const {
      conversationId,
    } = req.validated.params;

    const {
      message,
    } = req.validated.body;

    /*
    |--------------------------------------------------------------------------
    | Verify conversation access and determine viewer role
    |--------------------------------------------------------------------------
    */

    const conversationResult =
      await pool.query(
        `
          SELECT
            c.id,
            c.status,

            CASE
              WHEN c.user_id = $2
                THEN 'USER'

              WHEN EXISTS (
                SELECT 1
                FROM matching_requests mr
                INNER JOIN professional_profiles pp
                  ON pp.id = mr.professional_id
                WHERE mr.conversation_id = c.id
                  AND mr.status = 'ACCEPTED'
                  AND pp.user_id = $2
              )
                THEN 'PROFESSIONAL'

              ELSE NULL
            END AS viewer_role

          FROM conversations c

          WHERE c.id = $1
            AND c.deleted_at IS NULL

            AND (
              c.user_id = $2

              OR EXISTS (
                SELECT 1
                FROM matching_requests mr

                INNER JOIN professional_profiles pp
                  ON pp.id = mr.professional_id

                WHERE mr.conversation_id = c.id
                  AND mr.status = 'ACCEPTED'
                  AND pp.user_id = $2
              )
            )

          LIMIT 1
        `,
        [
          conversationId,
          req.user.id,
        ]
      );

    if (
      conversationResult.rowCount === 0
    ) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found.',
      });
    }

    const conversation =
      conversationResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Prevent messages after conversation has ended
    |--------------------------------------------------------------------------
    */

    if (
      conversation.status === 'ENDED' ||
      conversation.status === 'DELETED'
    ) {
      return res.status(409).json({
        success: false,
        message:
          'This conversation is no longer active.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Make sure the authenticated user has a valid role
    |--------------------------------------------------------------------------
    */

    if (
      conversation.viewer_role !== 'USER' &&
      conversation.viewer_role !== 'PROFESSIONAL'
    ) {
      return res.status(403).json({
        success: false,
        message:
          'You are not authorized to send messages in this conversation.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Determine sender type
    |--------------------------------------------------------------------------
    */

    const senderType =
      conversation.viewer_role === 'PROFESSIONAL'
        ? 'PROFESSIONAL'
        : 'USER';

    /*
    |--------------------------------------------------------------------------
    | Insert message
    |--------------------------------------------------------------------------
    */

    const result =
      await pool.query(
        `
          INSERT INTO messages (
            conversation_id,
            sender_type,
            sender_user_id,
            content
          )
          VALUES ($1, $2, $3, $4)
          RETURNING
            id,
            sender_type,
            content,
            created_at
        `,
        [
          conversationId,
          senderType,
          req.user.id,
          message,
        ]
      );

    const savedMessage =
      result.rows[0];

    return res.status(201).json({
      success: true,

      message: {
        id: savedMessage.id,

        sender:
          savedMessage.sender_type === 'PROFESSIONAL'
            ? 'professional'
            : savedMessage.sender_type === 'SYSTEM'
            ? 'justtalk'
            : 'user',

        text:
          savedMessage.content,

        timestamp:
          savedMessage.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| End Conversation
|--------------------------------------------------------------------------
*/

const endConversation = async (
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
    | Verify conversation ownership
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

    if (
      conversationResult.rowCount === 0
    ) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        success: false,
        message: 'Conversation not found.',
      });
    }

    const conversation =
      conversationResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Prevent ending an already-ended conversation
    |--------------------------------------------------------------------------
    */

    if (
      conversation.status === 'ENDED'
    ) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'This conversation has already ended.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | End conversation
    |--------------------------------------------------------------------------
    */

    const endedConversationResult =
      await client.query(
        `
          UPDATE conversations
          SET
            status = 'ENDED',
            ended_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            status,
            ended_at,
            updated_at
        `,
        [conversationId]
      );

    const endedConversation =
      endedConversationResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Complete the accepted matching request
    |--------------------------------------------------------------------------
    */

    const matchingResult =
      await client.query(
        `
          UPDATE matching_requests
          SET
            status = CASE
              WHEN status IN ('WAITING', 'MATCHED')
                THEN 'CANCELLED'
              WHEN status = 'ACCEPTED'
                THEN 'COMPLETED'
              ELSE status
            END,

            cancelled_at = CASE
              WHEN status IN ('WAITING', 'MATCHED')
                THEN NOW()
              ELSE cancelled_at
            END

          WHERE conversation_id = $1
            AND user_id = $2
            AND status IN (
              'WAITING',
              'MATCHED',
              'ACCEPTED'
            )

          RETURNING
            id,
            status,
            professional_id
        `,
        [
          conversationId,
          req.user.id,
        ]
      );

    /*
    |--------------------------------------------------------------------------
    | Release the professional
    |--------------------------------------------------------------------------
    |
    | Once the session ends, the professional becomes AVAILABLE again.
    | They must still be APPROVED to remain eligible for matching.
    |
    */

    if (matchingResult.rowCount > 0) {
      for (
        const matchingRequest of matchingResult.rows
      ) {
        if (!matchingRequest.professional_id) {
          continue;
        }

        await client.query(
          `
            UPDATE professional_profiles
            SET
              availability_status = 'AVAILABLE',
              updated_at = NOW()
            WHERE id = $1
              AND verification_status = 'APPROVED'
              AND availability_status = 'BUSY'
          `,
          [matchingRequest.professional_id]
        );
      }
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,

      conversation: {
        id: endedConversation.id,

        status:
          endedConversation.status,

        endedAt:
          endedConversation.ended_at,
      },

      matchingRequest:
        matchingResult.rowCount > 0
          ? {
              id:
                matchingResult.rows[0].id,

              status:
                matchingResult.rows[0].status,
            }
          : null,

      message:
        'Conversation ended successfully.',
    });
  } catch (error) {
    await client.query('ROLLBACK');

    next(error);
  } finally {
    client.release();
  }
};


module.exports = {
  createConversation,
  getConversation,
  sendMessage,
  endConversation,
};


  } finally {
    client.release();
  }
};


module.exports = {
  createConversation,
  getConversation,
  sendMessage,
  endConversation,
};