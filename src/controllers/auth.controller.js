const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const HTTP = require('../constants/httpStatus');

const COOKIE = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProd,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function sendSession(res, status, session) {
  res.cookie('token', session.token, COOKIE);
  res.status(status).json({ user: session.user });
}

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body || {};
  sendSession(res, HTTP.CREATED, await authService.register({ name, email, pass: password }));
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  sendSession(res, HTTP.OK, await authService.loginUser({ email, pass: password }));
});

exports.adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  sendSession(res, HTTP.OK, await authService.loginAdmin({ email, pass: password }));
});

exports.me = (req, res) => res.json({ user: req.user });

exports.logout = (_req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
};
