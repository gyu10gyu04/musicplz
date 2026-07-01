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
} = require('../models/playlists');

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

function isSafeImageUrl(value) {
  const url = String(value || '').trim();
  if (!url || url.length > 2_000_000 || /[\u0000-\u001f\u007f<>"'`\s]/.test(url)) return false;
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

router.post('/', requireLogin, async (req, res, next) => {
  try {
    const title = cleanText(req.body?.title, 40);
    const coverUrl = String(req.body?.coverUrl || '').trim().slice(0, 2_000_000);
    const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks.slice(0, 100) : [];

    if (!title) return res.status(400).json({ error: '플레이리스트 제목을 입력해주세요.' });
    if (!coverUrl) return res.status(400).json({ error: '플레이리스트 대표 커버를 선택해주세요.' });
    if (!isSafeImageUrl(coverUrl)) return res.status(400).json({ error: '올바르지 않은 커버 이미지입니다.' });
    if (tracks.length === 0) return res.status(400).json({ error: '곡을 1개 이상 담아주세요.' });

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
