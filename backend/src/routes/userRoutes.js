const express = require('express');

const validate =
  require('../middleware/validation');

const {
  requireAuth,
} = require('../middleware/auth');

const {
  getMyConversationsSchema,
} = require('../utils/userSchemas');

const {
  getCurrentUser,
  getMyConversations,
  getActiveConversation,
  deleteMyConversation,
} = require('../controllers/userController');

const {
  conversationIdSchema,
} = require('../utils/conversationSchemas');

const router = express.Router();


/*
|--------------------------------------------------------------------------
| Get Current User
|--------------------------------------------------------------------------
|
| GET /api/users/me
|
*/

router.get(
  '/me',
  requireAuth,
  getCurrentUser
);


/*
|--------------------------------------------------------------------------
| Get My Conversations
|--------------------------------------------------------------------------
|
| GET /api/users/me/conversations
|
*/

router.get(
  '/me/conversations',
  requireAuth,
  validate(getMyConversationsSchema),
  getMyConversations
);


/*
|--------------------------------------------------------------------------
| Get Active Conversation
|--------------------------------------------------------------------------
|
| GET /api/users/me/active-conversation
|
*/

router.get(
  '/me/active-conversation',
  requireAuth,
  getActiveConversation
);

/*
|--------------------------------------------------------------------------
| Delete My Conversation
|--------------------------------------------------------------------------
|
| DELETE /api/users/me/conversations/:conversationId
|
*/

router.delete(
  '/me/conversations/:conversationId',
  requireAuth,
  validate(conversationIdSchema),
  deleteMyConversation
);


module.exports = router;