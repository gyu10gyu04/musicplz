// services/gemini.js — Gemini API 연동
//
// 사용자가 적은 애매한 문장(예: "비 오는 날 창밖 보며 듣던 잔잔한 노래")을
// Spotify 검색에 적합한 키워드로 변환하고, 화면에 보여줄 "AI가 이해한 내용" 문구도
// 함께 만들어줍니다.
//
// Gemini에게 "반드시 JSON으로만 응답하라"고 강하게 지시한 뒤, 응답을 파싱해서 사용합니다.

const GEMINI_MODEL = 'gemini-2.5-flash'; // 가볍고 빠른 모델 — 짧은 해석 작업에 적합
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `너는 음악 검색 도우미야. 사용자가 한국어로 애매하거나 감성적인 문장으로
노래를 찾으려고 할 때, 그 문장에서 의미를 파악해서 Spotify 검색에 쓸 만한
영어 또는 한국어 키워드(장르, 분위기, 가수, 곡 제목 등)를 뽑아내야 해.

반드시 아래 JSON 형식으로만 응답해. 다른 설명, 코드블록 표시(\`\`\`) 없이 순수 JSON만 출력해:
{
  "searchQuery": "Spotify 검색창에 그대로 넣을 검색어 (2~5단어 정도, 영어/한국어 혼용 가능)",
  "tags": ["감지된", "분위기나", "테마", "태그", "목록", "최대5개"],
  "interpretation": "사용자에게 보여줄 한국어 한 문장. 예: '#비 #잔잔 #새벽 분위기의 곡으로 이해했어요'"
}

규칙:
- searchQuery는 실제 검색에 쓰일 거니까 너무 길거나 문장 형태면 안 돼. 핵심 단어 위주로.
- 사용자가 특정 가수나 곡 제목을 언급했으면 그걸 최우선으로 searchQuery에 반영해.
- 사용자가 분위기/상황만 말했으면(예: "이별하고 듣는 노래") 장르+무드 키워드로 변환해.
- interpretation은 "#태그 #태그 분위기의 곡으로 이해했어요" 형식을 기본으로 하되,
  특정 곡/가수를 찾는 경우엔 "~를 찾고 있는 것 같아요"처럼 자연스럽게 바꿔도 돼.`;

const ARTIST_ALBUMS_PROMPT = `너는 음악 데이터 정리 도우미야. 사용자가 아티스트 이름을 주면,
그 아티스트가 발매한 것으로 널리 알려진 앨범/EP/싱글 제목 후보를 Spotify 검색에 쓰기 좋게
정리해야 해.

반드시 아래 JSON 형식으로만 응답해. 다른 설명, 코드블록 표시(\`\`\`) 없이 순수 JSON만 출력해:
{
  "albumNames": ["앨범 또는 싱글 제목", "최대 12개"]
}

규칙:
- 확실하지 않은 제목은 넣지 마.
- 같은 제목을 중복으로 넣지 마.
- 정규 앨범을 우선하되, 알려진 EP/싱글도 포함해도 돼.
- 아티스트 이름 자체나 설명 문장은 넣지 말고 제목만 넣어.`;

const PLAYLIST_COVER_QUERIES_PROMPT = `너는 음악 검색어 정리 도우미야. 사용자가 고른 플레이리스트 곡 목록을 받으면,
각 곡의 실제 앨범 커버를 Spotify에서 다시 찾기 좋은 검색어를 만들어야 해.

반드시 아래 JSON 형식으로만 응답해. 다른 설명, 코드블록 표시 없이 순수 JSON만 출력해:
{
  "queries": ["곡 제목 아티스트", "최대 12개"]
}

규칙:
- 각 query는 Spotify 검색창에 넣기 좋은 형태로 짧게 만들어.
- 곡 제목과 대표 아티스트를 우선 포함해.
- 같은 곡/앨범으로 보이는 중복 검색어는 제거해.
- 확실하지 않으면 입력받은 제목과 아티스트를 그대로 조합해.`;

