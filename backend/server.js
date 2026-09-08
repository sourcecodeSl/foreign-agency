require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log('[api] Main Admin System listening on http://localhost:' + PORT);
  console.log('[api] Environment: ' + (process.env.NODE_ENV || 'development'));
});

// Fail loudly rather than leaving the process in a broken state.
process.on('unhandledRejection', (reason) => {
  console.error('[api] Unhandled rejection:', reason);
  server.close(() => process.exit(1));
});
