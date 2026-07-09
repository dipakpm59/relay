const helmet = require('helmet');
const hpp = require('hpp');
const cors = require('cors');
const compression = require('compression');
const xss = require('xss');
const env = require('../config/env');

/**
 * Recursive XSS sanitization of HTTP body/query fields. Password fields are
 * skipped (they're hashed, never rendered). Message bodies get sanitized in
 * the shared validator instead, because they also arrive over WebSockets.
 */
const SKIP = new Set(['password', 'currentPassword', 'newPassword']);

function deepSanitize(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string' && !SKIP.has(key)) {
      obj[key] = xss(val, { whiteList: {}, stripIgnoreTag: true });
    } else if (val && typeof val === 'object') {
      deepSanitize(val);
    }
  }
}

exports.xssSanitizer = (req, _res, next) => {
  deepSanitize(req.body);
  deepSanitize(req.query);
  deepSanitize(req.params);
  next();
};

exports.helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      fontSrc: ["'self'", 'https://cdn.jsdelivr.net', 'data:'],
      imgSrc: ["'self'", 'data:'],                 // data: → QR PNGs
      connectSrc: ["'self'", 'ws:', 'wss:'],       // the WebSocket
    },
  },
  crossOriginEmbedderPolicy: false,
});

exports.hppGuard = hpp();
exports.compress = compression();
exports.corsConfig = cors({
  origin: env.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
});
