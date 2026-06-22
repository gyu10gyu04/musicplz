// routes/music.js — AI 음악 검색 라우트
//
// 흐름: 사용자 문장 → Gemini가 검색어/태그/해석문구로 변환 → Spotify에서 실제 곡 검색
//       → 두 결과를 합쳐서 프론트엔드에 반환

const express = require('express');
const { interpretSearchQuery } = require('../services/gemini');
const { searchTracks } = require('../services/spotify');

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

module.exports = router;
