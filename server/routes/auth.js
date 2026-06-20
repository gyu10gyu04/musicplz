// routes/auth.js — 회원가입 / 로그인 / 로그아웃 / 세션 확인 라우트
//
// PostgreSQL 비동기 쿼리를 사용하므로 모든 핸들러가 async/await로 작성됩니다.
// next(err)로 넘긴 에러는 server.js의 공통 에러 핸들러가 처리합니다.

const express = require('express');
const bcrypt = require('bcryptjs');
const { createUser, findByEmail, findById } = require('../models/users');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 10;

// PostgreSQL의 unique_violation 에러 코드 (이메일 중복 가입 동시 요청 방어용)
const PG_UNIQUE_VIOLATION = '23505';

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, displayName: user.display_name };
}

/* ─── 회원가입 ─── */
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body || {};

    if (!email || !EMAIL_RE.test(String(email).trim())) {
      return res.status(400).json({ error: '올바른 이메일을 입력해주세요.' });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: '비밀번호는 8자 이상이어야 해요.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await findByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: '이미 가입된 이메일이에요.' });
    }

    const passwordHash = bcrypt.hashSync(String(password), BCRYPT_ROUNDS);

    let user;
    try {
      user = await createUser({
        email: normalizedEmail,
        passwordHash,
        displayName: displayName ? String(displayName).trim().slice(0, 40) : null,
      });
    } catch (dbErr) {
      // 동시에 같은 이메일로 가입 요청이 들어온 경우(위의 existing 체크 사이의 race condition)
      // DB의 UNIQUE 제약이 최종 방어선 역할을 함
      if (dbErr.code === PG_UNIQUE_VIOLATION) {
        return res.status(409).json({ error: '이미 가입된 이메일이에요.' });
      }
      throw dbErr;
    }

    // 가입 후 바로 로그인 상태로 전환
    req.session.userId = user.id;

    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

/* ─── 로그인 ─── */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await findByEmail(normalizedEmail);

    // 이메일 존재 여부를 노출하지 않기 위해 동일한 에러 메시지 사용
    const INVALID = '이메일 또는 비밀번호가 올바르지 않아요.';

    if (!user) {
      return res.status(401).json({ error: INVALID });
    }

    const ok = bcrypt.compareSync(String(password), user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: INVALID });
    }

    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

/* ─── 로그아웃 ─── */
router.post('/logout', (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

/* ─── 현재 로그인 상태 확인 ─── */
router.get('/me', async (req, res, next) => {
  try {
    if (!req.session.userId) {
      return res.json({ user: null });
    }
    const user = await findById(req.session.userId);
    if (!user) {
      // 세션은 있는데 유저가 삭제된 경우 등 — 세션 정리
      req.session.destroy(() => {});
      return res.json({ user: null });
    }
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
