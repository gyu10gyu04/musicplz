// models/users.js — users 테이블에 대한 쿼리 모음
const { pool } = require('../db');

async function createUser({ email, passwordHash, displayName }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, email_verified, created_at`,
    [email, passwordHash, displayName || null]
  );
  return rows[0];
}

async function findByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, display_name, email_verified, created_at
     FROM users WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
}

async function findByDisplayName(displayName) {
  const { rows } = await pool.query(
    `SELECT id, email, display_name, created_at
     FROM users WHERE lower(btrim(display_name)) = lower(btrim($1))`,
    [displayName]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT id, email, display_name, email_verified, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function createEmailVerificationToken({ userId, tokenHash, expiresAt }) {
  await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
}

async function deletePendingEmailVerificationTokens(userId) {
  await pool.query(
    `DELETE FROM email_verification_tokens
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );
}

async function verifyEmailByTokenHash(tokenHash) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, user_id, expires_at, used_at
       FROM email_verification_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );
    const token = rows[0];

    if (!token || token.used_at || new Date(token.expires_at).getTime() < Date.now()) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE email_verification_tokens SET used_at = now() WHERE id = $1`,
      [token.id]
    );

    const result = await client.query(
      `UPDATE users
       SET email_verified = TRUE, email_verified_at = now()
       WHERE id = $1
       RETURNING id, email, display_name, email_verified, created_at`,
      [token.user_id]
    );

    await client.query('COMMIT');
    return result.rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createUser,
  findByEmail,
  findById,
  findByDisplayName,
  createEmailVerificationToken,
  deletePendingEmailVerificationTokens,
  verifyEmailByTokenHash,
};
