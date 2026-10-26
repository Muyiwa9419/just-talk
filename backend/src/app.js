const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const matchingRoutes =
  require('./routes/matchingRoutes');
  const adminRoutes = require('./routes/adminRoutes');
const conversationRoutes =
  require('./routes/conversationRoutes');
  const professionalRoutes = require('./routes/professionalRoutes');
  const userRoutes =
  require('./routes/userRoutes');
  const communityRoutes = require('./routes/communityRoutes');
  
const adminCommunityRoutes =
  require('./routes/adminCommunityRoutes');



const app = express();

/*
|--------------------------------------------------------------------------
| Security Headers
|--------------------------------------------------------------------------
*/

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  })
);

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header,
      // such as local server-to-server requests.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const error = new Error(
        'Origin not allowed by CORS'
      );

      error.status = 403;

      return callback(error);
    },

    credentials: true,
  })
);

/*
|--------------------------------------------------------------------------
| Body Parsing
|--------------------------------------------------------------------------
|
| These MUST come before the API routes.
|
*/

app.use(
  express.json({
    limit: '50kb',
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: '50kb',
  })
);

app.use(cookieParser());

/*
|--------------------------------------------------------------------------
| Global Rate Limiter
|--------------------------------------------------------------------------
*/

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message:
      'Too many requests. Please try again later.',
  },
});

app.use('/api', globalLimiter);

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

app.use('/api/auth', authRoutes);

app.use(
  '/api/conversations',
  conversationRoutes
);


app.use(
  '/api/matching',
  matchingRoutes
);

app.use(
  '/api/professionals', 
  professionalRoutes
);

app.use(
  '/api/users',
  userRoutes
);

app.use(
  '/api/community',
  communityRoutes
);

app.use(
  '/api/admin', 
  adminRoutes
);

app.use(
  '/api/admin/community',
  adminCommunityRoutes
);
/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Just Talk API is running',
  });
});

/*
|--------------------------------------------------------------------------
| 404 Handler
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

/*
|--------------------------------------------------------------------------
| Global Error Handler
|--------------------------------------------------------------------------
*/

app.use((err, req, res, next) => {
  console.error(err.message);

  res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === 'production'
        ? 'Something went wrong.'
        : err.message,
  });
});

module.exports = app;