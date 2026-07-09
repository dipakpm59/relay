const pool = require('../config/db');

exports.create = async ({ ownerId, name, inviteCode }) => {
  const [r] = await pool.execute(
    'INSERT INTO rooms (owner_id, name, invite_code) VALUES (?, ?, ?)',
    [ownerId, name, inviteCode]
  );
  return r.insertId;
};

exports.findById = async (id) => {
  const [rows] = await pool.execute('SELECT * FROM rooms WHERE id = ?', [id]);
  return rows[0] || null;
};

exports.findByInviteCode = async (code) => {
  const [rows] = await pool.execute('SELECT * FROM rooms WHERE invite_code = ?', [code]);
  return rows[0] || null;
};

exports.rename = async (id, name) => {
  await pool.execute('UPDATE rooms SET name = ? WHERE id = ?', [name, id]);
};

exports.setArchived = async (id, archived) => {
  await pool.execute(
    'UPDATE rooms SET is_archived = ?, archived_at = ? WHERE id = ?',
    [archived ? 1 : 0, archived ? new Date() : null, id]
  );
};

exports.listForUser = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT r.id, r.name, r.invite_code, r.is_archived, r.created_at,
            rm.role,
            (SELECT COUNT(*) FROM room_members x WHERE x.room_id = r.id) AS member_count
     FROM rooms r
     JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = ?
     ORDER BY r.created_at DESC`,
    [userId]
  );
  return rows;
};

exports.adminList = async ({ q = '', page = 1, perPage = 20, includeArchived = false } = {}) => {
  const offset = (page - 1) * perPage;
  const where = [includeArchived ? '1=1' : 'r.is_archived = 0'];
  const params = [];
  if (q) {
    where.push('r.name LIKE ?');
    params.push(`%${q}%`);
  }
  const [rows] = await pool.query(
    `SELECT r.id, r.name, r.invite_code, r.is_archived, r.created_at,
            u.email AS owner_email,
            (SELECT COUNT(*) FROM room_members x WHERE x.room_id = r.id) AS member_count,
            (SELECT COUNT(*) FROM messages m WHERE m.room_id = r.id AND m.is_deleted = 0) AS message_count
     FROM rooms r JOIN users u ON u.id = r.owner_id
     WHERE ${where.join(' AND ')}
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );
  return rows;
};

exports.totals = async () => {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS totalRooms,
            SUM(CASE WHEN is_archived = 0 THEN 1 ELSE 0 END) AS activeRooms
     FROM rooms`
  );
  return row;
};
