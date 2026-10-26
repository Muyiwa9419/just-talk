const express = require('express');

const validate = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');

const {
  createProfessionalProfileSchema,
  updateProfessionalProfileSchema,
} = require('../utils/professionalSchemas');

const {
  createProfessionalProfile,
  getMyProfessionalProfile,
  updateMyProfessionalProfile,
  getProfessionalDashboard,
} = require('../controllers/professionalController');

const router = express.Router();


/*
|--------------------------------------------------------------------------
| Create Professional Application
|--------------------------------------------------------------------------
|
| POST /api/professionals
|
*/

router.post(
  '/',
  requireAuth,
  validate(createProfessionalProfileSchema),
  createProfessionalProfile
);


/*
|--------------------------------------------------------------------------
| Get My Professional Profile
|--------------------------------------------------------------------------
|
| GET /api/professionals/me
|
*/

router.get(
  '/me',
  requireAuth,
  getMyProfessionalProfile
);

/*
|--------------------------------------------------------------------------
| Professional Dashboard
|--------------------------------------------------------------------------
|
| GET /api/professionals/me/dashboard
|
*/

router.get(
  '/me/dashboard',
  requireAuth,
  getProfessionalDashboard
);


/*
|--------------------------------------------------------------------------
| Update My Professional Profile
|--------------------------------------------------------------------------
|
| PATCH /api/professionals/me
|
*/

router.patch(
  '/me',
  requireAuth,
  validate(updateProfessionalProfileSchema),
  updateMyProfessionalProfile
);


module.exports = router;