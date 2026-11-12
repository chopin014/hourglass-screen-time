// The "Time Allowance" block screen shown in place of a blocked website.

import { api, getMeta } from '../lib/store.js';
import { icon } from '../lib/icons.js';
import { esc, siteTile, actionSheet, passcodePad, installFaviconFallback } from '../lib/ui.js';
import { fmtClock, fmtDuration } from '../lib/time.js';

const q = new URLSearchParams(location.search);
const url = q.get('u') || '';
const domain = q.get('d') || '';
const reason = q.get('r') || 'allowance';
const label = q.get('n') || '';
const via = q.get('via') || '';

const $ = (id) => document.getElementById(id);

function paint(status) {
  const isContent = reason === 'content';
  $('symbol').innerHTML = icon(isContent ? 'restrict' : 'hourglass');
  $('symbol').classList.toggle('red', isContent);
  $('title').textContent = isContent ? 'Restricted Site' : 'Time Allowance';
  document.title = $('title').textContent;

  let msg;
  if (isContent) msg = `You cannot browse this page at “${domain}” because it is restricted.`;
  else if (reason === 'schedule') msg = 'This website can only be used during the scheduled time.';
  else msg = `You’ve used all your available time allowance${label ? ` for ${label}` : ''} today.`;
  $('msg').textContent = msg;
  $('ignore').textContent = isContent ? 'Allow Website' : 'Ignore Limit';

  let extra = '';
  if (status?.blocked && status.reason === 'schedule') {
    extra = status.windowName
      ? `${status.windowName} · until ${status.schedule?.window?.end || fmtClock(new Date(status.until))}`
      : `Available again at ${fmtClock(new Date(status.until))}`;
  } else if (status?.blocked && status.reason === 'allowance') {
    const l = status.limits.find((x) => x.remaining <= 0);
    if (l) extra = `${fmtDuration(l.usedSec)} of ${fmtDuration(l.limitSec)} used`;
  }
  $('extra').textContent = extra;
}

async function status() {
  try {
    return await api.runtime.sendMessage({ type: 'status', domain });
  } catch {
    return null;
  }
}

async function closeTab() {
  const tab = await api.tabs.getCurrent();
  const siblings = await api.tabs.query({ windowId: tab.windowId });
  if (siblings.length <= 1) await api.tabs.create({ windowId: tab.windowId });
  await api.tabs.remove(tab.id);
}

const reopen = () => location.replace(url);

async function askPasscode() {
  const r = await passcodePad([
    {
      title: 'Enter Screen Time Passcode',
      verify: async (code) => (await api.runtime.sendMessage({ type: 'verifyPasscode', code })) || 'Incorrect passcode. Try again.',
    },
  ]);
  return r ? r[0] : null;
}

async function ignore() {
  if (reason === 'content') {
    const st = await status();
    let code = '';
    if (st?.hasPasscode) {
      code = await askPasscode();
      if (!code) return;
    }
    const r = await api.runtime.sendMessage({ type: 'allowSite', domain, code });
    if (r?.ok) reopen();
    return;
  }

  const st = await status();
  if (st && !st.blocked) return reopen(); // limit changed in the meantime
  const needsCode = st?.hasPasscode && st?.blockAtEnd;
  const opts = [];
  if (!st?.minuteUsed) opts.push({ label: 'One More Minute', value: 'minute' });
  if (needsCode) opts.push({ label: 'Enter Screen Time Passcode', value: 'passcode' });
  else {
    opts.push({ label: 'Remind Me in 15 Minutes', value: 'remind15' });
    opts.push({ label: 'Ignore Limit for Today', value: 'today' });
  }
  opts.push({ label: 'Cancel', style: 'cancel' });

  let option = await actionSheet({ actions: opts });
  if (!option) return;
  let code;
  if (option === 'passcode') {
    code = await askPasscode();
    if (!code) return;
    option = await actionSheet({
      actions: [
        { label: 'Approve for 15 Minutes', value: 'approve15' },
        { label: 'Approve for an Hour', value: 'approve60' },
        { label: 'Approve All Day', value: 'approveDay' },
        { label: 'Cancel', style: 'cancel' },
      ],
    });
    if (!option) return;
  }
  const r = await api.runtime.sendMessage({ type: 'ignore', domain, option, code });
  if (r?.ok) reopen();
}

