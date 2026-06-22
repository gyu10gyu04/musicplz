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

  function showOnly(el) {
    [emptyState, loadingState, resultsHeader, resultsGrid].forEach(e => { e.hidden = true; });
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
      ? `<img src="${track.coverUrl}" alt="" loading="lazy">`
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
    card.addEventListener('click', () => toggleTrack(track));
    return card;
  }

  // 검색 결과로 받은 트랙들을 id로 빠르게 찾기 위한 캐시.
  // (선택된 곡 정보를 트레이에 표시할 때, 검색 결과가 바뀌어도 이전에 담은 곡 정보를
  //  여전히 찾을 수 있도록, 한 번 본 트랙은 계속 이 맵에 누적해서 보관한다.)
  const knownTracks = new Map();

  let currentAbortController = null;

  async function runSearch(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      showOnly('empty');
      aiChipRow.hidden = true;
      suggestRow.style.display = '';
      return;
    }

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

      aiInterpretation.textContent = data.interpretation || `"${trimmed}"로 검색했어요`;
      aiChipRow.hidden = false;

      resultsGrid.innerHTML = '';
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
        ? `<img src="${track.coverUrl}" alt="" loading="lazy">`
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

  /* 초기 상태 */
  showOnly('empty');
})();
