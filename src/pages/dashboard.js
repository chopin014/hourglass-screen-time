// Screen Time dashboard: a small single-page app with iOS-style push navigation.

import { api, getSettings, saveSettings, getRuntime, getMeta, getDays, hashPasscode, checkPasscode, DAY_PREFIX } from '../lib/store.js';
import {
  normalizeSettings, SYSTEM_TEMPLATES, systemItem, SHARED_STOPS, STEP_LADDER, TILE_COLORS, CUSTOM_ICONS, uid, OTHERS_ID,
} from '../lib/defaults.js';
import { REPORT_CATEGORIES, REPORT_CATEGORY_BY_ID, reportCategoryOf, prettyName } from '../lib/categories.js';
import {
  createMatcher, usageByItem, normalizeDomain, matchesPattern, sortedWindows, windowStart, windowEnd, windowConflict,
  allowedItems, scheduleAt, isAlwaysAllowed,
} from '../lib/policy.js';
import {
  period, loadPeriod, buildReport, elapsedDays, renderUsageChart, renderCountChart, weekLabels, hourLabels, pctChange, categoryName,
} from '../lib/reports.js';
import {
  dayKey, parseDayKey, startOfDay, addDays, fmtDuration, fmtLimit, fmtBigLimit, fmtDayTitle, fmtWeekTitle, fmtDays, fmtClock,
  WEEKDAYS, DAY_MS,
} from '../lib/time.js';
import { icon } from '../lib/icons.js';
import { DIRECT_SITES, DIRECT_PER_DAY_LADDER } from '../lib/directlinks.js';
import {
  esc, $, siteTile, itemTile, glyphTile, miniTiles, toggle, stepper, chevron, actionSheet, alertDialog, modalSheet, passcodePad,
  segmented, installFaviconFallback,
} from '../lib/ui.js';

const app = $('#app');
const S = { settings: null, runtime: null, meta: {}, unlocked: false, hostPerm: true, expanded: {} };
let currentRoute = null;
let currentView = null;
let windowDraft = null;

// ================================================================ helpers

const nameOf = (domain) => prettyName(domain);
const limitText = (item) => (item.limit == null ? 'Unlimited' : `Up to ${fmtLimit(item.limit)}`);
const itemById = (id) => S.settings.allowanceItems.find((i) => i.id === id);

function nav(title, { back = true, right = '', left = null, large = false } = {}) {
  const l = left ?? (back ? `<button class="glass-btn icon-only" data-act="back" aria-label="Back">${icon('chevronLeft')}</button>` : '');
  return `<header class="navbar ${large ? 'large' : ''}"><div class="nav-left">${l}</div><div class="nav-title">${esc(title)}</div><div class="nav-right">${right}</div></header>`;
}

function section(header, body, { action = '', footer = '', cls = '' } = {}) {
  return `<section class="section ${cls}">
    ${header ? `<div class="section-header"><span>${header}</span>${action}</div>` : ''}
    ${body}
    ${footer ? `<div class="section-footer">${footer}</div>` : ''}
  </section>`;
}

function hero({ tile, title, text, rows = '' }) {
  return `<div class="hero">${tile}<h1>${esc(title)}</h1><p>${text}</p>${rows ? `<div class="rows">${rows}</div>` : '<div style="height:6px"></div>'}</div>`;
}

const row = ({ act = '', data = '', tile = '', title, subtitle = '', right = '', chev = false, cls = '', tag = 'button' }) => {
  const t = act ? tag : 'div';
  const tileCls = tile ? (tile.includes(' lg') ? 'with-tile-lg' : 'with-tile') : '';
  return `<${t} class="row ${tileCls} ${cls}" ${act ? `data-act="${act}"` : ''} ${data}>
    ${tile}
    <div class="body"><div class="title">${title}</div>${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}</div>
    ${right}${chev ? chevron() : ''}
  </${t}>`;
};

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { parts: path ? path.split('/').map(decodeURIComponent) : [], query: Object.fromEntries(new URLSearchParams(qs || '')), raw: h };
}

function go(hash, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, '', hash);
    render('fade');
  } else location.hash = hash;
}

async function unlock() {
  if (!S.settings.passcode || S.unlocked) return true;
  const r = await passcodePad([
    {
      title: 'Enter Screen Time Passcode',
      verify: async (c) => (await checkPasscode(S.settings, c)) || 'Incorrect passcode. Try again.',
    },
  ]);
  S.unlocked = !!r;
  return S.unlocked;
}

/** Mutate settings (passcode-protected), persist and re-render. */
async function update(fn, { rerender = true } = {}) {
  if (!(await unlock())) return false;
  const s = structuredClone(S.settings);
  fn(s);
  S.settings = normalizeSettings(s);
  await saveSettings(S.settings);
  if (rerender) await render('none');
  return true;
}

async function topDomains(days = 14) {
  const keys = Array.from({ length: days }, (_, i) => dayKey(addDays(new Date(), -i)));
  const data = await getDays(keys);
  const totals = {};
  for (const d of Object.values(data)) for (const [k, v] of Object.entries(d.sites)) totals[k] = (totals[k] || 0) + v;
  return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([d]) => d);
}

async function askDomain(title, message = 'Enter a website address, like youtube.com.') {
  const r = await alertDialog({
    title,
    message,
    input: { placeholder: 'example.com' },
    buttons: [{ label: 'Cancel', value: false }, { label: 'Add', value: true, style: 'primary' }],
  });
  if (!r?.value) return null;
  const d = normalizeDomain(r.text);
  if (!d || !d.includes('.') && d !== 'localhost') {
    await alertDialog({ title: 'Invalid Website', message: `“${r.text}” doesn't look like a website address.` });
    return null;
  }
  return d;
}

// ================================================================= views

const views = {};

// ---------------------------------------------------------------- welcome
views.welcome = {
  depth: 0,
  render: () => `
    <div class="welcome">
      ${glyphTile('hourglass', 'hourglass', 'xxl')}
      <h1>Screen Time</h1>
      <div class="feat">${icon('chart')}<div><h3>Weekly Reports</h3><p>Get a weekly report with insights about your screen time and the websites you use most.</p></div></div>
      <div class="feat">${icon('hourglass')}<div><h3>Time Allowances</h3><p>Set daily time limits for categories of websites you want to manage.</p></div></div>
      <div class="feat">${icon('schedule')}<div><h3>Screen Time Schedule</h3><p>Choose which categories are available at different times of day.</p></div></div>
      <div class="feat">${icon('lock')}<div><h3>Screen Time Passcode</h3><p>Lock your settings and require a passcode to ignore a limit.</p></div></div>
      <button class="pill-btn" data-act="go" data-href="#/">Continue</button>
    </div>`,
};

// ------------------------------------------------------------------- root
views.root = {
  depth: 0,
  live: true,
  async render() {
    const s = S.settings;
    const p = period('week', 0);
    const [days, prevDays] = await Promise.all([loadPeriod(p), loadPeriod(period('week', -1))]);
    const rep = buildReport(s, p, days);
    const prev = buildReport(s, period('week', -1), prevDays);
    const avg = rep.total / elapsedDays(p);
    const change = pctChange(avg, prev.total / 7);

    const items = s.allowanceItems;
    const limited = items.filter((i) => i.limit != null);
    const allowSub = !s.tracking
      ? 'Off'
      : limited.length || s.sharedLimit != null
        ? `${limited.length + (s.sharedLimit != null ? 1 : 0)} allowance${limited.length + (s.sharedLimit != null ? 1 : 0) === 1 ? '' : 's'} set`
        : 'Unlimited';
    const st = scheduleAt(s);
    const schedSub = !s.schedule.enabled
      ? 'Off'
      : st.active
        ? st.window
          ? `${esc(st.window.name)} · until ${st.window.end}`
          : 'Only Always Allowed'
        : 'On';
    const contentSub = { unrestricted: 'Off', limitAdult: 'Limit Adult Websites', approved: 'Allowed Websites Only' }[s.content.mode];

    const permBanner = S.hostPerm
      ? ''
      : `<div class="banner">${glyphTile('globe', 'blue')}<div class="body"><div class="title">Website access needed</div><div class="subtitle">Allow Screen Time on all websites so it can count notifications.</div></div><button class="small-btn" data-act="grantPerm">Allow</button></div>`;

    const summary = s.tracking
      ? `<div class="card">
          <button class="summary-card" data-act="go" data-href="#/activity">
            <div class="stat-head">
              <div><div class="stat-label">Daily Average</div><div class="stat-big">${fmtDuration(avg)}</div></div>
              ${change != null ? `<div class="compare">${icon(change <= 0 ? 'arrowDown' : 'arrowUp')}${change > 0 ? '+' : ''}${change}% from last week</div>` : ''}
            </div>
            ${renderUsageChart({ columns: rep.columns, mode: 'week', avg, labels: weekLabels() })}
          </button>
          ${row({ act: 'go', data: 'data-href="#/activity"', title: 'See All App &amp; Website Activity', chev: true })}
        </div>
        <div class="updated">Updated today at ${fmtClock(new Date())}</div>`
      : `<div class="card">${row({ act: 'trackingOn', title: '<span class="blue-text">Turn On App &amp; Website Activity</span>' })}</div>
         <div class="section-footer">Screen Time reports how long you spend on websites, and powers Time Allowances and your Screen Time Schedule.</div>`;

    return `${nav('Screen Time', { back: false, large: true })}
      <h1 class="large-title">Screen Time</h1>
      ${permBanner}
      ${summary}
      ${section('Limit Usage', `<div class="card">
        ${row({ act: 'go', data: 'data-href="#/allowances"', tile: glyphTile('hourglass', 'hourglass'), title: 'Time Allowances', subtitle: allowSub, chev: true })}
        ${row({ act: 'go', data: 'data-href="#/schedule"', tile: glyphTile('schedule', 'schedule'), title: 'Screen Time Schedule', subtitle: schedSub, chev: true })}
        ${row({ act: 'go', data: 'data-href="#/always"', tile: glyphTile('checkmark', 'green'), title: 'Always Allowed', subtitle: s.alwaysAllowed.length ? `${s.alwaysAllowed.length} website${s.alwaysAllowed.length === 1 ? '' : 's'}` : 'None', chev: true })}
      </div>`)}
      ${section('Restrictions', `<div class="card">
        ${row({ act: 'go', data: 'data-href="#/content"', tile: glyphTile('restrict', 'red'), title: 'Content &amp; Privacy Restrictions', subtitle: contentSub, chev: true })}
      </div>`)}
      ${section('', `<div class="card">
        ${s.passcode
          ? row({ act: 'go', data: 'data-href="#/passcode"', tile: glyphTile('lock', 'blue'), title: 'Screen Time Passcode', subtitle: 'On', chev: true })
          : row({ act: 'setPasscode', tile: glyphTile('lock', 'blue'), title: '<span class="blue-text">Lock Screen Time Settings</span>' })}
      </div>`, { footer: 'Use a passcode to secure Screen Time settings and to approve more time when a limit is reached.' })}
      ${section('', `<div class="card">
        ${row({ act: 'go', data: 'data-href="#/options"', tile: glyphTile('bell', 'red'), title: 'Notifications &amp; Data', chev: true })}
      </div>`)}
      ${s.tracking ? section('', `<div class="card">${row({ act: 'trackingOff', title: '<span class="red-text">Turn Off App &amp; Website Activity</span>' })}</div>`) : ''}`;
  },
};

