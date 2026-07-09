const messageModel = require('../models/message.model');
const roomModel = require('../models/room.model');
const userModel = require('../models/user.model');
const messageService = require('./message.service');
const roomService = require('./room.service');

/** Per-room series — members (or admins) only. */
exports.roomSeries = async (user, roomId, days = 30) => {
  const { room } = await roomService.assertMember(roomId, user);
  const series = await messageModel.seriesForRoom(roomId, days);
  return { roomId: room.id, roomName: room.name, last30Days: series };
};

/** The signed-in user's own dashboard numbers. */
exports.mySummary = async (user) => {
  const [total, today, series] = await Promise.all([
    messageModel.countTotalByUser(user.id),
    messageModel.countTodayByUser(user.id),
    messageModel.seriesForUser(user.id, 30),
  ]);
  return { totalMessages: total, messagesToday: today, last30Days: series };
};

/** Platform-wide overview for the admin dashboard — includes LIVE stats. */
exports.platformOverview = async (gatewayStats) => {
  const [msgTotals, roomTotals, users, today, series] = await Promise.all([
    messageModel.totals(),
    roomModel.totals(),
    userModel.countAll(),
    messageModel.countToday(),
    messageModel.seriesAll(30),
  ]);
  return {
    ...msgTotals,
    ...roomTotals,
    totalUsers: users,
    messagesToday: today,
    last30Days: series,
    live: {
      ...gatewayStats,            // open connections, per-room presence
      buffers: messageService.bufferStats(),
    },
  };
};
