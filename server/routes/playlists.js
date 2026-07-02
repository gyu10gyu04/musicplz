const crypto = require('crypto');
const express = require('express');
const {
  createPlaylist,
  listPlaylists,
  getPlaylistById,
  togglePlaylistLike,
  togglePlaylistSave,
  deletePlaylist,
  listComments,
  createComment,
  updateComment,
  deleteComment,
  toggleCommentLike,
  commentBelongsToPlaylist,
  playlistExists,
  commentExists,
  recentPlaylistCount,
  recentCommentCount,
} = require('../models/playlists');
const { blockUser } = require('../models/blockedUsers');
const { analyzePlaylistSafety } = require('../services/gemini');
const { verifyTrackIds } = require('../services/spotify');

const MAX_COVER_URL_LENGTH = 350_000;
const MAX_FRONTEND_COVER_URL_LENGTH = 330_000;
const MAX_TRACKS_PER_PLAYLIST = 50;
const MAX_RECENT_PLAYLISTS = 5;
const MAX_RECENT_COMMENTS = 20;
const HOUR_MS = 60 * 60 * 1000;
const SPOTIFY_TRACK_ID_RE = /^[0-9A-Za-z]{22}$/;
const DUMMY_TEXT_RE = /^(?:a+|ㅋ+|ㅎ+|ㅠ+|ㅜ+|ㅁ+|ㄴ+|ㅇ+|ㅁㄴㅇ+|asdf+|qwer+|test|dummy|null|undefined|none|n\/a|lorem\s*ipsum|123+|0+)$/i;

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  next();
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function blockPlaylistBypass(req, token) {
  const blockedUntil = new Date(Date.now() + 24 * HOUR_MS);
  await blockUser({
    userId: req.session.userId,
    reason: 'playlist_create_bypass',
    displayReason: '정상적인 플레이리스트 생성 절차를 우회한 요청이 감지되었습니다.',
    blockedUntil,
    metadata: {
      ipAddress: req.ip,
      path: req.originalUrl,
      method: req.method,
      userAgent: req.get('user-agent') || '',
      tokenProvided: Boolean(token),
    },
  });
}

async function blockAbnormalPlaylist(req, { playlist, deleted, reasons, geminiResult, spotifyVerification }) {
  const banDurationHours = Math.min(Math.max(Math.round(Number(geminiResult?.banDurationHours) || 24), 1), 2160);
  const blockedUntil = new Date(Date.now() + banDurationHours * HOUR_MS);
  const displayReason = cleanText(
    geminiResult?.displayReason || reasons[0] || '비정상적인 플레이리스트 생성이 감지되었습니다.',
    200
  );

  await blockUser({
    userId: req.session.userId,
    reason: 'playlist_safety_abnormal',
    displayReason,
    blockedUntil,
    metadata: {
      ipAddress: req.ip,
      playlistId: playlist.id,
      deleted,
      reasons,
      geminiResult,
      spotifyVerification,
      banDurationHours,
      userAgent: req.get('user-agent') || '',
    },
  });
}

function normalizedMusicText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s\-_.,!?:;()[\]{}'"`~@#$%^&*+=|\\/]+/g, ' ')
    .trim();
}

function isDummyText(value) {
  const text = normalizedMusicText(value);
  if (!text) return true;
  if (/^[0-9]+$/.test(text)) return true;
  if (DUMMY_TEXT_RE.test(text)) return true;
  if (/^(.)\1{3,}$/.test(text.replace(/\s/g, ''))) return true;
  return false;
}