const PLAYLIST_SAFETY_PROMPT = `너는 MusicPlz의 악성 플레이리스트 탐지 도우미야.
사용자가 만든 플레이리스트 정보와 서버의 확정 검사 결과를 보고, 이 플레이리스트가 정상적인 음악 플레이리스트인지 판단해야 해.

반드시 아래 JSON 형식으로만 응답해. 다른 설명, 코드블록 표시 없이 순수 JSON만 출력해:
{
  "abnormal": true,
  "confidence": 0.0,
  "reasons": ["비정상으로 판단한 짧은 사유"]
}

비정상으로 봐야 하는 예:
- 제목/곡 정보가 dummy, test, asdf, qwer, lorem, undefined, null, ㅁㄴㅇ 같은 쓰레기 값으로 채워진 경우
- 곡 제목/아티스트가 실제 음악 데이터처럼 보이지 않는 경우
- 서버 검사 결과 Spotify에서 찾을 수 없는 곡 ID가 많은 경우
- 커버 이미지가 비정상적으로 큰 경우
- 같은 곡/같은 값이 과도하게 반복된 경우

정상으로 봐야 하는 예:
- 일부 곡에 특수문자, 괄호, 리믹스/라이브 표기가 있는 일반적인 음악 목록
- 한국어/영어/일본어 등 다양한 언어의 실제 곡명과 아티스트명
- 서버 검사에서 큰 문제가 없고 음악 플레이리스트처럼 자연스러운 경우

규칙:
- 확실하지 않으면 abnormal=false로 둬.
- confidence는 0부터 1 사이 숫자로 줘.
- reasons는 최대 5개까지 짧게 작성해.`;

/**
 * 사용자 문장을 해석해서 Spotify 검색어 + 화면 표시용 해석 문구를 만듦.
 * @param {string} userQuery - 사용자가 입력한 원문 문장
 * @returns {Promise<{searchQuery: string, tags: string[], interpretation: string}>}
 */
async function interpretSearchQuery(userQuery) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다. ' +
      '.env 파일에 Google AI Studio에서 발급받은 키를 넣어주세요.'
    );
  }

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userQuery }] }],
      generationConfig: {
        temperature: 0.4, // 검색어 변환은 일관성이 중요하므로 낮게 설정
        maxOutputTokens: 200,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini 요청 실패 (status ${res.status}): ${text}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return parseGeminiJson(rawText, userQuery);
}

/**
 * Spotify의 아티스트 앨범 API가 빈 결과를 줄 때 보강용으로,
 * Gemini가 알고 있는 앨범/EP/싱글 제목 후보를 받아온다.
 * 실제 화면에 쓰기 전에는 Spotify 검색으로 다시 검증한다.
 * @param {string} artistName
 * @returns {Promise<string[]>}
 */
async function suggestArtistAlbumNames(artistName) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다. ' +
      '.env 파일에 Google AI Studio에서 발급받은 키를 넣어주세요.'
    );
  }

  const safeArtistName = String(artistName || '').trim().slice(0, 120);
  if (!safeArtistName) return [];

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: ARTIST_ALBUMS_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: safeArtistName }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 300,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini 앨범 후보 요청 실패 (status ${res.status}): ${text}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseGeminiAlbumNames(rawText);
}

async function suggestPlaylistCoverQueries(tracks) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다. ' +
      '.env 파일에 Google AI Studio에서 발급받은 키를 넣어주세요.'
    );
  }

  const safeTracks = Array.isArray(tracks)
    ? tracks.slice(0, 12).map(track => ({
      title: String(track?.title || '').trim().slice(0, 120),
      artist: String(track?.artist || track?.primaryArtist || '').trim().slice(0, 120),
      album: String(track?.album || '').trim().slice(0, 120),
    })).filter(track => track.title || track.artist)
    : [];

  if (safeTracks.length === 0) return [];

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: PLAYLIST_COVER_QUERIES_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify({ tracks: safeTracks }, null, 2) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 350,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini 커버 검색어 요청 실패 (status ${res.status}): ${text}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseGeminiQueries(rawText);
}

