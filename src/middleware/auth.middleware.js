const jwtUtil = require('../utils/jwt');
const userModel = require('../models/user.model');
const adminModel = require('../models/admin.model');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const HTTP = require('../constants/httpStatus');
const MSG = require('../constants/messages');

function readToken(req) {
  if (req.cookies && req.cookies.token) return req.cookies.token; // primary: HttpOnly cookie
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);       // convenience: curl/Postman
  return null;
}

/**
 * JWT payload is only { id, role }. Every protected request re-loads the
 * account from the table matching the SIGNED role claim and re-checks
 * is_active / locked_until — identical guarantee to the WS handshake.
 */
async function resolveIdentity(token) {
  let payload;
  try {
    payload = jwtUtil.verify(token);
  } catch {
    throw new AppError(MSG.SESSION_EXPIRED, HTTP.UNAUTHORIZED);
  }
  const model = payload.role === 'admin' ? adminModel : userModel;
  const account = await model.findById(payload.id);
  if (!account || !account.is_active) {
    throw new AppError(MSG.ACCOUNT_DISABLED, HTTP.FORBIDDEN);
  }
  if (account.locked_until && new Date(account.locked_until) > new Date()) {
    throw new AppError(MSG.ACCOUNT_LOCKED, HTTP.LOCKED);
  }
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: payload.role === 'admin' ? 'admin' : 'user',
  };
}

exports.requireAuth = asyncHandler(async (req, _res, next) => {
  const token = readToken(req);
  if (!token) throw new AppError(MSG.AUTH_REQUIRED, HTTP.UNAUTHORIZED);
  req.user = await resolveIdentity(token);
  next();
});

exports.requireAdmin = (req, _res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return next(new AppError(MSG.ADMIN_ONLY, HTTP.FORBIDDEN));
  }
  next();
};
