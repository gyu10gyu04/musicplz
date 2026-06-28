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
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_SEARCH_URL = `${SPOTIFY_API_BASE}/search`;

// Client Credentials flow(사용자 로그인 없는 서버 인증)로 요청하면 Spotify는
// 사용자의 국가 정보를 알 수 없습니다. market 파라미터를 명시하지 않으면
// 일부 엔드포인트(특히 아티스트 앨범 목록 조회)가 콘텐츠를 "이용 불가"로 취급해
// 실제로는 앨범이 있는데도 빈 목록을 반환하는 문제가 있어, 항상 명시적으로 지정합니다.
const MARKET = 'KR';

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
    market: MARKET,
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
    artistId: track.artists?.[0]?.id || null, // 모달에서 "이 가수의 다른 앨범" 조회 시 사용
    album: track.album?.name || '',
    albumId: track.album?.id || null, // 모달에서 "이 앨범의 다른 트랙" 조회 시 사용
    durationMs: track.duration_ms,
    // 앨범 커버: 여러 해상도 중 적당한 크기(보통 두 번째, 300px 안팎) 선택
    coverUrl: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || null,
    spotifyUrl: track.external_urls?.spotify || null,
    previewUrl: track.preview_url || null, // 30초 미리듣기 (제공 안 될 수도 있음)
  }));
}

/**
 * 특정 앨범에 속한 트랙들을 가져옵니다.
 * 앨범 트랙 조회 엔드포인트는 트랙의 popularity(인기도)를 안 줘서,
 * "이 앨범의 대표곡"을 정하기 위해 트랙 ID들로 한 번 더 상세 정보를 조회합니다.
 *
 * @param {string} albumId
 * @param {number} offset - 페이지네이션 시작 위치 (더보기 버튼에서 사용)
 * @param {number} limit  - 한 번에 가져올 개수 (Spotify 정책상 최대 50)
 * @returns {Promise<{tracks: Array, total: number, hasMore: boolean, album: object}>}
 */
async function getAlbumTracks(albumId, offset = 0, limit = 20) {
  if (!albumId) throw new Error('albumId가 필요합니다.');

  const token = await getAccessToken();
  const parsedLimit = parseInt(limit, 10);
  const cappedLimit = isNaN(parsedLimit) ? 20 : Math.min(Math.max(parsedLimit, 1), 50);
  const parsedOffset = parseInt(offset, 10);
  const safeOffset = isNaN(parsedOffset) ? 0 : Math.max(parsedOffset, 0);

  // 1) 앨범 기본 정보(이름, 커버, 아티스트) 조회
  const albumRes = await fetch(`${SPOTIFY_API_BASE}/albums/${albumId}?market=${MARKET}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!albumRes.ok) {
    const text = await albumRes.text().catch(() => '');
    throw new Error(`Spotify 앨범 조회 실패 (status ${albumRes.status}): ${text}`);
  }
  const albumData = await albumRes.json();

  // 2) 해당 앨범의 트랙 목록 (페이지네이션)
  const tracksUrl = `${SPOTIFY_API_BASE}/albums/${albumId}/tracks?` + new URLSearchParams({
    offset: String(safeOffset),
    limit: String(cappedLimit),
    market: MARKET,
  });
  const tracksRes = await fetch(tracksUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!tracksRes.ok) {
    const text = await tracksRes.text().catch(() => '');
    throw new Error(`Spotify 앨범 트랙 조회 실패 (status ${tracksRes.status}): ${text}`);
  }
  const tracksData = await tracksRes.json();
  const items = tracksData.items || [];

  // 3) 트랙별 popularity를 얻기 위해 /tracks?ids=... 로 한 번에 조회 (최대 50개까지 가능)
  const popularityMap = await fetchTrackPopularities(items.map(t => t.id), token);

  const coverUrl = albumData.images?.[1]?.url || albumData.images?.[0]?.url || null;
  const albumName = albumData.name || '';

  const tracks = items.map(track => ({
    id: track.id,
    title: track.name,
    artist: (track.artists || []).map(a => a.name).join(', '),
    artistId: track.artists?.[0]?.id || null,
    album: albumName,
    albumId,
    durationMs: track.duration_ms,
    coverUrl,
    spotifyUrl: track.external_urls?.spotify || null,
    previewUrl: track.preview_url || null,
    popularity: popularityMap.get(track.id) ?? 0,
  }));

  return {
    tracks,
    total: tracksData.total ?? items.length,
    hasMore: Boolean(tracksData.next),
    album: {
      id: albumId,
      name: albumName,
      coverUrl,
      artist: (albumData.artists || []).map(a => a.name).join(', '),
      artistId: albumData.artists?.[0]?.id || null,
    },
  };
}

/**
 * 트랙 ID 목록으로 popularity 값을 한 번에 조회.
 * Spotify의 /tracks?ids= 엔드포인트는 한 번에 최대 50개까지 받을 수 있어
 * 앨범 트랙 개수(최대 50개로 캡되어 있음)와 항상 한 번의 호출로 충분합니다.
 */
async function fetchTrackPopularities(trackIds, token) {
  const map = new Map();
  const validIds = trackIds.filter(Boolean);
  if (validIds.length === 0) return map;

  const url = `${SPOTIFY_API_BASE}/tracks?` + new URLSearchParams({ ids: validIds.join(','), market: MARKET });
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return map; // 실패해도 popularity는 0으로 처리되도록 조용히 빈 맵 반환

  const data = await res.json();
  (data.tracks || []).forEach(t => {
    if (t && t.id) map.set(t.id, t.popularity ?? 0);
  });
  return map;
}

/**
 * 특정 아티스트가 발매한 다른 앨범들을 가져옵니다.
 * @param {string} artistId
 * @param {number} offset
 * @param {number} limit - 최대 50
 * @returns {Promise<{albums: Array, total: number, hasMore: boolean}>}
 */
async function getArtistAlbums(artistId, offset = 0, limit = 20) {
  if (!artistId) throw new Error('artistId가 필요합니다.');

  const token = await getAccessToken();
  const parsedLimit = parseInt(limit, 10);
  const cappedLimit = isNaN(parsedLimit) ? 20 : Math.min(Math.max(parsedLimit, 1), 50);
  const parsedOffset = parseInt(offset, 10);
  const safeOffset = isNaN(parsedOffset) ? 0 : Math.max(parsedOffset, 0);

  const url = `${SPOTIFY_API_BASE}/artists/${artistId}/albums?` + new URLSearchParams({
    offset: String(safeOffset),
    limit: String(cappedLimit),
    include_groups: 'album,single,compilation', // 정규 앨범+싱글+컴필레이션 (피처링은 제외해 결과를 깔끔하게)
    market: MARKET,
  });

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Spotify 아티스트 앨범 조회 실패 (status ${res.status}): ${text}`);
  }

  const data = await res.json();
  const items = data.items || [];

  // 같은 앨범이 지역별로 중복 등록된 경우가 있어, 앨범명 기준으로 1차 중복 제거
  const seenNames = new Set();
  const albums = [];
  for (const album of items) {
    const key = album.name.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    albums.push({
      id: album.id,
      name: album.name,
      coverUrl: album.images?.[1]?.url || album.images?.[0]?.url || null,
      releaseDate: album.release_date || null,
    });
  }

  return {
    albums,
    total: data.total ?? items.length,
    hasMore: Boolean(data.next),
  };
}

module.exports = { searchTracks, getAlbumTracks, getArtistAlbums };
