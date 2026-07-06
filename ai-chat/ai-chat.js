(() => {
  const POINTER_PLAYLIST_KEY = 'mp-share-pointer-playlist';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readPlaylist() {
    try {
      const playlist = JSON.parse(sessionStorage.getItem(POINTER_PLAYLIST_KEY) || 'null');
      return playlist && Array.isArray(playlist.tracks) ? playlist : null;
    } catch {
      return null;
    }
  }

  function renderPlaylistAnalysisSeed(playlist) {
    const log = document.querySelector('.message-log');
    if (!log || !playlist) return;

    const tracks = playlist.tracks || [];
    const sample = tracks.slice(0, 8).map((track, i) => `
      <li>
        <span>${i + 1}</span>
        <strong>${escapeHtml(track.title)}</strong>
        <em>${escapeHtml(track.artist)}</em>
      </li>
    `).join('');

    log.innerHTML = `
      <article class="message user-message wide-message">
        <div class="bubble analysis-bubble playlist-seed-bubble">
          <div class="message-meta">Selected Playlist</div>
          <div class="playlist-seed-card">
            <img src="${escapeHtml(playlist.coverUrl)}" alt="" draggable="false">
            <div>
              <strong>${escapeHtml(playlist.title || '선택한 플리')}</strong>
              <span>by @${escapeHtml(playlist.displayName || 'MusicPlz')} · ${tracks.length || playlist.trackCount || 0} tracks</span>
            </div>
          </div>
          <p>이 플리를 기준으로 AI 분석을 준비했습니다.</p>
          <ol class="playlist-seed-tracks">${sample}</ol>
        </div>
        <div class="avatar">ME</div>
      </article>
      <article class="message ai-message wide-message">
        <div class="avatar">AI</div>
        <div class="bubble analysis-bubble">
          <div class="message-meta">Analysis Ready</div>
          <div class="score-row">
            <strong>${Math.min(99, 82 + Math.min(tracks.length, 12))}</strong>
            <span>/100</span>
            <em>Playlist Loaded</em>
          </div>
          <div class="analysis-grid">
            <div><b>곡 수</b><span>${tracks.length || playlist.trackCount || 0}곡을 분석 대상으로 불러왔습니다.</span></div>
            <div><b>흐름</b><span>선택한 순서를 유지한 상태로 분위기 전개를 볼 수 있습니다.</span></div>
            <div><b>다음 단계</b><span>실제 AI 평가 API가 연결되면 이 데이터로 분석 요청을 보냅니다.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  renderPlaylistAnalysisSeed(readPlaylist());

  requestAnimationFrame(() => {
    document.body.classList.add('is-ready');
  });
})();
