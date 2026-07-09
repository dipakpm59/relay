const userService = require('../services/user.service');
const asyncHandler = require('../utils/asyncHandler');

exports.profile = asyncHandler(async (req, res) => {
  res.json(await userService.getProfile(req.user.id));
});

exports.updateName = asyncHandler(async (req, res) => {
  res.json({ ok: true, name: await userService.updateName(req.user.id, req.body.name) });
});

exports.changePassword = asyncHandler(async (req, res) => {
  await userService.changePassword(req.user.id, {
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword,
  });
  res.json({ ok: true });
});