// --------------------------------------------------------------- activity

function periodQuery(route) {
  const view = route.query.view === 'day' ? 'day' : 'week';
  const offset = Math.min(0, parseInt(route.query.offset || '0', 10) || 0);
  return { view, offset };
}

function withQuery(route, patch) {
  const q = { ...route.query, ...patch };
  for (const k of Object.keys(q)) if (q[k] == null || q[k] === '') delete q[k];
  const qs = new URLSearchParams(q).toString();
  return `#/${route.parts.map(encodeURIComponent).join('/')}${qs ? `?${qs}` : ''}`;
}

async function reportBlock(route, { filter = null, mono = false } = {}) {
  const s = S.settings;
  const { view, offset } = periodQuery(route);
  const p = period(view, offset);
  const days = await loadPeriod(p);
  const rep = buildReport(s, p, days, filter);
  const now = new Date();

  let label;
  let value;
  let compare = '';
  let chart;
  if (view === 'week') {
    const prevP = period('week', offset - 1);
    const prev = buildReport(s, prevP, await loadPeriod(prevP), filter);
    const avg = rep.total / Math.max(1, elapsedDays(p));
    const change = pctChange(avg, prev.total / 7);
    label = 'Daily Average';
    value = fmtDuration(avg);
    if (change != null) compare = `<div class="compare">${icon(change <= 0 ? 'arrowDown' : 'arrowUp')}${change > 0 ? '+' : ''}${change}% from last week</div>`;
    chart = renderUsageChart({ columns: rep.columns, mode: 'week', avg, labels: weekLabels(), act: 'pickDay', mono });
  } else {
    const before = {
      view: 'week',
      keys: Array.from({ length: 7 }, (_, i) => dayKey(addDays(p.start, -7 + i))),
    };
    const prev = buildReport(s, before, await getDays(before.keys), filter);
    const avg = prev.total / 7;
    const change = pctChange(rep.total, avg);
    label = fmtDayTitle(p.start, now);
    value = fmtDuration(rep.total);
    if (change != null) compare = `<div class="compare">${icon(change <= 0 ? 'arrowDown' : 'arrowUp')}${change > 0 ? '+' : ''}${change}% from average</div>`;
    chart = renderUsageChart({ columns: rep.columns, mode: 'hours', max: 3600, labels: hourLabels(), mono });
  }

  const legend =
    !mono && rep.topCats.length
      ? `<div class="legend">${rep.topCats
          .map((c, i) => `<div><div class="name c${i}">${esc(categoryName(c))}</div><div class="val">${fmtDuration(rep.catTotals[c])}</div></div>`)
          .join('')}</div>`
      : '';
  const totalRow = view === 'week' ? `<div class="total-row"><span>Total Screen Time</span><span class="v">${fmtDuration(rep.total)}</span></div>` : '';
  const title = view === 'week' ? fmtWeekTitle(p.start, now) : fmtDayTitle(p.start, now);

  const html = `
    ${segmented('setView', [{ label: 'Day', value: 'day' }, { label: 'Week', value: 'week' }], view)}
    <div class="period-nav">
      <button class="glass-btn icon-only" data-act="shift" data-dir="-1" aria-label="Previous" ${offset <= (view === 'week' ? -25 : -180) ? 'disabled' : ''}>${icon('chevronLeft')}</button>
      <span class="label">${esc(title)}</span>
      <button class="glass-btn icon-only" data-act="shift" data-dir="1" aria-label="Next" ${offset >= 0 ? 'disabled' : ''}>${icon('chevronRight')}</button>
    </div>
    ${section('Screen Time', `<div class="card pad">
      <div class="stat-head"><div><div class="stat-label">${esc(label)}</div><div class="stat-big">${value}</div></div>${compare}</div>
      ${chart}${legend}${totalRow}
    </div>`)}
    ${offset === 0 ? `<div class="updated">Updated today at ${fmtClock(now)}</div>` : ''}`;
  return { html, rep, p, view };
}

function mostUsedRows(rep, mode, key) {
  if (mode === 'categories') {
    const cats = Object.entries(rep.catTotals).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]);
    if (!cats.length) return '<div class="empty">No activity</div>';
    const max = cats[0][1];
    return cats
      .map(([c, v]) =>
        row({
          act: 'go',
          data: `data-href="#/category/${c}"`,
          tile: glyphTile(REPORT_CATEGORY_BY_ID[c]?.icon || 'others', 'gray'),
          title: esc(categoryName(c)),
          subtitle: `<span class="usage-line"><span class="usage-bar" style="width:${Math.max(3, (v / max) * 70)}%"></span><span class="t">${fmtDuration(v)}</span></span>`,
          chev: true,
        }),
      )
      .join('');
  }
  const sites = Object.entries(rep.siteTotals).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]);
  if (!sites.length) return '<div class="empty">No activity</div>';
  const max = sites[0][1];
  const limit = S.expanded[key] ? sites.length : 8;
  return (
    sites
      .slice(0, limit)
      .map(([d, v]) =>
        row({
          act: 'go',
          data: `data-href="#/site/${encodeURIComponent(d)}"`,
          tile: siteTile(d, S.meta, 'lg'),
          title: esc(nameOf(d)),
          subtitle: `<span class="usage-line"><span class="usage-bar" style="width:${Math.max(3, (v / max) * 70)}%"></span><span class="t">${fmtDuration(v)}</span></span>`,
          chev: true,
        }),
      )
      .join('') +
    (sites.length > limit ? row({ act: 'expand', data: `data-key="${esc(key)}"`, title: '<span class="blue-text">Show More</span>' }) : '')
  );
}

function countRows(map, emptyText) {
  const entries = Object.entries(map).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!entries.length) return `<div class="empty">${emptyText}</div>`;
  return entries
    .map(([d, n]) =>
      row({ act: 'go', data: `data-href="#/site/${encodeURIComponent(d)}"`, tile: siteTile(d, S.meta), title: esc(nameOf(d)), right: `<span class="detail tnum">${n}</span>`, chev: true }),
    )
    .join('');
}

