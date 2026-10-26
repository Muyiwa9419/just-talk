const { pool } = require('../config/database');

/*
|--------------------------------------------------------------------------
| Create Matching Request
|--------------------------------------------------------------------------
|
| Called by a user when they want to be connected with a professional.
|
| Flow:
| 1. Verify the conversation belongs to the user.
| 2. Verify the conversation is active.
| 3. Prevent duplicate active matching requests.
| 4. Find an approved and available professional.
| 5. Temporarily assign the professional if one is found.
| 6. Put the conversation into WAITING_FOR_PROFESSIONAL.
|
*/

const createMatchingRequest = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { category, conversationId } = req.validated.body;

    await client.query('BEGIN');

    /*
    |--------------------------------------------------------------------------
    | Verify conversation ownership and status
    |--------------------------------------------------------------------------
    */

    const conversationResult = await client.query(
      `
        SELECT
          id,
          user_id,
          topic,
          status
        FROM conversations
        WHERE id = $1
          AND user_id = $2
          AND deleted_at IS NULL
        FOR UPDATE
      `,
      [conversationId, req.user.id]
    );

    if (conversationResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        success: false,
        message: 'Conversation not found.',
      });
    }

    const conversation = conversationResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Validate conversation state
    |--------------------------------------------------------------------------
    */

    if (
      conversation.status === 'ENDED' ||
      conversation.status === 'DELETED'
    ) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'A professional cannot be requested for an ended conversation.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Prevent duplicate active matching requests
    |--------------------------------------------------------------------------
    */

    const existingRequestResult = await client.query(
      `
        SELECT
          id,
          status
        FROM matching_requests
        WHERE user_id = $1
          AND conversation_id = $2
          AND status IN ('WAITING', 'MATCHED', 'ACCEPTED')
        LIMIT 1
      `,
      [req.user.id, conversationId]
    );

    if (existingRequestResult.rowCount > 0) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'A professional matching request already exists for this conversation.',
        matchingRequest: {
          id: existingRequestResult.rows[0].id,
          status: existingRequestResult.rows[0].status,
        },
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Find an available professional
    |--------------------------------------------------------------------------
    |
    | A professional must:
    |
    | - be approved
    | - be marked AVAILABLE
    | - match the requested category, OR have no category restrictions
    | - not already have another MATCHED request
    |
    | FOR UPDATE + SKIP LOCKED helps prevent two simultaneous users from
    | being assigned the same professional.
    |
    */

    const professionalResult = await client.query(
      `
        SELECT
          pp.id,
          pp.display_name,
          pp.categories
        FROM professional_profiles pp
        WHERE pp.verification_status = 'APPROVED'
          AND pp.availability_status = 'AVAILABLE'
          AND (
            cardinality(pp.categories) = 0
            OR $1 = ANY(pp.categories)
          )
          AND NOT EXISTS (
            SELECT 1
            FROM matching_requests mr
            WHERE mr.professional_id = pp.id
              AND mr.status = 'MATCHED'
          )
        ORDER BY pp.created_at ASC
        FOR UPDATE OF pp SKIP LOCKED
        LIMIT 1
      `,
      [category]
    );

    const professional =
      professionalResult.rowCount > 0
        ? professionalResult.rows[0]
        : null;

    /*
    |--------------------------------------------------------------------------
    | Determine matching status
    |--------------------------------------------------------------------------
    */

    const matchingStatus = professional ? 'MATCHED' : 'WAITING';

    /*
    |--------------------------------------------------------------------------
    | Create matching request
    |--------------------------------------------------------------------------
    */

    const matchingRequestResult = await client.query(
      `
        INSERT INTO matching_requests (
          user_id,
          conversation_id,
          category,
          status,
          professional_id
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id,
          user_id,
          conversation_id,
          category,
          status,
          professional_id,
          created_at,
          expires_at
      `,
      [
        req.user.id,
        conversationId,
        category,
        matchingStatus,
        professional ? professional.id : null,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | Update conversation status
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        UPDATE conversations
        SET
          status = 'WAITING_FOR_PROFESSIONAL',
          updated_at = NOW()
        WHERE id = $1
      `,
      [conversationId]
    );

    await client.query('COMMIT');

    const matchingRequest = matchingRequestResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Response
    |--------------------------------------------------------------------------
    */

    return res.status(201).json({
      success: true,
      matchingRequest: {
        id: matchingRequest.id,
        category: matchingRequest.category,
        status: matchingRequest.status,
        conversationId: matchingRequest.conversation_id,
        professionalId: matchingRequest.professional_id,
        createdAt: matchingRequest.created_at,
        expiresAt: matchingRequest.expires_at,
      },
      professional: professional
        ? {
            id: professional.id,
            displayName: professional.display_name,
          }
        : null,
      message: professional
        ? 'A professional has been matched and is waiting to accept the conversation.'
        : 'Your request has been added to the professional matching queue.',
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
| Get Matching Request
|--------------------------------------------------------------------------
|
| Allows the requesting user to check the current state of their request.
|
*/

const getMatchingRequest = async (req, res, next) => {
  try {
    const { requestId } = req.validated.params;

    const result = await pool.query(
      `
        SELECT
          mr.id,
          mr.user_id,
          mr.conversation_id,
          mr.category,
          mr.status,
          mr.professional_id,
          mr.created_at,
          mr.matched_at,
          mr.accepted_at,
          mr.cancelled_at,
          mr.expires_at,

          pp.display_name AS professional_display_name,
          pp.verification_status AS professional_verification_status,
          pp.availability_status AS professional_availability_status

        FROM matching_requests mr

        LEFT JOIN professional_profiles pp
          ON pp.id = mr.professional_id

        WHERE mr.id = $1
          AND mr.user_id = $2
      `,
      [requestId, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Matching request not found.',
      });
    }

    const request = result.rows[0];

    return res.status(200).json({
      success: true,
      matchingRequest: {
        id: request.id,
        conversationId: request.conversation_id,
        category: request.category,
        status: request.status,
        createdAt: request.created_at,
        matchedAt: request.matched_at,
        acceptedAt: request.accepted_at,
        cancelledAt: request.cancelled_at,
        expiresAt: request.expires_at,
      },

      professional: request.professional_id
        ? {
            id: request.professional_id,
            displayName: request.professional_display_name,
            verificationStatus:
              request.professional_verification_status,
            availabilityStatus:
              request.professional_availability_status,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Cancel Matching Request
|--------------------------------------------------------------------------
|
| The requesting user can cancel a request while it is:
|
| WAITING
| MATCHED
|
| Once ACCEPTED, the professional has already connected to the
| conversation and the request should no longer be cancelled through
| this endpoint.
|
*/

const cancelMatchingRequest = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { requestId } = req.validated.params;

    await client.query('BEGIN');

    /*
    |--------------------------------------------------------------------------
    | Lock matching request
    |--------------------------------------------------------------------------
    */

    const requestResult = await client.query(
      `
        SELECT
          id,
          user_id,
          conversation_id,
          professional_id,
          status
        FROM matching_requests
        WHERE id = $1
          AND user_id = $2
        FOR UPDATE
      `,
      [requestId, req.user.id]
    );

    if (requestResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        success: false,
        message: 'Matching request not found.',
      });
    }

    const request = requestResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Validate request state
    |--------------------------------------------------------------------------
    */

    if (!['WAITING', 'MATCHED'].includes(request.status)) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'This matching request can no longer be cancelled.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Cancel request
    |--------------------------------------------------------------------------
    */

    const cancelledResult = await client.query(
      `
        UPDATE matching_requests
        SET
          status = 'CANCELLED',
          cancelled_at = NOW()
        WHERE id = $1
          AND status IN ('WAITING', 'MATCHED')
        RETURNING
          id,
          status,
          cancelled_at
      `,
      [requestId]
    );

    /*
    |--------------------------------------------------------------------------
    | If a professional had been assigned but had not accepted,
    | make sure they remain AVAILABLE.
    |--------------------------------------------------------------------------
    */

    if (request.professional_id) {
      await client.query(
        `
          UPDATE professional_profiles
          SET
            availability_status = 'AVAILABLE',
            updated_at = NOW()
          WHERE id = $1
            AND availability_status = 'BUSY'
        `,
        [request.professional_id]
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Return conversation to ACTIVE
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        UPDATE conversations
        SET
          status = 'ACTIVE',
          updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
          AND deleted_at IS NULL
          AND status = 'WAITING_FOR_PROFESSIONAL'
      `,
      [request.conversation_id, req.user.id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      matchingRequest: {
        id: cancelledResult.rows[0].id,
        status: cancelledResult.rows[0].status,
        cancelledAt: cancelledResult.rows[0].cancelled_at,
      },
      message: 'Professional matching request cancelled.',
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
| Update Professional Availability
|--------------------------------------------------------------------------
|
| Only an approved professional can change their availability.
|
| AVAILABLE = can receive matching requests
| OFFLINE   = cannot receive new matching requests
|
| BUSY is controlled by the system when a professional accepts a
| matching request.
|
*/

const updateAvailability = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { availability } = req.validated.body;

    await client.query('BEGIN');

    /*
    |--------------------------------------------------------------------------
    | Lock professional profile
    |--------------------------------------------------------------------------
    */

    const professionalResult = await client.query(
      `
        SELECT
          id,
          display_name,
          verification_status,
          availability_status,
          categories
        FROM professional_profiles
        WHERE user_id = $1
        FOR UPDATE
      `,
      [req.user.id]
    );

    if (professionalResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(403).json({
        success: false,
        message:
          'You do not have an approved professional profile.',
      });
    }

    const professional =
      professionalResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Professional must be approved
    |--------------------------------------------------------------------------
    */

    if (
      professional.verification_status !== 'APPROVED'
    ) {
      await client.query('ROLLBACK');

      return res.status(403).json({
        success: false,
        message:
          'You do not have an approved professional profile.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Prevent a BUSY professional from manually becoming AVAILABLE
    |--------------------------------------------------------------------------
    |
    | The system controls BUSY while a connected conversation is active.
    |
    */

    const activeAssignmentResult = await client.query(
  `
    SELECT id
    FROM matching_requests
    WHERE professional_id = $1
      AND status IN ('MATCHED', 'ACCEPTED')
    LIMIT 1
  `,
  [professional.id]
);

if (
  activeAssignmentResult.rowCount > 0
) {
  await client.query('ROLLBACK');

  return res.status(409).json({
    success: false,
    message:
      'You cannot change your availability while you have an active matching request.',
  });
}

    /*
    |--------------------------------------------------------------------------
    | Update requested availability
    |--------------------------------------------------------------------------
    */

    const availabilityResult = await client.query(
      `
        UPDATE professional_profiles
        SET
          availability_status = $1,
          updated_at = NOW()
        WHERE id = $2
        RETURNING
          id,
          display_name,
          verification_status,
          availability_status,
          updated_at
      `,
      [
        availability,
        professional.id,
      ]
    );

    const updatedProfessional =
      availabilityResult.rows[0];

    let matchedRequest = null;

    /*
    |--------------------------------------------------------------------------
    | Process waiting queue
    |--------------------------------------------------------------------------
    |
    | When a professional becomes AVAILABLE, immediately look for the oldest
    | compatible WAITING request.
    |
    */

    if (availability === 'AVAILABLE') {
      const waitingRequestResult =
        await client.query(
          `
            SELECT
              mr.id,
              mr.user_id,
              mr.conversation_id,
              mr.category
            FROM matching_requests mr

            INNER JOIN conversations c
              ON c.id = mr.conversation_id

            WHERE mr.status = 'WAITING'
              AND (
                mr.expires_at IS NULL
                OR mr.expires_at > NOW()
              )

              AND c.status IN (
                'ACTIVE',
                'WAITING_FOR_PROFESSIONAL'
                )

              AND (
                cardinality($1::text[]) = 0
                OR mr.category = ANY($1::text[])
              )

            ORDER BY
              mr.created_at ASC

            FOR UPDATE OF mr SKIP LOCKED
            LIMIT 1
          `,
          [professional.categories]
        );

      if (waitingRequestResult.rowCount > 0) {
        const waitingRequest =
          waitingRequestResult.rows[0];

        /*
        |----------------------------------------------------------------------
        | Make sure this professional has no active assignment already
        |----------------------------------------------------------------------
        */

        const activeAssignmentResult =
          await client.query(
            `
              SELECT id
              FROM matching_requests
              WHERE professional_id = $1
                AND status IN ('MATCHED', 'ACCEPTED')
              LIMIT 1
            `,
            [professional.id]
          );

        if (
          activeAssignmentResult.rowCount === 0
        ) {
          /*
          |--------------------------------------------------------------------
          | Assign professional to waiting request
          |--------------------------------------------------------------------
          */

          const matchedResult =
            await client.query(
              `
                UPDATE matching_requests
                SET
                  status = 'MATCHED',
                  professional_id = $1,
                  matched_at = NOW()
                WHERE id = $2
                  AND status = 'WAITING'
                RETURNING
                  id,
                  conversation_id,
                  category,
                  status,
                  professional_id,
                  matched_at
              `,
              [
                professional.id,
                waitingRequest.id,
              ]
            );

          if (matchedResult.rowCount > 0) {
            matchedRequest =
              matchedResult.rows[0];

            /*
            |------------------------------------------------------------------
            | Put conversation into waiting-for-professional state
            |------------------------------------------------------------------
            */

            await client.query(
              `
                UPDATE conversations
                SET
                  status = 'WAITING_FOR_PROFESSIONAL',
                  updated_at = NOW()
                WHERE id = $1
                  AND status = 'ACTIVE'
                  AND deleted_at IS NULL
              `,
              [waitingRequest.conversation_id]
            );
          }
        }
      }
    }

    await client.query('COMMIT');

    /*
    |--------------------------------------------------------------------------
    | Response
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      professional: {
        id: updatedProfessional.id,

        displayName:
          updatedProfessional.display_name,

        verificationStatus:
          updatedProfessional.verification_status,

        availabilityStatus:
          updatedProfessional.availability_status,

        updatedAt:
          updatedProfessional.updated_at,
      },

      matchingRequest: matchedRequest
        ? {
            id: matchedRequest.id,

            conversationId:
              matchedRequest.conversation_id,

            category:
              matchedRequest.category,

            status:
              matchedRequest.status,

            professionalId:
              matchedRequest.professional_id,

            matchedAt:
              matchedRequest.matched_at,
          }
        : null,

      message: matchedRequest
        ? 'Availability updated and a waiting conversation has been matched to you.'
        : `Availability updated to ${updatedProfessional.availability_status}.`,
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
| Accept Matching Request
|--------------------------------------------------------------------------
|
| Called by a professional when they accept a request assigned to them.
|
*/

const acceptMatchingRequest = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { requestId } = req.validated.params;

    await client.query('BEGIN');

    /*
    |--------------------------------------------------------------------------
    | Get and lock professional profile
    |--------------------------------------------------------------------------
    */

    const professionalResult = await client.query(
      `
        SELECT
          id,
          display_name,
          verification_status,
          availability_status
        FROM professional_profiles
        WHERE user_id = $1
        FOR UPDATE
      `,
      [req.user.id]
    );

    if (professionalResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(403).json({
        success: false,
        message: 'Professional profile not found.',
      });
    }

    const professional = professionalResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Professional must be approved
    |--------------------------------------------------------------------------
    */

    if (professional.verification_status !== 'APPROVED') {
      await client.query('ROLLBACK');

      return res.status(403).json({
        success: false,
        message:
          'Your professional profile is not approved.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Professional must be available
    |--------------------------------------------------------------------------
    */

    if (professional.availability_status !== 'AVAILABLE') {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'You are not currently available for a new conversation.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Get and lock matching request
    |--------------------------------------------------------------------------
    */

    const requestResult = await client.query(
      `
        SELECT
          id,
          user_id,
          conversation_id,
          category,
          status,
          professional_id
        FROM matching_requests
        WHERE id = $1
          AND professional_id = $2
        FOR UPDATE
      `,
      [requestId, professional.id]
    );

    if (requestResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        success: false,
        message:
          'Matching request not found or not assigned to you.',
      });
    }

    const request = requestResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Request must still be MATCHED
    |--------------------------------------------------------------------------
    */

    if (request.status !== 'MATCHED') {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'This matching request is no longer available.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Accept request
    |--------------------------------------------------------------------------
    */

    const acceptedResult = await client.query(
      `
        UPDATE matching_requests
        SET
          status = 'ACCEPTED',
          accepted_at = NOW()
        WHERE id = $1
          AND status = 'MATCHED'
        RETURNING
          id,
          status,
          accepted_at
      `,
      [requestId]
    );

    if (acceptedResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'This matching request was already accepted or is no longer available.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Mark professional BUSY
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        UPDATE professional_profiles
        SET
          availability_status = 'BUSY',
          updated_at = NOW()
        WHERE id = $1
      `,
      [professional.id]
    );

    /*
    |--------------------------------------------------------------------------
    | Connect conversation
    |--------------------------------------------------------------------------
    */

    const conversationResult = await client.query(
      `
        UPDATE conversations
        SET
          status = 'PROFESSIONAL_CONNECTED',
          updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
          AND deleted_at IS NULL
          AND status = 'WAITING_FOR_PROFESSIONAL'
        RETURNING
          id,
          topic,
          status,
          updated_at
      `,
      [
        request.conversation_id,
        request.user_id,
      ]
    );

    if (conversationResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'The conversation is no longer available.',
      });
    }

    const conversation =
      conversationResult.rows[0];

    await client.query('COMMIT');

    /*
    |--------------------------------------------------------------------------
    | Response
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      matchingRequest: {
        id: acceptedResult.rows[0].id,
        status: acceptedResult.rows[0].status,
        acceptedAt:
          acceptedResult.rows[0].accepted_at,
      },

      conversation: {
        id: conversation.id,
        topic: conversation.topic,
        status: conversation.status,
        updatedAt: conversation.updated_at,
      },

      professional: {
        id: professional.id,
        displayName:
          professional.display_name,
      },

      message:
        'Matching request accepted. You are now connected to the conversation.',
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
| Decline Matching Request
|--------------------------------------------------------------------------
|
| Called by a professional when they do not want to accept
| a MATCHED request.
|
| MATCHED -> CANCELLED
|
| The requester can then decide whether to request another
| professional.
|
*/

const declineMatchingRequest = async (
  req,
  res,
  next
) => {
  const client = await pool.connect();

  try {
    const { requestId } =
      req.validated.params;

    await client.query('BEGIN');

    /*
    |--------------------------------------------------------------------------
    | Get and lock professional profile
    |--------------------------------------------------------------------------
    */

    const professionalResult =
      await client.query(
        `
          SELECT
            id,
            display_name,
            verification_status,
            availability_status
          FROM professional_profiles
          WHERE user_id = $1
          FOR UPDATE
        `,
        [req.user.id]
      );

    if (professionalResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(403).json({
        success: false,
        message: 'Professional profile not found.',
      });
    }

    const professional =
      professionalResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Professional must be approved
    |--------------------------------------------------------------------------
    */

    if (
      professional.verification_status !==
      'APPROVED'
    ) {
      await client.query('ROLLBACK');

      return res.status(403).json({
        success: false,
        message:
          'Your professional profile is not approved.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Get and lock assigned request
    |--------------------------------------------------------------------------
    */

    const requestResult =
      await client.query(
        `
          SELECT
            id,
            user_id,
            conversation_id,
            category,
            status,
            professional_id
          FROM matching_requests
          WHERE id = $1
            AND professional_id = $2
          FOR UPDATE
        `,
        [
          requestId,
          professional.id,
        ]
      );

    if (requestResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        success: false,
        message:
          'Matching request not found or not assigned to you.',
      });
    }

    const request =
      requestResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Request must still be MATCHED
    |--------------------------------------------------------------------------
    */

    if (request.status !== 'MATCHED') {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'This matching request is no longer available to decline.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Cancel the request
    |--------------------------------------------------------------------------
    */

    const cancelledResult =
      await client.query(
        `
          UPDATE matching_requests
          SET
            status = 'CANCELLED',
            cancelled_at = NOW()
          WHERE id = $1
            AND status = 'MATCHED'
          RETURNING
            id,
            status,
            cancelled_at
        `,
        [requestId]
      );

    if (cancelledResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        message:
          'This matching request was already handled.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Return conversation to ACTIVE
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        UPDATE conversations
        SET
          status = 'ACTIVE',
          updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
          AND deleted_at IS NULL
          AND status = 'WAITING_FOR_PROFESSIONAL'
      `,
      [
        request.conversation_id,
        request.user_id,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | Release professional
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        UPDATE professional_profiles
        SET
          availability_status = 'AVAILABLE',
          updated_at = NOW()
        WHERE id = $1
          AND verification_status = 'APPROVED'
      `,
      [professional.id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,

      matchingRequest: {
        id:
          cancelledResult.rows[0].id,

        status:
          cancelledResult.rows[0].status,

        cancelledAt:
          cancelledResult.rows[0].cancelled_at,
      },

      conversation: {
        id:
          request.conversation_id,

        status: 'ACTIVE',
      },

      professional: {
        id:
          professional.id,

        displayName:
          professional.display_name,

        availabilityStatus:
          'AVAILABLE',
      },

      message:
        'Matching request declined. You are now available for another conversation.',
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
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
  createMatchingRequest,
  getMatchingRequest,
  cancelMatchingRequest,
  updateAvailability,
  acceptMatchingRequest,
  declineMatchingRequest,
};