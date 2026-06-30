// routes/auth.js — 회원가입 / 로그인 / 로그아웃 / 세션 확인 라우트
const express = require('express');
const bcrypt = require('bcryptjs');
const {
  createUser,
  findByEmail,
  findById,
  findByDisplayName,
} = require('../models/users');

const router = express.Router();

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 10;
const PG_UNIQUE_VIOLATION = '23505';
const MAX_PASSWORD_LENGTH = 72; // bcrypt는 72바이트 이후를 무시하므로 길이를 제한합니다.
const DISPLAY_NAME_RE = /^[0-9A-Za-z가-힣_.-]+$/;

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

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) return '비밀번호는 8자 이상이어야 해요.';
  if (value.length > MAX_PASSWORD_LENGTH) return '비밀번호는 72자 이하로 입력해주세요.';
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return '비밀번호는 영문과 숫자를 모두 포함해야 해요.';
  }
  return null;
}

function normalizeDisplayName(displayName) {
  return String(displayName || '').trim().replace(/\s+/g, ' ');
}

function validateDisplayName(displayName) {
  const value = normalizeDisplayName(displayName);
  if (!value) return '닉네임을 입력해주세요.';
  if (value.length < 2) return '닉네임은 2자 이상이어야 해요.';
  if (value.length > 20) return '닉네임은 20자 이하로 입력해주세요.';
  if (!DISPLAY_NAME_RE.test(value)) {
    return '닉네임은 한글, 영문, 숫자, _, ., - 만 사용할 수 있어요.';
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

async function verifyTurnstile(req, res, next) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  const siteKey = process.env.TURNSTILE_SITE_KEY;
  if (!secretKey || !siteKey) return next();

  const token = String(req.body?.turnstileToken || '').trim();
  if (!token) {
    return res.status(400).json({ error: '보안 확인을 완료해주세요.' });
  }

  try {
    const verifyRes = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
        remoteip: req.ip,
      }),
    });

    if (!verifyRes.ok) {
      return res.status(502).json({ error: '보안 확인 서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.' });
    }

    const data = await verifyRes.json();
    if (!data.success) {
      return res.status(400).json({ error: '보안 확인에 실패했어요. 다시 시도해주세요.' });
    }

    next();
  } catch (err) {
    next(err);
  }
}

function requireTurnstileConfig(req, res, next) {
  if (!process.env.TURNSTILE_SECRET_KEY || !process.env.TURNSTILE_SITE_KEY) {
    return res.status(503).json({ error: '회원가입 보안 확인 설정이 필요합니다. 관리자에게 문의해주세요.' });
  }

  next();
}

function rejectSignupWhileLoggedIn(req, res, next) {
  if (req.session.userId) {
    return res.status(400).json({ error: '이미 로그인된 상태에서는 새 계정을 만들 수 없어요. 로그아웃 후 다시 시도해주세요.' });
  }

  next();
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, displayName: user.display_name };
}

router.get('/security-config', (req, res) => {
  const siteKey = process.env.TURNSTILE_SITE_KEY || '';
  res.json({
    turnstileEnabled: Boolean(process.env.TURNSTILE_SECRET_KEY && siteKey),
    turnstileSiteKey: siteKey,
  });
});

router.post('/signup',
  rejectSignupWhileLoggedIn,
  authRateLimit({ windowMs: 60 * 60 * 1000, max: 3, keyPrefix: 'signup-hour' }),
  authRateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 8, keyPrefix: 'signup-day' }),
  requireTurnstileConfig,
  verifyTurnstile,
  async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body || {};

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
      return res.status(400).json({ error: '올바른 이메일을 입력해주세요.' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const normalizedDisplayName = normalizeDisplayName(displayName);
    const displayNameError = validateDisplayName(normalizedDisplayName);
    if (displayNameError) {
      return res.status(400).json({ error: displayNameError });
    }

    const existing = await findByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: '이미 가입된 이메일이에요.' });
    }

    const existingDisplayName = await findByDisplayName(normalizedDisplayName);
    if (existingDisplayName) {
      return res.status(409).json({ error: '이미 사용 중인 닉네임이에요.' });
    }

    const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);

    let user;
    try {
      user = await createUser({
        email: normalizedEmail,
        passwordHash,
        displayName: normalizedDisplayName,
      });
    } catch (dbErr) {
      if (dbErr.code === PG_UNIQUE_VIOLATION) {
        if (dbErr.constraint === 'users_display_name_lower_unique') {
          return res.status(409).json({ error: '이미 사용 중인 닉네임이에요.' });
        }
        return res.status(409).json({ error: '이미 가입된 이메일이에요.' });
      }
      throw dbErr;
    }

    await establishSession(req, user.id);
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
  }
);

router.post('/login',
  authRateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyPrefix: 'login-ip' }),
  authRateLimit({ windowMs: 15 * 60 * 1000, max: 8, keyPrefix: 'login-email', includeEmail: true }),
  verifyTurnstile,
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
