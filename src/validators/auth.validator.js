const validator = require('validator');
const AppError = require('../utils/AppError');
const HTTP = require('../constants/httpStatus');
const MSG = require('../constants/messages');

exports.assertValidName = (name) => {
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    throw new AppError(MSG.INVALID_NAME, HTTP.BAD_REQUEST);
  }
  return name.trim();
};

exports.assertValidEmail = (email) => {
  if (typeof email !== 'string' || email.length > 255 || !validator.isEmail(email)) {
    throw new AppError(MSG.INVALID_EMAIL, HTTP.BAD_REQUEST);
  }
  return email.toLowerCase().trim();
};

/** 8+ chars, at least one letter and one number. */
exports.assertStrongPassword = (pw) => {
  const ok = typeof pw === 'string' && pw.length >= 8 && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw);
  if (!ok) throw new AppError(MSG.WEAK_PASSWORD, HTTP.BAD_REQUEST);
  return pw;
};