/**
 * Paint the warm/cool glow pixel by pixel with ±0.5 LSB random dither so dark
 * gradients don't show 8-bit banding rings (CSS gradients can't dither).
 */
function drawBackdrop() {
  const canvas = $('backdrop');
  const w = Math.max(1, Math.round(window.innerWidth));
  const h = Math.max(1, Math.round(window.innerHeight));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const base = [28, 28, 30];
  const glows = [
    { cx: 0.18, cy: 0.12, rx: 0.7, ry: 0.6, color: [150, 110, 80], alpha: 0.3, spread: 0.42 },
    { cx: 0.85, cy: 0.88, rx: 0.65, ry: 0.55, color: [80, 80, 140], alpha: 0.32, spread: 0.45 },
  ];
  let i = 0;
  for (let y = 0; y < h; y++) {
    const ny = y / h;
    for (let x = 0; x < w; x++, i += 4) {
      const nx = x / w;
      let r = base[0];
      let g = base[1];
      let b = base[2];
      for (const gl of glows) {
        const dx = (nx - gl.cx) / gl.rx;
        const dy = (ny - gl.cy) / gl.ry;
        const d = Math.sqrt(dx * dx + dy * dy) / gl.spread;
        const a = gl.alpha * Math.exp(-d * d);
        r += (gl.color[0] - r) * a;
        g += (gl.color[1] - g) * a;
        b += (gl.color[2] - b) * a;
      }
      const n = Math.random() - 0.5;
      px[i] = r + n;
      px[i + 1] = g + n;
      px[i + 2] = b + n;
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawBackdrop, 150);
});

async function setupDirect() {
  if (reason === 'content') return;
  let info;
  try {
    info = await api.runtime.sendMessage({ type: 'directInfo', url, reason, via });
  } catch {
    return;
  }
  if (!info?.supported) return;
  const note = $('directNote');
  const noun = info.noun.toLowerCase();
  if (info.offer) {
    const btn = $('direct');
    btn.innerHTML = `${icon('link')}${info.noun === 'Video' ? 'Watch This Video' : `Open This ${esc(info.noun)}`}`;
    btn.classList.remove('hidden');
    document.querySelector('.btns').classList.add('has-direct');
    note.textContent =
      info.left == null
        ? `Direct links open just this ${noun}. The rest of ${info.siteName} stays blocked.`
        : `${info.left} of ${info.perDay} direct link${info.perDay === 1 ? '' : 's'} left today. Only this ${noun} opens; the rest of ${info.siteName} stays blocked.`;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const r = await api.runtime.sendMessage({ type: 'directLink', url, reason }).catch(() => null);
      if (r?.ok) return reopen();
      btn.disabled = false;
      note.textContent = r?.error === 'quota' ? 'You’ve used all your direct links for today.' : 'This link can’t be opened.';
    });
  } else if (info.internal) {
    note.textContent = `Direct links only open the ${noun} that was shared, not the rest of ${info.siteName}.`;
  } else if (info.content && info.left === 0) {
    note.textContent = `You’ve used all ${info.perDay} direct link${info.perDay === 1 ? '' : 's'} for today.`;
  }
}

async function boot() {
  drawBackdrop();
  installFaviconFallback(document);
  paint(null);
  const meta = await getMeta().catch(() => ({}));
  $('site').innerHTML = domain ? `${siteTile(domain, meta, 'sm')}<span>${esc(domain)}</span>` : '';
  $('ok').addEventListener('click', closeTab);
  $('ignore').addEventListener('click', ignore);
  setupDirect();
  paint(await status());
}

boot();