views.activity = {
  depth: 1,
  live: true,
  parent: '#/',
  async render(route) {
    const { html, rep, p, view } = await reportBlock(route);
    const mode = route.query.mode === 'categories' ? 'categories' : 'apps';
    const labels = view === 'week' ? weekLabels() : hourLabels();
    const days = elapsedDays(p);
    const pickupsVal = view === 'week' ? Math.round(rep.pickups / Math.max(1, days)) : rep.pickups;
    const notifVal = view === 'week' ? Math.round(rep.notifTotal / Math.max(1, days)) : rep.notifTotal;
    const firstPickup =
      view === 'day' && rep.firstPickupAt
        ? `<div class="total-row" style="margin:0 0 18px;border:0;padding:0"><span class="muted">First Pickup</span><span class="v">${fmtDayTitle(p.start)} at ${fmtClock(new Date(rep.firstPickupAt))}</span></div>`
        : '';

    return `${nav('Firefox')}
      ${html}
      ${section('Most Used', `<div class="card">${mostUsedRows(rep, mode, `${view}:${p.keys[0]}`)}</div>`, {
        action: `<button class="action" data-act="viewOptions">View Options</button>`,
      })}
      ${section('Pickups', `<div class="card pad">
        <div class="stat-head" style="margin-bottom:${firstPickup ? 14 : 22}px"><div><div class="stat-label">${view === 'week' ? 'Daily Average' : 'Total Pickups'}</div><div class="stat-big">${pickupsVal}</div></div></div>
        ${firstPickup}
        ${renderCountChart({ columns: rep.columns, mode: view === 'day' ? 'hours' : 'week', field: 'pickups', labels })}
      </div>`, { footer: 'A pickup is counted each time you come back to the browser after being away for at least a minute.' })}
      ${section('First Used After Pickup', `<div class="card">${countRows(rep.firstUsed, 'No pickups')}</div>`)}
      ${section('Notifications', `<div class="card pad">
        <div class="stat-head" style="margin-bottom:22px"><div><div class="stat-label">${view === 'week' ? 'Daily Average' : 'Total Notifications'}</div><div class="stat-big">${notifVal}</div></div></div>
        ${renderCountChart({ columns: rep.columns, mode: view === 'day' ? 'hours' : 'week', field: 'notifs', labels })}
      </div>`)}
      ${section('', `<div class="card">${countRows(rep.notifs, 'No notifications')}</div>`)}`;
  },
};

// ----------------------------------------------------------- site detail

views.site = {
  depth: 2,
  live: true,
  parent: '#/activity',
  async render(route) {
    const domain = normalizeDomain(route.parts[1]);
    const s = S.settings;
    const { html, rep } = await reportBlock(route, { filter: (d) => d === domain, mono: true });
    const cat = reportCategoryOf(domain, s.siteCategories);
    const matcher = createMatcher(s);
    const m = matcher(domain);
    const today = (await getDays([dayKey()]))[dayKey()];
    const usage = usageByItem(s, today.sites, matcher);
    const siteItem = m.site[0];
    const always = isAlwaysAllowed(s, domain);

    const limits = [
      siteItem
        ? row({ act: 'go', data: `data-href="#/allowances/item/${siteItem.id}"`, tile: itemTile(siteItem, S.meta), title: 'Time Allowance', subtitle: `${limitText(siteItem)} · ${fmtDuration(usage.byItem[siteItem.id] || 0)} today`, chev: true })
        : row({ act: 'addSiteLimit', data: `data-domain="${esc(domain)}"`, title: '<span class="blue-text">Add Limit</span>' }),
      ...m.cat.map((c) =>
        row({ act: 'go', data: `data-href="#/allowances/item/${c.id}"`, tile: itemTile(c, S.meta), title: `Included in ${esc(c.name)}`, subtitle: `${limitText(c)}${c.shared ? ' · Shared' : ''}`, chev: true }),
      ),
      !m.site.length && !m.cat.length && m.others
        ? row({ act: 'go', data: `data-href="#/allowances/item/${OTHERS_ID}"`, tile: itemTile(m.others, S.meta), title: 'Included in All Others', subtitle: limitText(m.others), chev: true })
        : '',
    ].join('');

    return `${nav(nameOf(domain))}
      <div class="detail-head">
        ${siteTile(domain, S.meta, 'xl')}
        <h1>${esc(nameOf(domain))}</h1>
        <div class="muted small">${esc(domain)}</div>
        <button class="cat-btn" data-act="changeCategory" data-domain="${esc(domain)}">${esc(categoryName(cat))} ${icon('chevronDown')}</button>
      </div>
      ${html}
      ${section('Limits', `<div class="card">${limits}</div>`)}
      ${section('', `<div class="card">${row({ title: 'Always Allowed', right: toggle(`data-change="toggleAlways" data-domain="${esc(domain)}"`, always) })}</div>`, {
        footer: 'Always Allowed websites stay available during your Screen Time Schedule and never count toward Time Allowances.',
      })}
      ${section('', `<div class="card">
        ${row({ title: 'First Used After Pickup', right: `<span class="detail tnum">${rep.pickups}</span>` })}
        ${row({ title: 'Notifications', right: `<span class="detail tnum">${rep.notifTotal}</span>` })}
      </div>`)}`;
  },
};

views.category = {
  depth: 2,
  live: true,
  parent: '#/activity?mode=categories',
  async render(route) {
    const id = route.parts[1];
    const s = S.settings;
    const filter = (d) => reportCategoryOf(d, s.siteCategories) === id;
    const { html, rep, p } = await reportBlock(route, { filter, mono: true });
    return `${nav(categoryName(id))}
      <div class="detail-head">${glyphTile(REPORT_CATEGORY_BY_ID[id]?.icon || 'others', 'gray', 'xl')}<h1>${esc(categoryName(id))}</h1></div>
      ${html}
      ${section('Websites', `<div class="card">${mostUsedRows(rep, 'apps', `cat:${id}:${p.keys[0]}`)}</div>`, {
        footer: 'Change a website’s category from its detail page.',
      })}`;
  },
};

// ------------------------------------------------------------ allowances

views.allowances = {
  depth: 1,
  parent: '#/',
  async render() {
    const s = S.settings;
    const shared = s.allowanceItems.filter((i) => i.shared);
    const additional = s.allowanceItems.filter((i) => !i.shared);
    const idx = Math.max(0, SHARED_STOPS.indexOf(s.sharedLimit));
    const today = (await getDays([dayKey()]))[dayKey()];
    const usage = usageByItem(s, today.sites);

    const itemRow = (i) => {
      const k = STEP_LADDER.indexOf(i.limit);
      return row({
        tile: itemTile(i, S.meta, 'lg'),
        title: esc(i.name),
        subtitle: limitText(i),
        right: stepper(`data-act="stepLimit" data-id="${esc(i.id)}"`, i.limit == null || k > 0, i.limit != null),
        cls: 'tap-title',
      });
    };

    const sharedUsed = s.sharedLimit != null ? `<div class="muted small" style="text-align:center;margin:-18px 0 22px">${fmtDuration(usage.shared)} used today</div>` : '';

    return `${nav('', { large: true })}
      ${hero({
        tile: glyphTile('hourglass', 'hourglass', 'xl'),
        title: 'Time Allowances',
        text: 'Set how long you can use categories of websites. <a href="#" data-act="learnAllowances">Learn more…</a>',
        rows: row({ act: 'go', data: 'data-href="#/allowances/manage"', title: 'Manage Categories', right: miniTiles(s.allowanceItems, S.meta), chev: true }),
      })}
      ${section('Shared Time Allowance', `<div class="card">
        <div class="allow-slider">
          <div class="big" id="sharedBig">${fmtBigLimit(s.sharedLimit)}</div>
          ${sharedUsed}
          <div class="range-wrap">
            <input class="ios" type="range" min="0" max="${SHARED_STOPS.length - 1}" step="1" value="${idx}" data-input="sharedSlide" data-change="sharedSet" aria-label="Shared time allowance">
            <div class="dots">${'<i></i>'.repeat(SHARED_STOPS.length)}</div>
          </div>
        </div>
        ${shared.length ? shared.map(itemRow).join('') : '<div class="empty">No categories share this allowance.</div>'}
      </div>`, { footer: 'Categories here draw from one daily budget, and each can also have its own allowance.' })}
      ${section('Additional Time Allowances', `<div class="card">
        ${additional.length ? additional.map(itemRow).join('') : '<div class="empty">No additional allowances.</div>'}
      </div>`, { footer: 'Additional allowances are tracked separately from the shared time allowance. Allowances reset every day at midnight.' })}
      ${section('', `<div class="card">
        ${row({ tile: glyphTile('hourglass', 'hourglass'), title: 'Timer on Websites', subtitle: 'A live countdown on sites with an allowance', right: toggle('data-change="timerEnabled"', s.timer.enabled) })}
        ${row({ title: 'Only in the Last 10 Minutes', right: toggle('data-change="timerOnlyLast"', s.timer.onlyLast, !s.timer.enabled), cls: s.timer.enabled ? '' : 'dim' })}
      </div>`, { footer: 'Drag the timer to any corner of the page. Hover it to see which allowance it counts.' })}
      ${section('', `<div class="card">${row({
        act: 'go',
        data: 'data-href="#/allowances/direct"',
        tile: glyphTile('link', 'blue'),
        title: 'Direct Links',
        subtitle: directSubtitle(s, S.runtime),
        chev: true,
      })}</div>`, { footer: 'Open a single shared video or post even after its allowance is used up.' })}
      ${section('', `<div class="card">${row({
        title: 'Block at End of Allowance',
        right: toggle('data-change="blockAtEnd"', !!(s.blockAtEnd && s.passcode), !s.passcode),
      })}</div>`, {
        footer: s.passcode
          ? 'When on, your Screen Time passcode is needed to approve more time once an allowance is used up.'
          : 'Set a Screen Time passcode to require it before more time can be approved.',
      })}`;
  },
};

