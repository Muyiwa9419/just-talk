const { pool } = require('../config/database');

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

const isValidUuid = (value) => {
  if (typeof value !== 'string') {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
};

const cleanText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};


/*
|--------------------------------------------------------------------------
| Get Community Categories
|--------------------------------------------------------------------------
*/

const getCategories = async (req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id,
          name,
          slug,
          description,
          is_active,
          created_at,
          updated_at
        FROM community_categories
        WHERE is_active = TRUE
        ORDER BY created_at ASC
      `
    );

    return res.status(200).json({
      success: true,
      categories: result.rows,
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Get Community Posts
|--------------------------------------------------------------------------
*/

const getPosts = async (req, res, next) => {
  try {
    const requestedLimit = Number.parseInt(
      req.query.limit,
      10
    );

    const requestedOffset = Number.parseInt(
      req.query.offset,
      10
    );

    const limit =
      Number.isInteger(requestedLimit) &&
      requestedLimit > 0
        ? Math.min(requestedLimit, 50)
        : 20;

    const offset =
      Number.isInteger(requestedOffset) &&
      requestedOffset >= 0
        ? requestedOffset
        : 0;

    const categoryId =
      typeof req.query.categoryId === 'string'
        ? req.query.categoryId.trim()
        : null;

    const categorySlug =
      typeof req.query.category === 'string'
        ? req.query.category.trim()
        : null;

    if (
      categoryId &&
      !isValidUuid(categoryId)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID.',
      });
    }

    const values = [];
    const conditions = [
      `p.status = 'PUBLISHED'`,
      `c.is_active = TRUE`,
    ];

    if (categoryId) {
      values.push(categoryId);
      conditions.push(
        `p.category_id = $${values.length}`
      );
    }

    if (categorySlug) {
      values.push(categorySlug);
      conditions.push(
        `c.slug = $${values.length}`
      );
    }

    values.push(limit);
    const limitIndex = values.length;

    values.push(offset);
    const offsetIndex = values.length;

    const result = await pool.query(
      `
        SELECT
          p.id,
          p.anonymous_name,
          p.title,
          p.body,
          p.status,
          p.reply_count,
          p.reaction_count,
          p.created_at,
          p.updated_at,

          c.id AS category_id,
          c.name AS category_name,
          c.slug AS category_slug,
          c.description AS category_description

        FROM community_posts p

        INNER JOIN community_categories c
          ON c.id = p.category_id

        WHERE ${conditions.join(' AND ')}

        ORDER BY p.created_at DESC

        LIMIT $${limitIndex}
        OFFSET $${offsetIndex}
      `,
      values
    );

    return res.status(200).json({
      success: true,

      posts: result.rows.map((post) => ({
        id: post.id,

        anonymousName:
          post.anonymous_name,

        title: post.title,

        body: post.body,

        status: post.status,

        replyCount:
          post.reply_count,

        reactionCount:
          post.reaction_count,

        createdAt:
          post.created_at,

        updatedAt:
          post.updated_at,

        category: {
          id: post.category_id,
          name: post.category_name,
          slug: post.category_slug,
          description:
            post.category_description,
        },
      })),

      pagination: {
        limit,
        offset,
        returned: result.rows.length,
      },
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Get Single Community Post
|--------------------------------------------------------------------------
*/

const getPost = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid post ID.',
      });
    }

    const postResult = await pool.query(
      `
        SELECT
          p.id,
          p.anonymous_name,
          p.title,
          p.body,
          p.status,
          p.reply_count,
          p.reaction_count,
          p.created_at,
          p.updated_at,

          c.id AS category_id,
          c.name AS category_name,
          c.slug AS category_slug,
          c.description AS category_description

        FROM community_posts p

        INNER JOIN community_categories c
          ON c.id = p.category_id

        WHERE p.id = $1
          AND p.status = 'PUBLISHED'
          AND c.is_active = TRUE

        LIMIT 1
      `,
      [id]
    );

    if (postResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Community post not found.',
      });
    }

    const post = postResult.rows[0];

    const repliesResult = await pool.query(
      `
        SELECT
          id,
          anonymous_name,
          body,
          status,
          created_at,
          updated_at

        FROM community_replies

        WHERE post_id = $1
          AND status = 'PUBLISHED'

        ORDER BY created_at ASC
      `,
      [id]
    );

    return res.status(200).json({
      success: true,

      post: {
        id: post.id,

        anonymousName:
          post.anonymous_name,

        title: post.title,

        body: post.body,

        status: post.status,

        replyCount:
          post.reply_count,

        reactionCount:
          post.reaction_count,

        createdAt:
          post.created_at,

        updatedAt:
          post.updated_at,

        category: {
          id: post.category_id,
          name: post.category_name,
          slug: post.category_slug,
          description:
            post.category_description,
        },

        replies:
          repliesResult.rows.map((reply) => ({
            id: reply.id,

            anonymousName:
              reply.anonymous_name,

            body: reply.body,

            status: reply.status,

            createdAt:
              reply.created_at,

            updatedAt:
              reply.updated_at,
          })),
      },
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Create Community Post
|--------------------------------------------------------------------------
*/

const createPost = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const anonymousName =
      req.user.anonymousName;

    /*
    |----------------------------------------------------------------------
    | Community requires an anonymous user identity
    |----------------------------------------------------------------------
    */

    if (!anonymousName) {
      return res.status(403).json({
        success: false,
        message:
          'A user account with an anonymous identity is required to create a community post.',
      });
    }

    const title = cleanText(
      req.body?.title
    );

    const body = cleanText(
      req.body?.body
    );

    const categoryId = cleanText(
      req.body?.categoryId
    );

    /*
    |----------------------------------------------------------------------
    | Validation
    |----------------------------------------------------------------------
    */

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Post title is required.',
      });
    }

    if (title.length > 160) {
      return res.status(400).json({
        success: false,
        message:
          'Post title cannot exceed 160 characters.',
      });
    }

    if (!body) {
      return res.status(400).json({
        success: false,
        message: 'Post body is required.',
      });
    }

    if (body.length > 10000) {
      return res.status(400).json({
        success: false,
        message:
          'Post body cannot exceed 10,000 characters.',
      });
    }

    if (!isValidUuid(categoryId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid category is required.',
      });
    }

    /*
    |----------------------------------------------------------------------
    | Check category
    |----------------------------------------------------------------------
    */

    const categoryResult = await client.query(
      `
        SELECT
          id,
          name,
          slug
        FROM community_categories
        WHERE id = $1
          AND is_active = TRUE
        LIMIT 1
      `,
      [categoryId]
    );

    if (categoryResult.rowCount === 0) {
      return res.status(400).json({
        success: false,
        message:
          'The selected community category is not available.',
      });
    }

    /*
    |----------------------------------------------------------------------
    | Create post
    |----------------------------------------------------------------------
    */

    await client.query('BEGIN');

    const result = await client.query(
      `
        INSERT INTO community_posts (
          category_id,
          anonymous_name,
          title,
          body
        )
        VALUES (
          $1,
          $2,
          $3,
          $4
        )
        RETURNING
          id,
          category_id,
          anonymous_name,
          title,
          body,
          status,
          reply_count,
          reaction_count,
          created_at,
          updated_at
      `,
      [
        categoryId,
        anonymousName,
        title,
        body,
      ]
    );

    await client.query('COMMIT');

    const post = result.rows[0];
    const category = categoryResult.rows[0];

    return res.status(201).json({
      success: true,

      message:
        'Your post has been published anonymously.',

      post: {
        id: post.id,

        anonymousName:
          post.anonymous_name,

        title: post.title,

        body: post.body,

        status: post.status,

        replyCount:
          post.reply_count,

        reactionCount:
          post.reaction_count,

        createdAt:
          post.created_at,

        updatedAt:
          post.updated_at,

        category: {
          id: category.id,
          name: category.name,
          slug: category.slug,
        },
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Ignore rollback errors.
    }

    next(error);
  } finally {
    client.release();
  }
};


/*
|--------------------------------------------------------------------------
| Get Replies
|--------------------------------------------------------------------------
*/

const getReplies = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid post ID.',
      });
    }

    const postResult = await pool.query(
      `
        SELECT id
        FROM community_posts
        WHERE id = $1
          AND status = 'PUBLISHED'
        LIMIT 1
      `,
      [id]
    );

    if (postResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Community post not found.',
      });
    }

    const result = await pool.query(
      `
        SELECT
          id,
          anonymous_name,
          body,
          status,
          created_at,
          updated_at

        FROM community_replies

        WHERE post_id = $1
          AND status = 'PUBLISHED'

        ORDER BY created_at ASC
      `,
      [id]
    );

    return res.status(200).json({
      success: true,

      replies: result.rows.map(
        (reply) => ({
          id: reply.id,

          anonymousName:
            reply.anonymous_name,

          body: reply.body,

          status: reply.status,

          createdAt:
            reply.created_at,

          updatedAt:
            reply.updated_at,
        })
      ),
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Create Reply
|--------------------------------------------------------------------------
*/

const createReply = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const anonymousName =
      req.user.anonymousName;

    if (!anonymousName) {
      return res.status(403).json({
        success: false,
        message:
          'A user account with an anonymous identity is required to reply.',
      });
    }

    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid post ID.',
      });
    }

    const body = cleanText(
      req.body?.body
    );

    if (!body) {
      return res.status(400).json({
        success: false,
        message: 'Reply cannot be empty.',
      });
    }

    if (body.length > 5000) {
      return res.status(400).json({
        success: false,
        message:
          'Reply cannot exceed 5,000 characters.',
      });
    }

    await client.query('BEGIN');

    /*
    |----------------------------------------------------------------------
    | Lock the post while updating reply count
    |----------------------------------------------------------------------
    */

    const postResult = await client.query(
      `
        SELECT id
        FROM community_posts
        WHERE id = $1
          AND status = 'PUBLISHED'
        FOR UPDATE
      `,
      [id]
    );

    if (postResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        success: false,
        message: 'Community post not found.',
      });
    }

    /*
    |----------------------------------------------------------------------
    | Create reply
    |----------------------------------------------------------------------
    */

    const replyResult = await client.query(
      `
        INSERT INTO community_replies (
          post_id,
          anonymous_name,
          body
        )
        VALUES (
          $1,
          $2,
          $3
        )
        RETURNING
          id,
          post_id,
          anonymous_name,
          body,
          status,
          created_at,
          updated_at
      `,
      [
        id,
        anonymousName,
        body,
      ]
    );

    /*
    |----------------------------------------------------------------------
    | Increment reply count
    |----------------------------------------------------------------------
    */

    await client.query(
      `
        UPDATE community_posts
        SET
          reply_count = reply_count + 1,
          updated_at = NOW()
        WHERE id = $1
      `,
      [id]
    );

    await client.query('COMMIT');

    const reply =
      replyResult.rows[0];

    return res.status(201).json({
      success: true,

      message:
        'Your reply has been published anonymously.',

      reply: {
        id: reply.id,

        postId:
          reply.post_id,

        anonymousName:
          reply.anonymous_name,

        body:
          reply.body,

        status:
          reply.status,

        createdAt:
          reply.created_at,

        updatedAt:
          reply.updated_at,
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Ignore rollback errors.
    }

    next(error);
  } finally {
    client.release();
  }
};


/*
|--------------------------------------------------------------------------
| React To Post
|--------------------------------------------------------------------------
*/

const reactToPost = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid post ID.',
      });
    }

    /*
    |----------------------------------------------------------------------
    | Use the authenticated account as the private reaction key.
    |
    | It is never returned to the public community.
    |----------------------------------------------------------------------
    */

    const anonymousKey =
      req.user.id;

    const reactionType =
      'SUPPORT';

    await client.query('BEGIN');

    const postResult = await client.query(
      `
        SELECT id
        FROM community_posts
        WHERE id = $1
          AND status = 'PUBLISHED'
        FOR UPDATE
      `,
      [id]
    );

    if (postResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        success: false,
        message: 'Community post not found.',
      });
    }

    const existingReaction =
      await client.query(
        `
          SELECT id
          FROM community_reactions
          WHERE post_id = $1
            AND anonymous_key = $2
            AND reaction_type = $3
          LIMIT 1
        `,
        [
          id,
          anonymousKey,
          reactionType,
        ]
      );

    let reacted;

    if (existingReaction.rowCount > 0) {
      /*
      |--------------------------------------------------------------------
      | Remove reaction
      |--------------------------------------------------------------------
      */

      await client.query(
        `
          DELETE FROM community_reactions
          WHERE id = $1
        `,
        [existingReaction.rows[0].id]
      );

      await client.query(
        `
          UPDATE community_posts
          SET
            reaction_count =
              GREATEST(reaction_count - 1, 0),
            updated_at = NOW()
          WHERE id = $1
        `,
        [id]
      );

      reacted = false;
    } else {
      /*
      |--------------------------------------------------------------------
      | Add reaction
      |--------------------------------------------------------------------
      */

      await client.query(
        `
          INSERT INTO community_reactions (
            post_id,
            reaction_type,
            anonymous_key
          )
          VALUES ($1, $2, $3)
        `,
        [
          id,
          reactionType,
          anonymousKey,
        ]
      );

      await client.query(
        `
          UPDATE community_posts
          SET
            reaction_count =
              reaction_count + 1,
            updated_at = NOW()
          WHERE id = $1
        `,
        [id]
      );

      reacted = true;
    }

    const countResult = await client.query(
      `
        SELECT reaction_count
        FROM community_posts
        WHERE id = $1
      `,
      [id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,

      reacted,

      reactionType,

      reactionCount:
        countResult.rows[0]
          .reaction_count,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Ignore rollback errors.
    }

    next(error);
  } finally {
    client.release();
  }
};


/*
|--------------------------------------------------------------------------
| Report Community Content
|--------------------------------------------------------------------------
*/

const reportContent = async (req, res, next) => {
  try {
    const {
      postId,
      replyId,
      reason,
      details,
    } = req.body || {};

    const cleanPostId =
      cleanText(postId);

    const cleanReplyId =
      cleanText(replyId);

    const cleanReason =
      cleanText(reason);

    const cleanDetails =
      cleanText(details);

    /*
    |----------------------------------------------------------------------
    | Exactly one target must be supplied
    |----------------------------------------------------------------------
    */

    if (
      (!cleanPostId && !cleanReplyId) ||
      (cleanPostId && cleanReplyId)
    ) {
      return res.status(400).json({
        success: false,
        message:
          'A report must target either a post or a reply.',
      });
    }

    if (
      cleanPostId &&
      !isValidUuid(cleanPostId)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid post ID.',
      });
    }

    if (
      cleanReplyId &&
      !isValidUuid(cleanReplyId)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reply ID.',
      });
    }

    if (!cleanReason) {
      return res.status(400).json({
        success: false,
        message: 'A report reason is required.',
      });
    }

    if (cleanReason.length > 100) {
      return res.status(400).json({
        success: false,
        message:
          'Report reason cannot exceed 100 characters.',
      });
    }

    if (cleanDetails.length > 500) {
      return res.status(400).json({
        success: false,
        message:
          'Report details cannot exceed 500 characters.',
      });
    }

    /*
    |----------------------------------------------------------------------
    | Verify target exists
    |----------------------------------------------------------------------
    */

    if (cleanPostId) {
      const postResult =
        await pool.query(
          `
            SELECT id
            FROM community_posts
            WHERE id = $1
            LIMIT 1
          `,
          [cleanPostId]
        );

      if (postResult.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Post not found.',
        });
      }
    }

    if (cleanReplyId) {
      const replyResult =
        await pool.query(
          `
            SELECT id
            FROM community_replies
            WHERE id = $1
            LIMIT 1
          `,
          [cleanReplyId]
        );

      if (replyResult.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Reply not found.',
        });
      }
    }

    /*
    |----------------------------------------------------------------------
    | Prevent duplicate pending reports
    |----------------------------------------------------------------------
    */

    const duplicateResult =
      await pool.query(
        `
          SELECT id
          FROM community_reports
          WHERE reporter_key = $1
            AND status = 'PENDING'
            AND (
              ($2::uuid IS NOT NULL AND post_id = $2::uuid)
              OR
              ($3::uuid IS NOT NULL AND reply_id = $3::uuid)
            )
          LIMIT 1
        `,
        [
          req.user.id,
          cleanPostId || null,
          cleanReplyId || null,
        ]
      );

    if (duplicateResult.rowCount > 0) {
      return res.status(409).json({
        success: false,
        message:
          'You have already reported this content.',
      });
    }

    const result = await pool.query(
      `
        INSERT INTO community_reports (
          post_id,
          reply_id,
          reason,
          details,
          reporter_key
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5
        )
        RETURNING
          id,
          status,
          created_at
      `,
      [
        cleanPostId || null,
        cleanReplyId || null,
        cleanReason,
        cleanDetails || null,
        req.user.id,
      ]
    );

    return res.status(201).json({
      success: true,

      message:
        'Thank you. Your report has been submitted for review.',

      report: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        createdAt:
          result.rows[0].created_at,
      },
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
  getCategories,
  getPosts,
  getPost,
  createPost,
  getReplies,
  createReply,
  reactToPost,
  reportContent,
};