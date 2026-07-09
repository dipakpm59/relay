const messageService = require('../services/message.service');
const gateway = require('../ws/gateway');
const asyncHandler = require('../utils/asyncHandler');

/** Soft delete (author / room owner / admin) — live rooms hear about it instantly. */
exports.remove = asyncHandler(async (req, res) => {
  const { roomId, messageId } = await messageService.removeMessage(
    req.user,
    parseInt(req.params.id, 10)
  );
  gateway.notifyMessageRemoved(roomId, messageId);
  res.json({ ok: true });
});

/** Restore (room owner / admin). */
exports.restore = asyncHandler(async (req, res) => {
  const { roomId, message } = await messageService.restoreMessage(
    req.user,
    parseInt(req.params.id, 10)
  );
  gateway.notifyMessageRestored(roomId, message);
  res.json({ ok: true });
});