function directSubtitle(s, runtime) {
  const d = s.directLinks;
  if (!d.enabled) return 'Off';
  const used = runtime?.directUsed?.[dayKey()] || 0;
  if (d.perDay == null) return `Unlimited · ${used} used today`;
  return `${d.perDay} per day · ${Math.max(0, d.perDay - used)} left today`;
}

views.direct = {
  depth: 2,
  parent: '#/allowances',
  render() {
    const s = S.settings;
    const d = s.directLinks;
    const k = DIRECT_PER_DAY_LADDER.indexOf(d.perDay);
    const used = S.runtime?.directUsed?.[dayKey()] || 0;
    return `${nav('', { large: true })}
      ${hero({
        tile: glyphTile('link', 'blue', 'xl'),
        title: 'Direct Links',
        text: 'When a website’s allowance is used up, you can still open a link to a single video or post, like one a friend sent you or one you found in search. Everything else on that website stays blocked: the home page, profiles, recommendations and the next video.',
        rows: row({ title: 'Direct Links', right: toggle('data-change="directEnabled"', d.enabled) }),
      })}
      ${section('', `<div class="card ${d.enabled ? '' : 'dim'}">
        ${row({
          title: 'Links per Day',
          subtitle: d.perDay == null ? 'Unlimited' : `${d.perDay} link${d.perDay === 1 ? '' : 's'}`,
          right: stepper('data-act="stepDirect"', d.perDay == null || k > 0, d.perDay != null),
        })}
        ${row({ title: 'Used Today', right: `<span class="detail tnum">${used}</span>` })}
        ${row({ title: 'During Screen Time Schedule', subtitle: 'Also allow direct links outside your scheduled time', right: toggle('data-change="directSchedule"', d.duringSchedule) })}
      </div>`, { footer: 'The block screen shows an Open button with how many links are left. Links you open from inside a shared page don’t get one, and neither do new tabs opened from it.' })}
      ${section('Websites', `<div class="card ${d.enabled ? '' : 'dim'}">
        ${DIRECT_SITES.map((site) => row({ tile: siteTile(site.home, S.meta), title: esc(site.name), subtitle: esc(site.examples), right: toggle(`data-change="directSite" data-site="${site.id}"`, !!d.sites[site.id]) })).join('')}
      </div>`)}`;
  },
};

views.manage = {
  depth: 2,
  parent: '#/allowances',
  render() {
    const s = S.settings;
    const sub = (i) =>
      [
        i.kind === 'site' ? 'Website' : i.kind === 'others' ? 'Everything else' : i.source ? 'Category' : 'Custom Category',
        i.shared ? 'Shared' : '',
        limitText(i),
      ]
        .filter(Boolean)
        .join(' · ');
    return `${nav('Manage Categories', { right: `<button class="glass-btn icon-only" data-act="addItem" aria-label="Add">${icon('plus')}</button>` })}
      ${section('', `<div class="card">
        ${s.allowanceItems.map((i) => row({ act: 'go', data: `data-href="#/allowances/item/${i.id}"`, tile: itemTile(i, S.meta), title: esc(i.name), subtitle: sub(i), chev: true })).join('')}
      </div>`, { footer: 'Categories group websites together so they can share an allowance and a schedule. Add a built-in category, a single website, or create your own.' })}`;
  },
};

views.item = {
  depth: 3,
  parent: '#/allowances/manage',
  async render(route) {
    const s = S.settings;
    const item = itemById(route.parts[2]);
    if (!item) return `${nav('')}<div class="empty">This allowance no longer exists.</div>`;
    const today = (await getDays([dayKey()]))[dayKey()];
    const matcher = createMatcher(s);
    const usage = usageByItem(s, today.sites, matcher);
    const k = STEP_LADDER.indexOf(item.limit);

    const head = `<div class="detail-head">
      ${itemTile(item, S.meta, 'xl')}
      ${item.kind === 'others'
        ? `<h1>${esc(item.name)}</h1>`
        : `<input class="name-input" value="${esc(item.name)}" data-change="renameItem" data-id="${esc(item.id)}" aria-label="Name" spellcheck="false">`}
      ${item.kind === 'site' ? `<div class="muted small">${esc(item.domain)}</div>` : ''}
    </div>`;

    const limitCard = section('Time Allowance', `<div class="card">
      ${row({ title: 'Daily Allowance', subtitle: limitText(item), right: stepper(`data-act="stepLimit" data-id="${esc(item.id)}"`, item.limit == null || k > 0, item.limit != null) })}
      ${row({ title: 'Include in Shared Time Allowance', right: toggle(`data-change="toggleShared" data-id="${esc(item.id)}"`, item.shared) })}
      ${row({ title: 'Used Today', right: `<span class="detail tnum">${fmtDuration(usage.byItem[item.id] || 0)}</span>` })}
    </div>`);

    let appearance = '';
    if (item.kind === 'category' && !item.source) {
      appearance = section('Appearance', `<div class="card">
        <div class="swatches">${TILE_COLORS.map((c) => `<button class="tile c-${c} ${item.color === c ? 'on' : ''}" style="--size:36px;border-radius:50%" data-act="setColor" data-id="${esc(item.id)}" data-color="${c}" aria-label="${c}"></button>`).join('')}</div>
        <div class="icon-grid">${CUSTOM_ICONS.map((g) => `<button class="${item.icon === g ? 'on' : ''}" data-act="setIcon" data-id="${esc(item.id)}" data-icon="${g}" aria-label="${g}">${icon(g)}</button>`).join('')}</div>
      </div>`);
    }

    let sitesCard = '';
    if (item.kind === 'category') {
      const recent = await topDomains(30);
      const auto = recent.filter((d) => matcher(d).cat.includes(item) && !(item.sites || []).some((p) => matchesPattern(d, p)));
      const explicit = item.sites || [];
      const rows = [
        ...explicit.map((d) =>
          row({ tile: siteTile(d, S.meta), title: esc(nameOf(d)), subtitle: d !== nameOf(d) ? esc(d) : '', right: `<button class="small-btn red" data-act="removeItemSite" data-id="${esc(item.id)}" data-domain="${esc(d)}">Remove</button>` }),
        ),
        ...auto.slice(0, 30).map((d) =>
          row({ tile: siteTile(d, S.meta), title: esc(nameOf(d)), subtitle: `${esc(categoryName(reportCategoryOf(d, s.siteCategories)))} · automatic`, right: `<button class="small-btn" data-act="excludeItemSite" data-id="${esc(item.id)}" data-domain="${esc(d)}">Exclude</button>` }),
        ),
        row({ act: 'addItemSite', data: `data-id="${esc(item.id)}"`, title: '<span class="blue-text">Add Website…</span>' }),
      ].join('');
      const excluded = (item.exclude || []).map((d) =>
        row({ tile: siteTile(d, S.meta), title: esc(nameOf(d)), right: `<button class="small-btn" data-act="unexcludeItemSite" data-id="${esc(item.id)}" data-domain="${esc(d)}">Include</button>` }),
      );
      sitesCard =
        section('Websites', `<div class="card">${rows}</div>`, {
          footer: item.source
            ? `Websites categorized as ${esc(categoryName(item.source))} are included automatically. Change a website’s category from its activity page.`
            : 'Add the websites that belong to this category.',
        }) + (excluded.length ? section('Excluded', `<div class="card">${excluded.join('')}</div>`) : '');
    }

    const windows = s.schedule.groups.flatMap((g) => sortedWindows(g).map((w) => ({ g, w })));
    const schedCard = windows.length
      ? section('Allowed During', `<div class="card">${windows
          .map(({ g, w }) =>
            row({ title: esc(w.name), subtitle: `${fmtDays(g.days)} · ${w.start} – ${w.end}`, right: toggle(`data-change="toggleItemWindow" data-id="${esc(item.id)}" data-g="${g.id}" data-w="${w.id}"`, w.allowed.includes(item.id)) }),
          )
          .join('')}</div>`, { footer: s.schedule.enabled ? '' : 'Your Screen Time Schedule is off.' })
      : '';

    const del = item.kind === 'others' ? '' : section('', `<div class="card">${row({ act: 'deleteItem', data: `data-id="${esc(item.id)}"`, title: '<span class="red-text">Delete Allowance</span>' })}</div>`);
    return `${nav(item.name)}${head}${limitCard}${appearance}${sitesCard}${schedCard}${del}`;
  },
};

// --------------------------------------------------------------- schedule

/** 24-hour time picker (the native <input type=time> follows the browser locale and may show AM/PM). */
function timePicker(name, value, label) {
  const [h, m] = value.split(':');
  const opts = (n, sel) =>
    Array.from({ length: n }, (_, i) => {
      const v = String(i).padStart(2, '0');
      return `<option value="${v}" ${v === sel ? 'selected' : ''}>${v}</option>`;
    }).join('');
  return `<span class="time-pick">
    <select data-change="${name}" data-part="h" aria-label="${label} hour">${opts(24, h)}</select>
    <span class="colon">:</span>
    <select data-change="${name}" data-part="m" aria-label="${label} minute">${opts(60, m)}</select>
  </span>`;
}

function mergeTime(current, el) {
  const [h, m] = current.split(':');
  return el.dataset.part === 'h' ? `${el.value}:${m}` : `${h}:${el.value}`;
}

