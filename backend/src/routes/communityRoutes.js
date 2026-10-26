const express = require('express');

const {
  getCategories,
  getPosts,
  getPost,
  createPost,
  getReplies,
  createReply,
  reactToPost,
  reportContent,
} = require('../controllers/communityController');

const {
  requireAuth,
} = require('../middleware/auth');

const router = express.Router();


/*
|--------------------------------------------------------------------------
| Public Community Routes
|--------------------------------------------------------------------------
|
| Reading the community does not require an account.
|
|--------------------------------------------------------------------------
*/

router.get(
  '/categories',
  getCategories
);

router.get(
  '/posts',
  getPosts
);

router.get(
  '/posts/:id',
  getPost
);


/*
|--------------------------------------------------------------------------
| Authenticated Community Routes
|--------------------------------------------------------------------------
|
| Creating content and interacting with the community requires
| an authenticated Just Talk account.
|
|--------------------------------------------------------------------------
*/

router.post(
  '/posts',
  requireAuth,
  createPost
);

router.get(
  '/posts/:id/replies',
  getReplies
);

router.post(
  '/posts/:id/replies',
  requireAuth,
  createReply
);

router.post(
  '/posts/:id/react',
  requireAuth,
  reactToPost
);

router.post(
  '/reports',
  requireAuth,
  reportContent
);


module.exports = router;