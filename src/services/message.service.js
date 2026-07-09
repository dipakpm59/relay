const RingBuffer = require('../structures/ringBuffer');
const messageModel = require('../models/message.model');
const roomService = require('./room.service');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const HTTP = require('../constants/httpStatus');
const MSG = require('../constants/messages');
const { cleanMessageBody } = require('../validators/message.validator');
const logger = require('../utils/logger');

/**
 * One RingBuffer per ACTIVE room: roomId → { buffer, hydrated }.
 * `hydrated` matters because an empty buffer does NOT mean an empty room —
 * on first access after boot we load the newest N messages from MySQL once,
 * then the buffer alone serves recent history.
 */
const buffers = new Map();

function getEntry(roomId) {
  let entry = buffers.get(roomId);
  if (!entry) {
    entry = { buffer: new RingBuffer(env.chat.bufferCapacity), hydrated: false };
    buffers.set(roomId, entry);
  }
  return entry;
}

async function hydrate(roomId) {
  const entry = getEntry(roomId);
  if (entry.hydrated) return entry;
  const rows = await messageModel.recentForRoom(roomId, env.chat.bufferCapacity);
  for (const row of rows) entry.buffer.push(present(row));
  entry.hydrated = true;
  return entry;
}

/** In-memory daily counters, lazily seeded from one DB COUNT per user per day. */
const dailyCounters = new Map(); // userId → { day: 'YYYY-MM-DD', count }

async function checkDailyLimit(userId) {
  const today = new Date().toISOString().slice(0, 10);
  let counter = dailyCounters.get(userId);
  if (!counter || counter.day !== today) {
    counter = { day: today, count: await messageModel.countTodayByUser(userId) };
    dailyCounters.set(userId, counter);
  }
  if (counter.count >= env.chat.dailyMessageLimit) {
    throw new AppError(MSG.DAILY_LIMIT_REACHED, HTTP.TOO_MANY_REQUESTS);
  }
  counter.count++;
}

/**
 * THE HOT PATH — called by the WS gateway when a message frame arrives.
 * Validate → push to the ring buffer → return immediately so the caller can
 * BROADCAST NOW. Persistence to MySQL happens in the returned `persisted`
 * promise, AFTER the broadcast — chatting users never wait on an INSERT
 * (exactly like Trimly's redirect never waited on the analytics write).
 * The DB id is backfilled onto the same object the buffer holds.
 */
exports.postMessage = async (user, roomId, rawBody) => {
  const body = cleanMessageBody(rawBody);
  await roomService.assertMember(roomId, user);
  await checkDailyLimit(user.id);

  const entry = await hydrate(roomId);

  const message = {
    id: null, // backfilled after the async INSERT
    roomId,
    userId: user.id,
    userName: user.name,
    body,
    removed: false,
    createdAt: new Date(),
  };
  entry.buffer.push(message);

  const persisted = messageModel
    .create({ roomId, userId: user.id, body, createdAt: message.createdAt })
    .then((insertId) => {
      message.id = insertId;
      return insertId;
    })
    .catch((err) => {
      logger.error('write-behind persist failed', { roomId, msg: err.message });
    });

  return { message, persisted };
};

/** Recent history for a room — served from the buffer, not MySQL. */
exports.getRecent = async (user, roomId, limit = 50) => {
  await roomService.assertMember(roomId, user);
  const entry = await hydrate(roomId);
  return entry.buffer.last(limit);
};

/** Older history — id-cursor pagination straight from MySQL. */
exports.getOlder = async (user, roomId, beforeId, limit = 30) => {
  await roomService.assertMember(roomId, user);
  const before = parseInt(beforeId, 10);
  if (!before) return [];
  const rows = await messageModel.olderForRoom(roomId, before, limit);
  return rows.map(present);
};

/**
 * Moderation: soft delete. Allowed for the message author, the room owner,
 * or an admin. The buffer copy (if present) is flagged in place so the
 * placeholder is what every future reader sees — no stale content.
 */
exports.removeMessage = async (user, messageId) => {
  const row = await loadForModeration(user, messageId, { authorAllowed: true });
  await messageModel.setDeleted(row.id, true);
  flagInBuffer(row.room_id, row.id, true);
  return { roomId: row.room_id, messageId: row.id };
};

/** Restore: room owner or admin only (authors don't un-moderate themselves). */
exports.restoreMessage = async (user, messageId) => {
  const row = await loadForModeration(user, messageId, { authorAllowed: false });
  await messageModel.setDeleted(row.id, false);
  flagInBuffer(row.room_id, row.id, false);
  return { roomId: row.room_id, message: present({ ...row, is_deleted: 0 }) };
};

async function loadForModeration(user, messageId, { authorAllowed }) {
  const row = await messageModel.findById(messageId);
  if (!row) throw new AppError(MSG.MESSAGE_NOT_FOUND, HTTP.NOT_FOUND);
  const roomModel = require('../models/room.model');
  const room = await roomModel.findById(row.room_id);
  const allowed =
    user.role === 'admin' ||
    (room && room.owner_id === user.id) ||
    (authorAllowed && row.user_id === user.id);
  if (!allowed) throw new AppError(MSG.CANNOT_MODERATE, HTTP.FORBIDDEN);
  return row;
}

function flagInBuffer(roomId, messageId, removed) {
  const entry = buffers.get(roomId);
  if (!entry) return;
  const buffered = entry.buffer.find((m) => m.id === messageId);
  if (buffered) buffered.removed = removed;
}

/** Live buffer stats for the admin dashboard. */
exports.bufferStats = () => {
  let totalMessages = 0;
  let totalCapacity = 0;
  for (const { buffer } of buffers.values()) {
    totalMessages += buffer.size;
    totalCapacity += buffer.capacity;
  }
  return {
    activeRoomBuffers: buffers.size,
    bufferedMessages: totalMessages,
    fillRatio: totalCapacity === 0 ? 0 : +(totalMessages / totalCapacity).toFixed(4),
    capacityPerRoom: env.chat.bufferCapacity,
  };
};

/** Drop a room's buffer (archived rooms shouldn't hold memory). */
exports.dropBuffer = (roomId) => buffers.delete(roomId);

/** Test hook. */
exports._resetForTests = () => {
  buffers.clear();
  dailyCounters.clear();
};

function present(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    userName: row.user_name,
    body: row.body,
    removed: !!row.is_deleted,
    createdAt: row.created_at,
  };
}
exports.present = present;
