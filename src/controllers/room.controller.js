const roomService = require('../services/room.service');
const messageService = require('../services/message.service');
const asyncHandler = require('../utils/asyncHandler');
const HTTP = require('../constants/httpStatus');

exports.create = asyncHandler(async (req, res) => {
  res.status(HTTP.CREATED).json(await roomService.createRoom(req.user, req.body.name));
});

exports.mine = asyncHandler(async (req, res) => {
  res.json({ rooms: await roomService.myRooms(req.user) });
});

exports.join = asyncHandler(async (req, res) => {
  res.json({ room: await roomService.joinByInvite(req.user, req.body.inviteCode) });
});

exports.leave = asyncHandler(async (req, res) => {
  await roomService.leaveRoom(req.user, parseInt(req.params.id, 10));
  res.json({ ok: true });
});

exports.rename = asyncHandler(async (req, res) => {
  const name = await roomService.rename(req.user, parseInt(req.params.id, 10), req.body.name);
  res.json({ ok: true, name });
});

exports.archive = asyncHandler(async (req, res) => {
  const roomId = parseInt(req.params.id, 10);
  await roomService.setArchived(req.user, roomId, true);
  messageService.dropBuffer(roomId); // archived rooms shouldn't hold memory
  res.json({ ok: true });
});

exports.restore = asyncHandler(async (req, res) => {
  await roomService.setArchived(req.user, parseInt(req.params.id, 10), false);
  res.json({ ok: true });
});

exports.qr = asyncHandler(async (req, res) => {
  res.json({ qr: await roomService.qrForRoom(req.user, parseInt(req.params.id, 10)) });
});

exports.members = asyncHandler(async (req, res) => {
  res.json({ members: await roomService.membersOf(req.user, parseInt(req.params.id, 10)) });
});

/** Older history over HTTP (recent history arrives over the socket). */
exports.olderMessages = asyncHandler(async (req, res) => {
  const messages = await messageService.getOlder(
    req.user,
    parseInt(req.params.id, 10),
    req.query.beforeId,
    30
  );
  res.json({ messages });
});
