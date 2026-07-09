const userModel = require('../models/user.model');
const messageModel = require('../models/message.model');
const password = require('../utils/password');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const HTTP = require('../constants/httpStatus');
const MSG = require('../constants/messages');
const v = require('../validators/auth.validator');

exports.getProfile = async (userId) => {
  const user = await userModel.findById(userId);
  if (!user) throw new AppError(MSG.NOT_FOUND, HTTP.NOT_FOUND);
  const [today, total] = await Promise.all([
    messageModel.countTodayByUser(userId),
    messageModel.countTotalByUser(userId),
  ]);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.created_at,
    usage: {
      messagesToday: today,
      dailyLimit: env.chat.dailyMessageLimit,
      totalMessages: total,
    },
  };
};

exports.updateName = async (userId, name) => {
  const clean = v.assertValidName(name);
  await userModel.updateName(userId, clean);
  return clean;
};

exports.changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await userModel.findById(userId);
  if (!user) throw new AppError(MSG.NOT_FOUND, HTTP.NOT_FOUND);

  const ok = await password.compare(currentPassword || '', user.password_hash);
  if (!ok) throw new AppError(MSG.WRONG_CURRENT_PASSWORD, HTTP.UNAUTHORIZED);

  v.assertStrongPassword(newPassword);
  await userModel.updatePassword(userId, await password.hash(newPassword));
};
