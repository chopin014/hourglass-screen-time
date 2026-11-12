// Live "time left" glass pill shown on websites that have a Time Allowance.
// Isolated in a closed shadow root so page CSS can't touch it.
(() => {
  if (window.top !== window || window.__screenTimeTimer) return;
  window.__screenTimeTimer = true;
  const api = globalThis.browser;
  if (!api?.runtime?.id) return;

  const MARGIN = 14;
  const SYNC_MS = 10_000;
  const FULLSCREEN_SHOW_SEC = 300; // in fullscreen, only appear for the last 5 minutes
  const R = 8;
  const CIRC = 2 * Math.PI * R;
  const pad = (n) => String(n).padStart(2, '0');

  let prefs = { enabled: true, onlyLast: false };
  let corner = 'tr';
  let mode = null; // 'limit' | 'grant' | null
  let remaining = 0;
  let total = 1;
  let grantUntil = 0;
  let name = '';
  let lastTick = performance.now();
  let dismissed = false;
  let host;
  let pill;
  let els = {};

  const CSS = `
    :host { all: initial; }
    .pill {
      position: fixed;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 7px;
      height: 34px;
      padding: 0 12px 0 7px;
      border-radius: 17px;
      box-sizing: border-box;
      font: 600 14px/1 -apple-system, BlinkMacSystemFont, 'SF Pro Text', ScreenTimeInter, system-ui, sans-serif;
      font-variant-numeric: tabular-nums;
      font-feature-settings: 'tnum', 'cv11';
      letter-spacing: -0.01em;
      -webkit-font-smoothing: antialiased;
      color: rgba(255, 255, 255, 0.96);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.02) 60%),
        rgba(28, 28, 30, 0.68);
      backdrop-filter: blur(22px) saturate(190%) brightness(1.05);
      border: 0.5px solid rgba(255, 255, 255, 0.24);
      box-shadow:
        0 12px 32px -8px rgba(0, 0, 0, 0.42),
        0 2px 6px rgba(0, 0, 0, 0.14),
        inset 0 1px 0 rgba(255, 255, 255, 0.32),
        inset 0 -0.5px 0 rgba(255, 255, 255, 0.1);
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      opacity: 1;
      transform-origin: var(--origin, top right);
      transition:
        transform 0.5s cubic-bezier(0.2, 1.3, 0.4, 1),
        box-shadow 0.3s, opacity 0.3s,
        left 0.5s cubic-bezier(0.2, 1.15, 0.35, 1), top 0.5s cubic-bezier(0.2, 1.15, 0.35, 1);
      animation: appear 0.6s cubic-bezier(0.2, 1.25, 0.35, 1) both;
      --accent: rgba(255, 255, 255, 0.95);
      --track: rgba(255, 255, 255, 0.2);
    }
    .pill::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: radial-gradient(120% 90% at 25% -30%, rgba(255, 255, 255, 0.32), transparent 55%);
      pointer-events: none;
    }
    @keyframes appear {
      from { opacity: 0; transform: scale(0.55); filter: blur(8px); }
      to { opacity: 1; transform: none; filter: none; }
    }
    .pill.leaving { opacity: 0; transform: scale(0.7); transition-duration: 0.25s; }
    .pill.dragging {
      cursor: grabbing;
      transition: transform 0.25s cubic-bezier(0.2, 1.3, 0.4, 1), box-shadow 0.25s;
      transform: scale(1.07);
      box-shadow: 0 22px 48px -10px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.34);
    }
    .pill:active:not(.dragging) { transform: scale(0.97); }
    .ring { width: 20px; height: 20px; flex: none; transform: rotate(-90deg); position: relative; }
    .ring circle { fill: none; stroke-width: 2.6; }
    .track { stroke: var(--track); }
    .fg {
      stroke: var(--accent);
      stroke-linecap: round;
      stroke-dasharray: ${CIRC.toFixed(3)};
      transition: stroke-dashoffset 1s linear, stroke 0.4s;
    }
    .time { min-width: 4ch; text-align: left; position: relative; }
    .label {
      max-width: 0;
      opacity: 0;
      overflow: hidden;
      white-space: nowrap;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.66);
      margin-left: -7px;
      transition: max-width 0.5s cubic-bezier(0.2, 1, 0.3, 1), opacity 0.25s, margin 0.5s cubic-bezier(0.2, 1, 0.3, 1);
      position: relative;
    }
    .close {
      all: unset;
      box-sizing: border-box;
      width: 0;
      height: 18px;
      margin-left: -7px;
      border-radius: 9px;
      display: grid;
      place-items: center;
      overflow: hidden;
      opacity: 0;
      cursor: pointer;
      background: rgba(255, 255, 255, 0.18);
      color: inherit;
      transition: width 0.45s cubic-bezier(0.2, 1, 0.3, 1), opacity 0.2s, margin 0.45s cubic-bezier(0.2, 1, 0.3, 1), background 0.15s;
      position: relative;
    }
    .close svg { width: 8px; height: 8px; flex: none; }
    .close:hover { background: rgba(255, 255, 255, 0.3); }
    .pill:hover .label, .pill:focus-within .label { max-width: 220px; opacity: 1; margin-left: 0; }
    .pill:hover .close, .pill:focus-within .close { width: 18px; opacity: 1; margin-left: 2px; }
    .pill.dragging .label, .pill.dragging .close { max-width: 0; width: 0; opacity: 0; margin-left: -7px; }
    .pill[data-level='warn'] { --accent: #ff9f0a; }
    .pill[data-level='crit'] { --accent: #ff453a; }
    .pill[data-level='crit'] .ring { animation: pulse 1.2s ease-in-out infinite; }
    .pill[data-mode='grant'] { --accent: #64d2ff; }
    @keyframes pulse { 0%, 100% { transform: rotate(-90deg) scale(1); } 50% { transform: rotate(-90deg) scale(1.14); } }
    .pill.paused .time { opacity: 0.6; }
    @media (prefers-color-scheme: light) {
      .pill {
        color: rgba(0, 0, 0, 0.86);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.4) 60%),
          rgba(246, 246, 248, 0.66);
        border-color: rgba(255, 255, 255, 0.85);
        box-shadow:
          0 12px 32px -8px rgba(0, 0, 0, 0.22),
          0 1px 4px rgba(0, 0, 0, 0.08),
          0 0 0 0.5px rgba(0, 0, 0, 0.06),
          inset 0 1px 0 rgba(255, 255, 255, 0.95);
        --accent: rgba(0, 0, 0, 0.82);
        --track: rgba(0, 0, 0, 0.12);
      }
      .pill::before { background: radial-gradient(120% 90% at 25% -30%, rgba(255, 255, 255, 0.8), transparent 55%); }
      .label { color: rgba(0, 0, 0, 0.55); }
      .close { background: rgba(0, 0, 0, 0.08); }
      .close:hover { background: rgba(0, 0, 0, 0.14); }
      .pill[data-mode='grant'] { --accent: #0a84ff; }
    }
    @media (prefers-reduced-motion: reduce) {
      .pill, .label, .close, .fg { transition: none; animation: none; }
    }
  `;

  // ----------------------------------------------------------------- DOM

  function loadFont() {
    try {
      const face = new FontFace('ScreenTimeInter', `url(${api.runtime.getURL('src/fonts/InterVariable.woff2')})`, { weight: '100 900' });
      document.fonts.add(face);
      face.load().catch(() => {});
    } catch {
      /* fall back to system fonts */
    }
  }

  const svg = (tag, attrs) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  function build() {
    host = document.createElement('screen-time-timer');
    // A manual popover lives in the browser's top layer: above every page overlay,
    // and — when re-shown after fullscreen starts — above fullscreen video too.
    host.setAttribute('popover', 'manual');
    host.style.cssText = [
      'all: initial !important', 'position: fixed !important', 'inset: 0 auto auto 0 !important',
      'width: 0 !important', 'height: 0 !important', 'margin: 0 !important', 'padding: 0 !important',
      'border: 0 !important', 'background: transparent !important', 'overflow: visible !important',
      'z-index: 2147483647 !important',
    ].join(';');
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;

    pill = document.createElement('div');
    pill.className = 'pill';
    pill.setAttribute('role', 'timer');
    pill.setAttribute('aria-live', 'off');

    const ring = svg('svg', { class: 'ring', viewBox: '0 0 20 20', 'aria-hidden': 'true' });
    ring.append(svg('circle', { class: 'track', cx: 10, cy: 10, r: R }));
    const fg = svg('circle', { class: 'fg', cx: 10, cy: 10, r: R });
    ring.append(fg);

    const time = document.createElement('span');
    time.className = 'time';
    const label = document.createElement('span');
    label.className = 'label';

    const close = document.createElement('button');
    close.className = 'close';
    close.title = 'Hide on this page';
    close.setAttribute('aria-label', 'Hide timer on this page');
    const x = svg('svg', { viewBox: '0 0 10 10', 'aria-hidden': 'true' });
    x.append(svg('path', { d: 'M1.5 1.5l7 7M8.5 1.5l-7 7', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round' }));
    close.append(x);

    pill.append(ring, time, label, close);
    root.append(style, pill);
    els = { fg, time, label, close };

    close.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissed = true;
      unmount();
    });
    close.addEventListener('pointerdown', (e) => e.stopPropagation());
    setupDrag();
  }

  const secondsLeft = () => (mode === 'grant' ? Math.max(0, (grantUntil - Date.now()) / 1000) : remaining);
  /**
   * Where the pill lives. In fullscreen Firefox paints only the fullscreen
   * element's subtree, so we go inside it; a raw <video>/<iframe> can't hold
   * children, in which case we stay hidden.
   */
  function container() {
    const fsEl = document.fullscreenElement;
    if (!fsEl) return document.documentElement;
    if (/^(VIDEO|AUDIO|IMG|CANVAS|IFRAME|EMBED|OBJECT)$/.test(fsEl.tagName) || fsEl.shadowRoot) return null;
    return fsEl;
  }
  const allowedNow = () => !document.fullscreenElement || (secondsLeft() <= FULLSCREEN_SHOW_SEC && !!container());
  const isOpen = () => {
    try {
      return host.matches(':popover-open');
    } catch {
      return host.isConnected;
    }
  };

  /** (Re)insert into the top layer so we stack above whatever entered it last (e.g. fullscreen). */
  function raise() {
    try {
      if (isOpen()) host.hidePopover();
      host.showPopover();
    } catch {
      /* popover unsupported: plain fixed element */
    }
  }

  function mount() {
    if (dismissed || !allowedNow()) return;
    if (!host) build();
    pill.classList.remove('leaving');
    const parent = container();
    if (host.parentNode !== parent) {
      parent.appendChild(host); // moving closes the popover; raise() below reopens it
      place(corner, false);
    }
    if (!isOpen()) raise();
  }

  function unmount() {
    if (!host?.isConnected) return;
    pill.classList.add('leaving');
    setTimeout(() => {
      if (!host.isConnected || !pill.classList.contains('leaving')) return;
      try {
        if (isOpen()) host.hidePopover();
      } catch {
        /* ignore */
      }
      host.remove();
    }, 260);
  }

  function shouldShow() {
    if (!mode || dismissed) return false;
    if (prefs.onlyLast && mode === 'limit' && remaining > 600) return false;
    return allowedNow();
  }

  function reconcile() {
    if (shouldShow()) mount();
    else unmount();
  }

  // ------------------------------------------------------------ position

  function anchor(c) {
    const s = pill.style;
    s.left = s.right = s.top = s.bottom = 'auto';
    s[c[0] === 't' ? 'top' : 'bottom'] = `${MARGIN}px`;
    s[c[1] === 'r' ? 'right' : 'left'] = `${MARGIN}px`;
    pill.style.setProperty('--origin', `${c[0] === 't' ? 'top' : 'bottom'} ${c[1] === 'r' ? 'right' : 'left'}`);
  }

  function place(c, animate) {
    if (!animate) return anchor(c);
    // Animate from the current pixel position to the corner, then re-anchor.
    const r = pill.getBoundingClientRect();
    const tx = c[1] === 'r' ? window.innerWidth - r.width - MARGIN : MARGIN;
    const ty = c[0] === 't' ? MARGIN : window.innerHeight - r.height - MARGIN;
    pill.style.right = pill.style.bottom = 'auto';
    pill.style.left = `${r.left}px`;
    pill.style.top = `${r.top}px`;
    void pill.offsetWidth;
    pill.style.left = `${tx}px`;
    pill.style.top = `${ty}px`;
    const done = () => {
      pill.removeEventListener('transitionend', done);
      if (!pill.classList.contains('dragging')) anchor(c);
    };
    pill.addEventListener('transitionend', done);
    setTimeout(done, 700);
  }

  function setupDrag() {
    let start = null;
    pill.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = pill.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: false };
      pill.setPointerCapture(e.pointerId);
    });
    pill.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) < 4) return;
      if (!start.moved) {
        start.moved = true;
        pill.classList.add('dragging');
        pill.style.right = pill.style.bottom = 'auto';
      }
      pill.style.left = `${start.left + dx}px`;
      pill.style.top = `${start.top + dy}px`;
    });
    const end = (e) => {
      if (!start) return;
      const moved = start.moved;
      start = null;
      try {
        pill.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (!moved) return;
      const r = pill.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      corner = `${cy < window.innerHeight / 2 ? 't' : 'b'}${cx < window.innerWidth / 2 ? 'l' : 'r'}`;
      pill.classList.remove('dragging');
      place(corner, true);
      api.storage.local.set({ timerCorner: corner }).catch(() => {});
    };
    pill.addEventListener('pointerup', end);
    pill.addEventListener('pointercancel', end);
  }

  // -------------------------------------------------------------- render

  function fmt(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  const counting = () => document.visibilityState === 'visible' && document.hasFocus();

  function render() {
    if (!mode || !host?.isConnected) return;
    const left = mode === 'grant' ? Math.max(0, (grantUntil - Date.now()) / 1000) : remaining;
    els.time.textContent = fmt(left);
    const frac = mode === 'grant' ? 1 : Math.max(0, Math.min(1, left / total));
    els.fg.style.strokeDashoffset = String(CIRC * (1 - frac));
    pill.dataset.mode = mode;
    pill.dataset.level = mode === 'limit' ? (left <= 60 ? 'crit' : left <= 300 ? 'warn' : 'ok') : 'ok';
    pill.classList.toggle('paused', mode === 'limit' && !counting());
    els.label.textContent = name;
    pill.setAttribute('aria-label', `${fmt(left)} left${name ? ` for ${name}` : ''}`);
  }

  function tick() {
    const now = performance.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    if (mode === 'limit' && counting()) remaining = Math.max(0, remaining - dt);
    if (mode) reconcile(); // e.g. crossing 5 minutes left while in fullscreen
    render();
  }

  // ---------------------------------------------------------------- data

  function apply(st) {
    if (!prefs.enabled || !st || st.blocked || st.alwaysAllowed) {
      mode = null;
      return unmount();
    }
    if (st.granted) {
      mode = 'grant';
      grantUntil = st.granted.until;
      name = 'Limit ignored';
    } else if (st.remaining != null && st.limits?.length) {
      const l = st.limits.reduce((a, b) => (a.remaining <= b.remaining ? a : b));
      mode = 'limit';
      remaining = l.remaining;
      total = Math.max(1, l.limitSec);
      name = l.shared ? 'Shared Time Allowance' : l.name;
    } else {
      mode = null;
      return unmount();
    }
    reconcile();
    render();
  }

  let syncing = false;
  async function sync() {
    if (syncing || document.visibilityState !== 'visible') return;
    syncing = true;
    try {
      const st = await api.runtime.sendMessage({ type: 'status', domain: location.hostname });
      lastTick = performance.now();
      apply(st);
    } catch {
      /* extension reloading */
    } finally {
      syncing = false;
    }
  }

  async function loadPrefs() {
    const { settings, timerCorner } = await api.storage.local.get(['settings', 'timerCorner']);
    prefs = { enabled: true, onlyLast: false, ...(settings?.timer || {}) };
    if (/^[tb][lr]$/.test(timerCorner || '')) corner = timerCorner;
  }

  // ---------------------------------------------------------------- boot

  async function boot() {
    await loadPrefs().catch(() => {});
    loadFont();
    await sync();
    setInterval(tick, 1000);
    setInterval(sync, SYNC_MS);
    document.addEventListener('visibilitychange', () => {
      lastTick = performance.now();
      if (document.visibilityState === 'visible') sync();
    });
    window.addEventListener('focus', () => {
      lastTick = performance.now();
      sync();
    });
    document.addEventListener('fullscreenchange', () => {
      lastTick = performance.now();
      // Entering fullscreen closes popovers; re-raise after the browser has settled.
      setTimeout(() => {
        if (!shouldShow()) return unmount();
        mount();
        raise();
        render();
      }, 120);
    });
    window.addEventListener('resize', () => host?.isConnected && anchor(corner));
    api.storage.onChanged.addListener(async (ch, area) => {
      if (area !== 'local') return;
      if (ch.settings) {
        await loadPrefs().catch(() => {});
        sync();
      }
      if (ch.timerCorner && ch.timerCorner.newValue !== corner && host?.isConnected) {
        corner = ch.timerCorner.newValue;
        place(corner, true);
      }
    });
  }

  boot();
})();
