const express = require('express');
const { listBlockedUsers } = require('../models/blockedUsers');
const { findById } = require('../models/users');

const router = express.Router();

async function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (adminKey) {
    if (req.get('x-admin-key') !== adminKey) {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }
    return next();
  }

  if (!req.session.userId) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }

  try {
    const adminEmails = String(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(Boolean);
    const user = await findById(req.session.userId);
    if (!user || !adminEmails.includes(String(user.email || '').toLowerCase())) {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

router.get('/blocked-users', requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const blockedUsers = await listBlockedUsers({ limit });
    res.json({ blockedUsers });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
