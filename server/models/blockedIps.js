const { pool } = require('../db');

function publicBlockedIp(row) {
  return {
    id: row.id,
    ipAddress: row.ip_address,
    userId: row.user_id,
    reason: row.reason,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    displayName: row.display_name || null,
    email: row.email || null,
  };
}

async function blockIp({ ipAddress, userId = null, reason, metadata = {} }) {
  const { rows } = await pool.query(
    `INSERT INTO blocked_ips (ip_address, user_id, reason, metadata)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (ip_address) DO UPDATE SET
       user_id = COALESCE(blocked_ips.user_id, EXCLUDED.user_id),
       reason = EXCLUDED.reason,
       metadata = blocked_ips.metadata || EXCLUDED.metadata
     RETURNING id, ip_address, user_id, reason, metadata, created_at`,
    [ipAddress, userId, reason, JSON.stringify(metadata)]
  );
  return publicBlockedIp(rows[0]);
}

async function isIpBlocked(ipAddress) {
  const { rows } = await pool.query(
    `SELECT 1 FROM blocked_ips WHERE ip_address = $1`,
    [ipAddress]
  );
  return Boolean(rows[0]);
}

async function listBlockedIps({ limit = 100 } = {}) {
  const { rows } = await pool.query(
    `SELECT b.id, b.ip_address, b.user_id, b.reason, b.metadata, b.created_at, u.display_name, u.email
     FROM blocked_ips b
     LEFT JOIN users u ON u.id = b.user_id
     ORDER BY b.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map(publicBlockedIp);
}

module.exports = {
  blockIp,
  isIpBlocked,
  listBlockedIps,
};