function groupLabel(g) {
  return `Allowed on ${fmtDays(g.days)}`;
}

function scheduleGaps(g) {
  const ws = sortedWindows(g);
  let t = 0;
  for (const w of ws) {
    if (windowStart(w) > t) return true;
    t = Math.max(t, windowEnd(w));
  }
  return t < 1440;
}

views.schedule = {
  depth: 1,
  parent: '#/',
  render() {
    const s = S.settings;
    const sch = s.schedule;
    const groups = [...sch.groups].sort((a, b) => Math.min(...a.days.map((d) => (d + 6) % 7)) - Math.min(...b.days.map((d) => (d + 6) % 7)));
    const used = new Set(groups.flatMap((g) => g.days));
    const groupHtml = groups
      .map((g) => {
        const ws = sortedWindows(g);
        const rows = ws
          .map((w) =>
            row({
              act: 'go',
              data: `data-href="#/schedule/window/${g.id}/${w.id}"`,
              title: esc(w.name),
              subtitle: `${w.start} – ${w.end}`,
              right: miniTiles(allowedItems(s, w), S.meta),
              chev: true,
            }),
          )
          .join('');
        return section(esc(groupLabel(g)), `<div class="card">
            ${rows}
            ${row({ act: 'go', data: `data-href="#/schedule/window/${g.id}/new"`, title: '<span class="blue-text">Add Time Window</span>' })}
          </div>`, {
          action: `<button class="action" data-act="editGroup" data-g="${g.id}">Edit</button>`,
          footer: scheduleGaps(g) ? 'Outside these time windows, only Always Allowed websites are available.' : '',
        });
      })
      .join('');

    return `${nav('', { large: true })}
      <div class="${sch.enabled ? '' : 'groups-disabled'}">
      ${hero({
        tile: glyphTile('schedule', 'schedule', 'xl'),
        title: 'Screen Time Schedule',
        text: 'Control your website access by setting which Time Allowance categories are available at different times of day. Always Allowed websites remain accessible.',
        rows: row({ title: 'Schedule', right: toggle('data-change="scheduleEnabled"', sch.enabled) }),
      })}
      ${groupHtml}
      ${used.size < 7 ? section('', `<div class="card">${row({ act: 'addGroup', title: '<span class="blue-text">Add Schedule</span>' })}</div>`, {
        footer: `${[0, 1, 2, 3, 4, 5, 6].filter((d) => !used.has(d)).map((d) => WEEKDAYS[d]).join(', ')} ${7 - used.size === 1 ? 'has' : 'have'} no schedule, so all categories are available.`,
        cls: 'keep',
      }) : ''}
      ${section('', `<div class="card">${row({ act: 'go', data: 'data-href="#/always"', tile: glyphTile('checkmark', 'green'), title: 'Always Allowed', subtitle: `${s.alwaysAllowed.length} website${s.alwaysAllowed.length === 1 ? '' : 's'}`, chev: true })}</div>`, { cls: 'keep' })}
      </div>`;
  },
};

function daysSheet({ title, days, takenBy, allowDelete }) {
  const rowsHtml = (sel) =>
    [1, 2, 3, 4, 5, 6, 0]
      .map((d) => {
        const taken = takenBy.has(d);
        return `<button class="row ${taken ? 'disabled' : ''}" data-day="${d}">
          <div class="body"><div class="title">Every ${WEEKDAYS[d]}</div>${taken ? '<div class="subtitle">Used by another schedule</div>' : ''}</div>
          ${sel.has(d) ? `<span class="check">${icon('checkmark')}</span>` : ''}
        </button>`;
      })
      .join('');
  return modalSheet(
    `<header class="navbar"><div class="nav-left"><button class="glass-btn" data-x="cancel">Cancel</button></div><div class="nav-title">${esc(title)}</div><div class="nav-right"><button class="glass-btn primary" data-x="done">Done</button></div></header>
     <section class="section"><div class="section-header"><span>Repeat</span></div><div class="card days"></div></section>
     ${allowDelete ? `<section class="section" style="margin-top:28px"><div class="card"><button class="row" data-x="delete"><div class="body"><div class="title red-text">Delete Schedule</div></div></button></div></section>` : ''}`,
    (el, close) => {
      const sel = new Set(days);
      const box = el.querySelector('.days');
      const paint = () => {
        box.innerHTML = rowsHtml(sel);
        el.querySelector('[data-x="done"]').disabled = sel.size === 0;
      };
      paint();
      el.addEventListener('click', (e) => {
        const d = e.target.closest('[data-day]');
        if (d) {
          const n = +d.dataset.day;
          sel.has(n) ? sel.delete(n) : sel.add(n);
          return paint();
        }
        const x = e.target.closest('[data-x]')?.dataset.x;
        if (x === 'cancel') close(null);
        if (x === 'done') close({ days: [...sel].sort() });
        if (x === 'delete') close({ delete: true });
      });
    },
  );
}

views.window = {
  depth: 2,
  parent: '#/schedule',
  render(route) {
    const s = S.settings;
    const [, , gid, wid] = route.parts;
    const group = s.schedule.groups.find((g) => g.id === gid);
    if (!group) return `${nav('')}<div class="empty">This schedule no longer exists.</div>`;
    const key = `${gid}/${wid}`;
    if (!windowDraft || windowDraft.key !== key) {
      const existing = group.windows.find((w) => w.id === wid);
      const last = sortedWindows(group).at(-1);
      const start = last ? (last.end === '23:59' ? '20:00' : last.end) : '09:00';
      windowDraft = {
        key,
        isNew: !existing,
        error: '',
        w: existing
          ? structuredClone(existing)
          : { id: uid('w'), name: 'New Time Window', start, end: '23:59', allowed: s.allowanceItems.map((i) => i.id) },
      };
    }
    const w = windowDraft.w;
    const all = s.allowanceItems;
    const allOn = all.every((i) => w.allowed.includes(i.id));
    return `${nav(windowDraft.isNew ? 'New Time Window' : w.name, {
      left: `<button class="glass-btn" data-act="back">Cancel</button>`,
      right: `<button class="glass-btn primary" data-act="saveWindow">Done</button>`,
    })}
      ${section('', `<div class="card">
        ${row({ title: `<input type="text" value="${esc(w.name)}" placeholder="Name" data-input="draftName" aria-label="Name" spellcheck="false">` })}
        ${row({ title: 'Start', right: timePicker('draftStart', w.start, 'Start') })}
        ${row({ title: 'End', right: timePicker('draftEnd', w.end, 'End') })}
      </div>${windowDraft.error ? `<div class="error-text">${esc(windowDraft.error)}</div>` : ''}`)}
      ${section('Allowed Categories', `<div class="card">
        ${all.map((i) => row({ act: 'draftToggle', data: `data-id="${esc(i.id)}"`, tile: itemTile(i, S.meta), title: esc(i.name), right: w.allowed.includes(i.id) ? `<span class="check">${icon('checkmark')}</span>` : '' })).join('')}
      </div>`, {
        action: `<button class="action" data-act="draftAll">${allOn ? 'Deselect All' : 'Select All'}</button>`,
        footer: 'Categories that aren’t selected are blocked during this time window.',
      })}
      ${section('', `<div class="card">${row({ act: 'go', data: 'data-href="#/always"', tile: glyphTile('checkmark', 'green'), title: 'Always Allowed', subtitle: `${s.alwaysAllowed.length} website${s.alwaysAllowed.length === 1 ? '' : 's'}`, chev: true })}</div>`)}
      ${windowDraft.isNew ? '' : section('', `<div class="card">${row({ act: 'deleteWindow', title: '<span class="red-text">Delete Time Window</span>' })}</div>`)}`;
  },
};

// ---------------------------------------------------------- always allowed

views.always = {
  depth: 1,
  parent: '#/',
  async render() {
    const s = S.settings;
    const list = s.alwaysAllowed;
    const suggestions = (await topDomains(14)).filter((d) => !isAlwaysAllowed(s, d)).slice(0, 8);
    return `${nav('', { large: true })}
      ${hero({
        tile: glyphTile('checkmark', 'green', 'xl'),
        title: 'Always Allowed',
        text: 'Websites you choose here remain available during your Screen Time Schedule and don’t count toward Time Allowances.',
      })}
      ${section('Allowed Websites', `<div class="card">
        ${list.map((d) => row({ tile: siteTile(d, S.meta), title: esc(nameOf(d)), subtitle: d !== nameOf(d) ? esc(d) : '', right: `<button class="minus-btn" data-act="removeAlways" data-domain="${esc(d)}" aria-label="Remove">${icon('minus')}</button>` })).join('')}
        ${row({ act: 'addAlways', title: '<span class="blue-text">Add Website…</span>' })}
      </div>`)}
      ${suggestions.length ? section('Choose Websites', `<div class="card">
        ${suggestions.map((d) => row({ tile: siteTile(d, S.meta), title: esc(nameOf(d)), subtitle: d !== nameOf(d) ? esc(d) : '', right: `<button class="plus-btn" data-act="addAlwaysQuick" data-domain="${esc(d)}" aria-label="Add">${icon('plus')}</button>` })).join('')}
      </div>`, { footer: 'Your most used websites from the last two weeks.' }) : ''}`;
  },
};