async function inspectPlaylistSafety({ title, coverUrl, tracks }) {
  const deterministicReasons = [];
  const coverKind = coverUrl.startsWith('data:image/') ? 'data-image' : 'remote-url';

  if (coverUrl.length > MAX_FRONTEND_COVER_URL_LENGTH) {
    deterministicReasons.push(`커버 이미지 데이터가 프론트 기준 용량(${MAX_FRONTEND_COVER_URL_LENGTH}자)을 초과했습니다.`);
  }

  if (isDummyText(title)) {
    deterministicReasons.push('플레이리스트 제목이 더미/쓰레기 값으로 보입니다.');
  }

  const invalidSpotifyIds = tracks
    .map(track => track.id)
    .filter(id => !SPOTIFY_TRACK_ID_RE.test(id));
  if (invalidSpotifyIds.length > 0) {
    deterministicReasons.push(`Spotify 트랙 ID 형식이 아닌 곡이 ${invalidSpotifyIds.length}개 포함되어 있습니다.`);
  }

  const dummyTracks = tracks.filter(track => isDummyText(track.title) || isDummyText(track.artist));
  if (dummyTracks.length > 0) {
    deterministicReasons.push(`곡 제목/아티스트가 더미/쓰레기 값인 곡이 ${dummyTracks.length}개 포함되어 있습니다.`);
  }

  const trackKeys = tracks.map(track => `${normalizedMusicText(track.title)}::${normalizedMusicText(track.artist)}`);
  const uniqueTrackKeys = new Set(trackKeys);
  if (tracks.length >= 5 && uniqueTrackKeys.size <= Math.ceil(tracks.length * 0.4)) {
    deterministicReasons.push('동일하거나 거의 같은 곡 정보가 과도하게 반복되어 있습니다.');
  }

  let spotifyVerification = {
    checked: 0,
    found: 0,
    missingIds: [],
    skippedInvalidIds: invalidSpotifyIds,
    error: null,
  };
  const validSpotifyIds = tracks
    .map(track => track.id)
    .filter(id => SPOTIFY_TRACK_ID_RE.test(id));
  try {
    spotifyVerification = {
      ...(await verifyTrackIds(validSpotifyIds)),
      skippedInvalidIds: invalidSpotifyIds,
      error: null,
    };
    if (spotifyVerification.missingIds.length > 0) {
      deterministicReasons.push(`Spotify API에서 찾을 수 없는 곡 ID가 ${spotifyVerification.missingIds.length}개 포함되어 있습니다.`);
    }
  } catch (err) {
    spotifyVerification.error = err.message;
    console.warn('[Spotify 플레이리스트 검증 실패]', err.message);
  }

  let geminiResult = { abnormal: false, confidence: 0, reasons: [], error: null };
  try {
    geminiResult = await analyzePlaylistSafety({
      title,
      coverLength: coverUrl.length,
      coverKind,
      deterministicReasons,
      spotifyVerification,
      tracks,
    });
  } catch (err) {
    geminiResult.error = err.message;
    console.warn('[Gemini 플레이리스트 안전성 분석 실패]', err.message);
  }

  const geminiAbnormal = Boolean(geminiResult.abnormal && geminiResult.confidence >= 0.75);
  const reasons = [
    ...deterministicReasons,
    ...(geminiAbnormal ? geminiResult.reasons.map(reason => `Gemini: ${reason}`) : []),
  ];

  return {
    abnormal: deterministicReasons.length > 0 || geminiAbnormal,
    reasons,
    geminiResult,
    spotifyVerification,
    banDurationHours: Math.min(Math.max(Math.round(Number(geminiResult.banDurationHours) || 24), 1), 2160),
    displayReason: geminiResult.displayReason || reasons[0] || '비정상적인 플레이리스트 생성이 감지되었습니다.',
  };
}

