// Activity report maths + the stacked bar chart used by the dashboard and popup.

import { reportCategoryOf, REPORT_CATEGORY_BY_ID } from './categories.js';
import { getDays } from './store.js';
import { addDays, dayKey, startOfDay, startOfWeek, fmtDuration, WEEKDAY_LETTERS } from './time.js';
import { esc } from './ui.js';

const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);

/** Period descriptor for Day/Week views. offset: 0 = current, -1 = previous… */
export function period(view, offset, now = new Date()) {
  if (view === 'day') {
    const date = addDays(startOfDay(now), offset);
    return { view, offset, start: date, keys: [dayKey(date)] };
  }
  const start = addDays(startOfWeek(now), offset * 7);
  return { view, offset, start, keys: Array.from({ length: 7 }, (_, i) => dayKey(addDays(start, i))) };
}

/** Days elapsed in the period (for "Daily Average" of the current week). */
export function elapsedDays(p, now = new Date()) {
  if (p.view === 'day') return 1;
  const today = startOfDay(now);
  if (today < p.start) return 0;
  const diff = Math.floor((today - p.start) / 86_400_000) + 1;
  return Math.min(7, Math.max(1, diff));
}

export async function loadPeriod(p) {
  return getDays(p.keys);
}

/**
 * Build the report for a period.
 * filter(domain) narrows it to one site or category (detail pages).
 */
export function buildReport(settings, p, days, filter = null) {
  const overrides = settings.siteCategories || {};
  const catOf = (d) => reportCategoryOf(d, overrides);
  const keep = (d) => !filter || filter(d);

  const siteTotals = {};
  const catTotals = {};
  const firstUsed = {};
  const notifs = {};
  let pickups = 0;
  let notifTotal = 0;
  let firstPickupAt = null;

  for (const k of p.keys) {
    const day = days[k];
    for (const [d, s] of Object.entries(day.sites)) {
      if (!keep(d)) continue;
      siteTotals[d] = (siteTotals[d] || 0) + s;
      const c = catOf(d);
      catTotals[c] = (catTotals[c] || 0) + s;
    }
    for (const [d, n] of Object.entries(day.firstUsed)) if (keep(d)) firstUsed[d] = (firstUsed[d] || 0) + n;
    for (const [d, n] of Object.entries(day.notifs)) {
      if (!keep(d)) continue;
      notifs[d] = (notifs[d] || 0) + n;
      notifTotal += n;
    }
    pickups += filter ? 0 : day.pickups;
    if (day.firstPickupAt && !firstPickupAt) firstPickupAt = day.firstPickupAt;
  }

  const topCats = Object.entries(catTotals)
    .filter(([, s]) => s >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);

  const segmentsOf = (domainSecs) => {
    const seg = [0, 0, 0, 0];
    for (const [d, s] of Object.entries(domainSecs || {})) {
      if (!keep(d)) continue;
      const i = topCats.indexOf(catOf(d));
      seg[i < 0 ? 3 : i] += s;
    }
    return seg;
  };

  let columns;
  if (p.view === 'day') {
    const day = days[p.keys[0]];
    columns = Array.from({ length: 24 }, (_, h) => ({
      key: h,
      segments: segmentsOf(day.hours[h]),
      pickups: filter ? 0 : day.pickupHours[h] || 0,
      notifs: filter ? 0 : day.notifHours[h] || 0,
    }));
  } else {
    columns = p.keys.map((k) => {
      const day = days[k];
      return {
        key: k,
        segments: segmentsOf(day.sites),
        pickups: filter ? sum(Object.fromEntries(Object.entries(day.firstUsed).filter(([d]) => keep(d)))) : day.pickups,
        notifs: sum(Object.fromEntries(Object.entries(day.notifs).filter(([d]) => keep(d)))),
      };
    });
  }
  for (const c of columns) c.total = c.segments.reduce((a, b) => a + b, 0);

  const total = sum(siteTotals);
  return {
    total,
    siteTotals,
    catTotals,
    topCats,
    columns,
    pickups: filter ? sum(firstUsed) : pickups,
    firstUsed,
    notifs,
    notifTotal,
    firstPickupAt,
  };
}

