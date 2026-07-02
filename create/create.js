(() => {
  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     페이지 전환 웨이브 (main.js / login.js와 동일 사양 + bfcache 복원 보정)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  function easeInOutCubic(t) {
    return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
  }

  const waveEl   = document.getElementById('waveTransition');
  const wavePath = document.getElementById('wavePath');

  /* 이 페이지는 항상 "화면을 덮은 상태"로 시작해서 가라앉는 인트로를 재생한다.
     뒤로/앞으로가기로 bfcache에서 그대로 복원된 경우, 전환이 덮인 채로 멈춰 보일 수 있어
     떠날 때 덮인 상태였다면 다시 풀어주는 인트로를 재생해 복구한다. */
  let waveCovered = true;

  function setWave(p) {
    const e = easeInOutCubic(p);
    const topY    = 100 - e * 100;
    const waveAmp = 9 * Math.sin(e * Math.PI);
    const midY    = topY - waveAmp;
    wavePath.setAttribute('d', `M0,100 L0,${topY} C25,${midY} 75,${midY} 100,${topY} L100,100 Z`);
  }

  function playWaveIntro() {
    waveEl.style.pointerEvents = 'auto';
    setWave(1);
    waveCovered = true;
    let start = null;
    const DURATION = 520;
    function step(ts) {
      if (start === null) start = ts;
      const p = clamp((ts - start) / DURATION, 0, 1);
      setWave(1 - p);
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        waveEl.style.pointerEvents = 'none';
        waveCovered = false;
      }
    }
    requestAnimationFrame(step);
  }

  function playWaveExit(toUrl) {
    waveEl.style.pointerEvents = 'auto';
    waveCovered = true;
    let start = null;
    const DURATION = 600;
    function step(ts) {
      if (start === null) start = ts;
      const p = clamp((ts - start) / DURATION, 0, 1);
      setWave(p);
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        sessionStorage.setItem('mp-transition', '1');
        location.href = toUrl;
      }
    }
    requestAnimationFrame(step);
  }

  playWaveIntro();

  // 뒤로가기로 bfcache에서 복원되어 웨이브가 덮인 채로 멈춰 보이는 버그 방지
  window.addEventListener('pageshow', e => {
    if (e.persisted && waveCovered) {
      playWaveIntro();
    }
  });

  document.getElementById('logoHome').addEventListener('click', e => {
    e.preventDefault();
    playWaveExit(e.currentTarget.getAttribute('href'));
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     보조 함수 — Spotify 앨범 커버가 없는 경우의 대체(이니셜+그라디언트) 표시용
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const GRADIENTS = [
    'linear-gradient(135deg,#7c3aed,#a78bfa)',
    'linear-gradient(135deg,#f43f5e,#fb923c)',
    'linear-gradient(135deg,#0ea5e9,#22d3ee)',
    'linear-gradient(135deg,#10b981,#84cc16)',
    'linear-gradient(135deg,#f59e0b,#facc15)',
    'linear-gradient(135deg,#6366f1,#ec4899)',
    'linear-gradient(135deg,#14b8a6,#3b82f6)',
    'linear-gradient(135deg,#8b5cf6,#d946ef)',
  ];

  function initials(name) {
    const s = (name || '').trim();
    if (!s) return '?';
    if (/[가-힣]/.test(s)) return s[0];
    return s.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  let csrfTokenPromise = null;

  async function getCsrfToken() {
    if (!csrfTokenPromise) {
      csrfTokenPromise = fetch('/api/csrf-token', { credentials: 'same-origin' })
        .then(res => {
          if (!res.ok) throw new Error('보안 토큰을 불러오지 못했어요. 새로고침 후 다시 시도해주세요.');
          return res.json();
        })
        .then(data => data.csrfToken || '');
    }
    return csrfTokenPromise;
  }

  async function secureFetch(url, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return fetch(url, { credentials: 'same-origin', ...options });
    }
    const csrfToken = await getCsrfToken();
    return fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.headers || {}),
        'X-CSRF-Token': csrfToken,
      },
    });
  }

  function gradientFor(seed) {
    // 곡 id 문자열을 간단히 해시해서 항상 같은 그라디언트가 나오도록 함
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return GRADIENTS[hash % GRADIENTS.length];
  }

  function formatDuration(ms) {
    if (!ms) return '';
    const totalSec = Math.round(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     검색 UI 상태 관리
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const searchInput   = document.getElementById('searchInput');
  const searchClear   = document.getElementById('searchClear');
  const searchSubmit  = document.getElementById('searchSubmit');
  const aiChipRow      = document.getElementById('aiChipRow');
  const aiInterpretation = document.getElementById('aiInterpretation');
  const suggestRow     = document.getElementById('suggestRow');

  const emptyState    = document.getElementById('emptyState');
  const loadingState  = document.getElementById('loadingState');
  const resultsHeader = document.getElementById('resultsHeader');
  const resultsCount  = document.getElementById('resultsCount');
  const resultsGrid   = document.getElementById('resultsGrid');
  const resultsBackBtn = document.getElementById('resultsBackBtn');
  const resultsLoadMore = document.getElementById('resultsLoadMore');
  const loadMoreBtn    = document.getElementById('loadMoreBtn');

  function showOnly(el) {
    [emptyState, loadingState, resultsHeader, resultsGrid, resultsLoadMore].forEach(e => { e.hidden = true; });
    if (el === 'results') {
      resultsHeader.hidden = false;
      resultsGrid.hidden = false;
    } else if (el === 'loading') {
      loadingState.hidden = false;
    } else {
      emptyState.hidden = false;
    }
  }

  function renderTrackCard(track) {
    const card = document.createElement('div');
    card.className = 'track-card';
    card.dataset.id = track.id;
    if (selectedIds.has(track.id)) card.classList.add('is-selected');

    // Spotify가 앨범 커버 이미지를 줬으면 그걸 쓰고, 없으면 이니셜+그라디언트로 대체
    const coverInner = track.coverUrl
      ? `<img src="${escapeHtml(track.coverUrl)}" alt="" loading="lazy" draggable="false">`
      : escapeHtml(initials(track.artist));
    const coverStyle = track.coverUrl ? '' : `style="background:${gradientFor(track.id)}"`;

    card.innerHTML = `
      <div class="track-cover" ${coverStyle}>${coverInner}</div>
      <div class="track-info">
        <div class="track-title">${escapeHtml(track.title)}</div>
        <div class="track-artist">${escapeHtml(track.artist)}</div>
      </div>
      <span class="track-meta">${formatDuration(track.durationMs)}</span>
      <span class="track-check" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
      </span>
    `;
    attachLongPress(card, track);
    return card;
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     롱프레스(꾹 누르기) 감지
     - 일정 시간(LONG_PRESS_MS) 동안 누르고 있으면 상세 모달을 띄움
     - 그보다 짧게 떼면 일반 클릭으로 처리해 선택 토글
     - 마우스/터치 둘 다 지원
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const LONG_PRESS_MS = 480;
  const MOVE_CANCEL_PX = 10; // 누른 채로 이만큼 움직이면 스크롤 의도로 보고 취소
  const COVER_MOVE_CANCEL_PX = 24; // 모달 안 커버는 스크롤 영역이 아니므로, 손 떨림에 더 관대하게 둠

  function attachLongPress(card, track) {
    let timer = null;
    let startX = 0;
    let startY = 0;
    let triggered = false; // 이번 누름에서 롱프레스가 실제로 발동했는지

    function clearPress() {
      window.clearTimeout(timer);
      timer = null;
      card.classList.remove('is-pressing');
    }

    function startPress(x, y) {
      triggered = false;
      startX = x;
      startY = y;
      card.classList.add('is-pressing');
      timer = window.setTimeout(() => {
        triggered = true;
        card.classList.remove('is-pressing');
        openTrackModal(track);
      }, LONG_PRESS_MS);
    }

    function movePress(x, y) {
      if (!timer) return;
      const dx = Math.abs(x - startX);
      const dy = Math.abs(y - startY);
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clearPress();
    }

    function endPress() {
      const wasTriggered = triggered;
      clearPress();
      // 롱프레스가 발동되지 않은 짧은 클릭/탭이었다면 평소처럼 선택 토글
      if (!wasTriggered) toggleTrack(track);
    }

    // 마우스
    card.addEventListener('mousedown', e => startPress(e.clientX, e.clientY));
    card.addEventListener('mousemove', e => movePress(e.clientX, e.clientY));
    card.addEventListener('mouseup', endPress);
    card.addEventListener('mouseleave', clearPress);

    // 터치(모바일)
    // touchstart에서 preventDefault를 호출해, iOS/Android 브라우저의 기본
    // "이미지 길게 눌러서 저장/공유" 메뉴가 캐러셀 롱프레스보다 먼저 뜨는 것을 막는다.
    // (touchmove는 계속 passive로 둬서 스크롤 성능에는 영향이 없도록 유지)
    card.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0];
      startPress(t.clientX, t.clientY);
    }, { passive: false });
    card.addEventListener('touchmove', e => {
      const t = e.touches[0];
      movePress(t.clientX, t.clientY);
    }, { passive: true });
    card.addEventListener('touchend', endPress);
    card.addEventListener('touchcancel', clearPress);

    // 브라우저 기본 우클릭 메뉴/드래그 등이 롱프레스를 방해하지 않도록
    card.addEventListener('contextmenu', e => e.preventDefault());
  }

  // 검색 결과로 받은 트랙들을 id로 빠르게 찾기 위한 캐시.
  // (선택된 곡 정보를 트레이에 표시할 때, 검색 결과가 바뀌어도 이전에 담은 곡 정보를
  //  여전히 찾을 수 있도록, 한 번 본 트랙은 계속 이 맵에 누적해서 보관한다.)
  const knownTracks = new Map();

  /* 현재 결과 영역이 "검색 결과"를 보여주는 중인지, "특정 앨범의 트랙들"을 보여주는 중인지.
     앨범 모드에서 "검색으로 돌아가기"를 눌렀을 때 직전 검색 상태를 그대로 복원하기 위해
     마지막 검색의 결과/문구/검색어를 기억해둔다. */
  let viewMode = 'search'; // 'search' | 'album'
  let lastSearchSnapshot = null; // { query, interpretation, tracks }
  let currentAlbum = null; // 앨범 모드일 때: { id, name, coverUrl, artist, artistId }
  let currentAlbumOffset = 0;
  let currentAlbumHasMore = false;

  let currentAbortController = null;

  async function runSearch(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      showOnly('empty');
      aiChipRow.hidden = true;
      suggestRow.style.display = '';
      return;
    }

    viewMode = 'search';
    currentAlbum = null;
    resultsBackBtn.hidden = true;

    suggestRow.style.display = 'none';
    showOnly('loading');
    aiChipRow.hidden = true;

    // 이전 검색이 아직 응답을 안 받았다면 취소 (사용자가 빠르게 다시 검색한 경우 대비)
    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();

    try {
      const res = await secureFetch('/api/music/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ query: trimmed }),
        signal: currentAbortController.signal,
      });

      let data = {};
      try { data = await res.json(); } catch (_) { /* 빈 응답일 수 있음 */ }

      if (!res.ok) {
        throw new Error(data.error || '검색 중 문제가 발생했어요.');
      }

      const tracks = Array.isArray(data.tracks) ? data.tracks : [];
      tracks.forEach(t => knownTracks.set(t.id, t));

      const interpretationText = data.interpretation || `"${trimmed}"로 검색했어요`;
      aiInterpretation.textContent = interpretationText;
      aiChipRow.hidden = false;

      // 앨범 모드에서 "검색으로 돌아가기"를 누르면 그대로 복원할 수 있도록 스냅샷 저장
      lastSearchSnapshot = { query: trimmed, interpretation: interpretationText, tracks };

      resultsGrid.innerHTML = '';
      resultsLoadMore.hidden = true;
      if (tracks.length === 0) {
        resultsCount.textContent = '결과가 없어요. 다른 표현으로 찾아볼까요?';
        showOnly('results');
        return;
      }

      resultsCount.textContent = `${tracks.length}개의 결과`;
      tracks.forEach(track => resultsGrid.appendChild(renderTrackCard(track)));
      showOnly('results');
    } catch (err) {
      if (err.name === 'AbortError') return; // 새 검색으로 대체된 경우 — 조용히 무시
      aiChipRow.hidden = true;
      resultsGrid.innerHTML = '';
      resultsCount.textContent = err.message || '검색 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.';
      showOnly('results');
    }
  }

  searchInput.addEventListener('input', () => {
    searchClear.hidden = !searchInput.value;
  });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') runSearch(searchInput.value);
  });
  searchSubmit.addEventListener('click', () => runSearch(searchInput.value));
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.hidden = true;
    searchInput.focus();
    showOnly('empty');
    aiChipRow.hidden = true;
    suggestRow.style.display = '';
  });

  suggestRow.querySelectorAll('.suggest-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const q = pill.dataset.q;
      searchInput.value = q;
      searchClear.hidden = false;
      runSearch(q);
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     앨범 모드 — 앨범 커버를 클릭하면 그 앨범의 트랙들을 결과 영역에 표시
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  async function loadAlbumTracks(albumId, { append = false } = {}) {
    const offset = append ? currentAlbumOffset : 0;

    if (!append) {
      viewMode = 'album';
      showOnly('loading');
      aiChipRow.hidden = true;
      suggestRow.style.display = 'none';
      resultsBackBtn.hidden = false;
    } else {
      loadMoreBtn.classList.add('is-loading');
    }

    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();

    try {
      const res = await fetch(`/api/music/album/${encodeURIComponent(albumId)}?offset=${offset}`, {
        credentials: 'same-origin',
        signal: currentAbortController.signal,
      });

      let data = {};
      try { data = await res.json(); } catch (_) { /* noop */ }

      if (!res.ok) {
        throw new Error(data.error || '앨범 정보를 불러오지 못했어요.');
      }

      const tracks = Array.isArray(data.tracks) ? data.tracks : [];
      tracks.forEach(t => knownTracks.set(t.id, t));

      currentAlbum = data.album || currentAlbum;
      currentAlbumOffset = data.nextOffset ?? offset + tracks.length;
      currentAlbumHasMore = Boolean(data.hasMore);

      if (!append) {
        resultsGrid.innerHTML = '';
        aiInterpretation.textContent = `${currentAlbum?.name || '앨범'} 트랙을 순서대로 보여드려요`;
        aiChipRow.hidden = false;
      }

      tracks.forEach(track => resultsGrid.appendChild(renderTrackCard(track)));
      resultsCount.textContent = `${currentAlbum?.name || '앨범'} · ${data.total ?? tracks.length}곡`;
      showOnly('results'); // 주의: showOnly가 resultsLoadMore.hidden을 true로 초기화하므로, 아래 줄보다 먼저 호출해야 함
      resultsLoadMore.hidden = !currentAlbumHasMore;
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (!append) {
        resultsGrid.innerHTML = '';
        resultsCount.textContent = err.message || '앨범 정보를 불러오지 못했어요.';
        showOnly('results');
      }
    } finally {
      loadMoreBtn.classList.remove('is-loading');
    }
  }

  loadMoreBtn.addEventListener('click', () => {
    if (!currentAlbum || !currentAlbumHasMore) return;
    loadAlbumTracks(currentAlbum.id, { append: true });
  });

  resultsBackBtn.addEventListener('click', () => {
    if (!lastSearchSnapshot) {
      // 직전 검색 기록이 없으면 그냥 빈 상태로
      viewMode = 'search';
      currentAlbum = null;
      resultsBackBtn.hidden = true;
      searchInput.value = '';
      showOnly('empty');
      aiChipRow.hidden = true;
      suggestRow.style.display = '';
      return;
    }

    viewMode = 'search';
    currentAlbum = null;
    resultsBackBtn.hidden = true;
    resultsLoadMore.hidden = true;

    searchInput.value = lastSearchSnapshot.query;
    searchClear.hidden = false;
    aiInterpretation.textContent = lastSearchSnapshot.interpretation;
    aiChipRow.hidden = false;
    suggestRow.style.display = 'none';

    resultsGrid.innerHTML = '';
    const tracks = lastSearchSnapshot.tracks;
    if (tracks.length === 0) {
      resultsCount.textContent = '결과가 없어요. 다른 표현으로 찾아볼까요?';
    } else {
      resultsCount.textContent = `${tracks.length}개의 결과`;
      tracks.forEach(track => resultsGrid.appendChild(renderTrackCard(track)));
    }
    showOnly('results');
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     선택(담기) 상태 + 하단 트레이
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const selectedIds   = new Set();
  const selectedOrder = []; // 담은 순서를 유지 (트레이 표시용)
  const POINTER_STACK_KEY = 'mp-share-pointer-tracks';

  const tray         = document.getElementById('tray');
  const trayCount    = document.getElementById('trayCount');
  const trayStrip    = document.getElementById('trayStrip');
  const trayClear    = document.getElementById('trayClear');
  const trayCreateBtn = document.getElementById('trayCreateBtn');

  function trackById(id) {
    return knownTracks.get(id);
  }

  function normalizeImportedTrack(track) {
    return {
      id: String(track?.id || '').trim(),
      title: String(track?.title || '').trim(),
      artist: String(track?.artist || '').trim(),
      album: String(track?.album || '').trim(),
      coverUrl: String(track?.coverUrl || '').trim(),
      durationMs: Number(track?.durationMs) || null,
    };
  }

  function importPointerStackTracks() {
    let imported = [];
    try {
      const parsed = JSON.parse(sessionStorage.getItem(POINTER_STACK_KEY) || '[]');
      imported = Array.isArray(parsed) ? parsed.map(normalizeImportedTrack) : [];
    } catch {
      imported = [];
    }

    imported.forEach(track => {
      if (!track.id || !track.title || !track.artist || selectedIds.has(track.id)) return;
      knownTracks.set(track.id, track);
      selectedIds.add(track.id);
      selectedOrder.push(track.id);
    });

    if (selectedOrder.length > 0) renderTray();
  }

  function toggleTrack(track) {
    const card = resultsGrid.querySelector(`[data-id="${track.id}"]`);
    if (selectedIds.has(track.id)) {
      selectedIds.delete(track.id);
      const idx = selectedOrder.indexOf(track.id);
      if (idx > -1) selectedOrder.splice(idx, 1);
      if (card) card.classList.remove('is-selected');
    } else {
      selectedIds.add(track.id);
      selectedOrder.push(track.id);
      if (card) card.classList.add('is-selected');
    }
    renderTray();
    if (!selectedTracksModalBackdrop.hidden) renderSelectedTracksList();
    if (!playlistComposerBackdrop.hidden) {
      renderPlaylistComposerList();
      if (selectedOrder.length === 0) closePlaylistComposer();
    }
  }

  function renderTray() {
    const count = selectedOrder.length;
    tray.classList.toggle('is-visible', count > 0);
    trayCount.textContent = `${count}곡 담김`;
    trayCreateBtn.disabled = count === 0;

    trayStrip.innerHTML = '';
    const MAX_CHIPS = 4;
    selectedOrder.slice(0, MAX_CHIPS).forEach(id => {
      const track = trackById(id);
      if (!track) return;
      const chip = document.createElement('div');
      chip.className = 'tray-chip';
      const coverInner = track.coverUrl
        ? `<img src="${escapeHtml(track.coverUrl)}" alt="" loading="lazy" draggable="false">`
        : escapeHtml(initials(track.artist));
      const coverStyle = track.coverUrl ? '' : `style="background:${gradientFor(track.id)}"`;
      chip.innerHTML = `
        <span class="tray-chip-cover" ${coverStyle}>${coverInner}</span>
        <span class="tray-chip-label">${escapeHtml(track.title)}</span>
      `;
      trayStrip.appendChild(chip);
    });
    if (count > 0) {
      const more = document.createElement('div');
      more.className = 'tray-chip-more';
      more.style.cursor = 'pointer';
      more.textContent = count > MAX_CHIPS ? `+${count - MAX_CHIPS}` : '...';
      more.addEventListener('click', () => {
        openSelectedTracksModal();
      });
      trayStrip.appendChild(more);
    }
  }

  trayClear.addEventListener('click', () => {
    selectedIds.clear();
    selectedOrder.length = 0;
    resultsGrid.querySelectorAll('.track-card.is-selected').forEach(c => c.classList.remove('is-selected'));
    renderTray();
    closeSelectedTracksModal();
  });

  trayCreateBtn.addEventListener('click', () => {
    if (selectedOrder.length === 0) return;
    openPlaylistComposer();
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     플레이리스트 만들기 모달
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const playlistComposerBackdrop = document.getElementById('playlistComposerBackdrop');
  const playlistComposerClose = document.getElementById('playlistComposerClose');
  const playlistCoverInput = document.getElementById('playlistCoverInput');
  const playlistCoverPicker = document.getElementById('playlistCoverPicker');
  const playlistCoverPreview = document.getElementById('playlistCoverPreview');
  const playlistCoverEmpty = document.getElementById('playlistCoverEmpty');
  const playlistCoverMenu = document.getElementById('playlistCoverMenu');
  const playlistPhotoPickBtn = document.getElementById('playlistPhotoPickBtn');
  const playlistAlbumPickBtn = document.getElementById('playlistAlbumPickBtn');
  const playlistAlbumCoverPanel = document.getElementById('playlistAlbumCoverPanel');
  const playlistAlbumCoverGrid = document.getElementById('playlistAlbumCoverGrid');
  const playlistAlbumCoverEmpty = document.getElementById('playlistAlbumCoverEmpty');
  const playlistTitleInput = document.getElementById('playlistTitleInput');
  const playlistTitleError = document.getElementById('playlistTitleError');
  const playlistComposerList = document.getElementById('playlistComposerList');
  const playlistSaveBtn = document.getElementById('playlistSaveBtn');

  let playlistCoverObjectUrl = null;
  let playlistCoverValue = '';
  let activeSortDrag = null;

  function attachSortablePointerDrag(item, index, { listEl, itemSelector, renderList }) {
    item.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('button')) return;

      window.clearTimeout(activeSortDrag?.timer);
      item.classList.add('is-pressing');
      activeSortDrag = {
        item,
        index,
        targetIdx: index,
        listEl,
        itemSelector,
        renderList,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        timer: window.setTimeout(() => {
          if (!activeSortDrag || activeSortDrag.item !== item) return;
          const children = [...listEl.querySelectorAll(itemSelector)];
          const containerRect = listEl.getBoundingClientRect();
          activeSortDrag.active = true;
          activeSortDrag.children = children;
          activeSortDrag.containerTop = containerRect.top;
          activeSortDrag.startScrollTop = listEl.scrollTop;
          activeSortDrag.positions = children.map(child => {
            const rect = child.getBoundingClientRect();
            const top = rect.top - containerRect.top + listEl.scrollTop;
            return {
              top,
              mid: top + rect.height / 2,
              height: rect.height,
            };
          });
          activeSortDrag.shiftY = (children[index]?.offsetHeight || 70) + 12;
          activeSortDrag.lastTargetIdx = index;
          item.classList.remove('is-pressing');
          item.classList.add('is-dragging');
          listEl.classList.add('is-sorting');
          item.setPointerCapture?.(e.pointerId);
        }, 180),
      };
    });

    item.addEventListener('pointermove', e => {
      if (!activeSortDrag || activeSortDrag.item !== item) return;

      const dx = e.clientX - activeSortDrag.startX;
      const dy = e.clientY - activeSortDrag.startY;

      if (!activeSortDrag.active) {
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          window.clearTimeout(activeSortDrag.timer);
          item.classList.remove('is-pressing');
          activeSortDrag = null;
        }
        return;
      }

      e.preventDefault();
      const children = activeSortDrag.children;
      const pointerY = e.clientY - activeSortDrag.containerTop + listEl.scrollTop;

      let nextTargetIdx = activeSortDrag.index;
      let minDist = Infinity;
      activeSortDrag.positions.forEach((pos, i) => {
        const dist = Math.abs(pointerY - pos.mid);
        if (dist < minDist) {
          minDist = dist;
          nextTargetIdx = i;
        }
      });

      activeSortDrag.targetIdx = nextTargetIdx;
      const shiftY = activeSortDrag.shiftY || ((children[0]?.offsetHeight || 70) + 12);

      item.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.02)`;

      if (activeSortDrag.lastTargetIdx === nextTargetIdx) return;
      activeSortDrag.lastTargetIdx = nextTargetIdx;

      children.forEach((child, i) => {
        if (child === item) return;
        child.style.transform = '';

        if (activeSortDrag.index < activeSortDrag.targetIdx && i > activeSortDrag.index && i <= activeSortDrag.targetIdx) {
          child.style.transform = `translateY(-${shiftY}px)`;
        } else if (activeSortDrag.index > activeSortDrag.targetIdx && i >= activeSortDrag.targetIdx && i < activeSortDrag.index) {
          child.style.transform = `translateY(${shiftY}px)`;
        }
      });
    });

    function endSortDrag(e) {
      if (!activeSortDrag || activeSortDrag.item !== item) return;
      const drag = activeSortDrag;
      item.releasePointerCapture?.(e.pointerId);
      window.clearTimeout(drag.timer);
      item.classList.remove('is-pressing', 'is-dragging');
      drag.listEl.classList.remove('is-sorting');
      [...drag.listEl.querySelectorAll(drag.itemSelector)].forEach(child => { child.style.transform = ''; });

      if (drag.active && drag.targetIdx !== drag.index) {
        const [removed] = selectedOrder.splice(drag.index, 1);
        selectedOrder.splice(drag.targetIdx, 0, removed);
        drag.renderList();
        renderTray();
        if (!selectedTracksModalBackdrop.hidden && drag.listEl !== selectedTracksModalList) renderSelectedTracksList();
        if (!playlistComposerBackdrop.hidden && drag.listEl !== playlistComposerList) renderPlaylistComposerList();
      }

      activeSortDrag = null;
    }

    item.addEventListener('pointerup', endSortDrag);
    item.addEventListener('pointercancel', endSortDrag);
    item.addEventListener('contextmenu', e => e.preventDefault());
  }

  function openPlaylistComposer() {
    playlistTitleError.textContent = '';
    renderPlaylistComposerList();
    renderPlaylistAlbumCoverChoices();
    playlistComposerBackdrop.hidden = false;
    requestAnimationFrame(() => playlistComposerBackdrop.classList.add('is-open'));
  }

  function closePlaylistComposer() {
    playlistComposerBackdrop.classList.remove('is-open');
    playlistCoverMenu.hidden = true;
    playlistAlbumCoverPanel.hidden = true;
    setTimeout(() => {
      if (!playlistComposerBackdrop.classList.contains('is-open')) {
        playlistComposerBackdrop.hidden = true;
      }
    }, 220);
  }

  function setPlaylistCover(url, value = url) {
    if (playlistCoverObjectUrl) {
      URL.revokeObjectURL(playlistCoverObjectUrl);
      playlistCoverObjectUrl = null;
    }
    playlistCoverValue = value;
    playlistCoverPreview.src = url;
    playlistCoverPreview.hidden = false;
    playlistCoverEmpty.hidden = true;
  }

  function compressImageFile(file, { maxSize = 640, quality = 0.72 } = {}) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('커버 이미지를 읽지 못했어요. 다른 사진을 선택해주세요.'));
      };

      img.src = objectUrl;
    });
  }

  function playlistAlbumCoverChoices() {
    const seen = new Set();
    const choices = [];

    selectedOrder.forEach(id => {
      const track = trackById(id);
      if (!track?.coverUrl) return;
      const key = track.albumId || track.coverUrl;
      if (seen.has(key)) return;
      seen.add(key);
      choices.push({
        coverUrl: track.coverUrl,
        album: track.album || '앨범',
        artist: track.primaryArtist || track.artist || '',
      });
    });

    return choices;
  }

  function selectedTracksForCoverSearch() {
    return selectedOrder
      .map(id => trackById(id))
      .filter(Boolean)
      .map(track => ({
        title: track.title,
        artist: track.artist,
        primaryArtist: track.primaryArtist,
        album: track.album,
      }));
  }

  async function fetchPlaylistAlbumCoverChoices() {
    const res = await secureFetch('/api/music/playlist-cover-candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ tracks: selectedTracksForCoverSearch() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '앨범 커버 후보를 불러오지 못했어요.');
    return Array.isArray(data.covers) ? data.covers : [];
  }

  function renderPlaylistAlbumCoverChoices(choices = playlistAlbumCoverChoices()) {
    playlistAlbumCoverGrid.innerHTML = '';
    playlistAlbumCoverEmpty.hidden = choices.length > 0;

    choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'playlist-album-cover-option';
      btn.innerHTML = `
        <img src="${escapeHtml(choice.coverUrl)}" alt="" loading="lazy" draggable="false">
        <span>${escapeHtml(choice.album)}</span>
      `;
      btn.addEventListener('click', () => {
        setPlaylistCover(choice.coverUrl);
        playlistAlbumCoverPanel.hidden = true;
      });
      playlistAlbumCoverGrid.appendChild(btn);
    });
  }

  function renderPlaylistComposerList() {
    playlistComposerList.innerHTML = '';

    selectedOrder.forEach((id, i) => {
      const track = trackById(id);
      if (!track) return;

      const item = document.createElement('div');
      item.className = 'composer-track-item';
      item.draggable = false;

      const coverInner = track.coverUrl
        ? `<img src="${escapeHtml(track.coverUrl)}" alt="" loading="lazy" draggable="false">`
        : escapeHtml(initials(track.artist));
      const coverStyle = track.coverUrl ? '' : `style="background:${gradientFor(track.id)}"`;

      item.innerHTML = `
        <div class="composer-track-cover" ${coverStyle}>${coverInner}</div>
        <div class="composer-track-info">
          <div class="composer-track-title">${escapeHtml(track.title)}</div>
          <div class="composer-track-artist">${escapeHtml(track.artist)}</div>
        </div>
        <button type="button" class="composer-track-remove" aria-label="삭제">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;

      attachSortablePointerDrag(item, i, {
        listEl: playlistComposerList,
        itemSelector: '.composer-track-item',
        renderList: renderPlaylistComposerList,
      });

      item.querySelector('.composer-track-remove').addEventListener('click', e => {
        e.stopPropagation();
        toggleTrack(track);
        renderPlaylistComposerList();
        if (selectedOrder.length === 0) closePlaylistComposer();
      });

      playlistComposerList.appendChild(item);
    });
  }

  playlistCoverInput.addEventListener('change', async () => {
    const file = playlistCoverInput.files?.[0];
    if (!file) return;
    if (playlistCoverObjectUrl) URL.revokeObjectURL(playlistCoverObjectUrl);

    try {
      const dataUrl = await compressImageFile(file);
      if (dataUrl.length > 330_000) {
        playlistTitleError.textContent = '커버 이미지가 너무 큽니다. 더 작은 사진을 선택해주세요.';
        playlistCoverObjectUrl = null;
        return;
      }
      playlistCoverValue = dataUrl;
      playlistCoverPreview.src = dataUrl;
      playlistCoverPreview.hidden = false;
      playlistCoverEmpty.hidden = true;
      playlistCoverMenu.hidden = true;
      playlistAlbumCoverPanel.hidden = true;
      playlistTitleError.textContent = '';
    } catch (err) {
      playlistTitleError.textContent = err.message;
    }
  });

  playlistCoverPicker.addEventListener('click', e => {
    e.preventDefault();
    playlistCoverMenu.hidden = !playlistCoverMenu.hidden;
    if (!playlistCoverMenu.hidden) playlistAlbumCoverPanel.hidden = true;
  });

  playlistPhotoPickBtn.addEventListener('click', () => {
    playlistCoverMenu.hidden = true;
    playlistAlbumCoverPanel.hidden = true;
    playlistCoverInput.click();
  });

  playlistAlbumPickBtn.addEventListener('click', async () => {
    playlistCoverMenu.hidden = true;
    playlistAlbumCoverPanel.hidden = false;
    playlistAlbumCoverGrid.innerHTML = '';
    playlistAlbumCoverEmpty.hidden = false;
    playlistAlbumCoverEmpty.textContent = '앨범 커버를 불러오는 중...';

    try {
      const choices = await fetchPlaylistAlbumCoverChoices();
      renderPlaylistAlbumCoverChoices(choices.length ? choices : playlistAlbumCoverChoices());
    } catch (err) {
      console.warn('[앨범 커버 후보 로드 실패]', err);
      renderPlaylistAlbumCoverChoices(playlistAlbumCoverChoices());
    }
  });

  playlistSaveBtn.addEventListener('click', async () => {
    const title = playlistTitleInput.value.trim();
    if (!title) {
      playlistTitleError.textContent = '제목을 입력해주세요.';
      playlistTitleInput.focus();
      return;
    }
    if (!playlistCoverValue) {
      playlistTitleError.textContent = '대표 커버를 선택해주세요.';
      return;
    }
    playlistTitleError.textContent = '';

    const tracks = selectedOrder.map(id => trackById(id)).filter(Boolean).map(track => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      coverUrl: track.coverUrl,
      durationMs: track.durationMs,
    }));

    playlistSaveBtn.disabled = true;
    playlistSaveBtn.textContent = '저장 중...';

    try {
      const tokenRes = await secureFetch('/api/playlists/create-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({}),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenData.createToken) {
        throw new Error(tokenData.error || '플레이리스트 생성 권한을 확인하지 못했어요.');
      }

      const res = await secureFetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ title, coverUrl: playlistCoverValue, tracks, createToken: tokenData.createToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '플레이리스트를 저장하지 못했어요.');
      playWaveExit(`/playlist-share/playlist-share.html?id=${encodeURIComponent(data.playlist.id)}`);
    } catch (err) {
      playlistTitleError.textContent = err.message;
      playlistSaveBtn.disabled = false;
      playlistSaveBtn.textContent = '완료';
    }
  });

  playlistComposerClose.addEventListener('click', closePlaylistComposer);
  playlistComposerBackdrop.addEventListener('click', e => {
    if (e.target === playlistComposerBackdrop) closePlaylistComposer();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !playlistComposerBackdrop.hidden) closePlaylistComposer();
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     트랙 상세 모달 — 가수 이름, 앨범 커버, 앨범 이름을 보여줌
     + 커버를 클릭하면 그 앨범의 트랙들을 검색 결과 영역에 표시
     + 커버를 꾹 누르면 같은 가수의 다른 앨범들이 좌우로 흐릿하게 펼쳐지는 캐러셀 표시
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const trackModalBackdrop = document.getElementById('trackModalBackdrop');
  const trackModal         = document.getElementById('trackModal');
  const trackModalClose    = document.getElementById('trackModalClose');
  const coverCarouselTrack = document.getElementById('coverCarouselTrack');
  const carouselHint       = document.getElementById('carouselHint');
  const modalTrackTitle    = document.getElementById('modalTrackTitle');
  const modalTrackArtist   = document.getElementById('modalTrackArtist');
  const modalTrackAlbum    = document.getElementById('modalTrackAlbum');

  let modalCurrentTrack      = null;
  let modalCurrentArtistName = '';
  let modalArtistAlbums      = null;   // 서버에서 받아온 앨범 목록 캐시
  let modalCarouselAlbums    = [];     // 실제 캐러셀에 쓰이는 배열 (현재 앨범 포함)
  let modalCarouselExpanded  = false;
  let ignoreCoverInputUntil  = 0;

  /* ── 담은 곡 목록 모달 관련 선택자 및 제어 함수 ── */
  const selectedTracksModalBackdrop = document.getElementById('selectedTracksModalBackdrop');
  const selectedTracksModal         = document.getElementById('selectedTracksModal');
  const selectedTracksModalClose    = document.getElementById('selectedTracksModalClose');
  const selectedTracksModalList     = document.getElementById('selectedTracksModalList');

  let selectedModalDrag = null;
  let selectedModalX = 0;
  let selectedModalY = 0;

  function applySelectedModalPosition() {
    selectedTracksModal.style.setProperty('--modal-x', `${selectedModalX}px`);
    selectedTracksModal.style.setProperty('--modal-y', `${selectedModalY}px`);
  }

  function openSelectedTracksModal() {
    renderSelectedTracksList();
    selectedTracksModalBackdrop.hidden = false;
    requestAnimationFrame(() => {
      selectedTracksModalBackdrop.classList.add('is-open');
    });
  }

  function closeSelectedTracksModal() {
    selectedTracksModalBackdrop.classList.remove('is-open');
    selectedTracksModalBackdrop.classList.remove('is-card-dragging');
    selectedTracksModal.classList.remove('is-card-dragging', 'is-pressing-card');
    clearSelectedModalDrag();
    setTimeout(() => {
      if (!selectedTracksModalBackdrop.classList.contains('is-open')) {
        selectedTracksModalBackdrop.hidden = true;
      }
    }, 250);
  }

  function clearSelectedModalDrag() {
    if (!selectedModalDrag) return;
    window.clearTimeout(selectedModalDrag.timer);
    selectedTracksModal.classList.remove('is-pressing-card');
    selectedModalDrag = null;
  }

  function attachSelectedModalDrag() {
    selectedTracksModal.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('button')) return;
      if (e.target.closest('.selected-track-item')) return;

      clearSelectedModalDrag();
      selectedTracksModal.classList.add('is-pressing-card');
      selectedModalDrag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        baseX: selectedModalX,
        baseY: selectedModalY,
        active: false,
        timer: window.setTimeout(() => {
          if (!selectedModalDrag) return;
          selectedModalDrag.active = true;
          selectedTracksModal.classList.remove('is-pressing-card');
          selectedTracksModal.classList.add('is-card-dragging');
          selectedTracksModalBackdrop.classList.add('is-card-dragging');
          selectedTracksModal.setPointerCapture?.(e.pointerId);
        }, 260),
      };
    });

    selectedTracksModal.addEventListener('pointermove', e => {
      if (!selectedModalDrag) return;

      const dx = e.clientX - selectedModalDrag.startX;
      const dy = e.clientY - selectedModalDrag.startY;

      if (!selectedModalDrag.active) {
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearSelectedModalDrag();
        return;
      }

      e.preventDefault();
      selectedModalX = selectedModalDrag.baseX + dx;
      selectedModalY = selectedModalDrag.baseY + dy;
      applySelectedModalPosition();
    });

    function endDrag(e) {
      if (!selectedModalDrag) return;
      selectedTracksModal.releasePointerCapture?.(e.pointerId);
      clearSelectedModalDrag();
      selectedTracksModal.classList.remove('is-card-dragging');
    }

    selectedTracksModal.addEventListener('pointerup', endDrag);
    selectedTracksModal.addEventListener('pointercancel', endDrag);
    selectedTracksModal.addEventListener('contextmenu', e => e.preventDefault());
  }

  function renderSelectedTracksList() {
    selectedTracksModalList.innerHTML = '';
    if (selectedOrder.length === 0) {
      selectedTracksModalList.innerHTML = '<div style="text-align:center;color:rgba(0,0,0,0.4);padding:40px 0;">담은 곡이 없습니다.</div>';
      return;
    }

    selectedOrder.forEach((id, i) => {
      const track = trackById(id);
      if (!track) return;

      const item = document.createElement('div');
      item.className = 'selected-track-item';
      item.draggable = false;
      item.dataset.index = i;

      const coverInner = track.coverUrl
        ? `<img src="${escapeHtml(track.coverUrl)}" alt="" loading="lazy" draggable="false">`
        : escapeHtml(initials(track.artist));
      const coverStyle = track.coverUrl ? '' : `style="background:${gradientFor(track.id)}"`;

      item.innerHTML = `
        <div class="selected-track-cover" ${coverStyle}>${coverInner}</div>
        <div class="selected-track-info">
          <div class="selected-track-title">${escapeHtml(track.title)}</div>
          <div class="selected-track-artist">${escapeHtml(track.artist)}</div>
        </div>
        <button type="button" class="selected-track-remove" aria-label="삭제">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;

      attachSortablePointerDrag(item, i, {
        listEl: selectedTracksModalList,
        itemSelector: '.selected-track-item',
        renderList: renderSelectedTracksList,
      });

      item.querySelector('.selected-track-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTrack(track);
        renderSelectedTracksList();
      });

      selectedTracksModalList.appendChild(item);
    });
  }

  selectedTracksModalClose.addEventListener('click', closeSelectedTracksModal);
  selectedTracksModalBackdrop.addEventListener('click', (e) => {
    if (e.target === selectedTracksModalBackdrop) closeSelectedTracksModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !selectedTracksModalBackdrop.hidden) closeSelectedTracksModal();
  });
  attachSelectedModalDrag();

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     커버 HTML 헬퍼
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  function buildCoverCellHtml(coverUrl, label) {
    if (coverUrl) return `<img src="${escapeHtml(coverUrl)}" alt="" loading="lazy" draggable="false">`;
    return escapeHtml(initials(label));
  }

  function updateModalText({ title, artist, album }) {
    [modalTrackTitle, modalTrackArtist, modalTrackAlbum].forEach(el => el.style.opacity = '0');
    window.setTimeout(() => {
      modalTrackTitle.textContent  = title;
      modalTrackArtist.textContent = artist;
      modalTrackAlbum.textContent  = album || '정보 없음';
      [modalTrackTitle, modalTrackArtist, modalTrackAlbum].forEach(el => el.style.opacity = '1');
    }, 80);
  }

  function renderModalCover(coverUrl, artistNameForFallback) {
    coverCarouselTrack.innerHTML = '';
    coverCarouselTrack.classList.remove('is-expanded');
    coverCarouselTrack.classList.add('is-single');
    modalCarouselExpanded = false;
    carouselHint.hidden = true;

    const item = document.createElement('div');
    item.className = 'carousel-cover-item ci-single';
    item.innerHTML = buildCoverCellHtml(coverUrl, artistNameForFallback);
    if (!coverUrl) item.style.background = gradientFor(artistNameForFallback || 'x');
    coverCarouselTrack.appendChild(item);
    attachCoverInteractions(item, { isCurrent: true });
  }

  function openTrackModal(track) {
    ignoreCoverInputUntil = Date.now() + 350;
    modalCurrentTrack      = track;
    modalCurrentArtistName = track.artist;
    modalArtistAlbums      = null;
    modalCarouselAlbums    = [];

    modalTrackTitle.textContent  = track.title;
    modalTrackArtist.textContent = track.artist;
    modalTrackAlbum.textContent  = track.album || '정보 없음';
    [modalTrackTitle, modalTrackArtist, modalTrackAlbum].forEach(el => el.style.opacity = '1');

    renderModalCover(track.coverUrl, track.artist);
    trackModal.classList.remove('is-carousel-open');
    trackModalBackdrop.hidden = false;
    requestAnimationFrame(() => trackModalBackdrop.classList.add('is-open'));
  }

  function closeTrackModal() {
    trackModalBackdrop.classList.remove('is-open');
    trackModal.classList.remove('is-carousel-open');
    window.setTimeout(() => {
      trackModalBackdrop.hidden = true;
      destroyCarousel();
    }, 200);
  }

  trackModalClose.addEventListener('click', closeTrackModal);
  trackModalBackdrop.addEventListener('click', e => {
    if (e.target === trackModalBackdrop) closeTrackModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !trackModalBackdrop.hidden) closeTrackModal();
  });

  let noAlbumsHintTimer = null;
  function showNoOtherAlbumsHint() {
    window.clearTimeout(noAlbumsHintTimer);
    carouselHint.textContent = '이 가수의 다른 앨범은 아직 없어요';
    carouselHint.hidden = false;
    carouselHint.classList.add('is-notice');
    noAlbumsHintTimer = window.setTimeout(() => {
      carouselHint.hidden = true;
      carouselHint.classList.remove('is-notice');
    }, 1800);
  }

  async function fetchArtistAlbumsIfNeeded() {
    if (modalArtistAlbums) return modalArtistAlbums;
    if (!modalCurrentTrack?.artistId) return [];
    try {
      const params = new URLSearchParams();
      const name = modalCurrentTrack.primaryArtist || modalCurrentArtistName.split(',')[0].trim();
      if (name) params.set('artistName', name);
      const res  = await fetch(`/api/music/artist/${encodeURIComponent(modalCurrentTrack.artistId)}/albums?${params}`, { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '오류');
      modalArtistAlbums = Array.isArray(data.albums) ? data.albums : [];
    } catch {
      modalArtistAlbums = [];
    }
    return modalArtistAlbums;
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     네이티브 스크롤 캐러셀
     - CSS scroll-snap-type 으로 맥 두 손가락 / 터치 스와이프 지원
     - 스크롤 중 가운데에 가장 가까운 아이템을 실시간으로 강조
     - 스크롤이 멈추면(scrollend / debounce) 현재 앨범 전환
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const C_ANIM_MS = 320;
  let carouselIdx      = 0;
  let _scrollEndTimer  = null;
  let _lastCommitIdx   = 0;  // 가장 마지막으로 switchModalToAlbum 호출한 idx
  let scrollTicking    = false;

  // 마우스 드래그 및 관성 스크롤(미끄러짐)용 변수
  let isMouseDown = false;
  let dragStartX = 0;
  let dragScrollLeft = 0;
  let dragVelocity = 0;
  let dragLastX = 0;
  let dragLastTime = 0;
  let inertiaAnimFrameId = null;

  function onMouseDown(e) {
    if (e.button !== 0) return;
    isMouseDown = true;
    coverCarouselTrack.classList.add('is-dragging');
    coverCarouselTrack.style.scrollSnapType = 'none';
    dragStartX = e.pageX - coverCarouselTrack.offsetLeft;
    dragScrollLeft = coverCarouselTrack.scrollLeft;
    dragVelocity = 0;
    dragLastX = e.pageX;
    dragLastTime = Date.now();
    cancelAnimationFrame(inertiaAnimFrameId);
  }

  function onMouseMove(e) {
    if (!isMouseDown) return;
    e.preventDefault();
    const x = e.pageX - coverCarouselTrack.offsetLeft;
    const walk = (x - dragStartX) * 1.3;
    coverCarouselTrack.scrollLeft = dragScrollLeft - walk;

    const now = Date.now();
    const elapsed = now - dragLastTime;
    if (elapsed > 0) {
      dragVelocity = (e.pageX - dragLastX) / elapsed;
      dragLastX = e.pageX;
      dragLastTime = now;
    }
  }

  function onMouseUpOrLeave() {
    if (!isMouseDown) return;
    isMouseDown = false;
    coverCarouselTrack.classList.remove('is-dragging');
    applyInertia();
  }

  function applyInertia() {
    if (Math.abs(dragVelocity) < 0.1) {
      coverCarouselTrack.style.scrollSnapType = 'x mandatory';
      onScrollSettle();
      return;
    }

    const step = () => {
      if (isMouseDown) return;
      coverCarouselTrack.scrollLeft -= dragVelocity * 16;
      dragVelocity *= 0.92; // 마찰력

      if (Math.abs(dragVelocity) > 0.08) {
        inertiaAnimFrameId = requestAnimationFrame(step);
      } else {
        coverCarouselTrack.style.scrollSnapType = 'x mandatory';
        const idx = nearestScrollIdx();
        scrollToIdx(idx);
      }
    };
    inertiaAnimFrameId = requestAnimationFrame(step);
  }

  /* 스크롤 위치 → 앨범 인덱스 변환 */
  function scrollToIdx(idx) {
    /* 각 아이템 너비 = 아이템 컨테이너 너비; snap은 center 기준 */
    const el = coverCarouselTrack.children[idx];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  /* 스크롤 컨테이너에서 현재 가운데에 가장 가까운 아이템 인덱스 반환 (레이아웃 비의존형) */
  function nearestScrollIdx() {
    const items = [...coverCarouselTrack.children];
    if (!items.length) return 0;
    const trackCenter = coverCarouselTrack.scrollLeft + coverCarouselTrack.clientWidth / 2;
    let nearest = 0, minDist = Infinity;
    items.forEach((el, i) => {
      const itemCenter = el.offsetLeft + el.offsetWidth / 2;
      const d = Math.abs(itemCenter - trackCenter);
      if (d < minDist) { minDist = d; nearest = i; }
    });
    return nearest;
  }

  /* 스크롤 중 실시간 scale/opacity/z-index 업데이트 (원통형, 정면 시야 - 레이아웃 비의존형) */
  function updateCarouselStyles() {
    const items = [...coverCarouselTrack.children];
    if (!items.length) return;
    const trackCenter = coverCarouselTrack.scrollLeft + coverCarouselTrack.clientWidth / 2;
    const ITEM_W = 148; // 아이템 가로

    items.forEach(el => {
      const itemCenter = el.offsetLeft + el.offsetWidth / 2;
      const dist = Math.abs(itemCenter - trackCenter);
      
      // t: 중앙(0)에서 멀어질수록 증가
      const t = Math.min(dist / (ITEM_W * 1.2), 1.8);

      // Z축 안쪽으로 사라지도록 음수 translateZ 지정
      const translateZ = -t * 110; 
      
      // 스크롤되면서 바깥쪽이 아닌 안쪽(중앙 방향)으로 꺾여 사라지는 원통 느낌을 주기 위한 X축 보정
      const direction = itemCenter > trackCenter ? -1 : 1;
      const translateX = direction * (t * t * 24);

      // scale도 살짝 줄여줌 (translateZ로 이미 작아지므로 보조적인 효과만)
      const scale = 1 - t * 0.12;
      const opacity = 1 - Math.min(t * 0.45, 0.75); // 외곽으로 갈수록 페이드 아웃
      const zIndex = Math.round((2 - t) * 5);

      el.style.transform = `translate3d(${translateX.toFixed(1)}px, 0, ${translateZ.toFixed(1)}px) scale(${scale.toFixed(3)})`;
      el.style.opacity = opacity.toFixed(3);
      el.style.zIndex = zIndex;

      // 중앙에 가까울수록 입체감 있는 섀도우를 주고, 멀어지면 섀도우도 페이드 아웃
      if (t < 0.2) {
        el.style.boxShadow = '0 12px 28px rgba(0, 0, 0, 0.22)';
      } else {
        const shadowOpacity = Math.max(0, 0.22 - (t * 0.12));
        el.style.boxShadow = `0 8px 16px rgba(0, 0, 0, ${shadowOpacity.toFixed(2)})`;
      }
    });
  }

  /* 스크롤 멈춤 후 앨범 전환 커밋 */
  function onScrollSettle() {
    const idx = nearestScrollIdx();
    carouselIdx = idx;
    updateCarouselStyles();
    if (idx !== _lastCommitIdx) {
      _lastCommitIdx = idx;
      const alb = modalCarouselAlbums[idx];
      if (alb && alb.id !== modalCurrentTrack?.albumId) switchModalToAlbum(alb);
    }
  }

  function buildScrollCarouselDom() {
    coverCarouselTrack.innerHTML = '';

    modalCarouselAlbums.forEach((alb, i) => {
      const el = document.createElement('div');
      el.className = 'carousel-cover-item carousel-scroll-item';
      el.dataset.albumId = alb.id;
      el.dataset.idx     = i;
      el.innerHTML = buildCoverCellHtml(alb.coverUrl, alb.name);
      if (!alb.coverUrl) el.style.background = gradientFor(alb.id);

      // 가운데(활성화된) 앨범 커버를 누르면 그 앨범의 수록곡 표시, 아니면 스크롤 이동
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx, 10);
        if (idx === carouselIdx) {
          goToAlbumTracksFromModal(alb.id);
        } else {
          scrollToIdx(idx);
        }
      });

      coverCarouselTrack.appendChild(el);
    });

    /* 초기 스타일 적용 */
    requestAnimationFrame(() => {
      updateCarouselStyles();
    });
  }

  function destroyCarousel() {
    /* 스크롤 및 드래그 리스너 정리 */
    coverCarouselTrack.removeEventListener('scroll', _onCarouselScroll);
    coverCarouselTrack.removeEventListener('scrollend', _onCarouselScrollEnd);
    clearTimeout(_scrollEndTimer);

    coverCarouselTrack.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUpOrLeave);
    cancelAnimationFrame(inertiaAnimFrameId);
    isMouseDown = false;
    coverCarouselTrack.classList.remove('is-dragging');
    coverCarouselTrack.style.scrollSnapType = '';

    coverCarouselTrack.innerHTML = '';
    coverCarouselTrack.classList.remove('is-expanded');
    coverCarouselTrack.classList.remove('is-single');
    coverCarouselTrack.style.paddingInline = '';
    modalCarouselExpanded = false;
    modalCarouselAlbums   = [];
    carouselIdx           = 0;
    _lastCommitIdx        = 0;
    scrollTicking         = false;
  }

  function _onCarouselScroll() {
    if (!scrollTicking) {
      requestAnimationFrame(() => {
        updateCarouselStyles();
        scrollTicking = false;
      });
      scrollTicking = true;
    }
    /* scrollend 미지원 브라우저 대비 debounce */
    clearTimeout(_scrollEndTimer);
    _scrollEndTimer = setTimeout(onScrollSettle, 120);
  }
  function _onCarouselScrollEnd() {
    clearTimeout(_scrollEndTimer);
    onScrollSettle();
  }

  async function expandArtistCarousel() {
    if (modalCarouselExpanded) return;

    const centerAlbumId = modalCurrentTrack.albumId;
    const fetched = await fetchArtistAlbumsIfNeeded();
    const others  = fetched.filter(a => a.id !== centerAlbumId);

    if (others.length === 0) { showNoOtherAlbumsHint(); return; }

    const currentAlbum = {
      id:       modalCurrentTrack.albumId,
      name:     modalCurrentTrack.album || '현재 앨범',
      coverUrl: modalCurrentTrack.coverUrl,
    };
    const seen = new Set();
    modalCarouselAlbums = [currentAlbum, ...fetched].filter(a => {
      if (!a?.id || seen.has(a.id)) return false;
      seen.add(a.id); return true;
    });

    carouselIdx    = 0;
    _lastCommitIdx = 0;
    coverCarouselTrack.classList.remove('is-single');
    coverCarouselTrack.classList.add('is-expanded');
    modalCarouselExpanded = true;
    trackModal.classList.add('is-carousel-open');
    carouselHint.hidden = true;
    carouselHint.textContent = '';
    carouselHint.classList.remove('is-notice');

    buildScrollCarouselDom();

    /* 스크롤 및 마우스 드래그 이벤트 연결 */
    coverCarouselTrack.addEventListener('scroll', _onCarouselScroll, { passive: true });
    coverCarouselTrack.addEventListener('scrollend', _onCarouselScrollEnd, { passive: true });

    coverCarouselTrack.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUpOrLeave);

    /* 양쪽 padding 설정: 첫/마지막 아이템도 정가운데로 스냅되도록
       trackWidth / 2 - itemWidth / 2 */
    requestAnimationFrame(() => {
      const trackW = coverCarouselTrack.offsetWidth;
      const itemW  = 148;
      const pad    = Math.max(0, Math.floor((trackW - itemW) / 2));
      coverCarouselTrack.style.paddingInline = `${pad}px`;
      /* 현재 앨범(첫 번째)으로 즉시 스크롤 → 이후에 위치 계산 */
      const first = coverCarouselTrack.children[0];
      if (first) first.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' });
      /* scrollIntoView(instant)는 동기적으로 즉시 적용되므로
         바로 뒤에서 호출하면 올바른 위치 기준으로 opacity/scale 계산 가능 */
      updateCarouselStyles();
    });
  }

  async function switchModalToAlbum(album) {
    if (!album?.id || album.id === modalCurrentTrack?.albumId) return;
    modalCurrentTrack = { ...modalCurrentTrack, albumId: album.id, album: album.name, coverUrl: album.coverUrl, title: '대표곡을 불러오는 중…' };
    updateModalText({ title: '대표곡을 불러오는 중…', artist: modalCurrentArtistName, album: album.name });
    try {
      const res  = await fetch(`/api/music/album/${encodeURIComponent(album.id)}?offset=0`, { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '오류');
      const t = data.representativeTrackTitle || album.name;
      modalCurrentTrack.title = t;
      updateModalText({ title: t, artist: modalCurrentArtistName, album: album.name });
    } catch {
      modalCurrentTrack.title = album.name;
      updateModalText({ title: album.name, artist: modalCurrentArtistName, album: album.name });
    }
  }

  function attachCoverInteractions(el, { isCurrent }) {
    if (isCurrent) {
      attachCoverLongPress(el, {
        onShortPress: () => { if (!modalCarouselExpanded) goToAlbumTracksFromModal(); },
        onLongPress:  () => { expandArtistCarousel(); },
      });
    }
  }

  function goToAlbumTracksFromModal(albumId) {
    const targetId = albumId || modalCurrentTrack?.albumId;
    if (!targetId) return;
    closeTrackModal();
    loadAlbumTracks(targetId);
  }

  function attachCoverLongPress(el, { onShortPress, onLongPress }) {
    let timer = null;
    let startX = 0, startY = 0, triggered = false, cancelled = false;
    function clear() { window.clearTimeout(timer); timer = null; el.classList.remove('is-pressing'); }
    function start(x, y) {
      if (Date.now() < ignoreCoverInputUntil) return;
      triggered = false; cancelled = false; startX = x; startY = y;
      el.classList.add('is-pressing');
      timer = window.setTimeout(() => { triggered = true; el.classList.remove('is-pressing'); onLongPress(); }, LONG_PRESS_MS);
    }
    function move(x, y) {
      if (!timer) return;
      if (Math.abs(x - startX) > COVER_MOVE_CANCEL_PX || Math.abs(y - startY) > COVER_MOVE_CANCEL_PX) { cancelled = true; clear(); }
    }
    function end() {
      if (!timer) return;
      const was = triggered, wc = cancelled; clear(); triggered = false; cancelled = false;
      if (Date.now() < ignoreCoverInputUntil) return;
      if (!was && !wc && !modalCarouselExpanded) onShortPress();
    }
    el.addEventListener('mousedown', e => start(e.clientX, e.clientY));
    el.addEventListener('mousemove', e => move(e.clientX, e.clientY));
    el.addEventListener('mouseup', end);
    el.addEventListener('mouseleave', clear);
    el.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; start(t.clientX, t.clientY); }, { passive: false });
    el.addEventListener('touchmove', e => { const t = e.touches[0]; move(t.clientX, t.clientY); }, { passive: true });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', clear);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* 초기 상태 */
  showOnly('empty');
  importPointerStackTracks();
})();
