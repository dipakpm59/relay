const path = require('path');
const logger = require('../utils/logger');
const env = require('../config/env');
const HTTP = require('../constants/httpStatus');
const MSG = require('../constants/messages');

const VIEWS = path.join(__dirname, '..', '..', 'views');

exports.notFound = (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(HTTP.NOT_FOUND).json({ error: MSG.NOT_FOUND });
  }
  res.status(HTTP.NOT_FOUND).sendFile(path.join(VIEWS, '404.html'));
};

// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  const status = err.isOperational ? err.statusCode : HTTP.INTERNAL_ERROR;

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} → ${err.message}`, {
      stack: env.isProd ? undefined : err.stack,
    });
  } else {
    logger.warn(`${req.method} ${req.originalUrl} → ${status} ${err.message}`);
  }

  if (res.headersSent) return;

  if (req.path.startsWith('/api/') || req.accepts('json') === 'json') {
    return res.status(status).json({
      error: err.isOperational ? err.message : MSG.SERVER_ERROR,
    });
  }
  res.status(status).sendFile(path.join(VIEWS, status >= 500 ? '500.html' : '404.html'));
};
