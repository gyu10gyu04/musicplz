// models/users.js — users 테이블에 대한 쿼리 모음
// pg는 비동기 API이므로 모든 함수가 Promise를 반환합니다(호출하는 쪽에서 await 필요).
// 모든 쿼리는 파라미터 바인딩($1, $2, ...)을 사용해 SQL 인젝션을 방지합니다.

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