async function analyzePlaylistSafety(playlist) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다. ' +
      '.env 파일에 Google AI Studio에서 발급받은 키를 넣어주세요.'
    );
  }

  const safePlaylist = {
    title: String(playlist?.title || '').trim().slice(0, 80),
    coverLength: Number(playlist?.coverLength) || 0,
    coverKind: String(playlist?.coverKind || '').slice(0, 40),
    deterministicReasons: Array.isArray(playlist?.deterministicReasons)
      ? playlist.deterministicReasons.map(reason => String(reason).slice(0, 200)).slice(0, 10)
      : [],
    spotifyVerification: playlist?.spotifyVerification || {},
    tracks: Array.isArray(playlist?.tracks)
      ? playlist.tracks.slice(0, 50).map(track => ({
        id: String(track?.id || '').slice(0, 120),
        title: String(track?.title || '').slice(0, 200),
        artist: String(track?.artist || '').slice(0, 200),
        album: String(track?.album || '').slice(0, 200),
        durationMs: Number(track?.durationMs) || null,
      }))
      : [],
  };

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: PLAYLIST_SAFETY_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(safePlaylist, null, 2) }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 500,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini 플레이리스트 안전성 분석 실패 (status ${res.status}): ${text}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseGeminiPlaylistSafety(rawText);
}

/**
 * Gemini 응답에서 JSON을 안전하게 파싱.
 * 모델이 코드블록(```json ... ```)으로 감싸서 응답하는 경우도 있어 그 부분을 먼저 벗겨낸다.
 * 파싱이 실패하면, 검색 자체가 완전히 멈추지 않도록 사용자 원문을 그대로 검색어로 쓰는
 * 안전한 기본값(fallback)을 반환한다.
 */
function parseGeminiJson(rawText, fallbackQuery) {
  const cleaned = rawText.trim().replace(/^```json\s*|^```\s*|```$/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      searchQuery: String(parsed.searchQuery || fallbackQuery).slice(0, 100),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map(String) : [],
      interpretation: String(parsed.interpretation || `"${fallbackQuery}"로 검색했어요`),
    };
  } catch (err) {
    // Gemini가 형식을 안 지킨 경우 — 검색이 완전히 막히지 않도록 원문으로 대체
    return {
      searchQuery: fallbackQuery,
      tags: [],
      interpretation: `"${fallbackQuery}"로 검색했어요`,
    };
  }
}

function parseGeminiAlbumNames(rawText) {
  const cleaned = rawText.trim().replace(/^```json\s*|^```\s*|```$/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    const names = Array.isArray(parsed.albumNames) ? parsed.albumNames : [];
    const seen = new Set();
    return names
      .map(name => String(name || '').trim())
      .filter(Boolean)
      .filter(name => {
        const key = name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 12);
  } catch (err) {
    return [];
  }
}

function parseGeminiQueries(rawText) {
  const cleaned = rawText.trim().replace(/^```json\s*|^```\s*|```$/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    const queries = Array.isArray(parsed.queries) ? parsed.queries : [];
    const seen = new Set();
    return queries
      .map(query => String(query || '').trim())
      .filter(Boolean)
      .filter(query => {
        const key = query.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 12);
  } catch (err) {
    return [];
  }
}

function parseGeminiPlaylistSafety(rawText) {
  const cleaned = rawText.trim().replace(/^```json\s*|^```\s*|```$/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      abnormal: Boolean(parsed.abnormal),
      confidence: Math.min(Math.max(Number(parsed.confidence) || 0, 0), 1),
      reasons: Array.isArray(parsed.reasons)
        ? parsed.reasons.map(reason => String(reason || '').trim()).filter(Boolean).slice(0, 5)
        : [],
    };
  } catch (err) {
    return { abnormal: false, confidence: 0, reasons: [] };
  }
}

module.exports = { interpretSearchQuery, suggestArtistAlbumNames, suggestPlaylistCoverQueries, analyzePlaylistSafety };
