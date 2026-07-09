const userModel = require('../models/user.model');
const adminModel = require('../models/admin.model');
const password = require('../utils/password');
const jwt = require('../utils/jwt');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const HTTP = require('../constants/httpStatus');
const MSG = require('../constants/messages');
const v = require('../validators/auth.validator');
const logger = require('../utils/logger');

exports.register = async ({ name, email, pass }) => {
  const cleanName = v.assertValidName(name);
  const cleanEmail = v.assertValidEmail(email);
  v.assertStrongPassword(pass);

  if (await userModel.findByEmail(cleanEmail)) {
    throw new AppError(MSG.EMAIL_TAKEN, HTTP.CONFLICT);
  }

  const passwordHash = await password.hash(pass);
  const id = await userModel.create({ name: cleanName, email: cleanEmail, passwordHash });
  logger.info('user registered', { id, email: cleanEmail });
  return issueSession({ id, name: cleanName, email: cleanEmail }, 'user');
};

/**
 * Shared login flow for users and admins with account lockout:
 * MAX_LOGIN_ATTEMPTS consecutive failures lock the account for
 * LOCKOUT_MINUTES. A successful login resets the counter.
 */
async function loginAgainst(model, role, { email, pass }) {
  if (!email || !pass) throw new AppError(MSG.BAD_CREDENTIALS, HTTP.BAD_REQUEST);

  const account = await model.findByEmail(String(email).toLowerCase().trim());
  if (!account) throw new AppError(MSG.BAD_CREDENTIALS, HTTP.UNAUTHORIZED);

  if (account.locked_until && new Date(account.locked_until) > new Date()) {
    throw new AppError(MSG.ACCOUNT_LOCKED, HTTP.LOCKED);
  }
  if (!account.is_active) throw new AppError(MSG.ACCOUNT_DISABLED, HTTP.FORBIDDEN);

  const ok = await password.compare(pass, account.password_hash);
  if (!ok) {
    const attempts = account.failed_login_attempts + 1;
    const shouldLock = attempts >= env.auth.maxLoginAttempts;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + env.auth.lockoutMinutes * 60 * 1000)
      : null;
    await model.recordFailedLogin(account.id, lockedUntil);
    if (shouldLock) {
      logger.warn('account locked after failed logins', { role, id: account.id });
      throw new AppError(MSG.ACCOUNT_LOCKED, HTTP.LOCKED);
    }
    throw new AppError(MSG.BAD_CREDENTIALS, HTTP.UNAUTHORIZED);
  }

  await model.resetLoginState(account.id);
  return issueSession(account, role);
}

exports.loginUser = (creds) => loginAgainst(userModel, 'user', creds);
exports.loginAdmin = (creds) => loginAgainst(adminModel, 'admin', creds);

/**
 * The JWT carries ONLY { id, role }. Identity is re-read from the DB on
 * every protected request AND at the WebSocket handshake — the client is
 * never trusted for identity or privilege decisions.
 */
function issueSession(account, role) {
  const token = jwt.sign({ id: account.id, role });
  return {
    token,
    user: { id: account.id, name: account.name, email: account.email, role },
  };
}
