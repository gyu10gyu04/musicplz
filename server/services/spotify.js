// services/spotify.js — Spotify Web API 연동
//
// Client Credentials flow를 사용합니다. 이 방식은 "사용자 로그인 없이" 서버가
// 자기 자신을 인증해서, 공개 카탈로그(곡/아티스트/앨범) 검색만 할 수 있는 토큰을 받습니다.
// (사용자의 개인 플레이리스트나 프로필 같은 건 이 방식으로는 못 가져옵니다 — 그건 우리한테
//  필요 없는 기능이라 문제 없습니다.)
//
// 토큰은 보통 1시간(3600초) 동안 유효해서, 매 검색마다 새로 발급받지 않고
// 메모리에 캐싱해서 만료되기 직전까지 재사용합니다.

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_SEARCH_URL = 'https://api.spotify.com/v1/search';

let cachedToken = null;
let tokenExpiresAt = 0; // epoch ms

async function getAccessToken() {
  const now = Date.now();

  // 캐싱된 토큰이 아직 유효하면(만료 60초 전까지) 그대로 재사용
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'SPOTIFY_CLIENT_ID 또는 SPOTIFY_CLIENT_SECRET 환경 변수가 설정되어 있지 않습니다. ' +
      '.env 파일에 Spotify Developer Dashboard에서 발급받은 값을 넣어주세요.'
    );
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Spotify 토큰 발급 실패 (status ${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000;
  return cachedToken;
}

/**
 * Spotify 카탈로그에서 트랙(곡)을 검색합니다.
 * @param {string} query - 검색어(키워드). 사용자의 원문 문장이 아니라,
 *                          AI가 해석한 키워드를 넣는 것을 권장합니다.
 * @param {number} limit  - 가져올 결과 수 (Spotify 정책상 최대 10).
 * @returns {Promise<Array>} 트랙 정보 배열 (제목, 아티스트, 앨범 커버, 길이 등)
 */
async function searchTracks(query, limit = 10) {
  if (!query || !query.trim()) return [];

  const token = await getAccessToken();
  const cappedLimit = Math.min(Math.max(limit, 1), 10); // Spotify 2026.02 정책: 최대 10

  const url = `${SPOTIFY_SEARCH_URL}?` + new URLSearchParams({
    q: query,
    type: 'track',
    limit: String(cappedLimit),
  });

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Spotify 검색 실패 (status ${res.status}): ${text}`);
  }

  const data = await res.json();
  const items = data?.tracks?.items || [];

  return items.map(track => ({
    id: track.id,
    title: track.name,
    artist: (track.artists || []).map(a => a.name).join(', '),
    album: track.album?.name || '',
    durationMs: track.duration_ms,
    // 앨범 커버: 여러 해상도 중 적당한 크기(보통 두 번째, 300px 안팎) 선택
    coverUrl: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || null,
    spotifyUrl: track.external_urls?.spotify || null,
    previewUrl: track.preview_url || null, // 30초 미리듣기 (제공 안 될 수도 있음)
  }));
}

module.exports = { searchTracks };
