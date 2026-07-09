const jwt = require('jsonwebtoken');
const env = require('../config/env');

exports.sign = (payload) =>
  jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn });

exports.verify = (token) => jwt.verify(token, env.jwt.secret);
