const rateLimit = require('express-rate-limit');


const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,

  standardHeaders: 'draft-8',
  legacyHeaders: false,

  message: {
    success: false,
    message:
      'Too many registration attempts. Please try again later.',
  },
});


const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,

  standardHeaders: 'draft-8',
  legacyHeaders: false,

  message: {
    success: false,
    message:
      'Too many login attempts. Please try again later.',
  },
});


const createConversationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,

  standardHeaders: 'draft-8',
  legacyHeaders: false,

  message: {
    success: false,
    message:
      'Too many conversations created. Please try again later.',
  },
});


const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,

  standardHeaders: 'draft-8',
  legacyHeaders: false,

  message: {
    success: false,
    message:
      'You are sending messages too quickly. Please slow down.',
  },
});

const matchingRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      'Too many matching requests. Please try again later.',
  },
});

const acceptMatchingRequestLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 10,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message:
      'Too many matching acceptance attempts. Please try again later.',
  },
});

const matchingStatusLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message:
      'Too many matching status requests. Please slow down.',
  },
});

const professionalAvailabilityLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      'Too many availability changes. Please try again later.',
  },
});

module.exports = {
  registerLimiter,
  loginLimiter,
  createConversationLimiter,
  messageLimiter,
  matchingRequestLimiter,
  acceptMatchingRequestLimiter,
  matchingStatusLimiter,
  professionalAvailabilityLimiter,
};