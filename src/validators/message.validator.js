const xss = require('xss');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const HTTP = require('../constants/httpStatus');
const MSG = require('../constants/messages');

/**
 * Validate AND sanitize a message body. Sanitization happens HERE, in the
 * shared validator, because messages arrive over WebSockets too — they never
 * pass through the Express xss middleware, so the service layer must be the
 * guarantee, not the HTTP pipeline.
 */
exports.cleanMessageBody = (body) => {
  if (typeof body !== 'string') throw new AppError(MSG.EMPTY_MESSAGE, HTTP.BAD_REQUEST);
  const trimmed = body.trim();
  if (!trimmed) throw new AppError(MSG.EMPTY_MESSAGE, HTTP.BAD_REQUEST);
  if (trimmed.length > env.chat.messageMaxLength) {
    throw new AppError(MSG.MESSAGE_TOO_LONG, HTTP.BAD_REQUEST);
  }
  return xss(trimmed, { whiteList: {}, stripIgnoreTag: true });
};
