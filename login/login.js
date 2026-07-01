(() => {
  /* ─── 수학 헬퍼 (main.js와 동일 로직 공유) ─── */
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  function easeInOutCubic(t) {
    return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     페이지 전환 웨이브 (main.js와 동일 사양)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const waveEl   = document.getElementById('waveTransition');
  const wavePath = document.getElementById('wavePath');

  /* 현재 웨이브가 화면을 덮고 있는 상태인지 추적.
     이 페이지에 진입할 때 SVG 초기값 자체가 이미 화면 전체를
     덮은 상태이므로 true로 시작한다(아래 playWaveIntro가 곧바로 풀어줌). */
  let waveCovered = true;

  function setWave(p) {
    const e = easeInOutCubic(p);
    const topY    = 100 - e * 100;
    const waveAmp = 9 * Math.sin(e * Math.PI);
    const midY    = topY - waveAmp;

    wavePath.setAttribute(
      'd',
      `M0,100 L0,${topY} C25,${midY} 75,${midY} 100,${topY} L100,100 Z`
    );
  }

  function playWaveIntro() {
    waveEl.style.pointerEvents = 'auto';
    setWave(1);
    waveCovered = true;
    let start = null;
    const DURATION = 560;
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
    const DURATION = 620;
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

  /* 뒤로/앞으로가기로 이 페이지가 bfcache에서 그대로 복원된 경우
     (예: 홈으로 나갔다가 다시 뒤로가기로 로그인 화면에 돌아온 경우),
     전환 애니메이션이 화면을 덮은 채 멈춘 상태로 보일 수 있다.
     떠날 때 덮인 상태였다면 다시 풀어주는 인트로를 재생해 복구한다. */
  window.addEventListener('pageshow', e => {
    if (e.persisted && waveCovered) {
      playWaveIntro();
    }
  });

  const logoHome = document.getElementById('logoHome');
  logoHome.addEventListener('click', e => {
    e.preventDefault();
    playWaveExit(logoHome.getAttribute('href'));
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     로그인 ↔ 회원가입 모드 전환
     필드 구성은 거의 동일하고(닉네임만 추가) 라벨/문구만 바뀜
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  // URL에 ?mode=signup 이 붙어 있으면 회원가입 모드로 바로 시작 (기본은 로그인 모드)
  let mode = new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'login'; // 'login' | 'signup'

  const modeTagline      = document.getElementById('modeTagline');
  const modeHeading      = document.getElementById('modeHeading');
  const modeDescription  = document.getElementById('modeDescription');
  const nameField        = document.getElementById('nameField');
  const loginOnlyRow     = document.getElementById('loginOnlyRow');
  const passwordConfirmField = document.getElementById('passwordConfirmField');
  const submitLabel      = document.getElementById('submitLabel');
  const modeSwitchPrompt = document.getElementById('modeSwitchPrompt');
  const displayNameInput = document.getElementById('displayName');
  const displayNameError = document.getElementById('displayNameError');

  function applyMode() {
    if (mode === 'login') {
      modeTagline.textContent = 'Welcome Back';
      modeHeading.innerHTML = '다시 만나서<br><span class="gradient-text">반가워요.</span>';
      modeDescription.textContent = '계정에 로그인하고 나만의 플레이리스트를 이어가세요.';
      nameField.hidden = true;
      passwordConfirmField.hidden = true;
      loginOnlyRow.hidden = false;
      submitLabel.textContent = '로그인';
      modeSwitchPrompt.innerHTML = '아직 계정이 없으신가요? <a href="#" id="modeSwitchLink">무료로 시작하기</a>';
    } else {
      modeTagline.textContent = 'Get Started';
      modeHeading.innerHTML = '취향을 발견할<br><span class="gradient-text">시간이에요.</span>';
      modeDescription.textContent = '이메일만으로 30초 안에 가입하고 바로 시작해보세요.';
      nameField.hidden = false;
      passwordConfirmField.hidden = false;
      loginOnlyRow.hidden = true;
      submitLabel.textContent = '무료로 시작하기';
      modeSwitchPrompt.innerHTML = '이미 계정이 있으신가요? <a href="#" id="modeSwitchLink">로그인하기</a>';
    }
    // innerHTML로 새로 만든 링크에 이벤트 다시 연결
    document.getElementById('modeSwitchLink').addEventListener('click', onModeSwitchClick);
    clearServerError();
  }

  function onModeSwitchClick(e) {
    e.preventDefault();
    mode = mode === 'login' ? 'signup' : 'login';
    applyMode();
  }
  document.getElementById('modeSwitchLink').addEventListener('click', onModeSwitchClick);

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     비밀번호 표시 토글
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const pwInput   = document.getElementById('password');
  const togglePw  = document.getElementById('togglePw');
  const eyeIcon   = document.getElementById('eyeIcon');

  const EYE_OPEN   = 'M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 11a4 4 0 110-8 4 4 0 010 8z';
  const EYE_CLOSED = 'M3.27 2 2 3.27l3.06 3.06C3.45 7.85 2.3 9.6 2 10c0 0 3 7 10 7 1.9 0 3.5-.4 4.86-1.05L20.73 22 22 20.73 3.27 2zM12 15a3 3 0 01-3-3c0-.4.08-.78.22-1.13l1.5 1.5A1.5 1.5 0 0012 14a1.5 1.5 0 001.13-.5l1.5 1.5c-.35.14-.73.22-1.13.22h-1.5zm9.93-5S19 3 12 3c-.96 0-1.84.13-2.64.35l1.7 1.7c.3-.03.6-.05.94-.05 5.16 0 7.74 4.35 8.35 5.5-.2.37-.6 1.02-1.2 1.74l1.42 1.42c1.1-1.27 1.66-2.4 1.66-2.4z';

  togglePw.addEventListener('click', () => {
    const showing = pwInput.type === 'text';
    pwInput.type = showing ? 'password' : 'text';
    eyeIcon.querySelector('path').setAttribute('d', showing ? EYE_OPEN : EYE_CLOSED);
    togglePw.setAttribute('aria-label', showing ? '비밀번호 표시' : '비밀번호 숨기기');
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     클라이언트 측 유효성 검사
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const form          = document.getElementById('authForm');
  const emailInput    = document.getElementById('email');
  const emailError    = document.getElementById('emailError');
  const passwordError = document.getElementById('passwordError');
  const passwordConfirmInput = document.getElementById('passwordConfirm');
  const passwordConfirmError = document.getElementById('passwordConfirmError');
  const submitBtn     = document.getElementById('submitBtn');
  const serverError   = document.getElementById('serverError');
  const captchaField  = document.getElementById('captchaField');
  const captchaError  = document.getElementById('captchaError');
  const turnstileWidget = document.getElementById('turnstileWidget');

  let turnstileEnabled = false;
  let turnstileWidgetId = null;
  let turnstileToken = '';

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const DISPLAY_NAME_RE = /^[0-9A-Za-z가-힣_.-]+$/;
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

  function normalizedDisplayName() {
    return displayNameInput.value.trim().replace(/\s+/g, ' ');
  }

  function setFieldError(input, errorEl, msg) {
    input.classList.toggle('has-error', !!msg);
    errorEl.textContent = msg || '';
  }

  function clearServerError() {
    serverError.hidden = true;
    serverError.textContent = '';
  }

  function setCaptchaError(msg) {
    if (!captchaError) return;
    captchaError.textContent = msg || '';
  }

  // 정적 HTML은 로그인 모드 기준으로 작성돼 있으므로,
  // ?mode=signup으로 들어온 경우 회원가입 모드 화면으로 맞춰준다
  applyMode();

  function showServerError(msg) {
    serverError.hidden = false;
    serverError.textContent = msg;
  }

  function loadTurnstileScript() {
    return new Promise((resolve, reject) => {
      if (window.turnstile) return resolve();

      const existing = document.querySelector('script[data-turnstile]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = '1';
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function initCaptcha() {
    try {
      const res = await fetch('/api/auth/security-config', { credentials: 'same-origin' });
      const config = await res.json();
      if (!config.turnstileEnabled || !config.turnstileSiteKey) return;

      turnstileEnabled = true;
      captchaField.hidden = false;
      await loadTurnstileScript();

      turnstileWidgetId = window.turnstile.render(turnstileWidget, {
        sitekey: config.turnstileSiteKey,
        theme: 'light',
        callback: token => {
          turnstileToken = token;
          setCaptchaError('');
        },
        'expired-callback': () => {
          turnstileToken = '';
          setCaptchaError('보안 확인이 만료됐어요. 다시 확인해주세요.');
        },
        'error-callback': () => {
          turnstileToken = '';
          setCaptchaError('보안 확인을 불러오지 못했어요. 새로고침 후 다시 시도해주세요.');
        },
      });
    } catch (err) {
      turnstileEnabled = false;
      captchaField.hidden = true;
      console.warn('[Turnstile 초기화 실패]', err);
    }
  }

  function resetCaptcha() {
    turnstileToken = '';
    if (turnstileEnabled && window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
  }

  function validate() {
    let ok = true;

    if (mode === 'signup') {
      const displayName = normalizedDisplayName();
      if (!displayName) {
        setFieldError(displayNameInput, displayNameError, '닉네임을 입력해주세요.');
        ok = false;
      } else if (displayName.length < 2) {
        setFieldError(displayNameInput, displayNameError, '닉네임은 2자 이상이어야 해요.');
        ok = false;
      } else if (displayName.length > 20) {
        setFieldError(displayNameInput, displayNameError, '닉네임은 20자 이하로 입력해주세요.');
        ok = false;
      } else if (!DISPLAY_NAME_RE.test(displayName)) {
        setFieldError(displayNameInput, displayNameError, '닉네임은 한글, 영문, 숫자, _, ., - 만 사용할 수 있어요.');
        ok = false;
      } else {
        setFieldError(displayNameInput, displayNameError, '');
      }
    }

    if (!emailInput.value.trim()) {
      setFieldError(emailInput, emailError, '이메일을 입력해주세요.');
      ok = false;
    } else if (!EMAIL_RE.test(emailInput.value.trim())) {
      setFieldError(emailInput, emailError, '올바른 이메일 형식이 아니에요.');
      ok = false;
    } else {
      setFieldError(emailInput, emailError, '');
    }

    if (!pwInput.value) {
      setFieldError(pwInput, passwordError, '비밀번호를 입력해주세요.');
      ok = false;
    } else if (pwInput.value.length < 8) {
      setFieldError(pwInput, passwordError, '비밀번호는 8자 이상이어야 해요.');
      ok = false;
    } else if (pwInput.value.length > 72) {
      setFieldError(pwInput, passwordError, '비밀번호는 72자 이하로 입력해주세요.');
      ok = false;
    } else if (mode === 'signup' && (!/[A-Za-z]/.test(pwInput.value) || !/\d/.test(pwInput.value))) {
      setFieldError(pwInput, passwordError, '비밀번호는 영문과 숫자를 모두 포함해야 해요.');
      ok = false;
    } else {
      setFieldError(pwInput, passwordError, '');
    }

    if (mode === 'signup') {
      if (!passwordConfirmInput.value) {
        setFieldError(passwordConfirmInput, passwordConfirmError, '비밀번호 확인을 입력해주세요.');
        ok = false;
      } else if (passwordConfirmInput.value !== pwInput.value) {
        setFieldError(passwordConfirmInput, passwordConfirmError, '비밀번호가 일치하지 않아요.');
        ok = false;
      } else {
        setFieldError(passwordConfirmInput, passwordConfirmError, '');
      }
    }

    if (turnstileEnabled && !turnstileToken) {
      setCaptchaError('보안 확인을 완료해주세요.');
      ok = false;
    }

    return ok;
  }

  [displayNameInput, emailInput, pwInput, passwordConfirmInput].forEach(input => {
    input.addEventListener('input', () => {
      const errEl = input === displayNameInput
        ? displayNameError
        : input === emailInput
          ? emailError
          : input === passwordConfirmInput
            ? passwordConfirmError
            : passwordError;
      setFieldError(input, errEl, '');
      clearServerError();
    });
  });

  function setLoading(isLoading, loadingText) {
    submitBtn.classList.toggle('is-loading', isLoading);
    submitBtn.disabled = isLoading;
    if (isLoading) {
      submitLabel.innerHTML = `<span class="spinner" style="display:inline-block"></span> ${loadingText}`;
    } else {
      submitLabel.textContent = mode === 'login' ? '로그인' : '무료로 시작하기';
    }
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     API 호출
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  async function callAuthApi(path, payload) {
    const csrfToken = await getCsrfToken();
    const res = await fetch(`/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      credentials: 'same-origin', // 세션 쿠키 송수신
      body: JSON.stringify(payload),
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* 빈 응답일 수 있음 */ }
    if (!res.ok) {
      throw new Error(data.error || '요청 처리 중 문제가 발생했어요.');
    }
    return data;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearServerError();
    if (!validate()) return;

    const payload = {
      email: emailInput.value.trim(),
      password: pwInput.value,
    };
    if (turnstileEnabled) {
      payload.turnstileToken = turnstileToken;
    }
    if (mode === 'signup') {
      payload.displayName = normalizedDisplayName();
    }

    setLoading(true, mode === 'login' ? '로그인 중…' : '가입 중…');

    try {
      await callAuthApi(mode === 'login' ? 'login' : 'signup', payload);

      // 성공 시 보라색 웨이브로 전환하며 홈으로 이동
      playWaveExit('../main/main.html');
    } catch (err) {
      setLoading(false);
      resetCaptcha();
      showServerError(err.message);
    }
  });

  initCaptcha();
})();
