// routes/auth.js — 회원가입 / 로그인 / 로그아웃 / 세션 확인 라우트
const express = require('express');
const bcrypt = require('bcryptjs');
const { createUser, findByEmail, findById } = require('../models/users');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 10;
const PG_UNIQUE_VIOLATION = '23505';
const MAX_PASSWORD_LENGTH = 72; // bcrypt는 72바이트 이후를 무시하므로 길이를 제한합니다.
const ALLOWED_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'naver.com',
  'kakao.com',
  'daum.net',
  'hanmail.net',
  'nate.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
]);

const authBuckets = new Map();

function authRateLimit({ windowMs, max, keyPrefix, includeEmail = false }) {
  return (req, res, next) => {
    const now = Date.now();
    const emailPart = includeEmail ? `:${normalizeEmail(req.body?.email || '')}` : '';
    const key = `${keyPrefix}:${req.ip}${emailPart}`;
    const bucket = authBuckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    authBuckets.set(key, bucket);

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: '시도가 너무 많아요. 잠시 후 다시 시도해주세요.' });
    }

    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of authBuckets.entries()) {
    if (now > bucket.resetAt) authBuckets.delete(key);
  }
}, 10 * 60 * 1000).unref();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function emailDomain(email) {
  return normalizeEmail(email).split('@')[1] || '';
}

function isAllowedEmailDomain(email) {
  return ALLOWED_EMAIL_DOMAINS.has(emailDomain(email));
}

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) return '비밀번호는 8자 이상이어야 해요.';
  if (value.length > MAX_PASSWORD_LENGTH) return '비밀번호는 72자 이하로 입력해주세요.';
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return '비밀번호는 영문과 숫자를 모두 포함해야 해요.';
  }
  return null;
}

function establishSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) return reject(err);
      req.session.userId = userId;
      resolve();
    });
  });
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, displayName: user.display_name };
}

router.post('/signup', authRateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'signup' }), async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body || {};

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
      return res.status(400).json({ error: '올바른 이메일을 입력해주세요.' });
    }

    if (!isAllowedEmailDomain(normalizedEmail)) {
      return res.status(400).json({ error: 'Gmail, Naver, Kakao 등 지원하는 이메일로만 가입할 수 있어요.' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const existing = await findByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: '이미 가입된 이메일이에요.' });
    }

    const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);

    let user;
    try {
      user = await createUser({
        email: normalizedEmail,
        passwordHash,
        displayName: displayName ? String(displayName).trim().slice(0, 40) : null,
      });
    } catch (dbErr) {
      if (dbErr.code === PG_UNIQUE_VIOLATION) {
        return res.status(409).json({ error: '이미 가입된 이메일이에요.' });
      }
      throw dbErr;
    }

    await establishSession(req, user.id);
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login',
  authRateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyPrefix: 'login-ip' }),
  authRateLimit({ windowMs: 15 * 60 * 1000, max: 8, keyPrefix: 'login-email', includeEmail: true }),
  async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }

    if (String(password).length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: '이메일 또는 비밀번호가 올바르지 않아요.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await findByEmail(normalizedEmail);
    const INVALID = '이메일 또는 비밀번호가 올바르지 않아요.';

    if (!user) {
      return res.status(401).json({ error: INVALID });
    }

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: INVALID });
    }

    await establishSession(req, user.id);
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
  }
);

router.post('/logout', (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('mp.sid');
    res.json({ ok: true });
  });
});

router.get('/me', async (req, res, next) => {
  try {
    if (!req.session.userId) {
      return res.json({ user: null });
    }
    const user = await findById(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.json({ user: null });
    }
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
