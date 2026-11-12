// Shared UI pieces: escaping, tiles, switches, steppers, sheets, alerts and
// the Screen Time passcode pad.

import { icon } from './icons.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ------------------------------------------------------------------ tiles

export function siteTile(domain, meta = {}, size = 'md') {
  const m = meta[domain] || {};
  const letter = esc((domain || '?').replace(/^www\./, '')[0] || '?');
  if (m.icon && /^(https?:|data:image\/)/.test(m.icon)) {
    return `<span class="tile site ${size}"><img class="favicon" src="${esc(m.icon)}" alt="" data-letter="${letter}" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="tile site ${size}"><span class="letter">${letter}</span></span>`;
}

/** Tile for an allowance item (category, single website or All Others). */
export function itemTile(item, meta = {}, size = 'md') {
  if (!item) return '';
  if (item.kind === 'site') return siteTile(item.domain, meta, size);
  return `<span class="tile c-${esc(item.color || 'gray')} ${size}">${icon(item.icon || 'others')}</span>`;
}

export function glyphTile(glyph, color, size = 'md') {
  return `<span class="tile c-${color} ${size}">${icon(glyph)}</span>`;
}

export function miniTiles(items, meta, max = 4) {
  const shown = items.slice(0, max).map((i) => itemTile(i, meta, 'sm')).join('');
  const more = items.length > max ? `<span class="more">+${items.length - max}</span>` : '';
  return `<span class="mini-tiles">${shown}${more}</span>`;
}

/** Replace broken favicons with a letter monogram (inline handlers aren't allowed by CSP). */
export function installFaviconFallback(root = document) {
  root.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.classList.contains('favicon')) return;
      const span = document.createElement('span');
      span.className = 'letter';
      span.textContent = img.dataset.letter || '?';
      img.replaceWith(span);
    },
    true,
  );
}

// ------------------------------------------------------------- controls

export function toggle(attrs = '', checked = false, disabled = false) {
  return `<label class="switch"><input type="checkbox" role="switch" ${attrs} ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="track"></span><span class="knob"></span></label>`;
}

export function stepper(attrs, canMinus, canPlus) {
  return `<div class="stepper">
    <button ${attrs} data-dir="-1" aria-label="Decrease" ${canMinus ? '' : 'disabled'}>${icon('minus')}</button>
    <span class="divider"></span>
    <button ${attrs} data-dir="1" aria-label="Increase" ${canPlus ? '' : 'disabled'}>${icon('plus')}</button>
  </div>`;
}

export const chevron = () => `<span class="chev">${icon('chevronRight')}</span>`;

// --------------------------------------------------------------- overlays

function mountOverlay(html, cls = '') {
  const el = document.createElement('div');
  el.className = `overlay ${cls}`;
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

function closeOverlay(el) {
  return new Promise((resolve) => {
    el.classList.add('closing');
    setTimeout(() => {
      el.remove();
      resolve();
    }, 170);
  });
}

/**
 * iOS action sheet.
 * actions: [{ label, value, style: 'destructive'|'cancel', disabled }]
 */
export function actionSheet({ title = '', message = '', actions = [] }) {
  return new Promise((resolve) => {
    const main = actions.filter((a) => a.style !== 'cancel');
    const cancel = actions.find((a) => a.style === 'cancel') || { label: 'Cancel', value: null };
    const btn = (a, i) =>
      `<button data-i="${i}" class="${a.style || ''}" ${a.disabled ? 'disabled' : ''}>${esc(a.label)}</button>`;
    const head = title || message ? `<div class="head">${title ? `<strong>${esc(title)}</strong>` : ''}${esc(message)}</div>` : '';
    const el = mountOverlay(`
      <div class="action-sheet" role="dialog" aria-modal="true">
        <div class="group">${head}${main.map((a) => btn(a, actions.indexOf(a))).join('')}</div>
        <div class="group"><button data-i="cancel" class="cancel">${esc(cancel.label)}</button></div>
      </div>`);
    const done = async (val) => {
      document.removeEventListener('keydown', onKey);
      await closeOverlay(el);
      resolve(val);
    };
    const onKey = (e) => e.key === 'Escape' && done(null);
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return e.target === el && done(null);
      done(b.dataset.i === 'cancel' ? cancel.value ?? null : actions[+b.dataset.i].value);
    });
    el.querySelector('button')?.focus();
  });
}

/**
 * iOS alert. buttons: [{ label, value, style: 'primary'|'destructive' }]
 * With `input`, resolves to { value, text }.
 */
