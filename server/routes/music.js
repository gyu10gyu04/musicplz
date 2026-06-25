// routes/music.js — AI 음악 검색 라우트
//
// 흐름: 사용자 문장 → Gemini가 검색어/태그/해석문구로 변환 → Spotify에서 실제 곡 검색
//       → 두 결과를 합쳐서 프론트엔드에 반환
//
// 추가 라우트:
//   GET /api/music/album/:albumId           — 특정 앨범의 트랙 목록 (더보기를 위한 offset 지원)
//   GET /api/music/artist/:artistId/albums  — 특정 아티스트의 다른 앨범 목록

const express = require('express');
const { interpretSearchQuery } = require('../services/gemini');
const { searchTracks, getAlbumTracks, getArtistAlbums } = require('../services/spotify');

const router = express.Router();

router.post('/search', async (req, res, next) => {
  try {
    const { query } = req.body || {};

    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: '검색어를 입력해주세요.' });
    }

    const userQuery = String(query).trim().slice(0, 200); // 과도하게 긴 입력 방지

    // 1) Gemini로 문장 해석 → Spotify에 던질 검색어와, 화면에 보여줄 해석 문구를 얻음
    let interpretation;
    try {
      interpretation = await interpretSearchQuery(userQuery);
    } catch (geminiErr) {
      console.error('[Gemini 해석 실패]', geminiErr.message);
      // Gemini가 잠시 안 되더라도 검색 자체는 계속 진행 — 사용자 원문으로 그대로 검색
      interpretation = {
        searchQuery: userQuery,
        tags: [],
        interpretation: `"${userQuery}"로 검색했어요`,
      };
    }

    // 2) Spotify에서 실제 곡 검색
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

/**
 * 앨범 커버 클릭 시: 그 앨범의 트랙들을 순서(트랙 번호)대로 반환.
 * 더보기를 위해 offset 쿼리 파라미터를 지원 (기본 0).
 * 응답에는 popularity 기준 "대표곡"도 함께 표시해 프론트에서 모달 제목 갱신에 사용.
 */
router.get('/album/:albumId', async (req, res, next) => {
  try {
    const { albumId } = req.params;
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const { tracks, total, hasMore, album } = await getAlbumTracks(albumId, offset, 20);

    // 대표곡 = 이번에 받은 트랙들 중 popularity가 가장 높은 트랙
    // (offset이 0이 아닌 "더보기" 요청에서는 그 페이지 안에서의 최고 인기곡이 됨 —
    //  대표곡 표시는 항상 첫 페이지 응답을 기준으로 쓰는 것을 프론트에서 권장)
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

/**
 * 앨범 커버 롱프레스 시: 같은 아티스트의 다른 앨범 목록을 반환 (좌우 캐러셀용).
 */
router.get('/artist/:artistId/albums', async (req, res, next) => {
  try {
    const { artistId } = req.params;
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    console.log(`[아티스트 앨범 조회] artistId="${artistId}", offset=${offset}`);

    const { albums, total, hasMore } = await getArtistAlbums(artistId, offset, 30);

    console.log(`[아티스트 앨범 조회 결과] artistId="${artistId}" → 앨범 ${albums.length}개 (전체 ${total}개): ${albums.map(a => a.name).join(', ')}`);

    res.json({ albums, total, hasMore, nextOffset: hasMore ? offset + albums.length : null });
  } catch (err) {
    console.error(`[아티스트 앨범 조회 실패] artistId="${req.params.artistId}":`, err.message);
    next(err);
  }
});

module.exports = router;
