const analyticsService = require('../services/analytics.service');
const roomService = require('../services/room.service');
const messageService = require('../services/message.service');
const roomModel = require('../models/room.model');
const userModel = require('../models/user.model');
const messageModel = require('../models/message.model');
const adminLogModel = require('../models/adminLog.model');
const gateway = require('../ws/gateway');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const HTTP = require('../constants/httpStatus');

/** Every mutating admin action is written to the audit trail. */
const audit = (req, action, targetType, targetId, details) =>
  adminLogModel.record({ adminId: req.user.id, action, targetType, targetId, details });

exports.overview = asyncHandler(async (_req, res) => {
  res.json(await analyticsService.platformOverview(gateway.stats()));
});

exports.listRooms = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const rows = await roomModel.adminList({
    q: (req.query.q || '').trim(),
    page,
    perPage: 30,
    includeArchived: req.query.includeArchived === '1',
  });
  res.json({ page, rooms: rows });
});

exports.archiveRoom = asyncHandler(async (req, res) => {
  const roomId = parseInt(req.params.id, 10);
  await roomService.setArchived(req.user, roomId, true);
  messageService.dropBuffer(roomId);
  await audit(req, 'ROOM_ARCHIVED', 'room', roomId);
  res.json({ ok: true });
});

exports.restoreRoom = asyncHandler(async (req, res) => {
  const roomId = parseInt(req.params.id, 10);
  await roomService.setArchived(req.user, roomId, false);
  await audit(req, 'ROOM_RESTORED', 'room', roomId);
  res.json({ ok: true });
});

exports.listUsers = asyncHandler(async (_req, res) => {
  res.json({ users: await userModel.listWithActivity() });
});

exports.setUserActive = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) throw new AppError('Invalid user id.', HTTP.BAD_REQUEST);
  const active = !!req.body.isActive;
  await userModel.setActive(id, active);
  if (!active) gateway.kickUser(id); // deactivation closes live sockets NOW
  await audit(req, active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'user', id);
  res.json({ ok: true });
});

exports.unlockUser = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) throw new AppError('Invalid user id.', HTTP.BAD_REQUEST);
  await userModel.resetLoginState(id);
  await audit(req, 'USER_UNLOCKED', 'user', id);
  res.json({ ok: true });
});

exports.listMessages = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const rows = await messageModel.adminRecent({ q: (req.query.q || '').trim(), page, perPage: 30 });
  res.json({ page, messages: rows });
});

exports.removeMessage = asyncHandler(async (req, res) => {
  const { roomId, messageId } = await messageService.removeMessage(
    req.user,
    parseInt(req.params.id, 10)
  );
  gateway.notifyMessageRemoved(roomId, messageId);
  await audit(req, 'MESSAGE_REMOVED', 'message', messageId, `room ${roomId}`);
  res.json({ ok: true });
});

exports.restoreMessage = asyncHandler(async (req, res) => {
  const { roomId, message } = await messageService.restoreMessage(
    req.user,
    parseInt(req.params.id, 10)
  );
  gateway.notifyMessageRestored(roomId, message);
  await audit(req, 'MESSAGE_RESTORED', 'message', message.id, `room ${roomId}`);
  res.json({ ok: true });
});

exports.auditLog = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  res.json({ page, logs: await adminLogModel.list({ page, perPage: 50 }) });
});
