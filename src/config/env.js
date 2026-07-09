require('dotenv').config();

const int = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

/** Managed MySQL providers (Aiven, PlanetScale, etc.) require TLS. */
const sslConfig = () =>
  process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

/** Railway/Aiven: set MYSQL_URL and it overrides the individual DB_* vars. */
function dbConfig() {
  if (process.env.MYSQL_URL) {
    const u = new URL(process.env.MYSQL_URL);
    const sslMode = u.searchParams.get('ssl-mode') || u.searchParams.get('sslmode');
    return {
      host: u.hostname,
      port: int(u.port, 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, '') || process.env.DB_NAME || 'relay',
      ssl: sslMode && sslMode.toUpperCase() !== 'DISABLED' ? sslConfig() || { rejectUnauthorized: false } : sslConfig(),
    };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: int(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'relay',
    ssl: sslConfig(),
  };
}

module.exports = {
  port: int(process.env.PORT, 3000),
  baseUrl: process.env.BASE_URL || `http://localhost:${int(process.env.PORT, 3000)}`,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  corsOrigin: process.env.CORS_ORIGIN || process.env.BASE_URL || 'http://localhost:3000',

  db: dbConfig(),

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_only_secret_do_not_use_in_prod',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  auth: {
    maxLoginAttempts: int(process.env.MAX_LOGIN_ATTEMPTS, 5),
    lockoutMinutes: int(process.env.LOCKOUT_MINUTES, 15),
  },

  chat: {
    bufferCapacity: int(process.env.BUFFER_CAPACITY, 200),
    dailyMessageLimit: int(process.env.DAILY_MESSAGE_LIMIT, 500),
    messageMaxLength: int(process.env.MESSAGE_MAX_LENGTH, 2000),
    wsMaxPayloadBytes: 8 * 1024,
    minMsBetweenMessages: 300, // trivial per-socket flood guard
  },

  rate: {
    windowMs: int(process.env.RATE_WINDOW_MINUTES, 15) * 60 * 1000,
    maxGeneral: int(process.env.RATE_MAX_GENERAL, 300),
    maxRooms: int(process.env.RATE_MAX_ROOMS, 20),
    maxAuth: int(process.env.RATE_MAX_AUTH, 10),
  },
};
