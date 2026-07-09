const { customAlphabet } = require('nanoid');
const QRCode = require('qrcode');
const roomModel = require('../models/room.model');
const roomMemberModel = require('../models/roomMember.model');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const HTTP = require('../constants/httpStatus');
const MSG = require('../constants/messages');
const rv = require('../validators/room.validator');
const logger = require('../utils/logger');

const inviteId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 10);

exports.inviteUrl = (code) => `${env.baseUrl}/join/${code}`;

exports.createRoom = async (user, name) => {
  const cleanName = rv.assertValidRoomName(name);
  const inviteCode = inviteId();
  const roomId = await roomModel.create({ ownerId: user.id, name: cleanName, inviteCode });
  await roomMemberModel.add({ roomId, userId: user.id, role: 'owner' });
  logger.info('room created', { roomId, ownerId: user.id });
  return { id: roomId, name: cleanName, inviteCode, inviteUrl: exports.inviteUrl(inviteCode), role: 'owner' };
};

exports.myRooms = async (user) => {
  const rows = await roomModel.listForUser(user.id);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    memberCount: r.member_count,
    isArchived: !!r.is_archived,
    inviteCode: r.invite_code,
    inviteUrl: exports.inviteUrl(r.invite_code),
    createdAt: r.created_at,
  }));
};

/**
 * Membership guard used by BOTH the HTTP controllers and the WS gateway —
 * the single place where "can this user touch this room?" is decided.
 */
exports.assertMember = async (roomId, user) => {
  const room = await roomModel.findById(roomId);
  if (!room) throw new AppError(MSG.ROOM_NOT_FOUND, HTTP.NOT_FOUND);
  if (room.is_archived) throw new AppError(MSG.ROOM_ARCHIVED, HTTP.GONE);
  if (user.role === 'admin') return { room, membership: { role: 'admin' } };
  const membership = await roomMemberModel.find(roomId, user.id);
  if (!membership) throw new AppError(MSG.NOT_A_MEMBER, HTTP.FORBIDDEN);
  return { room, membership };
};

exports.joinByInvite = async (user, code) => {
  rv.assertValidInviteCode(code);
  const room = await roomModel.findByInviteCode(code);
  if (!room) throw new AppError(MSG.INVALID_INVITE, HTTP.NOT_FOUND);
  if (room.is_archived) throw new AppError(MSG.ROOM_ARCHIVED, HTTP.GONE);
  await roomMemberModel.add({ roomId: room.id, userId: user.id, role: 'member' });
  return { id: room.id, name: room.name };
};

exports.leaveRoom = async (user, roomId) => {
  const membership = await roomMemberModel.find(roomId, user.id);
  if (!membership) throw new AppError(MSG.NOT_A_MEMBER, HTTP.FORBIDDEN);
  if (membership.role === 'owner') {
    throw new AppError(MSG.OWNER_CANNOT_LEAVE, HTTP.BAD_REQUEST);
  }
  await roomMemberModel.remove(roomId, user.id);
};

exports.rename = async (user, roomId, name) => {
  const cleanName = rv.assertValidRoomName(name);
  const room = await roomModel.findById(roomId);
  if (!room) throw new AppError(MSG.ROOM_NOT_FOUND, HTTP.NOT_FOUND);
  assertOwnerOrAdmin(room, user);
  await roomModel.rename(roomId, cleanName);
  return cleanName;
};

exports.setArchived = async (user, roomId, archived) => {
  const room = await roomModel.findById(roomId);
  if (!room) throw new AppError(MSG.ROOM_NOT_FOUND, HTTP.NOT_FOUND);
  assertOwnerOrAdmin(room, user);
  await roomModel.setArchived(roomId, archived);
  return room;
};

exports.qrForRoom = async (user, roomId) => {
  const { room } = await exports.assertMember(roomId, user);
  return QRCode.toDataURL(exports.inviteUrl(room.invite_code), {
    width: 320,
    margin: 2,
    color: { dark: '#0f1222', light: '#ffffff' },
  });
};

exports.membersOf = async (user, roomId) => {
  await exports.assertMember(roomId, user);
  return roomMemberModel.listMembers(roomId);
};

function assertOwnerOrAdmin(room, user) {
  const allowed = user.role === 'admin' || room.owner_id === user.id;
  if (!allowed) throw new AppError(MSG.NOT_ROOM_OWNER, HTTP.FORBIDDEN);
}
