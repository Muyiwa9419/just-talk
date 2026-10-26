const express = require('express');

const validate = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

const {
  professionalIdSchema,
  userIdSchema,
  adminUsersSchema,
} = require('../utils/adminSchemas');

const {
  getAdminDashboard,
  getAdminUsers,
  suspendUser,
  reactivateUser,
  getProfessionalApplications,
  approveProfessional,
  rejectProfessional,
} = require('../controllers/adminController');

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Admin Dashboard
|--------------------------------------------------------------------------
|
| GET /api/admin/dashboard
|
*/

router.get(
  '/dashboard',
  requireAuth,
  requireAdmin,
  getAdminDashboard
);

/*
|--------------------------------------------------------------------------
| Get Users
|--------------------------------------------------------------------------
|
| GET /api/admin/users
|
*/

router.get(
  '/users',
  requireAuth,
  requireAdmin,
  validate(adminUsersSchema),
  getAdminUsers
);


/*
|--------------------------------------------------------------------------
| Suspend User
|--------------------------------------------------------------------------
|
| PATCH /api/admin/users/:userId/suspend
|
*/

router.patch(
  '/users/:userId/suspend',
  requireAuth,
  requireAdmin,
  validate(userIdSchema),
  suspendUser
);


/*
|--------------------------------------------------------------------------
| Reactivate User
|--------------------------------------------------------------------------
|
| PATCH /api/admin/users/:userId/reactivate
|
*/

router.patch(
  '/users/:userId/reactivate',
  requireAuth,
  requireAdmin,
  validate(userIdSchema),
  reactivateUser
);

/*
|--------------------------------------------------------------------------
| Get Professional Applications
|--------------------------------------------------------------------------
|
| GET /api/admin/professionals
|
*/

router.get(
  '/professionals',
  requireAuth,
  requireAdmin,
  getProfessionalApplications
);


/*
|--------------------------------------------------------------------------
| Approve Professional
|--------------------------------------------------------------------------
|
| PATCH /api/admin/professionals/:professionalId/approve
|
*/

router.patch(
  '/professionals/:professionalId/approve',
  requireAuth,
  requireAdmin,
  validate(professionalIdSchema),
  approveProfessional
);


/*
|--------------------------------------------------------------------------
| Reject Professional
|--------------------------------------------------------------------------
|
| PATCH /api/admin/professionals/:professionalId/reject
|
*/

router.patch(
  '/professionals/:professionalId/reject',
  requireAuth,
  requireAdmin,
  validate(professionalIdSchema),
  rejectProfessional
);


module.exports = router;