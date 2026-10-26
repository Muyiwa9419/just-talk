const express = require('express');

const validate =
  require('../middleware/validation');

const {
  requireAuth,
} = require('../middleware/auth');

const {
  registerLimiter,
  loginLimiter,
} = require('../middleware/rateLimiters');

const {
  registerSchema,
  loginSchema,
} = require('../utils/validationSchemas');

const {
  register,
  login,
  professionalLogin,
  adminLogin,
  logout,
  me,
} = require('../controllers/authController');

const router = express.Router();

/*
|--------------------------------------------------------------------------
| User Registration
|--------------------------------------------------------------------------
*/

router.post(
  '/register',
  registerLimiter,
  validate(registerSchema),
  register
);

/*
|--------------------------------------------------------------------------
| User Login
|--------------------------------------------------------------------------
*/

router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  login
);

/*
|--------------------------------------------------------------------------
| Professional Login
|--------------------------------------------------------------------------
*/

router.post(
  '/professional-login',
  loginLimiter,
  validate(loginSchema),
  professionalLogin
);

/*
|--------------------------------------------------------------------------
| Admin Login
|--------------------------------------------------------------------------
*/

router.post(
  '/admin-login',
  loginLimiter,
  validate(loginSchema),
  adminLogin
);

/*
|--------------------------------------------------------------------------
| Logout
|--------------------------------------------------------------------------
*/

router.post(
  '/logout',
  requireAuth,
  logout
);

/*
|--------------------------------------------------------------------------
| Current Authenticated Account
|--------------------------------------------------------------------------
*/

router.get(
  '/me',
  requireAuth,
  me
);

module.exports = router;