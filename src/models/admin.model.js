const pool = require('../config/db');

exports.findByEmail = async (email) => {
  const [rows] = await pool.execute('SELECT * FROM admins WHERE email = ?', [email]);
  return rows[0] || null;
};

exports.findById = async (id) => {
  const [rows] = await pool.execute('SELECT * FROM admins WHERE id = ?', [id]);
  return rows[0] || null;
};

exports.recordFailedLogin = async (id, lockedUntil) => {
  await pool.execute(
    'UPDATE admins SET failed_login_attempts = failed_login_attempts + 1, locked_until = ? WHERE id = ?',
    [lockedUntil, id]
  );
};

exports.resetLoginState = async (id) => {
  await pool.execute(
    'UPDATE admins SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
    [id]
  );
};

exports.upsertSeed = async ({ name, email, passwordHash }) => {
  await pool.execute(
    `INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)`,
    [name, email, passwordHash]
  );
};
