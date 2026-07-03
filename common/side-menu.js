(() => {
  if (document.querySelector('.mp-side-menu')) return;

  const routes = {
    home: '../main/main.html',
    login: '../login/login.html',
    create: '../create/create.html',
    share: '../playlist-share/playlist-share.html',
    ai: '../ai-chat/ai-chat.html',
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(value) {
    const text = String(value || '').trim();
    return text ? text[0].toUpperCase() : '?';
  }

  function renderAuth(user) {
    if (!user) {
      return `
        <div class="mp-side-auth">
          <span class="mp-side-avatar">MP</span>
          <div class="mp-side-user">
            <b>게스트</b>
            <span>로그인하고 플리를 관리하세요</span>
          </div>
          <a class="mp-side-login" href="${routes.login}">로그인</a>
        </div>
      `;
    }

    const label = escapeHtml(user.displayName || user.email || 'MusicPlz User');
    const sub = escapeHtml(user.email || '로그인됨');
    const initial = escapeHtml(initials(user.displayName || user.email));
    return `
      <div class="mp-side-auth">
        <span class="mp-side-avatar">${initial}</span>
        <div class="mp-side-user">
          <b>${label}</b>
          <span>${sub}</span>
        </div>
      </div>
    `;
  }

  function buildMenu(user) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="mp-side-hotspot" id="mpSideHotspot" aria-hidden="true"></div>
      <aside class="mp-side-menu" id="mpSideMenu" aria-label="MusicPlz 빠른 메뉴">
        <div class="mp-side-inner">
          <a class="mp-side-brand" href="${routes.home}">
            <span class="mp-side-logo">MP</span>
            <span><strong>MusicPlz</strong><span>Quick Navigation</span></span>
          </a>
          ${renderAuth(user)}
          <nav class="mp-side-nav" aria-label="주요 메뉴">
            <a class="mp-side-link" href="${routes.create}">
              <span class="mp-side-icon">+</span>
              <span><strong>만들기</strong><span>AI 검색으로 새 플리 구성</span></span>
              <span class="mp-side-arrow">→</span>
            </a>
            <a class="mp-side-link" href="${routes.share}">
              <span class="mp-side-icon">#</span>
              <span><strong>플리공유</strong><span>사람들이 만든 플레이리스트 탐색</span></span>
              <span class="mp-side-arrow">→</span>
            </a>
            <a class="mp-side-link" href="${routes.ai}">
              <span class="mp-side-icon">AI</span>
              <span><strong>AI평가</strong><span>플리 평점과 평가 채팅방</span></span>
              <span class="mp-side-arrow">→</span>
            </a>
          </nav>
          <div class="mp-side-foot"><span>Hover Left Edge</span><span class="mp-side-pulse"></span></div>
        </div>
      </aside>
    `;
    document.body.append(...wrap.children);
  }

  function initInteraction() {
    const hotspot = document.getElementById('mpSideHotspot');
    const menu = document.getElementById('mpSideMenu');
    if (!hotspot || !menu) return;

    let closeTimer = null;
    const open = () => {
      clearTimeout(closeTimer);
      document.body.classList.add('mp-side-open');
    };
    const scheduleClose = () => {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        if (!menu.matches(':hover') && !hotspot.matches(':hover') && !menu.contains(document.activeElement)) {
          document.body.classList.remove('mp-side-open');
        }
      }, 210);
    };

    hotspot.addEventListener('mouseenter', open);
    hotspot.addEventListener('mouseleave', scheduleClose);
    menu.addEventListener('mouseenter', open);
    menu.addEventListener('mouseleave', scheduleClose);
    menu.addEventListener('focusin', open);
    menu.addEventListener('focusout', scheduleClose);
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') document.body.classList.remove('mp-side-open');
    });
  }

  async function getUser() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user || null;
    } catch (_) {
      return null;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const user = await getUser();
    buildMenu(user);
    initInteraction();
  });
})();
