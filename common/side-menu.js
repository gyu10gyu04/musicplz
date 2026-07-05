(() => {
  const currentPath = location.pathname.replace(/\/+$/, '');
  const items = [
    {
      title: '메인',
      href: '../main/main.html',
      match: '/main/main.html',
      icon: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-5h5v5"/>'
    },
    {
      title: '플리 만들기',
      href: '../create/create.html',
      match: '/create/create.html',
      icon: '<path d="M12 5v14"/><path d="M5 12h14"/><path d="M16.5 7.5c1.7.7 3 2.4 3 4.5s-1.3 3.8-3 4.5"/>'
    },
    {
      title: '플레이리스트 공유',
      href: '../playlist-share/playlist-share.html',
      match: '/playlist-share/playlist-share.html',
      icon: '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 9h8"/><path d="M8 13h5"/>'
    },
    {
      title: 'AI 분석',
      href: '../ai-chat/ai-chat.html',
      match: '/ai-chat/ai-chat.html',
      icon: '<path d="M12 3v3"/><path d="M12 18v3"/><path d="M4.8 7.2 7 9.4"/><path d="M17 14.6l2.2 2.2"/><rect x="7" y="7" width="10" height="10" rx="3"/><path d="M10 12h4"/>'
    },
  ];

  const authIcon = '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>';

  function icon(svg) {
    return `<span class="mp-side-menu__icon"><svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg></span>`;
  }

  function createToggle() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mp-menu-toggle';
    button.setAttribute('aria-label', '왼쪽 메뉴 열기');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'mpSideMenu');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg><span>메뉴</span>';
    return button;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    }[char]));
  }

  function initial(value) {
    const text = String(value || '').trim();
    return text ? text[0].toUpperCase() : '?';
  }

  function createMenu() {
    const active = items.map(item => ({ ...item, active: currentPath.endsWith(item.match) }));
    const aside = document.createElement('aside');
    aside.className = 'mp-side-menu';
    aside.id = 'mpSideMenu';
    aside.setAttribute('aria-label', '사이트 메뉴');
    aside.innerHTML = `
      <div class="mp-side-menu__head">
        <button type="button" class="mp-side-menu__close" aria-label="왼쪽 메뉴 닫기">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>
          <span>메뉴</span>
        </button>
      </div>
      <div class="mp-side-menu__nav">
        ${active.map(item => `
          <a class="mp-side-menu__link${item.active ? ' is-active' : ''}" href="${item.href}"${item.active ? ' aria-current="page"' : ''}>
            ${icon(item.icon)}
            <span class="mp-side-menu__text"><strong>${item.title}</strong></span>
          </a>
        `).join('')}
      </div>
      <div class="mp-side-menu__auth" id="mpSideMenuAuth">
        <a class="mp-side-menu__link mp-side-menu__login" href="../login/login.html"${currentPath.endsWith('/login/login.html') ? ' aria-current="page"' : ''}>
          ${icon(authIcon)}
          <span class="mp-side-menu__text"><strong>로그인</strong></span>
        </a>
      </div>
    `;
    return aside;
  }

  function renderUser(user) {
    const auth = document.getElementById('mpSideMenuAuth');
    if (!auth || !user) return;

    const label = user.displayName || user.email || '사용자';
    auth.innerHTML = `
      <a class="mp-side-menu__profile" href="../main/main.html">
        <span class="mp-side-menu__avatar">${escapeHtml(initial(label))}</span>
        <span class="mp-side-menu__profile-name">${escapeHtml(label)}</span>
      </a>
    `;
  }

  async function updateAuth() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.user) renderUser(data.user);
    } catch (_) {
      // Static previews can run without the auth server.
    }
  }

  function attachToggle(toggle) {
    const bar = document.querySelector('header.topbar') || document.querySelector('nav');
    const brand = bar?.querySelector('.logo, .brand');
    if (!bar || !brand) return false;

    const group = document.createElement('div');
    group.className = 'mp-nav-left';
    bar.insertBefore(group, brand);
    group.append(toggle, brand);
    return true;
  }

  function setOpen(open, toggle) {
    document.body.classList.toggle('mp-menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '왼쪽 메뉴 닫기' : '왼쪽 메뉴 열기');
  }

  function init() {
    if (document.getElementById('mpSideMenu')) return;

    const toggle = createToggle();
    if (!attachToggle(toggle)) return;

    const menu = createMenu();
    document.body.prepend(menu);

    const close = menu.querySelector('.mp-side-menu__close');
    setOpen(false, toggle);
    updateAuth();

    toggle.addEventListener('click', () => {
      setOpen(!document.body.classList.contains('mp-menu-open'), toggle);
    });
    close?.addEventListener('click', () => setOpen(false, toggle));
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') setOpen(false, toggle);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
