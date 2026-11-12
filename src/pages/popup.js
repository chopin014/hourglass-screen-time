// Toolbar popup: a Screen Time widget for today plus the current site's status.

import { api, getSettings, getDay, getMeta } from '../lib/store.js';
import { domainOfUrl, scheduleAt } from '../lib/policy.js';
import { prettyName } from '../lib/categories.js';
import { period, buildReport, renderUsageChart, hourLabels } from '../lib/reports.js';
import { fmtDuration, fmtClock, dayKey } from '../lib/time.js';
import { icon } from '../lib/icons.js';
import { esc, siteTile, glyphTile, installFaviconFallback } from '../lib/ui.js';

const DASHBOARD = api.runtime.getURL('src/pages/dashboard.html');

async function openDashboard(hash = '#/') {
  const [existing] = await api.tabs.query({ url: `${DASHBOARD}*` });
  if (existing) {
    await api.tabs.update(existing.id, { url: DASHBOARD + hash, active: true });
    await api.windows.update(existing.windowId, { focused: true });
  } else {
    await api.tabs.create({ url: DASHBOARD + hash });
  }
  window.close();
}

function statusLine(st) {
  if (!st) return { text: '', cls: '' };
  if (st.blocked) {
    const why = { content: 'Restricted', schedule: 'Not available right now', allowance: 'Time allowance used up' }[st.reason];
    return { text: why, cls: 'bad' };
  }
  if (st.alwaysAllowed) return { text: 'Always Allowed', cls: '' };
  if (st.granted) return { text: `Limit ignored until ${fmtClock(new Date(st.granted.until))}`, cls: 'warn' };
  if (st.remaining != null) {
    return { text: `${fmtDuration(st.remaining)} left today`, cls: st.remaining <= 300 ? 'warn' : '' };
  }
  return { text: 'No time allowance', cls: '' };
}

async function render() {
  const root = document.getElementById('root');
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  const domain = domainOfUrl(tab?.url);
  const st = await api.runtime.sendMessage({ type: 'status', domain }).catch(() => null);
  const [settings, today, meta] = await Promise.all([getSettings(), getDay(dayKey()), getMeta()]);

  const head = `<div class="head">${glyphTile('hourglass', 'hourglass')}<h1>Screen Time</h1><button class="open" data-go="#/">Settings</button></div>`;

  if (!settings.tracking) {
    root.innerHTML = `${head}<div class="card off">App &amp; Website Activity is off.<br><br><button class="pill-btn" data-go="#/">Turn On…</button></div>`;
    return;
  }

  const p = period('day', 0);
  const rep = buildReport(settings, p, { [p.keys[0]]: today });

  let current = '';
  if (domain) {
    const used = today.sites[domain] || 0;
    const s = statusLine(st);
    const limit = st?.limits?.length ? st.limits.reduce((a, b) => (a.remaining <= b.remaining ? a : b)) : null;
    const pct = limit ? Math.min(100, (limit.usedSec / limit.limitSec) * 100) : 0;
    current = `<div class="card"><button class="current row" data-go="#/site/${encodeURIComponent(domain)}" style="padding:14px 16px">
      ${siteTile(domain, meta, 'lg')}
      <div class="body">
        <div class="name">${esc(prettyName(domain))}</div>
        <div class="status ${s.cls}">${esc(s.text)}${used >= 1 ? ` · ${fmtDuration(used)} today` : ''}</div>
        ${limit && !st.alwaysAllowed ? `<div class="progress ${s.cls}"><i style="width:${pct}%"></i></div>` : ''}
      </div>
      <span class="chev">${icon('chevronRight')}</span>
    </button></div>`;
  }

  const sites = Object.entries(rep.siteTotals).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const most = sites.length
    ? `<div class="card">${sites
        .map(
          ([d, v]) =>
            `<button class="row with-tile" data-go="#/site/${encodeURIComponent(d)}">${siteTile(d, meta)}<div class="body"><div class="title">${esc(prettyName(d))}</div></div><span class="detail tnum">${fmtDuration(v)}</span></button>`,
        )
        .join('')}</div>`
    : '';

  const sch = scheduleAt(settings);
  const schedLine =
    sch.active
      ? `<div class="sched">${icon('schedule')}<span>${sch.window ? `${esc(sch.window.name)} until ${sch.window.end}` : `Only Always Allowed until ${fmtClock(new Date(sch.nextAt))}`}</span></div>`
      : '';

  root.innerHTML = `${head}
    <div class="card summary">
      <div class="lbl">Today</div>
      <div class="big">${fmtDuration(rep.total)}</div>
      ${renderUsageChart({ columns: rep.columns, mode: 'hours', max: 3600, labels: hourLabels() })}
    </div>
    ${current}
    ${most}
    ${schedLine}
    <div class="footer">
      <button data-go="#/allowances">Time Allowances</button>
      <button class="primary" data-go="#/activity?view=day">See All Activity</button>
    </div>`;
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-go]');
  if (el) openDashboard(el.dataset.go);
});
installFaviconFallback(document);
render();
