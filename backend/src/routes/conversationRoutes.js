const express = require('express');

const validate =
  require('../middleware/validation');

const {
  requireAuth,
} = require('../middleware/auth');

const {
  createConversationLimiter,
  messageLimiter,
} = require('../middleware/rateLimiters');

const {
  createConversationSchema,
  sendMessageSchema,
  conversationIdSchema,
} = require('../utils/conversationSchemas');

const {
  createConversation,
  getConversation,
  sendMessage,
  endConversation,
} = require('../controllers/conversationController');

const router = express.Router();


/*
|--------------------------------------------------------------------------
| Create conversation
|--------------------------------------------------------------------------
*/

router.post(
  '/',
  requireAuth,
  createConversationLimiter,
  validate(createConversationSchema),
  createConversation
);


/*
|--------------------------------------------------------------------------
| Get conversation
|--------------------------------------------------------------------------
*/

router.get(
  '/:conversationId',
  requireAuth,
  validate(conversationIdSchema),
  getConversation
);


/*
|--------------------------------------------------------------------------
| Send message
|--------------------------------------------------------------------------
*/

router.post(
  '/:conversationId/messages',
  requireAuth,
  messageLimiter,
  validate(sendMessageSchema),
  sendMessage
);


/*
|--------------------------------------------------------------------------
| End conversation
|--------------------------------------------------------------------------
*/

router.patch(
  '/:conversationId/end',
  requireAuth,
  validate(conversationIdSchema),
  endConversation
);


module.exports = router;