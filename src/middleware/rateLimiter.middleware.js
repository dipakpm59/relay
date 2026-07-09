const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const MSG = require('../constants/messages');

const common = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: MSG.RATE_LIMITED },
};

exports.general = rateLimit({ ...common, windowMs: env.rate.windowMs, max: env.rate.maxGeneral });
exports.rooms = rateLimit({ ...common, windowMs: env.rate.windowMs, max: env.rate.maxRooms });
exports.auth = rateLimit({ ...common, windowMs: env.rate.windowMs, max: env.rate.maxAuth });
