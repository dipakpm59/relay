const AppError = require('../utils/AppError');
const HTTP = require('../constants/httpStatus');
const MSG = require('../constants/messages');

exports.assertValidRoomName = (name) => {
  if (typeof name !== 'string') throw new AppError(MSG.INVALID_ROOM_NAME, HTTP.BAD_REQUEST);
  const clean = name.trim();
  if (clean.length < 3 || clean.length > 50) {
    throw new AppError(MSG.INVALID_ROOM_NAME, HTTP.BAD_REQUEST);
  }
  return clean;
};

exports.assertValidInviteCode = (code) => {
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{6,16}$/.test(code)) {
    throw new AppError(MSG.INVALID_INVITE, HTTP.BAD_REQUEST);
  }
  return code;
};
