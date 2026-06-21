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
     목업 데이터셋
     실제로는 이 자리에 Spotify 등 외부 음악 API 검색 결과가 들어올 예정.
     지금은 UI/동작 흐름만 보여주기 위한 더미 데이터 + 키워드 매칭 시뮬레이션.
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
    const s = name.trim();
    if (!s) return '?';
    if (/[가-힣]/.test(s)) return s[0];
    return s.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  const TRACKS = [
    { title: '새벽 2시, 센치해질 때', artist: '디거킹', duration: '3:47', tags: ['새벽','감성','잔잔','이별','비'] },
    { title: '빗소리와 너', artist: '오로라', duration: '4:02', tags: ['비','잔잔','감성','새벽'] },
    { title: '창밖엔 비가', artist: '소란시티', duration: '3:21', tags: ['비','잔잔','우울','이별'] },
    { title: '별이 빛나는 밤에', artist: '네온로드', duration: '3:55', tags: ['별','밤','감성','새벽'] },
    { title: '너의 별자리', artist: '문라이트', duration: '4:14', tags: ['별','사랑','밤'] },
    { title: '이별 통보', artist: '소란시티', duration: '3:33', tags: ['이별','새벽','우울'] },
    { title: '헤어진 다음 날', artist: '디거킹', duration: '3:48', tags: ['이별','새벽','우울','감성'] },
    { title: '러닝 하이', artist: '네오시티', duration: '3:12', tags: ['운동','신남','에너지','러닝'] },
    { title: '땀과 비트', artist: '펄스웍스', duration: '3:05', tags: ['운동','신남','에너지'] },
    { title: '오늘부터 헬스', artist: '머슬비트', duration: '2:58', tags: ['운동','신남','에너지','러닝'] },
    { title: '성수동 카페', artist: 'VinylLover', duration: '3:40', tags: ['카페','잔잔','감성'] },
    { title: '스타라이트', artist: '문라이트', duration: '3:29', tags: ['별','밤','사랑'] },
    { title: '힙합 디깅 vol.7', artist: 'fliphop', duration: '3:15', tags: ['힙합','신남'] },
    { title: '비 오는 골목', artist: '오로라', duration: '4:21', tags: ['비','잔잔','새벽','감성'] },
    { title: '운동 갈 시간', artist: '펄스웍스', duration: '3:02', tags: ['운동','에너지','신남'] },
    { title: '별 하나 나 하나', artist: '네온로드', duration: '3:50', tags: ['별','밤','사랑','잔잔'] },
  ].map((t, i) => ({ ...t, id: 't' + i, gradient: GRADIENTS[i % GRADIENTS.length] }));

  /* 검색어 → 의미 태그로 거칠게 매핑하는 간단한 사전.
     실제 AI 검색을 흉내내기 위한 자리이며, 실제 구현 시 이 부분이
     임베딩 기반 의미 검색 API 호출로 대체될 예정. */
  const KEYWORD_MAP = [
    { match: ['비', '빗소리', '창밖', '우산'], tag: '비' },
    { match: ['이별', '헤어', '슬픈', '슬프'], tag: '이별' },
    { match: ['새벽', '밤', '잠'], tag: '새벽' },
    { match: ['별', '스타'], tag: '별' },
    { match: ['운동', '헬스', '러닝', '땀', '신나는', '에너지'], tag: '운동' },
    { match: ['카페', '커피'], tag: '카페' },
    { match: ['사랑', '연애'], tag: '사랑' },
    { match: ['힙합'], tag: '힙합' },
    { match: ['잔잔', '감성', '센치'], tag: '감성' },
  ];

  function interpretQuery(query) {
    const q = query.trim();
    if (!q) return { tags: [], phrase: '' };
    const matchedTags = new Set();
    KEYWORD_MAP.forEach(({ match, tag }) => {
      if (match.some(k => q.includes(k))) matchedTags.add(tag);
    });
    return { tags: [...matchedTags], phrase: q };
  }

  function searchTracks(query) {
    const { tags, phrase } = interpretQuery(query);
    if (!phrase) return [];

    const scored = TRACKS.map(track => {
      let score = 0;
      tags.forEach(tag => { if (track.tags.includes(tag)) score += 3; });
      if (track.title.includes(phrase) || phrase.includes(track.title)) score += 5;
      if (track.artist.includes(phrase)) score += 4;
      return { track, score };
    }).filter(r => r.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.map(r => r.track);
  }

  function buildInterpretationLabel(query) {
    const { tags } = interpretQuery(query);
    if (tags.length === 0) return `"${query}"와 비슷한 느낌의 곡을 찾고 있어요`;
    const tagText = tags.map(t => `#${t}`).join(' ');
    return `${tagText} 분위기의 곡으로 이해했어요`;
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

    card.innerHTML = `
      <div class="track-cover" style="background:${track.gradient}">${initials(track.artist)}</div>
      <div class="track-info">
        <div class="track-title">${track.title}</div>
        <div class="track-artist">${track.artist}</div>
      </div>
      <span class="track-meta">${track.duration}</span>
      <span class="track-check" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
      </span>
    `;
    card.addEventListener('click', () => toggleTrack(track));
    return card;
  }

  function runSearch(query) {
    if (!query.trim()) {
      showOnly('empty');
      aiChipRow.hidden = true;
      suggestRow.style.display = '';
      return;
    }

    suggestRow.style.display = 'none';
    showOnly('loading');
    aiChipRow.hidden = true;

    // 실제 AI 의미 검색 API 호출을 흉내내는 인위적 지연.
    // (실제 연동 시 이 setTimeout 블록을 fetch 호출로 교체)
    window.clearTimeout(runSearch._t);
    runSearch._t = window.setTimeout(() => {
      const results = searchTracks(query);

      aiInterpretation.textContent = buildInterpretationLabel(query);
      aiChipRow.hidden = false;

      resultsGrid.innerHTML = '';
      if (results.length === 0) {
        resultsCount.textContent = '결과가 없어요. 다른 표현으로 찾아볼까요?';
        showOnly('results');
        return;
      }

      resultsCount.textContent = `${results.length}개의 결과`;
      results.forEach(track => resultsGrid.appendChild(renderTrackCard(track)));
      showOnly('results');
    }, 480);
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
    return TRACKS.find(t => t.id === id);
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
      chip.innerHTML = `
        <span class="tray-chip-cover" style="background:${track.gradient}">${initials(track.artist)}</span>
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
