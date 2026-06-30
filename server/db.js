// db.js — PostgreSQL 연결 풀 및 스키마 초기화
//
// Render의 무료 PostgreSQL 인스턴스를 사용합니다.
// DATABASE_URL 환경 변수(예: postgres://user:pass@host:5432/dbname)로 접속 정보를 받습니다.

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn(
    '[경고] DATABASE_URL 환경 변수가 설정되어 있지 않습니다. ' +
    '.env 파일에 PostgreSQL 접속 문자열을 추가해주세요. (예: postgresql://user:pass@localhost:5432/musicplz)'
  );
}

// 접속 주소가 로컬인지 아닌지로 SSL 필요 여부를 판단합니다.
// (NODE_ENV가 아니라 주소 자체를 기준으로 판단해야, 로컬 PC에서 Render의 원격
//  DATABASE_URL에 접속하는 경우에도 SSL이 올바르게 켜집니다.)
const databaseUrl = process.env.DATABASE_URL || '';
const isLocalDb = /localhost|127\.0\.0\.1/.test(databaseUrl);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[DB 풀 오류]', err);
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name  TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_display_name_lower_unique
      ON users (lower(btrim(display_name)))
      WHERE display_name IS NOT NULL;
    `);
  } catch (err) {
    if (err.code !== '23505') throw err;
    console.warn('[경고] 기존 users 데이터에 중복 닉네임이 있어 닉네임 유니크 인덱스를 만들지 못했습니다. 중복 데이터를 정리해주세요.');
  }
  // express-session용 세션 테이블(session)은 connect-pg-simple이 자동으로 생성합니다.
}

module.exports = { pool, initSchema };
