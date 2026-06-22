// server.js — MusicPlz 서버 엔트리포인트
//
// 실행 방법:
//   1) cd server
//   2) npm install
//   3) cp .env.example .env   (DATABASE_URL, SESSION_SECRET 설정)
//   4) npm start
//   5) 브라우저에서 http://localhost:3000 접속
//
// PostgreSQL이 필요합니다. 로컬에 PostgreSQL을 설치했거나,
// Render의 무료 PostgreSQL 인스턴스를 만들어 DATABASE_URL에 연결 문자열을 넣어주세요.

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool, initSchema } = require('./db');
const authRoutes = require('./routes/auth');
const musicRoutes = require('./routes/music');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');

// Render(및 대부분의 PaaS)는 리버스 프록시 뒤에서 앱을 실행합니다.
// 이 설정이 없으면 express-session이 HTTPS 여부를 제대로 인식하지 못해
// secure 쿠키가 항상 거부되고, 로그인이 안 되는 것처럼 보일 수 있습니다.
app.set('trust proxy', 1);

/* ─── 바디 파서 ─── */
app.use(express.json());

/* ─── 세션 설정 ───
   세션 데이터는 connect-pg-simple을 통해 PostgreSQL의 별도 테이블(session)에
   저장됩니다. → 서버를 재시작하거나 재배포해도 로그인 상태가 유지됩니다.
   (SQLite와 달리, Render 무료 플랜에서도 PostgreSQL 데이터는 디스크가 아니라
    별도 관리형 DB에 저장되므로 재배포 시 사라지지 않습니다.) */
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true, // 최초 실행 시 session 테이블 자동 생성
  }),
  secret: process.env.SESSION_SECRET || 'musicplz-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,                 // HTTPS 환경(운영)에서만 secure 쿠키 사용
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
  },
}));

/* ─── API 라우트 ─── */
app.use('/api/auth', authRoutes);
app.use('/api/music', musicRoutes);

/* ─── 정적 파일 서빙 ───
   프로젝트 폴더 구조(main/, login/, create/)를 그대로 서빙합니다.
   예: /main/main.html , /login/login.html , /create/create.html 등 */
app.use('/main', express.static(path.join(__dirname, '..', 'main')));
app.use('/login', express.static(path.join(__dirname, '..', 'login')));
app.use('/create', express.static(path.join(__dirname, '..', 'create')));

/* 루트 접속 시 홈으로 리다이렉트 */
app.get('/', (req, res) => res.redirect('/main/main.html'));

/* ─── 404 처리 ─── */
app.use((req, res) => {
  res.status(404).json({ error: '요청한 경로를 찾을 수 없어요.' });
});

/* ─── 에러 핸들러 ─── */
app.use((err, req, res, next) => {
  console.error('[서버 오류]', err);
  res.status(500).json({ error: '서버에 문제가 발생했어요. 잠시 후 다시 시도해주세요.' });
});

/* ─── 서버 시작 ───
   users 테이블이 준비된 뒤에 요청을 받기 시작해야 하므로,
   initSchema()가 끝난 다음 app.listen을 호출합니다. */
async function start() {
  try {
    await initSchema();
    app.listen(PORT, () => {
      console.log(`MusicPlz 서버 실행 중 → http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[서버 시작 실패] DB 연결 또는 스키마 초기화에 문제가 있어요:', err);
    process.exit(1);
  }
}

start();
