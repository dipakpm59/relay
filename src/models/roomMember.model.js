const pool = require('../config/db');

exports.add = async ({ roomId, userId, role = 'member' }) => {
  await pool.execute(
    'INSERT IGNORE INTO room_members (room_id, user_id, role) VALUES (?, ?, ?)',
    [roomId, userId, role]
  );
};

exports.find = async (roomId, userId) => {
  const [rows] = await pool.execute(
    'SELECT * FROM room_members WHERE room_id = ? AND user_id = ?',
    [roomId, userId]
  );
  return rows[0] || null;
};

exports.remove = async (roomId, userId) => {
  await pool.execute(
    'DELETE FROM room_members WHERE room_id = ? AND user_id = ?',
    [roomId, userId]
  );
};

exports.listMembers = async (roomId) => {
  const [rows] = await pool.execute(
    `SELECT u.id, u.name, rm.role, rm.joined_at
     FROM room_members rm JOIN users u ON u.id = rm.user_id
     WHERE rm.room_id = ? ORDER BY rm.joined_at`,
    [roomId]
  );
  return rows;
};
