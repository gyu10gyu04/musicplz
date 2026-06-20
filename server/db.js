// db.js — PostgreSQL 연결 풀 및 스키마 초기화
//
// Render의 무료 PostgreSQL 인스턴스를 사용합니다.
// DATABASE_URL 환경 변수(예: postgres://user:pass@host:5432/dbname)로 접속 정보를 받습니다.
// 로컬 개발 시에도 .env 파일에 같은 이름으로 PostgreSQL 접속 문자열을 넣어주면 동일하게 동작합니다.

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn(
    '[경고] DATABASE_URL 환경 변수가 설정되어 있지 않습니다. ' +
    '.env 파일에 PostgreSQL 접속 문자열을 추가해주세요. (예: postgresql://user:pass@localhost:5432/musicplz)'
  );
}

// Render의 관리형 PostgreSQL은 SSL 연결을 요구합니다.
// 처음에는 NODE_ENV가 production일 때만 SSL을 켜도록 했었지만,
// "로컬에서 NODE_ENV=development로 실행하면서 Render의 원격 DATABASE_URL에 접속하는 경우"가
// 빠져서 SSL이 꺼진 채로 접속을 시도해 거부당하는 문제가 있었습니다.
// → SSL 필요 여부는 NODE_ENV가 아니라 "접속 주소가 로컬인지 아닌지"로 판단하도록 수정.
const databaseUrl = process.env.DATABASE_URL || '';
const isLocalDb = /localhost|127\.0\.0\.1/.test(databaseUrl);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  // 유휴 커넥션에서 발생하는 예기치 못한 에러를 잡아서 서버 전체가 죽는 것을 방지
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
  // express-session용 세션 테이블(session)은 connect-pg-simple이
  // createTableIfMissing 옵션을 통해 자동으로 생성합니다.
}

module.exports = { pool, initSchema };
