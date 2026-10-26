
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
| Get Community Reports
|--------------------------------------------------------------------------
|
| Admin only.
|
| Returns pending reports first, followed by the newest reports.
|
|--------------------------------------------------------------------------
*/

const getCommunityReports = async (
  req,
  res,
  next
) => {
  try {
    const requestedLimit =
      Number.parseInt(
        req.query.limit,
        10
      );

    const requestedOffset =
      Number.parseInt(
        req.query.offset,
        10
      );

    const limit =
      Number.isInteger(requestedLimit) &&
      requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 50;

    const offset =
      Number.isInteger(requestedOffset) &&
      requestedOffset >= 0
        ? requestedOffset
        : 0;

    const requestedStatus =
      typeof req.query.status === 'string'
        ? req.query.status.trim().toUpperCase()
        : '';

    const allowedStatuses = [
      'PENDING',
      'REVIEWED',
      'RESOLVED',
      'DISMISSED',
    ];

    if (
      requestedStatus &&
      !allowedStatuses.includes(
        requestedStatus
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid report status.',
      });
    }

    const values = [];

    const conditions = [];

    if (requestedStatus) {
      values.push(requestedStatus);

      conditions.push(
        `r.status = $${values.length}`
      );
    }

    values.push(limit);
    const limitIndex = values.length;

    values.push(offset);
    const offsetIndex = values.length;

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    const result = await pool.query(
      `
        SELECT
          r.id,
          r.post_id,
          r.reply_id,
          r.reason,
          r.details,
          r.reporter_key,
          r.status,
          r.reviewed_by,
          r.reviewed_at,
          r.created_at,

          /*
          |--------------------------------------------------------------
          | Reported post information
          |--------------------------------------------------------------
          */

          p.anonymous_name AS post_anonymous_name,
          p.title AS post_title,
          p.body AS post_body,
          p.status AS post_status,
          p.reply_count AS post_reply_count,
          p.reaction_count AS post_reaction_count,
          p.created_at AS post_created_at,

          pc.id AS post_category_id,
          pc.name AS post_category_name,
          pc.slug AS post_category_slug,

          /*
          |--------------------------------------------------------------
          | Reported reply information
          |--------------------------------------------------------------
          */

          rr.anonymous_name AS reply_anonymous_name,
          rr.body AS reply_body,
          rr.status AS reply_status,
          rr.created_at AS reply_created_at,

          /*
          |--------------------------------------------------------------
          | Reviewer
          |--------------------------------------------------------------
          */

          reviewer.email AS reviewer_email

        FROM community_reports r

        LEFT JOIN community_posts p
          ON p.id = r.post_id

        LEFT JOIN community_categories pc
          ON pc.id = p.category_id

        LEFT JOIN community_replies rr
          ON rr.id = r.reply_id

        LEFT JOIN users reviewer
          ON reviewer.id = r.reviewed_by

        ${whereClause}

        ORDER BY
          CASE
            WHEN r.status = 'PENDING'
            THEN 0
            ELSE 1
          END,
          r.created_at DESC

        LIMIT $${limitIndex}
        OFFSET $${offsetIndex}
      `,
      values
    );

    /*
    |--------------------------------------------------------------------------
    | Total report count
    |--------------------------------------------------------------------------
    */

    const countValues = [];

    const countConditions = [];

    if (requestedStatus) {
      countValues.push(
        requestedStatus
      );

      countConditions.push(
        `status = $${countValues.length}`
      );
    }

    const countWhere =
      countConditions.length > 0
        ? `WHERE ${countConditions.join(
            ' AND '
          )}`
        : '';

    const countResult =
      await pool.query(
        `
          SELECT
            COUNT(*)::INTEGER AS total
          FROM community_reports
          ${countWhere}
        `,
        countValues
      );

    /*
    |--------------------------------------------------------------------------
    | Pending count
    |--------------------------------------------------------------------------
    */

    const pendingResult =
      await pool.query(
        `
          SELECT
            COUNT(*)::INTEGER AS pending
          FROM community_reports
          WHERE status = 'PENDING'
        `
      );

    return res.status(200).json({
      success: true,

      reports: result.rows.map(
        (report) => ({
          id: report.id,

          targetType:
            report.post_id
              ? 'POST'
              : 'REPLY',

          postId:
            report.post_id,

          replyId:
            report.reply_id,

          reason:
            report.reason,

          details:
            report.details,

          status:
            report.status,

          createdAt:
            report.created_at,

          reviewedAt:
            report.reviewed_at,

          reviewerEmail:
            report.reviewer_email,

          post: report.post_id
            ? {
                id: report.post_id,

                anonymousName:
                  report.post_anonymous_name,

                title:
                  report.post_title,

                body:
                  report.post_body,

                status:
                  report.post_status,

                replyCount:
                  report.post_reply_count,

                reactionCount:
                  report.post_reaction_count,

                createdAt:
                  report.post_created_at,

                category: {
                  id:
                    report.post_category_id,

                  name:
                    report.post_category_name,

                  slug:
                    report.post_category_slug,
                },
              }
            : null,

          reply: report.reply_id
            ? {
                id:
                  report.reply_id,

                anonymousName:
                  report.reply_anonymous_name,

                body:
                  report.reply_body,

                status:
                  report.reply_status,

                createdAt:
                  report.reply_created_at,
              }
            : null,
        })
      ),

      pagination: {
        limit,
        offset,
        returned:
          result.rows.length,
        total:
          countResult.rows[0].total,
      },

      pendingCount:
        pendingResult.rows[0].pending,
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Get Single Community Report
|--------------------------------------------------------------------------
*/

const getCommunityReport = async (
  req,
  res,
  next
) => {
  try {
    const { reportId } =
      req.params;

    if (!isValidUuid(reportId)) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid report ID.',
      });
    }

    const result = await pool.query(
      `
        SELECT
          r.id,
          r.post_id,
          r.reply_id,
          r.reason,
          r.details,
          r.reporter_key,
          r.status,
          r.reviewed_by,
          r.reviewed_at,
          r.created_at,

          p.anonymous_name AS post_anonymous_name,
          p.title AS post_title,
          p.body AS post_body,
          p.status AS post_status,
          p.created_at AS post_created_at,

          pc.id AS post_category_id,
          pc.name AS post_category_name,
          pc.slug AS post_category_slug,

          rr.anonymous_name AS reply_anonymous_name,
          rr.body AS reply_body,
          rr.status AS reply_status,
          rr.created_at AS reply_created_at,

          reviewer.email AS reviewer_email

        FROM community_reports r

        LEFT JOIN community_posts p
          ON p.id = r.post_id

        LEFT JOIN community_categories pc
          ON pc.id = p.category_id

        LEFT JOIN community_replies rr
          ON rr.id = r.reply_id

        LEFT JOIN users reviewer
          ON reviewer.id = r.reviewed_by

        WHERE r.id = $1

        LIMIT 1
      `,
      [reportId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message:
          'Community report not found.',
      });
    }

    const report =
      result.rows[0];

    return res.status(200).json({
      success: true,

      report: {
        id: report.id,

        targetType:
          report.post_id
            ? 'POST'
            : 'REPLY',

        postId:
          report.post_id,

        replyId:
          report.reply_id,

        reason:
          report.reason,

        details:
          report.details,

        status:
          report.status,

        createdAt:
          report.created_at,

        reviewedAt:
          report.reviewed_at,

        reviewerEmail:
          report.reviewer_email,

        post: report.post_id
          ? {
              id:
                report.post_id,

              anonymousName:
                report.post_anonymous_name,

              title:
                report.post_title,

              body:
                report.post_body,

              status:
                report.post_status,

              createdAt:
                report.post_created_at,

              category: {
                id:
                  report.post_category_id,

                name:
                  report.post_category_name,

                slug:
                  report.post_category_slug,
              },
            }
          : null,

        reply: report.reply_id
          ? {
              id:
                report.reply_id,

              anonymousName:
                report.reply_anonymous_name,

              body:
                report.reply_body,

              status:
                report.reply_status,

              createdAt:
                report.reply_created_at,
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
| Review Community Report
|--------------------------------------------------------------------------
|
| Supported report statuses:
|
| REVIEWED
| RESOLVED
| DISMISSED
|
|--------------------------------------------------------------------------
*/

const reviewCommunityReport = async (
  req,
  res,
  next
) => {
  const client =
    await pool.connect();

  try {
    const { reportId } =
      req.params;

    if (!isValidUuid(reportId)) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid report ID.',
      });
    }

    const status =
      cleanText(
        req.body?.status
      ).toUpperCase();

    const allowedStatuses = [
      'REVIEWED',
      'RESOLVED',
      'DISMISSED',
    ];

    if (
      !allowedStatuses.includes(
        status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid moderation status.',
      });
    }

    await client.query(
      'BEGIN'
    );

    /*
    |--------------------------------------------------------------------------
    | Lock report
    |--------------------------------------------------------------------------
    */

    const reportResult =
      await client.query(
        `
          SELECT
            id,
            post_id,
            reply_id,
            status
          FROM community_reports
          WHERE id = $1
          FOR UPDATE
        `,
        [reportId]
      );

    if (
      reportResult.rowCount === 0
    ) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(404).json({
        success: false,
        message:
          'Community report not found.',
      });
    }

    const report =
      reportResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Determine post/reply moderation action
    |--------------------------------------------------------------------------
    |
    | RESOLVED:
    |   Report is resolved but content stays visible.
    |
    | DISMISSED:
    |   Report is dismissed and content stays visible.
    |
    | REVIEWED:
    |   Report has been inspected but no final action recorded.
    |
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        UPDATE community_reports
        SET
          status = $1,
          reviewed_by = $2,
          reviewed_at = NOW()
        WHERE id = $3
      `,
      [
        status,
        req.user.id,
        reportId,
      ]
    );

    await client.query(
      'COMMIT'
    );

    return res.status(200).json({
      success: true,

      message:
        status === 'DISMISSED'
          ? 'Report dismissed.'
          : status === 'RESOLVED'
          ? 'Report marked as resolved.'
          : 'Report marked as reviewed.',

      report: {
        id: reportId,
        status,
      },
    });
  } catch (error) {
    try {
      await client.query(
        'ROLLBACK'
      );
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
| Moderate Reported Content
|--------------------------------------------------------------------------
|
| Actions:
|
| KEEP
| HIDE
| REMOVE
|
|--------------------------------------------------------------------------
*/

const moderateReportedContent = async (
  req,
  res,
  next
) => {
  const client =
    await pool.connect();

  try {
    const { reportId } =
      req.params;

    const action =
      cleanText(
        req.body?.action
      ).toUpperCase();

    if (!isValidUuid(reportId)) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid report ID.',
      });
    }

    const allowedActions = [
      'KEEP',
      'HIDE',
      'REMOVE',
    ];

    if (
      !allowedActions.includes(
        action
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid moderation action.',
      });
    }

    await client.query(
      'BEGIN'
    );

    const reportResult =
      await client.query(
        `
          SELECT
            id,
            post_id,
            reply_id,
            status
          FROM community_reports
          WHERE id = $1
          FOR UPDATE
        `,
        [reportId]
      );

    if (
      reportResult.rowCount === 0
    ) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(404).json({
        success: false,
        message:
          'Community report not found.',
      });
    }

    const report =
      reportResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | KEEP
    |--------------------------------------------------------------------------
    */

    if (action === 'KEEP') {
      await client.query(
        `
          UPDATE community_reports
          SET
            status = 'DISMISSED',
            reviewed_by = $1,
            reviewed_at = NOW()
          WHERE id = $2
        `,
        [
          req.user.id,
          reportId,
        ]
      );

      await client.query(
        'COMMIT'
      );

      return res.status(200).json({
        success: true,
        message:
          'Content kept. Report dismissed.',
        action,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | HIDE / REMOVE
    |--------------------------------------------------------------------------
    */

    if (report.post_id) {
      const newStatus =
        action === 'HIDE'
          ? 'HIDDEN'
          : 'REMOVED';

      await client.query(
        `
          UPDATE community_posts
          SET
            status = $1,
            updated_at = NOW()
          WHERE id = $2
        `,
        [
          newStatus,
          report.post_id,
        ]
      );
    }

    if (report.reply_id) {
      const newStatus =
        action === 'HIDE'
          ? 'HIDDEN'
          : 'REMOVED';

      await client.query(
        `
          UPDATE community_replies
          SET
            status = $1,
            updated_at = NOW()
          WHERE id = $2
        `,
        [
          newStatus,
          report.reply_id,
        ]
      );
    }

    await client.query(
      `
        UPDATE community_reports
        SET
          status = 'RESOLVED',
          reviewed_by = $1,
          reviewed_at = NOW()
        WHERE id = $2
      `,
      [
        req.user.id,
        reportId,
      ]
    );

    await client.query(
      'COMMIT'
    );

    return res.status(200).json({
      success: true,

      message:
        action === 'HIDE'
          ? 'Content has been hidden.'
          : 'Content has been removed.',

      action,
    });
  } catch (error) {
    try {
      await client.query(
        'ROLLBACK'
      );
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
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
  getCommunityReports,
  getCommunityReport,
  reviewCommunityReport,
  moderateReportedContent,
};

