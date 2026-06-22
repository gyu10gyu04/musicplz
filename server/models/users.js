// models/users.js — users 테이블에 대한 쿼리 모음
const { pool } = require('../db');

async function createUser({ email, passwordHash, displayName }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, created_at`,
    [email, passwordHash, displayName || null]
  );
  return rows[0];
}

async function findByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, display_name, created_at
     FROM users WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT id, email, display_name, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { createUser, findByEmail, findById };
