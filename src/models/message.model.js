const pool = require('../config/db');

exports.create = async ({ roomId, userId, body, createdAt }) => {
  const [r] = await pool.execute(
    'INSERT INTO messages (room_id, user_id, body, created_at) VALUES (?, ?, ?, ?)',
    [roomId, userId, body, createdAt]
  );
  return r.insertId;
};

exports.findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT m.*, u.name AS user_name FROM messages m
     JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
    [id]
  );
  return rows[0] || null;
};

/** Newest N of a room (used to hydrate a cold ring buffer). Chronological. */
exports.recentForRoom = async (roomId, limit = 200) => {
  const [rows] = await pool.query(
    `SELECT m.id, m.room_id, m.user_id, u.name AS user_name, m.body,
            m.is_deleted, m.created_at
     FROM messages m JOIN users u ON u.id = m.user_id
     WHERE m.room_id = ?
     ORDER BY m.id DESC LIMIT ?`,
    [roomId, limit]
  );
  return rows.reverse();
};

/** Older history, id-cursor pagination (served over HTTP, not the buffer). */
exports.olderForRoom = async (roomId, beforeId, limit = 30) => {
  const [rows] = await pool.query(
    `SELECT m.id, m.room_id, m.user_id, u.name AS user_name, m.body,
            m.is_deleted, m.created_at
     FROM messages m JOIN users u ON u.id = m.user_id
     WHERE m.room_id = ? AND m.id < ?
     ORDER BY m.id DESC LIMIT ?`,
    [roomId, beforeId, limit]
  );
  return rows.reverse();
};

exports.setDeleted = async (id, deleted) => {
  await pool.execute(
    'UPDATE messages SET is_deleted = ?, deleted_at = ? WHERE id = ?',
    [deleted ? 1 : 0, deleted ? new Date() : null, id]
  );
};

exports.countTodayByUser = async (userId) => {
  const [[{ n }]] = await pool.execute(
    'SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND created_at >= CURDATE()',
    [userId]
  );
  return n;
};

exports.countTotalByUser = async (userId) => {
  const [[{ n }]] = await pool.execute(
    'SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND is_deleted = 0',
    [userId]
  );
  return n;
};

exports.seriesForRoom = async (roomId, days = 30) => {
  const [rows] = await pool.execute(
    `SELECT DATE(created_at) AS day, COUNT(*) AS messages
     FROM messages
     WHERE room_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(created_at) ORDER BY day`,
    [roomId, days]
  );
  return rows;
};

exports.seriesForUser = async (userId, days = 30) => {
  const [rows] = await pool.execute(
    `SELECT DATE(created_at) AS day, COUNT(*) AS messages
     FROM messages
     WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(created_at) ORDER BY day`,
    [userId, days]
  );
  return rows;
};

exports.seriesAll = async (days = 30) => {
  const [rows] = await pool.execute(
    `SELECT DATE(created_at) AS day, COUNT(*) AS messages
     FROM messages
     WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(created_at) ORDER BY day`,
    [days]
  );
  return rows;
};

exports.countToday = async () => {
  const [[{ n }]] = await pool.query(
    'SELECT COUNT(*) AS n FROM messages WHERE created_at >= CURDATE()'
  );
  return n;
};

exports.totals = async () => {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS totalMessages,
            SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END) AS removedMessages
     FROM messages`
  );
  return row;
};

exports.adminRecent = async ({ q = '', page = 1, perPage = 30 } = {}) => {
  const offset = (page - 1) * perPage;
  const where = ['1=1'];
  const params = [];
  if (q) {
    where.push('m.body LIKE ?');
    params.push(`%${q}%`);
  }
  const [rows] = await pool.query(
    `SELECT m.id, m.body, m.is_deleted, m.created_at,
            u.name AS user_name, u.email AS user_email, r.name AS room_name, r.id AS room_id
     FROM messages m
     JOIN users u ON u.id = m.user_id
     JOIN rooms r ON r.id = m.room_id
     WHERE ${where.join(' AND ')}
     ORDER BY m.id DESC LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );
  return rows;
};
