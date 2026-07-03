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
          </div>
          <a class="mp-side-login" href="${routes.login}">로그인</a>
        </div>
      `;
    }

    const label = escapeHtml(user.displayName || user.email || 'MusicPlz User');
    const initial = escapeHtml(initials(user.displayName || user.email));
    return `
      <div class="mp-side-auth">
        <span class="mp-side-avatar">${initial}</span>
        <div class="mp-side-user">
          <b>${label}</b>
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
            <span><strong>MusicPlz</strong></span>
          </a>
          ${renderAuth(user)}
          <nav class="mp-side-nav" aria-label="주요 메뉴">
            <a class="mp-side-link" href="${routes.create}">
              <strong>만들기</strong>
            </a>
            <a class="mp-side-link" href="${routes.share}">
              <strong>플리공유</strong>
            </a>
            <a class="mp-side-link" href="${routes.ai}">
              <strong>AI평가</strong>
            </a>
          </nav>
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
