(() => {
  const playlistGrid = document.getElementById('playlistGrid');
  const emptyState = document.getElementById('emptyState');
  const playlistSearch = document.getElementById('playlistSearch');
  const sortTabs = [...document.querySelectorAll('.sort-tab')];
  const listToolbar = document.getElementById('listToolbar');
  const playlistDetail = document.getElementById('playlistDetail');
  const backToList = document.getElementById('backToList');
  const detailCover = document.getElementById('detailCover');
  const detailTitle = document.getElementById('detailTitle');
  const detailByline = document.getElementById('detailByline');
  const detailTrackList = document.getElementById('detailTrackList');
  const likeBtn = document.getElementById('likeBtn');
  const saveBtn = document.getElementById('saveBtn');
  const quickCardBackdrop = document.getElementById('quickCardBackdrop');
  const quickCardClose = document.getElementById('quickCardClose');
  const quickCover = document.getElementById('quickCover');
  const quickTitle = document.getElementById('quickTitle');
  const quickOwner = document.getElementById('quickOwner');
  const quickStats = document.getElementById('quickStats');
  const quickOwnerActions = document.getElementById('quickOwnerActions');
  const quickEditBtn = document.getElementById('quickEditBtn');
  const quickDeleteBtn = document.getElementById('quickDeleteBtn');
  const quickComments = document.getElementById('quickComments');
  const quickCommentInput = document.getElementById('quickCommentInput');
  const quickCommentSend = document.getElementById('quickCommentSend');
  const quickReplyState = document.getElementById('quickReplyState');
  const waveEl = document.getElementById('waveTransition');
  const wavePath = document.getElementById('wavePath');
  const navCreate = document.querySelector('.nav-create');

  let sort = 'latest';
  let currentPlaylist = null;
  let quickPlaylist = null;
  let replyToCommentId = null;
  const savedOnly = new URLSearchParams(location.search).get('saved') === '1';

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  function easeInOutCubic(t) {
    return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function setWave(p) {
    const e = easeInOutCubic(p);
    const topY = 100 - e * 100;
    const waveAmp = 9 * Math.sin(e * Math.PI);
    const midY = topY - waveAmp;
    wavePath.setAttribute('d', `M0,100 L0,${topY} C25,${midY} 75,${midY} 100,${topY} L100,100 Z`);
  }

  function playWaveTransition(toUrl) {
    waveEl.style.pointerEvents = 'auto';
    let start = null;
    const DURATION = 620;
    function step(ts) {
      if (start === null) start = ts;
      const p = clamp((ts - start) / DURATION, 0, 1);
      setWave(p);
      if (p < 1) requestAnimationFrame(step);
      else location.href = toUrl;
    }
    requestAnimationFrame(step);
  }

  let csrfTokenPromise = null;

  async function getCsrfToken() {
    if (!csrfTokenPromise) {
      csrfTokenPromise = fetch('/api/csrf-token', { credentials: 'same-origin' })
        .then(res => {
          if (!res.ok) throw new Error('CSRF token request failed');
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

  async function loadList() {
    const params = new URLSearchParams({ sort });
    const q = playlistSearch.value.trim();
    if (q) params.set('q', q);
    if (savedOnly) params.set('saved', '1');

    const res = await fetch(`/api/playlists?${params}`, { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      playlistGrid.innerHTML = '';
      emptyState.hidden = false;
      emptyState.textContent = data.error || '플레이리스트를 불러오지 못했어요.';
      return;
    }
    const playlists = Array.isArray(data.playlists) ? data.playlists : [];

    playlistGrid.innerHTML = '';
    emptyState.hidden = playlists.length > 0;
    emptyState.textContent = savedOnly ? '저장한 플레이리스트가 없습니다.' : '아직 보여줄 플레이리스트가 없습니다.';
    playlists.forEach(playlist => playlistGrid.appendChild(renderCard(playlist)));
  }

  function renderCard(playlist) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'share-card';
    card.innerHTML = `
      <img src="${escapeHtml(playlist.coverUrl)}" alt="" loading="lazy">
      <div class="share-card-body">
        <div class="share-card-title">${escapeHtml(playlist.title)}</div>
        <div class="share-card-meta">by ${escapeHtml(playlist.displayName || 'MusicPlz')} · ${playlist.trackCount || 0} tracks</div>
        <div class="share-card-stats"><span>♥ ${playlist.likeCount || 0}</span><span>저장 ${playlist.saveCount || 0}</span></div>
      </div>
    `;
    attachCardPress(card, playlist);
    return card;
  }

  function attachCardPress(card, playlist) {
    let timer = null;
    let startX = 0;
    let startY = 0;
    let longPressed = false;

    function clear() {
      window.clearTimeout(timer);
      timer = null;
      card.classList.remove('is-pressing');
    }

    card.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button !== 0) return;
      longPressed = false;
      startX = e.clientX;
      startY = e.clientY;
      card.classList.add('is-pressing');
      timer = window.setTimeout(() => {
        longPressed = true;
        clear();
        openQuickCard(playlist);
      }, 520);
    });

    card.addEventListener('pointermove', e => {
      if (!timer) return;
      if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) clear();
    });

    card.addEventListener('pointerup', () => {
      const wasLongPressed = longPressed;
      clear();
      if (!wasLongPressed) showDetail(playlist.id);
    });

    card.addEventListener('pointercancel', clear);
    card.addEventListener('contextmenu', e => e.preventDefault());
  }

  function openQuickCard(playlist) {
    quickPlaylist = playlist;
    quickCover.src = playlist.coverUrl;
    quickTitle.textContent = playlist.title;
    quickOwner.textContent = `플리주인 @${playlist.displayName || 'MusicPlz'}`;
    quickStats.textContent = `${playlist.trackCount || 0} tracks · ♥ ${playlist.likeCount || 0} · 저장 ${playlist.saveCount || 0}`;
    quickOwnerActions.hidden = !playlist.isOwner;
    quickCardBackdrop.hidden = false;
    requestAnimationFrame(() => quickCardBackdrop.classList.add('is-open'));
  }

  function closeQuickCard() {
    quickCardBackdrop.classList.remove('is-open');
    setTimeout(() => {
      if (!quickCardBackdrop.classList.contains('is-open')) quickCardBackdrop.hidden = true;
    }, 180);
  }

  async function showDetail(id) {
    const res = await fetch(`/api/playlists/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || '플레이리스트를 불러오지 못했어요.');

    currentPlaylist = data.playlist;
    quickPlaylist = currentPlaylist;
    replyToCommentId = null;
    listToolbar.hidden = true;
    playlistGrid.hidden = true;
    emptyState.hidden = true;
    playlistDetail.hidden = false;
    quickCommentInput.value = '';
    quickReplyState.hidden = true;

    detailCover.src = currentPlaylist.coverUrl;
    detailTitle.textContent = currentPlaylist.title;
    detailByline.textContent = `by ${currentPlaylist.displayName || 'MusicPlz'} · ${currentPlaylist.tracks.length} tracks · ♥ ${currentPlaylist.likeCount || 0}`;
    likeBtn.classList.toggle('is-on', currentPlaylist.liked);
    saveBtn.classList.toggle('is-on', currentPlaylist.saved);
    likeBtn.textContent = currentPlaylist.liked ? '좋아요 취소' : '좋아요';
    saveBtn.textContent = currentPlaylist.saved ? '저장 취소' : '저장';

    detailTrackList.innerHTML = '';
    currentPlaylist.tracks.forEach((track, i) => {
      const item = document.createElement('div');
      item.className = 'detail-track';
      item.innerHTML = `
        <div class="detail-track-index">${i + 1}</div>
        <img src="${escapeHtml(track.coverUrl || currentPlaylist.coverUrl)}" alt="" loading="lazy">
        <div class="detail-track-info">
          <div class="detail-track-title">${escapeHtml(track.title)}</div>
          <div class="detail-track-artist">${escapeHtml(track.artist)}</div>
        </div>
      `;
      detailTrackList.appendChild(item);
    });
    loadQuickComments();
  }

  async function toggleAction(type) {
    if (!currentPlaylist) return;
    const res = await secureFetch(`/api/playlists/${currentPlaylist.id}/${type}`, {
      method: 'POST',
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || '로그인이 필요합니다.');
    currentPlaylist = data.playlist;
    showDetail(currentPlaylist.id);
  }

  async function deleteCurrentQuickPlaylist() {
    if (!quickPlaylist || !quickPlaylist.isOwner) return;
    if (!confirm(`"${quickPlaylist.title}" 플레이리스트를 삭제할까요?\n\n이 플레이리스트를 저장한 모든 사용자의 보관함에서도 지워집니다.`)) return;

    const res = await secureFetch(`/api/playlists/${quickPlaylist.id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || '삭제하지 못했어요.');

    closeQuickCard();
    if (currentPlaylist?.id === quickPlaylist.id) showList();
    else loadList();
  }

  async function loadQuickComments() {
    if (!quickPlaylist) return;
    quickComments.innerHTML = '<div class="quick-comment-empty">댓글을 불러오는 중...</div>';

    const res = await fetch(`/api/playlists/${quickPlaylist.id}/comments`, { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      quickComments.innerHTML = `<div class="quick-comment-empty">${escapeHtml(data.error || '댓글을 불러오지 못했어요.')}</div>`;
      return;
    }

    renderQuickComments(Array.isArray(data.comments) ? data.comments : []);
  }

  function renderQuickComments(comments) {
    quickComments.innerHTML = '';
    if (comments.length === 0) {
      quickComments.innerHTML = '<div class="quick-comment-empty">아직 댓글이 없습니다.</div>';
      return;
    }

    comments.forEach(comment => {
      const item = document.createElement('div');
      item.className = `quick-comment${comment.parentCommentId ? ' is-reply' : ''}`;
      item.innerHTML = `
        <div class="quick-comment-top">
          <strong>@${escapeHtml(comment.displayName || 'MusicPlz')}</strong>
          <span>${formatTime(comment.createdAt)}${comment.updatedAt ? ' · 수정됨' : ''}</span>
        </div>
        <div class="quick-comment-body">${escapeHtml(comment.content)}</div>
        <div class="quick-comment-actions">
          <button type="button" data-action="reply">답장</button>
          <button type="button" data-action="like">공감 ${comment.likeCount || 0}</button>
          ${comment.isOwner ? '<button type="button" data-action="edit">수정</button><button type="button" data-action="delete">삭제</button>' : ''}
        </div>
      `;

      item.querySelector('[data-action="reply"]').addEventListener('click', () => {
        replyToCommentId = comment.id;
        quickReplyState.hidden = false;
        quickReplyState.textContent = `@${comment.displayName || 'MusicPlz'}에게 답장 중`;
        quickCommentInput.focus();
      });

      item.querySelector('[data-action="like"]').addEventListener('click', async () => {
        const res = await secureFetch(`/api/playlists/comments/${comment.id}/like`, { method: 'POST', credentials: 'same-origin' });
        if (!res.ok) return alert('로그인이 필요합니다.');
        loadQuickComments();
      });

      const editBtn = item.querySelector('[data-action="edit"]');
      if (editBtn) {
        editBtn.addEventListener('click', async () => {
          const content = prompt('댓글 수정', comment.content);
          if (!content || !content.trim()) return;
          const res = await secureFetch(`/api/playlists/comments/${comment.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ content: content.trim() }),
          });
          if (!res.ok) return alert('수정하지 못했어요.');
          loadQuickComments();
        });
      }

      const deleteBtn = item.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          if (!confirm('댓글을 삭제할까요?')) return;
          const res = await secureFetch(`/api/playlists/comments/${comment.id}`, { method: 'DELETE', credentials: 'same-origin' });
          if (!res.ok) return alert('삭제하지 못했어요.');
          loadQuickComments();
        });
      }

      quickComments.appendChild(item);
    });
  }

  async function submitQuickComment() {
    if (!quickPlaylist) return;
    const content = quickCommentInput.value.trim();
    if (!content) return;

    const res = await secureFetch(`/api/playlists/${quickPlaylist.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ content, parentCommentId: replyToCommentId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || '댓글을 등록하지 못했어요.');

    quickCommentInput.value = '';
    replyToCommentId = null;
    quickReplyState.hidden = true;
    renderQuickComments(Array.isArray(data.comments) ? data.comments : []);
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function showList() {
    currentPlaylist = null;
    quickPlaylist = null;
    replyToCommentId = null;
    listToolbar.hidden = false;
    playlistGrid.hidden = false;
    playlistDetail.hidden = true;
    loadList();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  playlistSearch.addEventListener('input', () => loadList());
  sortTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      sort = btn.dataset.sort;
      sortTabs.forEach(tab => tab.classList.toggle('is-active', tab === btn));
      loadList();
    });
  });
  backToList.addEventListener('click', showList);
  likeBtn.addEventListener('click', () => toggleAction('like'));
  saveBtn.addEventListener('click', () => toggleAction('save'));
  quickCardClose.addEventListener('click', closeQuickCard);
  quickCardBackdrop.addEventListener('click', e => {
    if (e.target === quickCardBackdrop) closeQuickCard();
  });
  quickEditBtn.addEventListener('click', () => alert('수정 기능은 다음 단계에서 연결할게요.'));
  quickDeleteBtn.addEventListener('click', deleteCurrentQuickPlaylist);
  quickCommentSend.addEventListener('click', submitQuickComment);
  quickCommentInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitQuickComment();
    if (e.key === 'Escape') {
      replyToCommentId = null;
      quickReplyState.hidden = true;
    }
  });
  navCreate.addEventListener('click', e => {
    e.preventDefault();
    playWaveTransition(navCreate.getAttribute('href'));
  });

  const id = new URLSearchParams(location.search).get('id');
  if (id) showDetail(id);
  else loadList();
})();
