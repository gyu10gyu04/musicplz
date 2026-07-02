const { pool } = require('../db');

function publicBlockedUser(row) {
  return {
    id: row.id,
    userId: row.user_id,
    reason: row.reason,
    displayReason: row.display_reason,
    metadata: row.metadata || {},
    blockedUntil: row.blocked_until,
    createdAt: row.created_at,
    displayName: row.display_name || null,
    email: row.email || null,
  };
}

async function blockUser({ userId, reason, displayReason, blockedUntil, metadata = {} }) {
  if (!userId) return null;

  const { rows } = await pool.query(
    `INSERT INTO blocked_users (user_id, reason, display_reason, metadata, blocked_until)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (user_id) DO UPDATE SET
        reason = EXCLUDED.reason,
        display_reason = EXCLUDED.display_reason,
        metadata = blocked_users.metadata || EXCLUDED.metadata,
        blocked_until = EXCLUDED.blocked_until
       RETURNING id, user_id, reason, display_reason, metadata, blocked_until, created_at`,
    [userId, reason, displayReason, JSON.stringify(metadata), blockedUntil]
  );
  return publicBlockedUser(rows[0]);
}

async function getActiveBlockedUser(userId) {
  if (!userId) return null;

  await pool.query(
    `DELETE FROM blocked_users WHERE user_id = $1 AND blocked_until <= now()`,
    [userId]
  );

  const { rows } = await pool.query(
    `SELECT id, user_id, reason, display_reason, metadata, blocked_until, created_at
     FROM blocked_users
     WHERE user_id = $1 AND blocked_until > now()`,
    [userId]
  );
  return rows[0] ? publicBlockedUser(rows[0]) : null;
}

async function listBlockedUsers({ limit = 100 } = {}) {
  await pool.query(`DELETE FROM blocked_users WHERE blocked_until <= now()`);

  const { rows } = await pool.query(
    `SELECT b.id, b.user_id, b.reason, b.display_reason, b.metadata, b.blocked_until, b.created_at, u.display_name, u.email
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
  getActiveBlockedUser,
  listBlockedUsers,
};
