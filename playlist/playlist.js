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

  let sort = 'latest';
  let currentPlaylist = null;

  async function loadList() {
    const params = new URLSearchParams({ sort });
    const q = playlistSearch.value.trim();
    if (q) params.set('q', q);

    const res = await fetch(`/api/playlists?${params}`, { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    const playlists = Array.isArray(data.playlists) ? data.playlists : [];

    playlistGrid.innerHTML = '';
    emptyState.hidden = playlists.length > 0;
    playlists.forEach(playlist => playlistGrid.appendChild(renderCard(playlist)));
  }

  function renderCard(playlist) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'share-card';
    card.innerHTML = `
      <img src="${playlist.coverUrl}" alt="" loading="lazy">
      <div class="share-card-body">
        <div class="share-card-title">${escapeHtml(playlist.title)}</div>
        <div class="share-card-meta">by ${escapeHtml(playlist.displayName || 'MusicPlz')} · ${playlist.trackCount || 0} tracks</div>
        <div class="share-card-stats"><span>♥ ${playlist.likeCount || 0}</span><span>저장 ${playlist.saveCount || 0}</span></div>
      </div>
    `;
    card.addEventListener('click', () => showDetail(playlist.id));
    return card;
  }

  async function showDetail(id) {
    const res = await fetch(`/api/playlists/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || '플레이리스트를 불러오지 못했어요.');

    currentPlaylist = data.playlist;
    listToolbar.hidden = true;
    playlistGrid.hidden = true;
    emptyState.hidden = true;
    playlistDetail.hidden = false;

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
        <img src="${track.coverUrl || currentPlaylist.coverUrl}" alt="" loading="lazy">
        <div class="detail-track-info">
          <div class="detail-track-title">${escapeHtml(track.title)}</div>
          <div class="detail-track-artist">${escapeHtml(track.artist)}</div>
        </div>
      `;
      detailTrackList.appendChild(item);
    });
  }

  async function toggleAction(type) {
    if (!currentPlaylist) return;
    const res = await fetch(`/api/playlists/${currentPlaylist.id}/${type}`, {
      method: 'POST',
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || '로그인이 필요합니다.');
    currentPlaylist = data.playlist;
    showDetail(currentPlaylist.id);
  }

  function showList() {
    currentPlaylist = null;
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

  const id = new URLSearchParams(location.search).get('id');
  if (id) showDetail(id);
  else loadList();
})();