// ---------------------------------------------------------------- content

views.content = {
  depth: 1,
  parent: '#/',
  render() {
    const c = S.settings.content;
    const mode = (v, label) =>
      row({ act: 'contentMode', data: `data-mode="${v}"`, title: label, right: c.mode === v ? `<span class="check">${icon('checkmark')}</span>` : '' });
    const list = (key, header, footer) =>
      section(header, `<div class="card">
        ${c[key].map((d) => row({ tile: siteTile(d, S.meta), title: esc(d), right: `<button class="minus-btn" data-act="contentRemove" data-key="${key}" data-domain="${esc(d)}" aria-label="Remove">${icon('minus')}</button>` })).join('')}
        ${row({ act: 'contentAdd', data: `data-key="${key}"`, title: '<span class="blue-text">Add Website…</span>' })}
      </div>`, { footer });

    return `${nav('', { large: true })}
      ${hero({
        tile: glyphTile('restrict', 'red', 'xl'),
        title: 'Content & Privacy Restrictions',
        text: 'Limit access to adult content, or allow only the websites you approve. Restricted websites are blocked even when no Time Allowance applies.',
      })}
      ${section('Web Content', `<div class="card">
        ${mode('unrestricted', 'Unrestricted Access')}
        ${mode('limitAdult', 'Limit Adult Websites')}
        ${mode('approved', 'Allowed Websites Only')}
      </div>`, {
        footer:
          c.mode === 'limitAdult'
            ? 'Known adult websites are blocked automatically. Use the lists below to make exceptions.'
            : c.mode === 'approved'
              ? 'Only the websites below can be opened.'
              : '',
      })}
      ${c.mode === 'limitAdult' ? list('allow', 'Always Allow', '') + list('deny', 'Never Allow', '') : ''}
      ${c.mode === 'approved' ? list('approved', 'Only Allow These Websites', '') : ''}`;
  },
};

// --------------------------------------------------------------- passcode

views.passcode = {
  depth: 1,
  parent: '#/',
  render() {
    return `${nav('Screen Time Passcode')}
      ${section('', `<div class="card">
        ${row({ act: 'changePasscode', title: '<span class="blue-text">Change Screen Time Passcode</span>' })}
        ${row({ act: 'removePasscode', title: '<span class="red-text">Turn Off Screen Time Passcode</span>' })}
      </div>`, { footer: 'The passcode is needed to change Screen Time settings, and to approve more time when Block at End of Allowance is on.' })}`;
  },
};

// ---------------------------------------------------------------- options

views.options = {
  depth: 1,
  parent: '#/',
  render() {
    const n = S.settings.notifications;
    const v = api.runtime.getManifest().version;
    return `${nav('Notifications & Data')}
      ${section('Notifications', `<div class="card">
        ${row({ title: 'Time Check', subtitle: '5 and 1 minute before an allowance ends', right: toggle('data-change="notif" data-key="timeCheck"', n.timeCheck) })}
        ${row({ title: 'Screen Time Schedule', subtitle: '5 minutes before categories become unavailable', right: toggle('data-change="notif" data-key="schedule"', n.schedule) })}
        ${row({ title: 'Weekly Report', subtitle: 'Monday morning summary of last week', right: toggle('data-change="notif" data-key="weeklyReport"', n.weeklyReport) })}
      </div>`)}
      ${section('Website Access', `<div class="card">
        ${row({ title: 'Access to All Websites', subtitle: S.hostPerm ? 'Allowed' : 'Needed to count notifications', right: S.hostPerm ? `<span class="check">${icon('checkmark')}</span>` : '<button class="small-btn" data-act="grantPerm">Allow</button>' })}
      </div>`)}
      ${section('Data', `<div class="card">
        ${row({ act: 'exportData', title: '<span class="blue-text">Export Settings &amp; Usage…</span>' })}
        ${row({ act: 'importData', title: '<span class="blue-text">Import…</span>' })}
        ${row({ act: 'clearUsage', title: '<span class="red-text">Clear Usage Data</span>' })}
      </div>`, { footer: `All data stays on this computer. Hourglass ${esc(v)}.` })}
      <input type="file" id="importFile" accept="application/json" hidden>`;
  },
};

// ================================================================ router

function resolveView(route) {
  const [a, b] = route.parts;
  if (!a) return views.root;
  if (a === 'allowances') return b === 'manage' ? views.manage : b === 'item' ? views.item : b === 'direct' ? views.direct : views.allowances;
  if (a === 'schedule') return b === 'window' ? views.window : views.schedule;
  return views[a] || views.root;
}

const PROTECTED = new Set(['allowances', 'schedule', 'always', 'content', 'passcode']);

async function render(anim = 'none') {
  const route = parseHash();
  const view = resolveView(route);
  if (PROTECTED.has(route.parts[0]) && !(await unlock())) {
    history.replaceState(null, '', '#/');
    return render('pop');
  }
  if (view !== views.window) windowDraft = null;
  const keepScroll = anim === 'none' ? window.scrollY : 0;
  const html = await view.render(route);
  // A newer navigation may have happened while we were awaiting.
  if (parseHash().raw !== route.raw) return;
  currentRoute = route;
  currentView = view;
  const el = document.createElement('div');
  el.className = `view ${anim !== 'none' ? `enter-${anim}` : ''}`;
  el.innerHTML = html;
  app.replaceChildren(el);
  window.scrollTo(0, keepScroll);
  onScroll();
  document.title = view === views.root ? 'Screen Time' : `${$('.nav-title', el)?.textContent || $('h1', el)?.textContent || 'Screen Time'} – Screen Time`;
}

let lastDepth = null;
let lastPath = null;
window.addEventListener('hashchange', () => {
  const route = parseHash();
  const depth = route.parts.length;
  const path = route.parts.join('/');
  let anim = 'fade';
  if (lastPath === path) anim = 'none';
  else if (lastDepth != null) anim = depth > lastDepth ? 'push' : depth < lastDepth ? 'pop' : 'fade';
  lastDepth = depth;
  lastPath = path;
  render(anim);
});

function onScroll() {
  $('.navbar')?.classList.toggle('scrolled', window.scrollY > 40);
}
window.addEventListener('scroll', onScroll, { passive: true });

// ================================================================ actions

