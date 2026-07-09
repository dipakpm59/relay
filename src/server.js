const http = require('http');
const app = require('./app');
const env = require('./config/env');
const pool = require('./config/db');
const gateway = require('./ws/gateway');
const logger = require('./utils/logger');

async function start() {
  try {
    await pool.query('SELECT 1'); // fail fast if MySQL is unreachable

    // One HTTP server carries both Express and the WebSocket upgrade.
    const server = http.createServer(app);
    gateway.init(server);

    server.listen(env.port, () => {
      logger.info('Relay running', { url: env.baseUrl, ws: `${env.baseUrl.replace(/^http/, 'ws')}/ws`, env: env.nodeEnv });
    });
  } catch (err) {
    logger.error('Could not connect to MySQL', { msg: err.message });
    logger.error('Check .env (or MYSQL_URL on Railway) and run `npm run db:init` first.');
    process.exit(1);
  }
}

process.on('unhandledRejection', (err) => {
  logger.error('unhandled rejection', { msg: err && err.message });
});

start();
