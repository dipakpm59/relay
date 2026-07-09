const pool = require('../config/db');

exports.create = async ({ name, email, passwordHash }) => {
  const [r] = await pool.execute(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    [name, email, passwordHash]
  );
  return r.insertId;
};

exports.findByEmail = async (email) => {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0] || null;
};

exports.findById = async (id) => {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] || null;
};

exports.recordFailedLogin = async (id, lockedUntil) => {
  await pool.execute(
    'UPDATE users SET failed_login_attempts = failed_login_attempts + 1, locked_until = ? WHERE id = ?',
    [lockedUntil, id]
  );
};

exports.resetLoginState = async (id) => {
  await pool.execute(
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
    [id]
  );
};

exports.setActive = async (id, active) => {
  await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
};

exports.updateName = async (id, name) => {
  await pool.execute('UPDATE users SET name = ? WHERE id = ?', [name, id]);
};

exports.updatePassword = async (id, passwordHash) => {
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
};

exports.listWithActivity = async () => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.is_active, u.locked_until, u.created_at,
            COUNT(m.id) AS message_count
     FROM users u
     LEFT JOIN messages m ON m.user_id = u.id AND m.is_deleted = 0
     GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200`
  );
  return rows;
};

exports.countAll = async () => {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM users');
  return n;
};
