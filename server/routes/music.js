// routes/music.js — AI 음악 검색 라우트
//
// 흐름: 사용자 문장 → Gemini가 검색어/태그/해석문구로 변환 → Spotify에서 실제 곡 검색
//       → 두 결과를 합쳐서 프론트엔드에 반환
//
// 라우트 목록:
//   POST /api/music/search                  — AI 음악 검색
//   GET  /api/music/album/:albumId          — 앨범 트랙 목록 (더보기 offset 지원)
//   GET  /api/music/artist/:artistId/albums — 아티스트 다른 앨범 목록 (캐러셀용)

const express = require('express');
const { interpretSearchQuery, suggestArtistAlbumNames, suggestPlaylistCoverQueries } = require('../services/gemini');
const { searchTracks, getAlbumTracks, getArtistAlbums, searchAlbumsByArtistAndNames } = require('../services/spotify');

const router = express.Router();

router.post('/playlist-cover-candidates', async (req, res, next) => {
  try {
    const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks.slice(0, 12) : [];
    if (tracks.length === 0) {
      return res.json({ covers: [] });
    }

    let queries = [];
    try {
      queries = await suggestPlaylistCoverQueries(tracks);
    } catch (geminiErr) {
      console.error('[Gemini 커버 검색어 실패]', geminiErr.message);
      queries = tracks
        .map(track => `${track.title || ''} ${track.primaryArtist || track.artist || ''}`.trim())
        .filter(Boolean);
    }

    const seen = new Set();
    const covers = [];

    for (const query of queries.slice(0, 12)) {
      const foundTracks = await searchTracks(query, 1).catch(() => []);
      const track = foundTracks[0];
      if (!track?.coverUrl) continue;

      const key = track.albumId || track.coverUrl;
      if (seen.has(key)) continue;
      seen.add(key);

      covers.push({
        coverUrl: track.coverUrl,
        album: track.album || track.title || '앨범',
        artist: track.primaryArtist || track.artist || '',
      });
    }

    res.json({ covers });
  } catch (err) {
    next(err);
  }
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   POST /api/music/search
   사용자 자연어 문장 → Gemini 해석 → Spotify 검색
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
router.post('/search', async (req, res, next) => {
  try {
    const { query } = req.body || {};

    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: '검색어를 입력해주세요.' });
    }

    const userQuery = String(query).trim().slice(0, 200);

    let interpretation;
    try {
      interpretation = await interpretSearchQuery(userQuery);
    } catch (geminiErr) {
      console.error('[Gemini 해석 실패]', geminiErr.message);
      interpretation = {
        searchQuery: userQuery,
        tags: [],
        interpretation: `"${userQuery}"로 검색했어요`,
      };
    }

    const tracks = await searchTracks(interpretation.searchQuery, 10);

    console.log(`[검색 결과] "${interpretation.searchQuery}" → ${tracks.length}곡:`,
      tracks.map(t => `${t.title}(artistId=${t.artistId})`).join(' / '));

    res.json({
      interpretation: interpretation.interpretation,
      tags: interpretation.tags,
      searchQuery: interpretation.searchQuery,
      tracks,
    });
  } catch (err) {
    next(err);
  }
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GET /api/music/album/:albumId
   앨범 커버 클릭 시 — 해당 앨범의 트랙 목록 반환
   ?offset=0 으로 더보기(페이지네이션) 지원
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
router.get('/album/:albumId', async (req, res, next) => {
  try {
    const { albumId } = req.params;
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const { tracks, total, hasMore, album } = await getAlbumTracks(albumId, offset, 20);

    // 대표곡 = popularity 가장 높은 트랙 (첫 페이지 응답 기준으로 사용 권장)
    const representativeTrack = tracks.reduce(
      (best, t) => (!best || t.popularity > best.popularity ? t : best),
      null
    );

    res.json({
      album,
      tracks,
      total,
      hasMore,
      nextOffset: hasMore ? offset + tracks.length : null,
      representativeTrackTitle: representativeTrack?.title || null,
    });
  } catch (err) {
    next(err);
  }
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GET /api/music/artist/:artistId/albums
   앨범 커버 롱프레스 시 — 같은 아티스트의 다른 앨범 목록 반환 (캐러셀용)

   동작 순서:
   1. Spotify /artists/{id}/albums 로 먼저 시도
   2. 실패하거나 결과가 비어있으면 → Gemini에게 앨범명 후보 요청
   3. Gemini 후보명을 Spotify /search 로 검증해서 실제 커버가 있는 것만 반환
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
router.get('/artist/:artistId/albums', async (req, res, next) => {
  try {
    const { artistId } = req.params;
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const artistName = String(req.query.artistName || '').trim().slice(0, 120);

    console.log(`[아티스트 앨범 조회] artistId="${artistId}", artistName="${artistName}", offset=${offset}`);

    // ── STEP 1: Spotify 직접 조회 시도 ──────────────────────
    let spotifyAlbums = [];
    let spotifyTotal = 0;
    let spotifyHasMore = false;
    let spotifyFailed = false;

    try {
      const result = await getArtistAlbums(artistId, offset, 10);
      spotifyAlbums = result.albums;
      spotifyTotal  = result.total;
      spotifyHasMore = result.hasMore;
    } catch (err) {
      spotifyFailed = true;
      console.warn(`[Spotify 아티스트 앨범 실패 → Gemini fallback] artistId="${artistId}": ${err.message}`);
    }

    // Spotify에서 결과를 잘 받았으면 바로 반환
    if (!spotifyFailed && spotifyAlbums.length > 0) {
      console.log(`[Spotify 앨범 결과] "${artistName}" → ${spotifyAlbums.length}개: ${spotifyAlbums.map(a => a.name).join(', ')}`);
      return res.json({
        albums: spotifyAlbums,
        total: spotifyTotal,
        hasMore: spotifyHasMore,
        nextOffset: spotifyHasMore ? offset + spotifyAlbums.length : null,
        source: 'spotify-artist',
      });
    }

    // ── STEP 2: Spotify 실패 또는 빈 결과 → Gemini + Spotify 검색 fallback ──
    // offset > 0 인 더보기 요청은 첫 페이지가 Spotify에서 왔을 텐데
    // 두 번째부터 실패하는 경우라 Gemini로 대체하기 어려움 → 빈 결과 반환
    if (offset > 0) {
      return res.json({ albums: [], total: 0, hasMore: false, nextOffset: null, source: 'none' });
    }

    if (!artistName) {
      // artistName 없이는 Gemini에 물어볼 수 없음
      console.warn(`[아티스트 앨범] artistName 없음, 빈 결과 반환`);
      return res.json({ albums: [], total: 0, hasMore: false, nextOffset: null, source: 'none' });
    }

    // Gemini에게 이 아티스트의 앨범명 후보 목록 요청
    let suggestedNames = [];
    try {
      suggestedNames = await suggestArtistAlbumNames(artistName);
      console.log(`[Gemini 앨범 후보] "${artistName}" → ${suggestedNames.length}개: ${suggestedNames.join(', ')}`);
    } catch (geminiErr) {
      console.error(`[Gemini 앨범 후보 실패] "${artistName}": ${geminiErr.message}`);
    }

    if (suggestedNames.length === 0) {
      return res.json({ albums: [], total: 0, hasMore: false, nextOffset: null, source: 'none' });
    }

    // Gemini 후보명을 Spotify /search 로 하나씩 검증
    const fallbackAlbums = await searchAlbumsByArtistAndNames(artistName, suggestedNames);

    console.log(`[Gemini+Spotify 최종] "${artistName}" → ${fallbackAlbums.length}개: ${fallbackAlbums.map(a => a.name).join(', ')}`);

    res.json({
      albums: fallbackAlbums,
      total: fallbackAlbums.length,
      hasMore: false,
      nextOffset: null,
      source: 'gemini-spotify-search',
    });

  } catch (err) {
    console.error(`[아티스트 앨범 오류] artistId="${req.params.artistId}": ${err.message}`);
    next(err);
  }
});

module.exports = router;
