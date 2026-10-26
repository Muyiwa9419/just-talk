
const express = require('express');

const {
  requireAuth,
} = require('../middleware/auth');

const {
  requireAdmin,
} = require('../middleware/admin');

const {
  getCommunityReports,
  getCommunityReport,
  reviewCommunityReport,
  moderateReportedContent,
} = require('../controllers/adminCommunityController');

const router = express.Router();

/*
|--------------------------------------------------------------------------
| All routes below require administrator authentication.
|--------------------------------------------------------------------------
*/

router.get(
  '/reports',
  requireAuth,
  requireAdmin,
  getCommunityReports
);

router.get(
  '/reports/:reportId',
  requireAuth,
  requireAdmin,
  getCommunityReport
);

router.patch(
  '/reports/:reportId',
  requireAuth,
  requireAdmin,
  reviewCommunityReport
);

router.patch(
  '/reports/:reportId/moderate',
  requireAuth,
  requireAdmin,
  moderateReportedContent
);

module.exports = router;
