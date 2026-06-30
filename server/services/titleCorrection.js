const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Spotify track id 또는 "artist::title" 키로 확정 보정이 필요한 곡을 추가할 수 있습니다.
const TITLE_OVERRIDES = new Map([
  // ['spotify-track-id', '한글 원제'],
  // ['artist name::english translated title', '한글 원제'],
]);

const correctedTitleCache = new Map();

const TITLE_CORRECTION_PROMPT = `너는 음악 메타데이터 교정 도우미야. Spotify가 내려준 곡 제목 중,
한국어 원제가 있는데 영어로 번역되어 표시된 제목만 한국어 원제로 고쳐야 해.

반드시 아래 JSON 형식으로만 응답해. 다른 설명, 코드블록 표시 없이 순수 JSON만 출력해:
{
  "tracks": [
    { "id": "입력받은 id", "title": "최종 표시 제목" }
  ]
}

규칙:
- 입력받은 모든 id를 그대로 포함해.
- 원래 제목이 영어인 곡은 절대 한국어로 번역하지 말고 입력 제목 그대로 둬.
- 한국어 원제가 널리 알려진 곡이 영어 번역 제목으로 표시된 경우에만 한국어 원제로 바꿔.
- 확실하지 않으면 반드시 입력 제목 그대로 둬.
- 아티스트명, 앨범명, 로마자 표기, 번역 제목을 근거로 판단해.
- 괄호 안 버전 정보, remaster, live, feat. 표기는 원제 판단에 꼭 필요한 경우만 유지해.`;

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function overrideFor(track) {
  if (!track) return null;
  if (TITLE_OVERRIDES.has(track.id)) return TITLE_OVERRIDES.get(track.id);

  const artistTitleKey = `${normalizeKey(track.primaryArtist || track.artist)}::${normalizeKey(track.title)}`;
  return TITLE_OVERRIDES.get(artistTitleKey) || null;
}

async function correctTrackTitles(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) return tracks;

  let corrected = tracks.map(track => {
    const override = overrideFor(track);
    if (!override) return track;
    correctedTitleCache.set(track.id, override);
    return { ...track, title: override };
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return corrected;

  const candidates = corrected
    .filter(track => track?.id && track?.title && !overrideFor(track))
    .filter(track => correctedTitleCache.get(track.id) !== track.title)
    .slice(0, 20);

  if (candidates.length === 0) return corrected;

  try {
    const titleMap = await requestGeminiTitleCorrections(apiKey, candidates);
    corrected = corrected.map(track => {
      const title = titleMap.get(track.id);
      if (!title) return track;
      correctedTitleCache.set(track.id, title);
      return { ...track, title };
    });
  } catch (err) {
    console.error('[Gemini 제목 보정 실패]', err.message);
  }

  return corrected.map(track => {
    const cachedTitle = correctedTitleCache.get(track.id);
    return cachedTitle ? { ...track, title: cachedTitle } : track;
  });
}

async function requestGeminiTitleCorrections(apiKey, tracks) {
  const payload = tracks.map(track => ({
    id: String(track.id || ''),
    title: String(track.title || ''),
    artist: String(track.artist || ''),
    primaryArtist: String(track.primaryArtist || ''),
    album: String(track.album || ''),
  }));

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: TITLE_CORRECTION_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify({ tracks: payload }, null, 2) }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 900,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini 제목 보정 요청 실패 (status ${res.status}): ${text}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseTitleCorrectionJson(rawText, tracks);
}

function parseTitleCorrectionJson(rawText, originalTracks) {
  const cleaned = rawText.trim().replace(/^```json\s*|^```\s*|```$/g, '').trim();
  const originalById = new Map(originalTracks.map(track => [track.id, track]));
  const titleMap = new Map();

  try {
    const parsed = JSON.parse(cleaned);
    const tracks = Array.isArray(parsed.tracks) ? parsed.tracks : [];
    tracks.forEach(item => {
      const id = String(item?.id || '');
      const title = String(item?.title || '').trim();
      if (!id || !title || !originalById.has(id)) return;
      titleMap.set(id, title.slice(0, 120));
    });
  } catch (err) {
    return new Map();
  }

  return titleMap;
}

module.exports = { correctTrackTitles };
