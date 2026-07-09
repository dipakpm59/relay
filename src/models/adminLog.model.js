const pool = require('../config/db');

/** Audit trail: every mutating admin action lands here. */
exports.record = async ({ adminId, action, targetType = null, targetId = null, details = null }) => {
  await pool.execute(
    `INSERT INTO admin_logs (admin_id, action, target_type, target_id, details)
     VALUES (?, ?, ?, ?, ?)`,
    [adminId, action, targetType, targetId === null ? null : String(targetId), details]
  );
};

exports.list = async ({ page = 1, perPage = 50 } = {}) => {
  const offset = (page - 1) * perPage;
  const [rows] = await pool.query(
    `SELECT g.id, g.action, g.target_type, g.target_id, g.details, g.created_at,
            a.email AS admin_email
     FROM admin_logs g JOIN admins a ON a.id = g.admin_id
     ORDER BY g.created_at DESC LIMIT ? OFFSET ?`,
    [perPage, offset]
  );
  return rows;
};
