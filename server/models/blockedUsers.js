const { pool } = require('../db');

function publicBlockedUser(row) {
  return {
    id: row.id,
    userId: row.user_id,
    reason: row.reason,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    displayName: row.display_name || null,
    email: row.email || null,
  };
}

async function blockUser({ userId, reason, metadata = {} }) {
  if (!userId) return null;

  const { rows } = await pool.query(
    `INSERT INTO blocked_users (user_id, reason, metadata)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET
       reason = EXCLUDED.reason,
       metadata = blocked_users.metadata || EXCLUDED.metadata
      RETURNING id, user_id, reason, metadata, created_at`,
    [userId, reason, JSON.stringify(metadata)]
  );
  return publicBlockedUser(rows[0]);
}

async function isUserBlocked(userId) {
  if (!userId) return false;

  const { rows } = await pool.query(
    `SELECT 1 FROM blocked_users WHERE user_id = $1`,
    [userId]
  );
  return Boolean(rows[0]);
}

async function listBlockedUsers({ limit = 100 } = {}) {
  const { rows } = await pool.query(
    `SELECT b.id, b.user_id, b.reason, b.metadata, b.created_at, u.display_name, u.email
     FROM blocked_users b
     LEFT JOIN users u ON u.id = b.user_id
     ORDER BY b.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map(publicBlockedUser);
}

module.exports = {
  blockUser,
  isUserBlocked,
  listBlockedUsers,
};