function isSafeImageUrl(value) {
  const url = String(value || '').trim();
  if (!url || url.length > MAX_COVER_URL_LENGTH || /[\u0000-\u001f\u007f<>"'`\s]/.test(url)) return false;
  if (/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(url)) return true;

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

router.get('/', async (req, res, next) => {
  try {
    const query = cleanText(req.query.q, 80);
    const sort = req.query.sort === 'popular' ? 'popular' : 'latest';
    const savedOnly = req.query.saved === '1';
    if (savedOnly && !req.session.userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    const playlists = await listPlaylists({ query, sort, userId: req.session.userId || null, savedOnly });
    res.json({ playlists });
  } catch (err) {
    next(err);
  }
});

router.post('/create-token', requireLogin, (req, res) => {
  const token = crypto.randomBytes(32).toString('base64url');
  req.session.playlistCreateToken = token;
  res.json({ createToken: token });
});

router.post('/', requireLogin, async (req, res, next) => {
  try {
    const createToken = String(req.body?.createToken || '');
    if (!req.session.playlistCreateToken || !createToken || !safeEqual(createToken, req.session.playlistCreateToken)) {
      await blockPlaylistBypass(req, createToken);
      return res.status(403).json({ error: '정상적인 완료 절차를 거치지 않아 계정이 일시 차단되었습니다.' });
    }
    delete req.session.playlistCreateToken;

    const title = cleanText(req.body?.title, 40);
    const coverUrl = String(req.body?.coverUrl || '').trim().slice(0, MAX_COVER_URL_LENGTH + 1);
    const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks.slice(0, MAX_TRACKS_PER_PLAYLIST) : [];

    if (!title) return res.status(400).json({ error: '플레이리스트 제목을 입력해주세요.' });
    if (!coverUrl) return res.status(400).json({ error: '플레이리스트 대표 커버를 선택해주세요.' });
    if (!isSafeImageUrl(coverUrl)) return res.status(400).json({ error: '올바르지 않은 커버 이미지입니다.' });
    if (tracks.length === 0) return res.status(400).json({ error: '곡을 1개 이상 담아주세요.' });
    if (await recentPlaylistCount(req.session.userId, 10) >= MAX_RECENT_PLAYLISTS) {
      return res.status(429).json({ error: '플레이리스트를 너무 빠르게 만들고 있어요. 잠시 후 다시 시도해주세요.' });
    }

    const safeTracks = tracks.map(track => ({
      id: cleanText(track.id, 120),
      title: cleanText(track.title, 200),
      artist: cleanText(track.artist, 200),
      album: cleanText(track.album, 200),
      coverUrl: String(track.coverUrl || '').trim().slice(0, 1000),
      durationMs: Number.isSafeInteger(Number(track.durationMs)) && Number(track.durationMs) >= 0 ? Number(track.durationMs) : null,
    })).filter(track => track.id && track.title && track.artist);

    if (safeTracks.some(track => track.coverUrl && !isSafeImageUrl(track.coverUrl))) {
      return res.status(400).json({ error: '올바르지 않은 곡 커버 이미지가 포함되어 있습니다.' });
    }

    if (safeTracks.length === 0) return res.status(400).json({ error: '저장할 수 있는 곡이 없습니다.' });

    const playlist = await createPlaylist({
      userId: req.session.userId,
      title,
      coverUrl,
      tracks: safeTracks,
    });

    const safety = await inspectPlaylistSafety({ title, coverUrl, tracks: safeTracks });
    if (safety.abnormal) {
      const deleted = await deletePlaylist({ playlistId: playlist.id, userId: req.session.userId });
      await blockAbnormalPlaylist(req, {
        playlist,
        deleted,
        reasons: safety.reasons,
        geminiResult: safety.geminiResult,
        spotifyVerification: safety.spotifyVerification,
      });
      return res.status(403).json({ error: '비정상적인 플레이리스트로 판단되어 삭제되었고 계정이 일시 차단되었습니다.' });
    }

    res.status(201).json({ playlist });
  } catch (err) {
    next(err);
  }
});

router.get('/:playlistId', async (req, res, next) => {
  try {
    const playlistId = parsePositiveInt(req.params.playlistId);
    if (!playlistId) return res.status(400).json({ error: '올바르지 않은 플레이리스트입니다.' });

    const playlist = await getPlaylistById({ playlistId, userId: req.session.userId || null });
    if (!playlist) return res.status(404).json({ error: '플레이리스트를 찾을 수 없습니다.' });
    res.json({ playlist });
  } catch (err) {
    next(err);
  }
});

router.post('/:playlistId/like', requireLogin, async (req, res, next) => {
  try {
    const playlistId = parsePositiveInt(req.params.playlistId);
    if (!playlistId) return res.status(400).json({ error: '올바르지 않은 플레이리스트입니다.' });
    if (!(await playlistExists(playlistId))) return res.status(404).json({ error: '플레이리스트를 찾을 수 없습니다.' });
    const liked = await togglePlaylistLike({ playlistId, userId: req.session.userId });
    const playlist = await getPlaylistById({ playlistId, userId: req.session.userId });
    res.json({ liked, playlist });
  } catch (err) {
    next(err);
  }
});

router.post('/:playlistId/save', requireLogin, async (req, res, next) => {
  try {
    const playlistId = parsePositiveInt(req.params.playlistId);
    if (!playlistId) return res.status(400).json({ error: '올바르지 않은 플레이리스트입니다.' });
    if (!(await playlistExists(playlistId))) return res.status(404).json({ error: '플레이리스트를 찾을 수 없습니다.' });
    const saved = await togglePlaylistSave({ playlistId, userId: req.session.userId });
    const playlist = await getPlaylistById({ playlistId, userId: req.session.userId });
    res.json({ saved, playlist });
  } catch (err) {
    next(err);
  }
});

router.delete('/:playlistId', requireLogin, async (req, res, next) => {
  try {
    const playlistId = parsePositiveInt(req.params.playlistId);
    if (!playlistId) return res.status(400).json({ error: '올바르지 않은 플레이리스트입니다.' });

    const deleted = await deletePlaylist({ playlistId, userId: req.session.userId });
    if (!deleted) return res.status(403).json({ error: '이 플레이리스트를 삭제할 권한이 없습니다.' });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:playlistId/comments', async (req, res, next) => {
  try {
    const playlistId = parsePositiveInt(req.params.playlistId);
    if (!playlistId) return res.status(400).json({ error: '올바르지 않은 플레이리스트입니다.' });
    const comments = await listComments({ playlistId, userId: req.session.userId || null });
    res.json({ comments });
  } catch (err) {
    next(err);
  }
});

router.post('/:playlistId/comments', requireLogin, async (req, res, next) => {
  try {
    const playlistId = parsePositiveInt(req.params.playlistId);
    if (!playlistId) return res.status(400).json({ error: '올바르지 않은 플레이리스트입니다.' });

    const content = cleanText(req.body?.content, 500);
    const parentCommentId = req.body?.parentCommentId ? parsePositiveInt(req.body.parentCommentId) : null;
    if (!content) return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });
    if (await recentCommentCount(req.session.userId, 10) >= MAX_RECENT_COMMENTS) {
      return res.status(429).json({ error: '댓글을 너무 빠르게 작성하고 있어요. 잠시 후 다시 시도해주세요.' });
    }
    if (req.body?.parentCommentId && !parentCommentId) return res.status(400).json({ error: '올바르지 않은 답글입니다.' });
    if (parentCommentId && !(await commentBelongsToPlaylist({ commentId: parentCommentId, playlistId }))) {
      return res.status(400).json({ error: '올바르지 않은 답글입니다.' });
    }

    await createComment({ playlistId, userId: req.session.userId, parentCommentId, content });
    const comments = await listComments({ playlistId, userId: req.session.userId });
    res.status(201).json({ comments });
  } catch (err) {
    next(err);
  }
});

router.patch('/comments/:commentId', requireLogin, async (req, res, next) => {
  try {
    const commentId = parsePositiveInt(req.params.commentId);
    if (!commentId) return res.status(400).json({ error: '올바르지 않은 댓글입니다.' });

    const content = cleanText(req.body?.content, 500);
    if (!content) return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });

    const updated = await updateComment({ commentId, userId: req.session.userId, content });
    if (!updated) return res.status(403).json({ error: '댓글을 수정할 권한이 없습니다.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/comments/:commentId', requireLogin, async (req, res, next) => {
  try {
    const commentId = parsePositiveInt(req.params.commentId);
    if (!commentId) return res.status(400).json({ error: '올바르지 않은 댓글입니다.' });

    const deleted = await deleteComment({ commentId, userId: req.session.userId });
    if (!deleted) return res.status(403).json({ error: '댓글을 삭제할 권한이 없습니다.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/comments/:commentId/like', requireLogin, async (req, res, next) => {
  try {
    const commentId = parsePositiveInt(req.params.commentId);
    if (!commentId) return res.status(400).json({ error: '올바르지 않은 댓글입니다.' });
    if (!(await commentExists(commentId))) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    const liked = await toggleCommentLike({ commentId, userId: req.session.userId });
    res.json({ liked });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