export function alertDialog({ title, message = '', buttons = [{ label: 'OK', value: true, style: 'primary' }], input = null }) {
  return new Promise((resolve) => {
    const vertical = buttons.length > 2;
    const el = mountOverlay(
      `<div class="alert" role="alertdialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        ${message ? `<p>${esc(message)}</p>` : ''}
        ${input ? `<input type="text" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value || '')}" spellcheck="false" autocomplete="off">` : ''}
        <div class="btns ${vertical ? 'vertical' : ''}">
          ${buttons.map((b, i) => `<button data-i="${i}" class="${b.style || ''}">${esc(b.label)}</button>`).join('')}
        </div>
      </div>`,
      'center',
    );
    const field = el.querySelector('input');
    const done = async (val) => {
      document.removeEventListener('keydown', onKey);
      await closeOverlay(el);
      resolve(input ? { value: val, text: field.value.trim() } : val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') done(null);
      if (e.key === 'Enter' && field) {
        const primary = buttons.find((b) => b.style === 'primary');
        if (primary) done(primary.value);
      }
    };
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b) done(buttons[+b.dataset.i].value);
    });
    (field || el.querySelector('button.primary') || el.querySelector('button'))?.focus();
  });
}

/** Custom modal sheet. `render(el, close)` fills it; resolves with close(value). */
export function modalSheet(html, setup) {
  return new Promise((resolve) => {
    const el = mountOverlay(`<div class="modal-sheet" role="dialog" aria-modal="true">${html}</div>`, 'center');
    const close = async (val) => {
      document.removeEventListener('keydown', onKey);
      await closeOverlay(el);
      resolve(val);
    };
    const onKey = (e) => e.key === 'Escape' && close(null);
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', (e) => e.target === el && close(null));
    setup?.(el.querySelector('.modal-sheet'), close);
  });
}

// --------------------------------------------------------------- passcode

const KEYS = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['', ''], ['0', ''], ['', ''],
];

/**
 * Full-screen passcode pad.
 * steps: [{ title, subtitle, verify?: async (code, previous) => true | 'error message' }]
 * Resolves with the array of entered codes, or null if cancelled.
 */
export function passcodePad(steps, { length = 4 } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'passcode';
    el.setAttribute('role', 'dialog');
    el.innerHTML = `
      <h2 class="pc-title"></h2>
      <div class="sub pc-sub"></div>
      <div class="dots">${'<i></i>'.repeat(length)}</div>
      <div class="pad">${KEYS.map(([n, l]) =>
        n ? `<button data-n="${n}"><span class="n">${n}</span>${l ? `<span class="l">${l}</span>` : ''}</button>` : '<span class="blank"></span>',
      ).join('')}</div>
      <div class="foot"><span></span><button class="pc-cancel">Cancel</button></div>`;
    document.body.appendChild(el);

    let step = 0;
    let code = '';
    const codes = [];
    const dots = el.querySelector('.dots');
    const cancelBtn = el.querySelector('.pc-cancel');

    const paint = (err) => {
      el.querySelector('.pc-title').textContent = steps[step].title;
      el.querySelector('.pc-sub').textContent = err || steps[step].subtitle || '';
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i < code.length));
      cancelBtn.textContent = code.length ? 'Delete' : 'Cancel';
    };

    const finish = (val) => {
      document.removeEventListener('keydown', onKey);
      el.remove();
      resolve(val);
    };

    const press = async (n) => {
      if (code.length >= length) return;
      code += n;
      paint();
      if (code.length < length) return;
      const verdict = steps[step].verify ? await steps[step].verify(code, codes) : true;
      if (verdict === true) {
        codes.push(code);
        code = '';
        step += 1;
        if (step >= steps.length) return finish(codes);
        setTimeout(() => paint(), 120);
      } else {
        dots.classList.remove('shake');
        void dots.offsetWidth;
        dots.classList.add('shake');
        setTimeout(() => {
          code = '';
          paint(typeof verdict === 'string' ? verdict : 'Incorrect passcode. Try again.');
        }, 420);
      }
    };

    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) {
        el.querySelector(`[data-n="${e.key}"]`)?.classList.add('flash');
        setTimeout(() => el.querySelector(`[data-n="${e.key}"]`)?.classList.remove('flash'), 120);
        press(e.key);
      } else if (e.key === 'Backspace') {
        code = code.slice(0, -1);
        paint();
      } else if (e.key === 'Escape') finish(null);
    };
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-n]');
      if (b) press(b.dataset.n);
    });
    cancelBtn.addEventListener('click', () => {
      if (code.length) {
        code = code.slice(0, -1);
        paint();
      } else finish(null);
    });
    paint();
  });
}

// ------------------------------------------------------------- segmented

export function segmented(name, options, value) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return `<div class="segmented" role="tablist" style="--n:${options.length}">
    <span class="thumb" style="width:calc((100% - 8px) / ${options.length});transform:translateX(${idx * 100}%)"></span>
    ${options.map((o) => `<button role="tab" aria-selected="${o.value === value}" data-act="${name}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join('')}
  </div>`;
}