export const categoryName = (id) => REPORT_CATEGORY_BY_ID[id]?.name || 'Other';

const STEPS = [60, 300, 600, 900, 1800, 3600, 7200, 10800, 14400, 21600, 28800, 43200, 57600, 86400];
export const niceMax = (sec) => STEPS.find((s) => s >= sec) || 86400;
const COUNT_STEPS = [5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 1000];
export const niceCount = (n) => COUNT_STEPS.find((s) => s >= n) || Math.ceil(n / 500) * 500;

export function axisLabel(sec) {
  if (sec <= 0) return '0s';
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.round(sec / 3600)}h`;
}

/**
 * Stacked bar chart.
 *   columns: [{ key, segments:[..], total, label?, tip? }]
 *   mode: 'week' | 'hours'
 */
export function renderUsageChart({ columns, mode, max, avg = null, selectedKey = null, act = null, mono = false, size = '', labels }) {
  const scale = max || niceMax(Math.max(...columns.map((c) => c.total), 1));
  const top = mode === 'hours' ? '60m' : axisLabel(scale);
  const lines = [
    `<div class="gl" style="top:0"><span>${top}</span></div>`,
    mode === 'hours' ? `<div class="gl dashed" style="top:50%"><span>30m</span></div>` : '',
    `<div class="gl" style="top:100%"><span>${mode === 'hours' ? '0m' : '0s'}</span></div>`,
    avg != null && avg > 0 ? `<div class="gl avg" style="top:${(1 - Math.min(avg / scale, 1)) * 100}%"><span>avg</span></div>` : '',
  ].join('');

  const bars = columns
    .map((c) => {
      const h = Math.min(100, (c.total / scale) * 100);
      const segs = mono
        ? `<i class="mono" style="height:100%"></i>`
        : c.segments
            .map((s, i) => (s > 0 && c.total > 0 ? `<i class="s${i}" style="height:${(s / c.total) * 100}%"></i>` : ''))
            .join('');
      const dim = selectedKey != null && String(selectedKey) !== String(c.key) ? 'dim' : '';
      const click = act ? `data-act="${act}" data-key="${esc(c.key)}"` : '';
      const tip = c.tip ? `<span class="tip">${esc(c.tip)}</span>` : '';
      return `<div class="col ${dim} ${act ? 'clickable' : ''}" ${click}>${tip}<div class="stack" style="height:${h}%">${segs}</div></div>`;
    })
    .join('');

  const xl = labels || columns.map((c) => c.label ?? '');
  return `<div class="chart ${mode === 'hours' ? 'hours' : ''} ${size}">
    <div class="plot">${lines}<div class="bars">${bars}</div></div>
    <div class="xlabels">${xl.map((l) => `<span class="${l && l.sel ? 'sel' : ''}">${esc(typeof l === 'object' ? l.text : l)}</span>`).join('')}</div>
  </div>`;
}

/** Single-color count chart (pickups / notifications). */
export function renderCountChart({ columns, mode, field, labels, size = 'short' }) {
  const max = niceCount(Math.max(...columns.map((c) => c[field]), 1));
  const bars = columns
    .map((c) => {
      const h = (c[field] / max) * 100;
      return `<div class="col"><span class="tip">${c[field]}</span><div class="stack" style="height:${h}%"><i class="neutral" style="height:100%"></i></div></div>`;
    })
    .join('');
  return `<div class="chart ${mode === 'hours' ? 'hours' : ''} ${size}">
    <div class="plot">
      <div class="gl" style="top:0"><span>${max}</span></div>
      <div class="gl" style="top:100%"><span>0</span></div>
      <div class="bars">${bars}</div>
    </div>
    <div class="xlabels">${labels.map((l) => `<span>${esc(l)}</span>`).join('')}</div>
  </div>`;
}

export function weekLabels() {
  return [...WEEKDAY_LETTERS];
}

export function hourLabels() {
  return Array.from({ length: 24 }, (_, h) => (h % 6 === 0 ? String(h).padStart(2, '0') : ''));
}

export function pctChange(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export { fmtDuration };