const actions = {
  go: (el) => (location.hash = el.dataset.href),
  back: () => {
    const p = currentView?.parent;
    if (currentView === views.item && currentRoute.query.from) return (location.hash = currentRoute.query.from);
    location.hash = typeof p === 'function' ? p(currentRoute) : p || '#/';
  },

  // ----- activity
  setView: (el) => go(withQuery(currentRoute, { view: el.dataset.value, offset: null }), { replace: true }),
  shift: (el) => {
    const { offset } = periodQuery(currentRoute);
    go(withQuery(currentRoute, { offset: Math.min(0, offset + +el.dataset.dir) || null }), { replace: true });
  },
  pickDay: (el) => {
    const off = Math.round((parseDayKey(el.dataset.key) - startOfDay(new Date())) / DAY_MS);
    if (off > 0) return;
    go(withQuery(currentRoute, { view: 'day', offset: off || null }), { replace: true });
  },
  expand: (el) => {
    S.expanded[el.dataset.key] = true;
    render('none');
  },
  viewOptions: async () => {
    const v = await actionSheet({
      actions: [
        { label: 'Show Apps & Websites', value: 'apps' },
        { label: 'Show Categories', value: 'categories' },
        { label: 'Cancel', style: 'cancel' },
      ],
    });
    if (v) go(withQuery(currentRoute, { mode: v === 'apps' ? null : v }), { replace: true });
  },
  changeCategory: async (el) => {
    const domain = el.dataset.domain;
    const cur = reportCategoryOf(domain, S.settings.siteCategories);
    const v = await actionSheet({
      title: `Category for ${nameOf(domain)}`,
      actions: [...REPORT_CATEGORIES.map((c) => ({ label: `${c.name}${c.id === cur ? '  ✓' : ''}`, value: c.id })), { label: 'Cancel', style: 'cancel' }],
    });
    if (v && v !== cur) await update((s) => (s.siteCategories[domain] = v));
  },
  addSiteLimit: async (el) => {
    const domain = el.dataset.domain;
    let id;
    const ok = await update((s) => {
      id = uid('s');
      s.allowanceItems.splice(s.allowanceItems.length - 1, 0, {
        id, kind: 'site', domain, name: nameOf(domain), icon: 'globe', color: 'blue', limit: 15, shared: false,
      });
      addToOpenWindows(s, id);
    }, { rerender: false });
    if (ok) location.hash = `#/allowances/item/${id}?from=${encodeURIComponent(`#/site/${encodeURIComponent(domain)}`)}`;
  },

  // ----- allowances
  learnAllowances: (el, e) => {
    e.preventDefault();
    alertDialog({
      title: 'Time Allowances',
      message:
        'Allowances limit how long you can use categories of websites each day. Categories in the Shared Time Allowance draw from one combined budget, and each category can also have its own limit. When time runs out, websites in that category are blocked until midnight, unless you choose to ignore the limit. You’ll get a Time Check notification 5 minutes before.',
    });
  },
  stepLimit: async (el) => {
    const id = el.dataset.id;
    const dir = +el.dataset.dir;
    await update((s) => {
      const it = s.allowanceItems.find((i) => i.id === id);
      if (it.limit == null) {
        if (dir < 0) it.limit = 60; // Unlimited − → 1 hr, instead of walking down from 12 hr
        return;
      }
      let k = STEP_LADDER.indexOf(it.limit);
      if (k < 0) k = STEP_LADDER.findIndex((m) => m != null && m >= it.limit);
      if (k < 0) k = STEP_LADDER.length - 1;
      it.limit = STEP_LADDER[Math.max(0, Math.min(STEP_LADDER.length - 1, k + dir))];
    });
  },
  stepDirect: (el) =>
    update((s) => {
      const L = DIRECT_PER_DAY_LADDER;
      let k = L.indexOf(s.directLinks.perDay);
      if (k < 0) k = 2;
      s.directLinks.perDay = L[Math.max(0, Math.min(L.length - 1, k + +el.dataset.dir))];
    }),
  addItem: async () => {
    const present = new Set(S.settings.allowanceItems.map((i) => i.source).filter(Boolean));
    const v = await actionSheet({
      title: 'Add to Time Allowances',
      actions: [
        ...SYSTEM_TEMPLATES.filter((t) => !present.has(t.source)).map((t) => ({ label: t.name, value: `tpl:${t.source}` })),
        { label: 'Single Website…', value: 'site' },
        { label: 'Custom Category…', value: 'custom' },
        { label: 'Cancel', style: 'cancel' },
      ],
    });
    if (!v) return;
    let item;
    if (v.startsWith('tpl:')) item = systemItem(SYSTEM_TEMPLATES.find((t) => t.source === v.slice(4)));
    else if (v === 'site') {
      const domain = await askDomain('Add Website');
      if (!domain) return;
      item = { id: uid('s'), kind: 'site', domain, name: nameOf(domain), icon: 'globe', color: 'blue', limit: 15, shared: false };
    } else {
      item = { id: uid('c'), kind: 'category', source: null, name: 'New Category', icon: 'headphones', color: 'blue', sites: [], exclude: [], limit: null, shared: true };
    }
    const ok = await update((s) => {
      s.allowanceItems.splice(s.allowanceItems.length - 1, 0, item);
      addToOpenWindows(s, item.id);
    }, { rerender: false });
    if (ok) location.hash = `#/allowances/item/${item.id}`;
  },
  setColor: (el) => update((s) => (s.allowanceItems.find((i) => i.id === el.dataset.id).color = el.dataset.color)),
  setIcon: (el) => update((s) => (s.allowanceItems.find((i) => i.id === el.dataset.id).icon = el.dataset.icon)),
  addItemSite: async (el) => {
    const d = await askDomain('Add Website');
    if (!d) return;
    await update((s) => {
      const it = s.allowanceItems.find((i) => i.id === el.dataset.id);
      it.sites = [...new Set([...(it.sites || []), d])];
      it.exclude = (it.exclude || []).filter((x) => x !== d);
    });
  },
  removeItemSite: (el) =>
    update((s) => {
      const it = s.allowanceItems.find((i) => i.id === el.dataset.id);
      it.sites = (it.sites || []).filter((x) => x !== el.dataset.domain);
    }),
  excludeItemSite: (el) =>
    update((s) => {
      const it = s.allowanceItems.find((i) => i.id === el.dataset.id);
      it.exclude = [...new Set([...(it.exclude || []), el.dataset.domain])];
    }),
  unexcludeItemSite: (el) =>
    update((s) => {
      const it = s.allowanceItems.find((i) => i.id === el.dataset.id);
      it.exclude = (it.exclude || []).filter((x) => x !== el.dataset.domain);
    }),
  deleteItem: async (el) => {
    const it = itemById(el.dataset.id);
    const v = await actionSheet({
      message: `Delete “${it.name}”? Its websites will count toward All Others.`,
      actions: [{ label: 'Delete Allowance', value: true, style: 'destructive' }, { label: 'Cancel', style: 'cancel' }],
    });
    if (!v) return;
    const ok = await update((s) => {
      s.allowanceItems = s.allowanceItems.filter((i) => i.id !== it.id);
      for (const g of s.schedule.groups) for (const w of g.windows) w.allowed = w.allowed.filter((x) => x !== it.id);
    }, { rerender: false });
    if (ok) location.hash = '#/allowances/manage';
  },

  // ----- schedule
  editGroup: async (el) => {
    const g = S.settings.schedule.groups.find((x) => x.id === el.dataset.g);
    const taken = new Set(S.settings.schedule.groups.filter((x) => x.id !== g.id).flatMap((x) => x.days));
    if (!(await unlock())) return;
    const r = await daysSheet({ title: 'Edit Schedule', days: g.days, takenBy: taken, allowDelete: true });
    if (!r) return;
    if (r.delete) {
      const v = await actionSheet({
        message: `Delete the schedule for ${fmtDays(g.days)}? Those days will have no restrictions.`,
        actions: [{ label: 'Delete Schedule', value: true, style: 'destructive' }, { label: 'Cancel', style: 'cancel' }],
      });
      if (v) await update((s) => (s.schedule.groups = s.schedule.groups.filter((x) => x.id !== g.id)));
      return;
    }
    await update((s) => (s.schedule.groups.find((x) => x.id === g.id).days = r.days));
  },
  addGroup: async () => {
    const taken = new Set(S.settings.schedule.groups.flatMap((x) => x.days));
    if (!(await unlock())) return;
    const free = [0, 1, 2, 3, 4, 5, 6].filter((d) => !taken.has(d));
    const r = await daysSheet({ title: 'Add Schedule', days: free, takenBy: taken, allowDelete: false });
    if (!r?.days?.length) return;
    let copy = null;
    if (S.settings.schedule.groups.length) {
      const opts = S.settings.schedule.groups.map((g) => ({ label: `Copy ${fmtDays(g.days)}`, value: g.id }));
      copy = await actionSheet({
        title: 'Copy Time Windows?',
        message: 'Start from the time windows of an existing schedule.',
        actions: [...opts, { label: 'Don’t Copy', value: 'none' }, { label: 'Cancel', style: 'cancel' }],
      });
      if (!copy) return;
    }
    await update((s) => {
      const src = s.schedule.groups.find((g) => g.id === copy);
      s.schedule.groups.push({
        id: uid('g'),
        days: r.days,
        windows: src
          ? src.windows.map((w) => ({ ...structuredClone(w), id: uid('w') }))
          : [{ id: uid('w'), name: 'All Day', start: '00:00', end: '23:59', allowed: s.allowanceItems.map((i) => i.id) }],
      });
    });
  },
  draftToggle: (el) => {
    const w = windowDraft.w;
    const id = el.dataset.id;
    w.allowed = w.allowed.includes(id) ? w.allowed.filter((x) => x !== id) : [...w.allowed, id];
    render('none');
  },
  draftAll: () => {
    const all = S.settings.allowanceItems.map((i) => i.id);
    windowDraft.w.allowed = all.every((id) => windowDraft.w.allowed.includes(id)) ? [] : all;
    render('none');
  },
  saveWindow: async () => {
    const [, , gid] = currentRoute.parts;
    const w = windowDraft.w;
    w.name = w.name.trim() || 'Time Window';
    const group = S.settings.schedule.groups.find((g) => g.id === gid);
    const err = windowConflict(group, w);
    if (err) {
      windowDraft.error = err;
      return render('none');
    }
    const ok = await update((s) => {
      const g = s.schedule.groups.find((x) => x.id === gid);
      const i = g.windows.findIndex((x) => x.id === w.id);
      if (i >= 0) g.windows[i] = w;
      else g.windows.push(w);
    }, { rerender: false });
    if (ok) {
      windowDraft = null;
      location.hash = '#/schedule';
    }
  },
  deleteWindow: async () => {
    const [, , gid, wid] = currentRoute.parts;
    const v = await actionSheet({
      actions: [{ label: 'Delete Time Window', value: true, style: 'destructive' }, { label: 'Cancel', style: 'cancel' }],
    });
    if (!v) return;
    const ok = await update((s) => {
      const g = s.schedule.groups.find((x) => x.id === gid);
      g.windows = g.windows.filter((x) => x.id !== wid);
    }, { rerender: false });
    if (ok) {
      windowDraft = null;
      location.hash = '#/schedule';
    }
  },

  // ----- always allowed
  addAlways: async () => {
    const d = await askDomain('Always Allow Website');
    if (d) await update((s) => (s.alwaysAllowed = [...new Set([...s.alwaysAllowed, d])]));
  },
  addAlwaysQuick: (el) => update((s) => (s.alwaysAllowed = [...new Set([...s.alwaysAllowed, el.dataset.domain])])),
  removeAlways: (el) => update((s) => (s.alwaysAllowed = s.alwaysAllowed.filter((d) => d !== el.dataset.domain))),

  // ----- content
  contentMode: (el) => update((s) => (s.content.mode = el.dataset.mode)),
  contentAdd: async (el) => {
    const d = await askDomain('Add Website');
    if (d) await update((s) => (s.content[el.dataset.key] = [...new Set([...s.content[el.dataset.key], d])]));
  },
  contentRemove: (el) => update((s) => (s.content[el.dataset.key] = s.content[el.dataset.key].filter((d) => d !== el.dataset.domain))),

  // ----- passcode
  setPasscode: async () => {
    const codes = await passcodePad([
      { title: 'Screen Time Passcode', subtitle: 'Create a passcode that will be required to allow more time, or to make changes to Screen Time settings.' },
      { title: 'Re-enter Screen Time Passcode', verify: (c, prev) => c === prev[0] || 'Passcodes did not match. Try again.' },
    ]);
    if (!codes) return;
    const passcode = await hashPasscode(codes[0]);
    S.unlocked = true;
    await update((s) => {
      s.passcode = passcode;
      s.blockAtEnd = true;
    });
  },
  changePasscode: async () => {
    if (!(await unlock())) return;
    const codes = await passcodePad([
      { title: 'Enter New Passcode' },
      { title: 'Re-enter New Passcode', verify: (c, prev) => c === prev[0] || 'Passcodes did not match. Try again.' },
    ]);
    if (!codes) return;
    const passcode = await hashPasscode(codes[0]);
    await update((s) => (s.passcode = passcode));
    alertDialog({ title: 'Passcode Changed', message: 'Your Screen Time passcode has been updated.' });
  },
  removePasscode: async () => {
    const v = await actionSheet({
      message: 'Turning off the passcode lets anyone using this browser change Screen Time settings and ignore limits.',
      actions: [{ label: 'Turn Off Passcode', value: true, style: 'destructive' }, { label: 'Cancel', style: 'cancel' }],
    });
    if (!v) return;
    const ok = await update((s) => (s.passcode = null), { rerender: false });
    if (ok) location.hash = '#/';
  },

  // ----- tracking
  trackingOn: () => update((s) => (s.tracking = true)),
  trackingOff: async () => {
    const v = await actionSheet({
      message: 'Turning off App & Website Activity stops reports and turns off Time Allowances and Screen Time Schedule.',
      actions: [{ label: 'Turn Off App & Website Activity', value: true, style: 'destructive' }, { label: 'Cancel', style: 'cancel' }],
    });
    if (v) await update((s) => (s.tracking = false));
  },

  // ----- options
  grantPerm: () => {
    // Must be called synchronously from the click for Firefox to show the prompt.
    api.permissions.request({ origins: ['<all_urls>'] }).then(async (granted) => {
      S.hostPerm = granted;
      render('none');
    });
  },
  exportData: async () => {
    const all = await api.storage.local.get(null);
    const blob = new Blob([JSON.stringify({ app: 'screen-time', exportedAt: new Date().toISOString(), data: all }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `screen-time-${dayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  importData: async () => {
    if (!(await unlock())) return;
    const input = $('#importFile');
    input.onchange = async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (parsed.app !== 'screen-time' || typeof parsed.data !== 'object') throw new Error('format');
        const data = {};
        for (const [k, v] of Object.entries(parsed.data)) if (k === 'settings' || k === 'meta' || k.startsWith(DAY_PREFIX)) data[k] = v;
        data.settings = normalizeSettings(data.settings);
        const v = await actionSheet({
          message: 'Importing replaces your current settings and merges the usage history from the file.',
          actions: [{ label: 'Import', value: true, style: 'destructive' }, { label: 'Cancel', style: 'cancel' }],
        });
        if (!v) return;
        await api.storage.local.set(data);
        await reload();
        alertDialog({ title: 'Import Complete', message: 'Your Screen Time data was imported.' });
      } catch {
        alertDialog({ title: 'Couldn’t Import', message: 'This file isn’t a Screen Time export.' });
      }
    };
    input.click();
  },
  clearUsage: async () => {
    const v = await actionSheet({
      message: 'This permanently deletes all usage history, pickups and notification counts.',
      actions: [{ label: 'Clear Usage Data', value: true, style: 'destructive' }, { label: 'Cancel', style: 'cancel' }],
    });
    if (!v || !(await unlock())) return;
    const all = await api.storage.local.get(null);
    await api.storage.local.remove(Object.keys(all).filter((k) => k.startsWith(DAY_PREFIX) || k === 'meta'));
    S.meta = {};
    render('none');
  },
};

const changes = {
  toggleAlways: (el) =>
    update((s) => {
      const d = el.dataset.domain;
      s.alwaysAllowed = el.checked ? [...new Set([...s.alwaysAllowed, d])] : s.alwaysAllowed.filter((x) => !matchesPattern(d, x));
    }),
  sharedSet: (el) => update((s) => (s.sharedLimit = SHARED_STOPS[+el.value])),
  blockAtEnd: (el) => update((s) => (s.blockAtEnd = el.checked)),
  renameItem: (el) => {
    const name = el.value.trim();
    if (!name) return render('none');
    update((s) => (s.allowanceItems.find((i) => i.id === el.dataset.id).name = name));
  },
  toggleShared: (el) => update((s) => (s.allowanceItems.find((i) => i.id === el.dataset.id).shared = el.checked)),
  toggleItemWindow: (el) =>
    update((s) => {
      const w = s.schedule.groups.find((g) => g.id === el.dataset.g).windows.find((x) => x.id === el.dataset.w);
      const id = el.dataset.id;
      w.allowed = el.checked ? [...new Set([...w.allowed, id])] : w.allowed.filter((x) => x !== id);
    }),
  scheduleEnabled: (el) => update((s) => (s.schedule.enabled = el.checked)),
  timerEnabled: (el) => update((s) => (s.timer.enabled = el.checked)),
  timerOnlyLast: (el) => update((s) => (s.timer.onlyLast = el.checked)),
  directEnabled: (el) => update((s) => (s.directLinks.enabled = el.checked)),
  directSchedule: (el) => update((s) => (s.directLinks.duringSchedule = el.checked)),
  directSite: (el) => update((s) => (s.directLinks.sites[el.dataset.site] = el.checked)),
  draftStart: (el) => {
    windowDraft.w.start = mergeTime(windowDraft.w.start, el);
    windowDraft.error = '';
  },
  draftEnd: (el) => {
    windowDraft.w.end = mergeTime(windowDraft.w.end, el);
    windowDraft.error = '';
  },
  notif: (el) => update((s) => (s.notifications[el.dataset.key] = el.checked)),
};

const inputs = {
  sharedSlide: (el) => ($('#sharedBig').textContent = fmtBigLimit(SHARED_STOPS[+el.value])),
  draftName: (el) => (windowDraft.w.name = el.value),
};

/** New categories become available in windows that currently allow "All Others". */
function addToOpenWindows(s, id) {
  for (const g of s.schedule.groups) for (const w of g.windows) if (w.allowed.includes(OTHERS_ID) && !w.allowed.includes(id)) w.allowed.push(id);
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) {
    if (el.tagName === 'A') e.preventDefault();
    fn(el, e);
  }
});
app.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = changes[el.dataset.change];
  if (!fn) return;
  const prev = el.type === 'checkbox' ? !el.checked : null;
  const ok = await fn(el, e);
  if (ok === false && prev != null) el.checked = prev; // passcode cancelled
});
app.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el) inputs[el.dataset.input]?.(el, e);
});
app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.name-input')) e.target.blur();
});

// ================================================================ boot

async function reload() {
  [S.settings, S.runtime, S.meta] = await Promise.all([getSettings(), getRuntime(), getMeta()]);
  await render('none');
}

let refreshTimer = null;
api.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local') return;
  let needs = false;
  if (ch.settings) {
    const next = normalizeSettings(ch.settings.newValue);
    if (JSON.stringify(next) !== JSON.stringify(S.settings)) {
      S.settings = next;
      needs = true;
    }
  }
  if (ch.meta) {
    S.meta = ch.meta.newValue || {};
  }
  if (ch.runtime) {
    S.runtime = ch.runtime.newValue || S.runtime;
    if (currentView === views.direct || currentView === views.allowances) needs = true;
  }
  if (Object.keys(ch).some((k) => k.startsWith(DAY_PREFIX)) && currentView?.live) needs = true;
  if (!needs) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    const a = document.activeElement;
    if (a && app.contains(a) && a.matches('input[type="text"], input[type="range"], select')) return;
    if (document.querySelector('.overlay, .passcode')) return;
    render('none');
  }, 250);
});

installFaviconFallback(document);
(async () => {
  try {
    S.hostPerm = await api.permissions.contains({ origins: ['<all_urls>'] });
  } catch {
    S.hostPerm = true;
  }
  await api.runtime.sendMessage({ type: 'flush' }).catch(() => {});
  [S.settings, S.runtime, S.meta] = await Promise.all([getSettings(), getRuntime(), getMeta()]);
  const r = parseHash();
  lastDepth = r.parts.length;
  lastPath = r.parts.join('/');
  await render('fade');
  // Keep "Updated today at…" fresh while the page is open.
  setInterval(() => {
    if (currentView?.live && document.visibilityState === 'visible') api.runtime.sendMessage({ type: 'flush' }).catch(() => {});
  }, 30_000);
})();
