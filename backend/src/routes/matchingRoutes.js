const express = require('express');

const validate = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');

const {
  matchingRequestLimiter,
  acceptMatchingRequestLimiter,
  matchingStatusLimiter,
  professionalAvailabilityLimiter,
} = require('../middleware/rateLimiters');

const {
  createMatchingRequestSchema,
  matchingRequestIdSchema,
  availabilitySchema,
} = require('../utils/matchingSchemas');

const {
  createMatchingRequest,
  getMatchingRequest,
  cancelMatchingRequest,
  updateAvailability,
  acceptMatchingRequest,
  declineMatchingRequest,
} = require('../controllers/matchingController');

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Professional Availability
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This route must come before /:requestId so "professional" is not
| interpreted as a request ID.
|
*/

router.patch(
  '/professional/availability',
  requireAuth,
  professionalAvailabilityLimiter,
  validate(availabilitySchema),
  updateAvailability
);

/*
|--------------------------------------------------------------------------
| Create Matching Request
|--------------------------------------------------------------------------
|
| POST /api/matching
|
*/

router.post(
  '/',
  requireAuth,
  matchingRequestLimiter,
  validate(createMatchingRequestSchema),
  createMatchingRequest
);

/*
|--------------------------------------------------------------------------
| Accept Matching Request
|--------------------------------------------------------------------------
|
| POST/PATCH /api/matching/:requestId/accept
|
*/

router.patch(
  '/:requestId/accept',
  requireAuth,
  acceptMatchingRequestLimiter,
  validate(matchingRequestIdSchema),
  acceptMatchingRequest
);

/*
|--------------------------------------------------------------------------
| Get Matching Request
|--------------------------------------------------------------------------
|
| GET /api/matching/:requestId
|
*/

/*
|--------------------------------------------------------------------------
| Decline Matching Request
|--------------------------------------------------------------------------
|
| PATCH /api/matching/:requestId/decline
|
*/

router.patch(
  '/:requestId/decline',
  requireAuth,
  matchingRequestLimiter,
  validate(matchingRequestIdSchema),
  declineMatchingRequest
);

router.get(
  '/:requestId',
  requireAuth,
  matchingStatusLimiter,
  validate(matchingRequestIdSchema),
  getMatchingRequest
);

/*
|--------------------------------------------------------------------------
| Cancel Matching Request
|--------------------------------------------------------------------------
|
| PATCH /api/matching/:requestId/cancel
|
*/

router.patch(
  '/:requestId/cancel',
  requireAuth,
  matchingRequestLimiter,
  validate(matchingRequestIdSchema),
  cancelMatchingRequest
);

module.exports = router;