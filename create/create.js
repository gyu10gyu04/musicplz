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
      ? `<img src="${track.coverUrl}" alt="" loading="lazy" draggable="false">`
      : initials(track.artist);
    const coverStyle = track.coverUrl ? '' : `style="background:${gradientFor(track.id)}"`;

    card.innerHTML = `
      <div class="track-cover" ${coverStyle}>${coverInner}</div>
      <div class="track-info">
        <div class="track-title">${track.title}</div>
        <div class="track-artist">${track.artist}</div>
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
      const res = await fetch('/api/music/search', {
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

  const tray         = document.getElementById('tray');
  const trayCount    = document.getElementById('trayCount');
  const trayStrip    = document.getElementById('trayStrip');
  const trayClear    = document.getElementById('trayClear');
  const trayCreateBtn = document.getElementById('trayCreateBtn');

  function trackById(id) {
    return knownTracks.get(id);
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
        ? `<img src="${track.coverUrl}" alt="" loading="lazy" draggable="false">`
        : initials(track.artist);
      const coverStyle = track.coverUrl ? '' : `style="background:${gradientFor(track.id)}"`;
      chip.innerHTML = `
        <span class="tray-chip-cover" ${coverStyle}>${coverInner}</span>
        <span class="tray-chip-label">${track.title}</span>
      `;
      trayStrip.appendChild(chip);
    });
    if (count > MAX_CHIPS) {
      const more = document.createElement('div');
      more.className = 'tray-chip-more';
      more.textContent = `+${count - MAX_CHIPS}`;
      trayStrip.appendChild(more);
    }
  }

  trayClear.addEventListener('click', () => {
    selectedIds.clear();
    selectedOrder.length = 0;
    resultsGrid.querySelectorAll('.track-card.is-selected').forEach(c => c.classList.remove('is-selected'));
    renderTray();
  });

  trayCreateBtn.addEventListener('click', () => {
    if (selectedOrder.length === 0) return;
    // 실제 플레이리스트 생성 로직(서버 저장 등)이 들어갈 자리.
    // 지금은 UI 동작 시연 단계라 담은 곡 목록만 안내.
    alert(`"${selectedOrder.length}곡"으로 플레이리스트를 만들 준비가 됐어요!\n(플레이리스트 저장 기능은 다음 단계에서 연결할게요)`);
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

  // 모달이 지금 어떤 트랙/앨범을 보여주고 있는지 추적.
  // 캐러셀에서 다른 앨범을 고르면 이 값들이 갱신된다.
  let modalCurrentTrack = null;       // 모달을 열게 한 원래 트랙(앨범 트랙 보기 진입점)
  let modalCurrentArtistName = '';    // 표시용 가수 이름(원본 트랙 기준, 캐러셀 전환해도 가수는 동일)
  let modalArtistAlbums = null;       // 캐러셀에 쓸 아티스트 앨범 목록(지연 로딩, 캐싱)
  let modalCarouselExpanded = false;

  function buildCoverCellHtml(coverUrl, labelForInitials) {
    if (coverUrl) return `<img src="${coverUrl}" alt="" loading="lazy" draggable="false">`;
    return initials(labelForInitials);
  }

  function renderModalCover(coverUrl, artistNameForFallback) {
    // 캐러셀이 접힌 기본 상태: 현재 트랙/앨범의 커버 하나만 보여줌
    coverCarouselTrack.innerHTML = '';
    coverCarouselTrack.classList.remove('is-expanded');
    modalCarouselExpanded = false;
    carouselHint.hidden = true;

    const item = document.createElement('div');
    item.className = 'carousel-cover-item is-current';
    item.innerHTML = buildCoverCellHtml(coverUrl, artistNameForFallback);
    if (!coverUrl) item.style.background = gradientFor(artistNameForFallback || 'x');
    coverCarouselTrack.appendChild(item);

    attachCoverInteractions(item, { isCurrent: true });
  }

  function updateModalText({ title, artist, album }) {
    modalTrackTitle.style.opacity = '0';
    modalTrackArtist.style.opacity = '0';
    modalTrackAlbum.style.opacity = '0';
    window.setTimeout(() => {
      modalTrackTitle.textContent = title;
      modalTrackArtist.textContent = artist;
      modalTrackAlbum.textContent = album || '정보 없음';
      modalTrackTitle.style.opacity = '1';
      modalTrackArtist.style.opacity = '1';
      modalTrackAlbum.style.opacity = '1';
    }, 90);
  }

  function openTrackModal(track) {
    modalCurrentTrack = track;
    modalCurrentArtistName = track.artist;
    modalArtistAlbums = null; // 새 트랙을 열 때마다 캐러셀 데이터는 다시 받아오도록 초기화

    modalTrackTitle.textContent = track.title;
    modalTrackArtist.textContent = track.artist;
    modalTrackAlbum.textContent = track.album || '정보 없음';
    modalTrackTitle.style.opacity = '1';
    modalTrackArtist.style.opacity = '1';
    modalTrackAlbum.style.opacity = '1';

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
      coverCarouselTrack.innerHTML = '';
      coverCarouselTrack.classList.remove('is-expanded');
      modalCarouselExpanded = false;
    }, 200);
  }

  trackModalClose.addEventListener('click', closeTrackModal);
  trackModalBackdrop.addEventListener('click', e => {
    if (e.target === trackModalBackdrop) closeTrackModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !trackModalBackdrop.hidden) closeTrackModal();
  });

  /* 같은 가수의 다른 앨범이 없을 때, 캐러셀 힌트 영역에 짧게 안내 문구를 보여줌
     (조용히 아무 반응 없는 것보다, "다른 앨범이 없다"는 걸 알려주는 게 덜 헷갈림) */
  let noAlbumsHintTimer = null;
  function showNoOtherAlbumsHint() {
    window.clearTimeout(noAlbumsHintTimer);
    const original = carouselHint.textContent;
    carouselHint.textContent = '이 가수의 다른 앨범은 아직 없어요';
    carouselHint.hidden = false;
    carouselHint.classList.add('is-notice');
    noAlbumsHintTimer = window.setTimeout(() => {
      carouselHint.hidden = true;
      carouselHint.classList.remove('is-notice');
      carouselHint.textContent = original || '← 좌우로 넘겨서 다른 앨범 보기 →';
    }, 1800);
  }

  /* ── 캐러셀: 같은 가수의 다른 앨범들 가져오기 (최초 펼칠 때 한 번만 요청, 이후 캐싱) ── */
  async function fetchArtistAlbumsIfNeeded() {
    if (modalArtistAlbums) return modalArtistAlbums; // 이미 받아온 경우 재사용
    if (!modalCurrentTrack?.artistId) return null;

    try {
      const res = await fetch(`/api/music/artist/${encodeURIComponent(modalCurrentTrack.artistId)}/albums`, {
        credentials: 'same-origin',
      });
      let data = {};
      try { data = await res.json(); } catch (_) { /* noop */ }
      if (!res.ok) throw new Error(data.error || '다른 앨범을 불러오지 못했어요.');
      modalArtistAlbums = Array.isArray(data.albums) ? data.albums : [];
      return modalArtistAlbums;
    } catch (err) {
      modalArtistAlbums = [];
      return modalArtistAlbums;
    }
  }

  /* 현재 보고 있는 앨범(또는 원본 트랙의 앨범)을 캐러셀 중앙에 두고,
     같은 가수의 다른 앨범들을 양옆에 배치한 뒤 펼침. */
  async function expandArtistCarousel() {
    if (modalCarouselExpanded) return;

    const centerAlbumId = modalCurrentTrack.albumId;
    const centerCoverUrl = modalCurrentTrack.coverUrl;
    const centerAlbumName = modalCurrentTrack.album;

    const albums = await fetchArtistAlbumsIfNeeded();
    const others = (albums || []).filter(a => a.id !== centerAlbumId);

    if (others.length === 0) {
      // 다른 앨범이 없는 경우: 조용히 무시하지 않고, "다른 앨범이 없다"고 짧게 알려줌
      showNoOtherAlbumsHint();
      return;
    }

    // 현재 앨범을 목록 중앙에 두고, 나머지를 좌우로 배치
    const half = Math.ceil(others.length / 2);
    const leftSide = others.slice(0, half).reverse(); // 중앙에 가까운 게 먼저 오도록
    const rightSide = others.slice(half);

    coverCarouselTrack.innerHTML = '';

    leftSide.forEach(album => {
      const el = createCarouselAlbumItem(album);
      coverCarouselTrack.appendChild(el);
    });

    const centerEl = document.createElement('div');
    centerEl.className = 'carousel-cover-item is-current';
    centerEl.dataset.albumId = centerAlbumId || '';
    centerEl.innerHTML = buildCoverCellHtml(centerCoverUrl, modalCurrentArtistName);
    if (!centerCoverUrl) centerEl.style.background = gradientFor(modalCurrentArtistName);
    coverCarouselTrack.appendChild(centerEl);
    attachCoverInteractions(centerEl, { isCurrent: true });

    rightSide.forEach(album => {
      const el = createCarouselAlbumItem(album);
      coverCarouselTrack.appendChild(el);
    });

    coverCarouselTrack.classList.add('is-expanded');
    modalCarouselExpanded = true;
    trackModal.classList.add('is-carousel-open');
    carouselHint.hidden = false;

    // 펼쳐진 직후 중앙(현재) 커버가 화면 중앙에 오도록 스크롤 위치 맞춤
    requestAnimationFrame(() => {
      centerEl.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' });
    });
  }

  function createCarouselAlbumItem(album) {
    const el = document.createElement('div');
    el.className = 'carousel-cover-item';
    el.dataset.albumId = album.id;
    el.innerHTML = buildCoverCellHtml(album.coverUrl, album.name);
    if (!album.coverUrl) el.style.background = gradientFor(album.id);
    attachCoverInteractions(el, { isCurrent: false, album });
    return el;
  }

  /* 캐러셀 안의 커버 하나에 상호작용을 건다.
     - 중앙(현재) 커버: 짧게 클릭하면 그 앨범의 트랙 목록 보기로 이동, 꾹 누르면 캐러셀 펼침
     - 다른(흐릿한) 커버: 클릭하면 그 앨범을 새로운 "현재"로 채택해 모달 내용을 교체 */
  function attachCoverInteractions(el, { isCurrent, album }) {
    if (isCurrent) {
      attachCoverLongPress(el, {
        onShortPress: () => {
          if (modalCarouselExpanded) return; // 캐러셀이 펼쳐진 동안은 클릭으로 앨범 진입하지 않음(오작동 방지)
          goToAlbumTracksFromModal();
        },
        onLongPress: () => { expandArtistCarousel(); },
      });
    } else {
      el.addEventListener('click', () => switchModalToAlbum(album));
    }
  }

  /* 캐러셀에서 다른 앨범을 선택했을 때: 모달의 제목/대표곡/앨범명을 그 앨범 기준으로 교체.
     "원래 노래 제목"이 그대로면 어색하므로, 대표곡(인기도가 가장 높은 트랙)을 받아와 제목으로 사용. */
  async function switchModalToAlbum(album) {
    modalCurrentTrack = {
      ...modalCurrentTrack,
      albumId: album.id,
      album: album.name,
      coverUrl: album.coverUrl,
      // title은 대표곡 조회가 끝난 뒤 갱신 — 우선 앨범명을 임시로 보여줘 어색한 공백을 줄임
      title: '대표곡을 불러오는 중…',
    };

    updateModalText({
      title: '대표곡을 불러오는 중…',
      artist: modalCurrentArtistName,
      album: album.name,
    });
    renderModalCoverCenterOnly(album.coverUrl, album.id);

    try {
      const res = await fetch(`/api/music/album/${encodeURIComponent(album.id)}?offset=0`, {
        credentials: 'same-origin',
      });
      let data = {};
      try { data = await res.json(); } catch (_) { /* noop */ }
      if (!res.ok) throw new Error(data.error || '앨범 정보를 불러오지 못했어요.');

      const repTitle = data.representativeTrackTitle || album.name;
      modalCurrentTrack.title = repTitle;
      updateModalText({ title: repTitle, artist: modalCurrentArtistName, album: album.name });
    } catch (err) {
      // 대표곡 조회가 실패해도 앨범명/커버는 이미 갱신되어 있으니 제목만 앨범명으로 대체
      modalCurrentTrack.title = album.name;
      updateModalText({ title: album.name, artist: modalCurrentArtistName, album: album.name });
    }
  }

  /* switchModalToAlbum 중간에, 캐러셀은 유지한 채로 "현재" 표시만 새 앨범으로 옮기고 싶을 때 사용.
     (캐러셀을 다시 접지 않고, 가운데 칸의 내용만 바꿔서 자연스럽게 이어지게) */
  function renderModalCoverCenterOnly(coverUrl, albumId) {
    const centerEl = coverCarouselTrack.querySelector('.carousel-cover-item.is-current');
    if (!centerEl) return;
    centerEl.dataset.albumId = albumId || '';
    centerEl.innerHTML = buildCoverCellHtml(coverUrl, modalCurrentArtistName);
    centerEl.style.background = coverUrl ? '' : gradientFor(albumId || modalCurrentArtistName);
  }

  /* 모달 커버(또는 캐러셀 중앙 커버)를 짧게 클릭했을 때: 모달을 닫고 그 앨범의 트랙들을 검색 결과로 표시 */
  function goToAlbumTracksFromModal() {
    if (!modalCurrentTrack?.albumId) return;
    closeTrackModal();
    loadAlbumTracks(modalCurrentTrack.albumId);
  }

  /* ── 모달 안 커버 전용 롱프레스 감지 (카드 롱프레스와 별개 인스턴스) ── */
  function attachCoverLongPress(el, { onShortPress, onLongPress }) {
    let timer = null;
    let startX = 0, startY = 0, triggered = false;

    function clear() {
      window.clearTimeout(timer);
      timer = null;
      el.classList.remove('is-pressing');
    }
    function start(x, y) {
      triggered = false;
      startX = x; startY = y;
      el.classList.add('is-pressing');
      timer = window.setTimeout(() => {
        triggered = true;
        el.classList.remove('is-pressing');
        onLongPress();
      }, LONG_PRESS_MS);
    }
    function move(x, y) {
      if (!timer) return;
      if (Math.abs(x - startX) > COVER_MOVE_CANCEL_PX || Math.abs(y - startY) > COVER_MOVE_CANCEL_PX) clear();
    }
    function end() {
      const was = triggered;
      clear();
      if (!was) onShortPress();
    }

    el.addEventListener('mousedown', e => start(e.clientX, e.clientY));
    el.addEventListener('mousemove', e => move(e.clientX, e.clientY));
    el.addEventListener('mouseup', end);
    el.addEventListener('mouseleave', clear);
    // touchstart에서 preventDefault를 호출해, 모바일 브라우저의 기본
    // "이미지 길게 눌러서 저장/공유" 메뉴가 캐러셀 롱프레스보다 먼저 뜨는 것을 막는다.
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0];
      start(t.clientX, t.clientY);
    }, { passive: false });
    el.addEventListener('touchmove',  e => { const t = e.touches[0]; move(t.clientX, t.clientY); }, { passive: true });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', clear);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* 초기 상태 */
  showOnly('empty');
})();
