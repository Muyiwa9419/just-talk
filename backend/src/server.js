require('dotenv').config();

const app = require('./app');
const {
  testDatabaseConnection,
} = require('./config/database');
const {
  cleanupSessions,
} = require('./services/sessionCleanup');



const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await testDatabaseConnection();
    await cleanupSessions();

      const sessionCleanupInterval =
        setInterval(
          cleanupSessions,
          60 * 60 * 1000
        );
    const server = app.listen(PORT, () => {
      console.log(
        `Just Talk API running on http://localhost:${PORT}`
      );
    });
    
    const shutdown = () => {
      console.log('Shutting down Just Talk API...');

      server.close(() => {
        console.log('Server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error(
      'Unable to start Just Talk API:',
      error.message
    );

    process.exit(1);
  }
};

startServer();