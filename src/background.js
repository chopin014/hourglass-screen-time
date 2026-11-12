// Background event page: tracks usage, enforces Time Allowances / Screen
// Time Schedule / content restrictions, and sends the iOS-style notifications.
//
// Firefox may unload this page when idle, so the in-progress session lives in
// storage.session and a 30-second heartbeat alarm keeps the books balanced.

import {
  api, getSettings, saveSettings, getRuntime, getDays, getDay, dayStorageKey, checkPasscode, getMeta, DAY_PREFIX,
} from './lib/store.js';
import { domainOfUrl, evaluate, scheduleAt, allowedItems, normalizeDomain } from './lib/policy.js';
import { dayKey, nextMidnight, startOfWeek, addDays, fmtRemaining, fmtDuration, DAY_MS } from './lib/time.js';
import { directTarget, siteFor, directEnabledFor, directLeft } from './lib/directlinks.js';

const IDLE_SECONDS = 60;
const PICKUP_GAP_MS = 60_000;
const MAX_CREDIT_MS = 90_000; // never credit more than this between two ticks (sleep, crashes…)
const RETENTION_DAYS = 180;
const BLOCKED_PAGE = api.runtime.getURL('src/pages/blocked.html');
const DASHBOARD = api.runtime.getURL('src/pages/dashboard.html');
const ICON = api.runtime.getURL('icons/icon-96.png');

// ------------------------------------------------------------ serial queue

let queue = Promise.resolve();
function serial(fn) {
  const p = queue.then(fn);
  queue = p.catch((e) => console.error('[screen-time]', e));
  return p;
}

// ------------------------------------------------------------ session state

async function getSession() {
  const { session } = await api.storage.session.get('session');
  return session || { domain: null, tabId: null, since: 0, active: false, lastActive: 0, pendingFirst: false };
}

async function detectActive() {
  const none = { domain: null, tab: null, browserActive: false };
  let win;
  try {
    win = await api.windows.getLastFocused({ windowTypes: ['normal'] });
  } catch {
    return none;
  }
  if (!win || !win.focused) return none;
  const [tab] = await api.tabs.query({ active: true, windowId: win.id });
  // The window can still claim focus while it's on another workspace; the page knows better.
  const { hiddenTabs } = await api.storage.session.get('hiddenTabs');
  if (tab && hiddenTabs?.[tab.id]) return none;
  const idle = await api.idle.queryState(IDLE_SECONDS);
  const browserActive = idle === 'active' || !!tab?.audible;
  if (!browserActive) return none;
  return { domain: tab ? domainOfUrl(tab.url) : null, tab: tab || null, browserActive };
}

// ------------------------------------------------------------- day writer

const round2 = (n) => Math.round(n * 100) / 100;

class DayWriter {
  constructor() {
    this.days = {};
  }

  async get(key) {
    if (!this.days[key]) this.days[key] = (await getDays([key]))[key];
    return this.days[key];
  }

  /** Credit [from, to) to `domain`, split across hour and day boundaries. */
  async addUsage(domain, from, to) {
    let t = from;
    while (t < to) {
      const d = new Date(t);
      const boundary = new Date(d);
      boundary.setMinutes(60, 0, 0);
      const end = Math.min(to, boundary.getTime());
      const sec = (end - t) / 1000;
      const day = await this.get(dayKey(d));
      const h = d.getHours();
      day.sites[domain] = round2((day.sites[domain] || 0) + sec);
      day.hours[h] = day.hours[h] || {};
      day.hours[h][domain] = round2((day.hours[h][domain] || 0) + sec);
      t = end;
    }
  }

  async pickup(now) {
    const d = new Date(now);
    const day = await this.get(dayKey(d));
    day.pickups += 1;
    day.pickupHours[d.getHours()] = (day.pickupHours[d.getHours()] || 0) + 1;
    if (!day.firstPickupAt) day.firstPickupAt = now;
  }

  async firstUsed(domain, now) {
    const day = await this.get(dayKey(new Date(now)));
    day.firstUsed[domain] = (day.firstUsed[domain] || 0) + 1;
  }

  async notification(domain, now) {
    const d = new Date(now);
    const day = await this.get(dayKey(d));
    day.notifs[domain] = (day.notifs[domain] || 0) + 1;
    day.notifHours[d.getHours()] = (day.notifHours[d.getHours()] || 0) + 1;
  }

  async commit() {
    const entries = Object.entries(this.days);
    if (!entries.length) return;
    await api.storage.local.set(Object.fromEntries(entries.map(([k, v]) => [dayStorageKey(k), v])));
  }
}

// ------------------------------------------------------------------ tick

async function tick() {
  const now = Date.now();
  const [settings, sess, runtime] = await Promise.all([getSettings(), getSession(), getRuntime()]);
  const active = await detectActive();
  const writer = new DayWriter();

  if (settings.tracking) {
    if (sess.domain && sess.since && sess.since < now) {
      await writer.addUsage(sess.domain, Math.max(sess.since, now - MAX_CREDIT_MS), now);
    }
    if (active.browserActive && !sess.active && (!sess.lastActive || now - sess.lastActive > PICKUP_GAP_MS)) {
      await writer.pickup(now);
      sess.pendingFirst = true;
    }
    if (active.domain && sess.pendingFirst) {
      await writer.firstUsed(active.domain, now);
      sess.pendingFirst = false;
    }
    await writer.commit();
  }

  await api.storage.session.set({
    session: {
      domain: settings.tracking ? active.domain : null,
      tabId: active.tab?.id ?? null,
      since: now,
      active: active.browserActive,
      lastActive: active.browserActive ? now : sess.lastActive,
      pendingFirst: !!sess.pendingFirst,
    },
  });

  await enforce(settings, runtime, active, now);
}

// ------------------------------------------------------------ enforcement

const recentlyBlocked = new Map(); // tabId -> timestamp, avoids double redirects

// ------------------------------------------------------------ direct links
//
// A pass lets one tab show one piece of content (a video / post) on a blocked
// site. Any other URL on that site in that tab — including in-page (SPA)
// navigation and tabs opened from it — is blocked as "internal".

const REDIRECT_GRACE_MS = 20_000;
const CHILD_TAB_MS = 60_000;

async function getPasses() {
  const { passes, childTabs } = await api.storage.session.get(['passes', 'childTabs']);
  return { passes: passes || {}, childTabs: childTabs || {} };
}

function passAllows(pass, url, now = Date.now()) {
  if (!pass) return false;
  const t = directTarget(url);
  if (!t || t.site.id !== pass.site) return false;
  return t.key === pass.key || pass.graceUntil > now; // grace absorbs redirects (youtu.be, share links)
}

/** Drop the tab's pass when it leaves the shared content; returns whether the navigation is "internal". */
async function settlePass(tabId, url) {
  const { passes, childTabs } = await getPasses();
  const pass = passes[tabId];
  const now = Date.now();
  if (passAllows(pass, url, now)) return { allowed: true, internal: false };
  let internal = false;
  if (pass && siteFor(url)?.site.id === pass.site) internal = true;
  const child = childTabs[tabId];
  if (child && child.until > now && siteFor(url)?.site.id === child.site) internal = true;
  if (pass || child) {
    delete passes[tabId];
    delete childTabs[tabId];
    await api.storage.session.set({ passes, childTabs });
  }
  return { allowed: false, internal };
}

async function grantDirectLink(tabId, { url, reason }) {
  const settings = await getSettings();
  const runtime = await getRuntime();
  const t = directTarget(url);
  if (!t || !directEnabledFor(settings, t.site, reason)) return { ok: false, error: 'unavailable' };
  const today = dayKey();
  if (directLeft(settings, runtime, today) <= 0) return { ok: false, error: 'quota' };
  runtime.directUsed = runtime.directUsed || {};
  runtime.directUsed[today] = (runtime.directUsed[today] || 0) + 1;
  await api.storage.local.set({ runtime });
  const { passes } = await getPasses();
  passes[tabId] = { site: t.site.id, key: t.key, url, at: Date.now(), graceUntil: Date.now() + REDIRECT_GRACE_MS };
  await api.storage.session.set({ passes });
  return { ok: true, left: directLeft(settings, runtime, today) };
}

async function directInfo({ url, reason, via }) {
  const settings = await getSettings();
  const runtime = await getRuntime();
  const t = directTarget(url);
  const f = siteFor(url);
  const site = t?.site || f?.site || null;
  const enabled = directEnabledFor(settings, site, reason);
  const left = directLeft(settings, runtime, dayKey());
  return {
    supported: !!site && enabled,
    content: !!t,
    internal: via === 'internal',
    offer: !!t && enabled && via !== 'internal' && left > 0,
    left: Number.isFinite(left) ? left : null,
    perDay: settings.directLinks.perDay,
    noun: site?.noun || 'Page',
    siteName: site?.name || '',
  };
}

function blockedUrl(originalUrl, verdict, via = '') {
  const p = new URLSearchParams({
    u: originalUrl,
    d: verdict.domain,
    r: verdict.reason,
    n: verdict.limitName || verdict.windowName || '',
  });
  if (via) p.set('via', via);
  return `${BLOCKED_PAGE}?${p}`;
}

async function blockTab(tabId, url, verdict, via = '') {
  const last = recentlyBlocked.get(tabId);
  if (last && Date.now() - last < 1500) return;
  recentlyBlocked.set(tabId, Date.now());
  try {
    await api.tabs.update(tabId, { url: blockedUrl(url, verdict, via), loadReplace: true });
  } catch (e) {
    console.warn('[screen-time] could not block tab', e);
  }
}

async function enforce(settings, runtime, active, now) {
  const today = await getDay(dayKey(new Date(now)));
  const ctx = { settings, sites: today.sites, runtime };
  const date = new Date(now);
  const verdicts = new Map();
  const verdictFor = (d) => {
    if (!verdicts.has(d)) verdicts.set(d, evaluate(ctx, d, date));
    return verdicts.get(d);
  };

  const tabs = await api.tabs.query({});
  const { passes } = await getPasses();
  let blockedActive = false;
  for (const tab of tabs) {
    if (tab.discarded) continue;
    const d = domainOfUrl(tab.url);
    if (!d) continue;
    const v = verdictFor(d);
    if (v.blocked) {
      const pass = passes[tab.id];
      if (v.reason !== 'content' && passAllows(pass, tab.url, now)) continue;
      await blockTab(tab.id, tab.url, v, pass ? 'internal' : '');
      if (tab.id === active.tab?.id) blockedActive = true;
    }
  }
  if (blockedActive) {
    // Stop the clock right away: the block screen replaces the site.
    const { session } = await api.storage.session.get('session');
    if (session) await api.storage.session.set({ session: { ...session, domain: null } });
  }

  let runtimeDirty = false;
  const current = active.domain ? verdictFor(active.domain) : null;
  if (current && !current.blocked) runtimeDirty = (await timeChecks(settings, runtime, current, now)) || runtimeDirty;
  runtimeDirty = (await scheduleNotice(settings, runtime, now)) || runtimeDirty;
  runtimeDirty = (await weeklyReport(settings, runtime, now)) || runtimeDirty;
  runtimeDirty = (await housekeeping(runtime, now)) || runtimeDirty;
  if (runtimeDirty) await api.storage.local.set({ runtime });

  await updateBadge(current);
  await planNextAlarm(settings, runtime, current, now);
}

async function updateBadge(verdict) {
  let text = '';
  if (verdict && !verdict.blocked && !verdict.granted && verdict.remaining != null && verdict.remaining < 3600) {
    text = `${Math.max(1, Math.ceil(verdict.remaining / 60))}m`;
  }
  try {
    await api.action.setBadgeText({ text });
    if (text) await api.action.setBadgeBackgroundColor({ color: verdict.remaining <= 300 ? '#ff453a' : '#5e5ce6' });
  } catch {
    /* badge is cosmetic */
  }
}

async function planNextAlarm(settings, runtime, current, now) {
  const at = [nextMidnight(new Date(now)).getTime() + 1000];
  if (current && !current.blocked) {
    for (const l of current.limits) {
      for (const offset of [300, 60, 0]) {
        const t = l.remaining - offset;
        if (t > 0) at.push(now + t * 1000 + 250);
      }
    }
  }
  for (const g of Object.values(runtime.grants || {})) if (g.until > now) at.push(g.until + 250);
  const st = scheduleAt(settings, new Date(now));
  if (st.active) at.push(st.nextAt - 300_000, st.nextAt + 250);
  const when = Math.min(...at.filter((t) => t > now + 500));
  if (Number.isFinite(when)) api.alarms.create('precise', { when });
}

// ---------------------------------------------------------- notifications

function notify(id, title, message) {
  return api.notifications.create(id, { type: 'basic', iconUrl: ICON, title, message }).catch(() => {});
}

function flagsFor(runtime, now) {
  const k = dayKey(new Date(now));
  runtime.notified = runtime.notified || {};
  runtime.notified[k] = runtime.notified[k] || {};
  return runtime.notified[k];
}

async function timeChecks(settings, runtime, verdict, now) {
  if (!settings.notifications.timeCheck || verdict.granted || !verdict.limits.length) return false;
  const flags = flagsFor(runtime, now);
  let dirty = false;
  for (const l of verdict.limits) {
    if (l.remaining <= 0 || l.remaining > 300) continue;
    const key60 = `${l.id}:60`;
    const key300 = `${l.id}:300`;
    const who = l.shared ? 'your shared time allowance' : l.name;
    if (l.remaining <= 60 && !flags[key60]) {
      flags[key60] = flags[key300] = true;
      await notify(`timecheck:${l.id}`, 'Time Check', `1 minute remaining for ${who} today.`);
      dirty = true;
    } else if (l.remaining > 60 && !flags[key300]) {
      flags[key300] = true;
      await notify(`timecheck:${l.id}`, 'Time Check', `${fmtRemaining(l.remaining)} remaining for ${who} today.`);
      dirty = true;
    }
  }
  return dirty;
}

async function scheduleNotice(settings, runtime, now) {
  if (!settings.notifications.schedule) return false;
  const st = scheduleAt(settings, new Date(now));
  if (!st.active) return false;
  const msLeft = st.nextAt - now;
  if (msLeft <= 0 || msLeft > 300_000) return false;
  const flags = flagsFor(runtime, now);
  const key = `sched:${st.nextAt}`;
  if (flags[key]) return false;

  const next = scheduleAt(settings, new Date(st.nextAt + 1000));
  const nowAllowed = new Set(st.window?.allowed || []);
  const nextAllowed = new Set(next.active ? next.window?.allowed || [] : settings.allowanceItems.map((i) => i.id));
  const losing = [...nowAllowed].some((id) => !nextAllowed.has(id));
  if (!losing) return false; // nothing gets restricted – stay quiet

  flags[key] = true;
  const mins = fmtRemaining(msLeft / 1000);
  let message;
  if (next.active && next.window) {
    const names = allowedItems(settings, next.window).map((i) => i.name);
    message = `${next.window.name} will begin in ${mins}. ${names.length ? `Only ${listJoin(names)} will be available.` : 'Only Always Allowed websites will be available.'}`;
  } else {
    message = `In ${mins}, only Always Allowed websites will be available.`;
  }
  await notify('schedule', 'Screen Time Schedule', message);
  return true;
}

function listJoin(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

async function weekTotal(weekStart) {
  const keys = Array.from({ length: 7 }, (_, i) => dayKey(addDays(weekStart, i)));
  const days = await getDays(keys);
  return Object.values(days).reduce((sum, d) => sum + Object.values(d.sites).reduce((a, b) => a + b, 0), 0);
}

async function weeklyReport(settings, runtime, now) {
  if (!settings.notifications.weeklyReport || !settings.tracking) return false;
  const date = new Date(now);
  if (date.getDay() !== 1 || date.getHours() < 9) return false; // Monday morning
  const lastWeek = addDays(startOfWeek(date), -7);
  const key = dayKey(lastWeek);
  if (runtime.lastWeekly === key) return false;
  runtime.lastWeekly = key;
  const [cur, prev] = await Promise.all([weekTotal(lastWeek), weekTotal(addDays(lastWeek, -7))]);
  if (cur <= 0) return true;
  const avg = fmtDuration(cur / 7);
  let message;
  if (prev > 0) {
    const pct = Math.round(((cur - prev) / prev) * 100);
    message = `Your screen time was ${pct <= 0 ? 'down' : 'up'} ${Math.abs(pct)}% last week, for an average of ${avg} a day.`;
  } else {
    message = `You averaged ${avg} of screen time a day last week.`;
  }
  await notify('weekly', 'Weekly Report Available', message);
  return true;
}

async function housekeeping(runtime, now) {
  const today = dayKey(new Date(now));
  if (runtime.lastPrune === today) return false;
  runtime.lastPrune = today;
  // Drop expired grants and old notification flags.
  for (const [d, g] of Object.entries(runtime.grants || {})) if (g.until <= now) delete runtime.grants[d];
  for (const k of Object.keys(runtime.notified || {})) if (k !== today) delete runtime.notified[k];
  for (const k of Object.keys(runtime.minuteUsed || {})) if (k !== today) delete runtime.minuteUsed[k];
  for (const k of Object.keys(runtime.directUsed || {})) if (k !== today) delete runtime.directUsed[k];
  // Usage retention.
  const all = await api.storage.local.get(null);
  const cutoff = dayKey(new Date(now - RETENTION_DAYS * DAY_MS));
  const old = Object.keys(all).filter((k) => k.startsWith(DAY_PREFIX) && k.slice(DAY_PREFIX.length) < cutoff);
  if (old.length) await api.storage.local.remove(old);
  return true;
}

// ---------------------------------------------------------- ignore limit

const GRANTS = {
  minute: 60_000,
  remind15: 15 * 60_000,
  approve15: 15 * 60_000,
  approve60: 60 * 60_000,
};

async function ignoreLimit({ domain, option, code }) {
  domain = normalizeDomain(domain);
  const settings = await getSettings();
  const runtime = await getRuntime();
  const needsCode = option.startsWith('approve');
  if (needsCode && !(await checkPasscode(settings, code))) return { ok: false, error: 'passcode' };
  if (!needsCode && option !== 'minute' && settings.passcode && settings.blockAtEnd) return { ok: false, error: 'passcode' };

  const now = Date.now();
  const today = dayKey(new Date(now));
  if (option === 'minute') {
    runtime.minuteUsed[today] = runtime.minuteUsed[today] || [];
    if (runtime.minuteUsed[today].includes(domain)) return { ok: false, error: 'minute-used' };
    runtime.minuteUsed[today].push(domain);
  }
  const until = option === 'today' || option === 'approveDay' ? nextMidnight(new Date(now)).getTime() : now + (GRANTS[option] || 0);
  if (until <= now) return { ok: false, error: 'option' };
  runtime.grants[domain] = { until, kind: option };
  await api.storage.local.set({ runtime });
  return { ok: true, until };
}

async function allowSite({ domain, code }) {
  const settings = await getSettings();
  if (!(await checkPasscode(settings, code))) return { ok: false, error: 'passcode' };
  domain = normalizeDomain(domain);
  const c = settings.content;
  if (c.mode === 'approved') c.approved = [...new Set([...c.approved, domain])];
  else {
    c.allow = [...new Set([...c.allow, domain])];
    c.deny = c.deny.filter((d) => normalizeDomain(d) !== domain);
  }
  await saveSettings(settings);
  return { ok: true };
}

// ---------------------------------------------------------------- status

async function status(domain) {
  domain = domain ? normalizeDomain(domain) : null;
  await serial(tick);
  const [settings, runtime, today] = await Promise.all([getSettings(), getRuntime(), getDay()]);
  const v = evaluate({ settings, sites: today.sites, runtime }, domain);
  const { items, effective, ...rest } = v;
  return {
    ...rest,
    items: items.map((i) => ({ id: i.id, name: i.name })),
    minuteUsed: (runtime.minuteUsed[dayKey()] || []).includes(domain),
    hasPasscode: !!settings.passcode,
    blockAtEnd: settings.blockAtEnd,
  };
}

// ---------------------------------------------------------------- events

const kick = () => serial(tick);

api.tabs.onActivated.addListener(kick);
// Pages report when they're hidden (see notify-bridge.js). Pages that can't run
// content scripts never report, so a new document starts out as "visible".
async function setTabHidden(tabId, hidden) {
  const { hiddenTabs = {} } = await api.storage.session.get('hiddenTabs');
  if (!!hiddenTabs[tabId] === hidden) return false;
  if (hidden) hiddenTabs[tabId] = true;
  else delete hiddenTabs[tabId];
  await api.storage.session.set({ hiddenTabs });
  return true;
}

api.tabs.onRemoved.addListener(async (tabId) => {
  recentlyBlocked.delete(tabId);
  serial(() => setTabHidden(tabId, false));
  const { passes, childTabs } = await getPasses();
  if (passes[tabId] || childTabs[tabId]) {
    delete passes[tabId];
    delete childTabs[tabId];
    await api.storage.session.set({ passes, childTabs });
  }
});
api.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.audible !== undefined || info.status === 'complete') kick();
  if ((info.favIconUrl || info.title) && domainOfUrl(tab.url)) serial(() => rememberMeta(tab));
});
api.windows.onFocusChanged.addListener(kick);
api.idle.onStateChanged.addListener(kick);
api.alarms.onAlarm.addListener(kick);
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) kick();
});

async function checkNavigation(details) {
  if (details.frameId !== 0) return;
  if (details.url.startsWith(BLOCKED_PAGE)) return;
  const domain = domainOfUrl(details.url);
  const [settings, runtime, today] = await Promise.all([getSettings(), getRuntime(), getDay()]);
  const v = domain ? evaluate({ settings, sites: today.sites, runtime }, domain) : { blocked: false };
  const pass = await settlePass(details.tabId, details.url);
  if (!v.blocked) return;
  if (pass.allowed && v.reason !== 'content') return;
  await blockTab(details.tabId, details.url, v, pass.internal ? 'internal' : '');
}

api.webNavigation.onBeforeNavigate.addListener(checkNavigation);
// YouTube / Reddit change pages with pushState: treat those like navigations.
api.webNavigation.onHistoryStateUpdated.addListener(checkNavigation);

// After redirects (youtu.be → /watch, share links → post), pin the pass to the final content.
api.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  if (!/^https?:/.test(details.url)) serial(() => setTabHidden(details.tabId, false));
  const { passes } = await getPasses();
  const pass = passes[details.tabId];
  if (!pass || pass.graceUntil <= Date.now()) return;
  const t = directTarget(details.url);
  if (!t || t.site.id !== pass.site) return;
  passes[details.tabId] = { ...pass, key: t.key, url: details.url, graceUntil: 0 };
  await api.storage.session.set({ passes });
});

// Links opened in a new tab from a passed page count as browsing inside the site.
api.webNavigation.onCreatedNavigationTarget.addListener(async ({ sourceTabId, tabId }) => {
  const { passes, childTabs } = await getPasses();
  const src = passes[sourceTabId] || childTabs[sourceTabId];
  if (!src) return;
  childTabs[tabId] = { site: src.site, until: Date.now() + CHILD_TAB_MS };
  await api.storage.session.set({ childTabs });
});

api.notifications.onClicked.addListener(async (id) => {
  const hash = id === 'weekly' ? '#/activity?view=week&offset=-1' : id === 'schedule' ? '#/schedule' : '#/activity';
  await api.tabs.create({ url: DASHBOARD + hash });
  api.notifications.clear(id);
});

api.runtime.onMessage.addListener((msg, sender) => {
  switch (msg?.type) {
    case 'flush':
      return serial(tick).then(() => ({ ok: true }));
    case 'status':
      return status(msg.domain);
    case 'ignore':
      return serial(() => ignoreLimit(msg)).then(async (r) => {
        if (r.ok) await serial(tick);
        return r;
      });
    case 'allowSite':
      return serial(() => allowSite(msg));
    case 'directInfo':
      return directInfo(msg);
    case 'directLink':
      if (!sender.tab?.id) return Promise.resolve({ ok: false, error: 'tab' });
      return serial(() => grantDirectLink(sender.tab.id, msg));
    case 'visibility':
      if (sender.tab?.id == null || sender.frameId) return undefined;
      return serial(async () => {
        if (await setTabHidden(sender.tab.id, !!msg.hidden)) await tick();
      });
    case 'verifyPasscode':
      return getSettings().then((s) => checkPasscode(s, msg.code));
    case 'notification': {
      const domain = domainOfUrl(sender.tab?.url);
      if (!domain) return undefined;
      return serial(async () => {
        const settings = await getSettings();
        if (!settings.tracking) return;
        const w = new DayWriter();
        await w.notification(domain, Date.now());
        await w.commit();
      });
    }
    default:
      return undefined;
  }
});

async function rememberMeta(tab) {
  const domain = domainOfUrl(tab.url);
  const meta = await getMeta();
  const cur = meta[domain] || {};
  const icon = tab.favIconUrl && tab.favIconUrl.length < 40_000 && !tab.favIconUrl.startsWith('chrome:') ? tab.favIconUrl : cur.icon;
  // Keep the shortest meaningful title we've seen on the site's root page.
  let title = cur.title;
  try {
    const path = new URL(tab.url).pathname;
    if (tab.title && (!title || path === '/')) title = tab.title.slice(0, 80);
  } catch {
    /* ignore */
  }
  if (icon === cur.icon && title === cur.title) return;
  meta[domain] = { icon, title };
  await api.storage.local.set({ meta });
}

async function init() {
  await api.idle.setDetectionInterval(IDLE_SECONDS);
  const hb = await api.alarms.get('heartbeat');
  if (!hb) api.alarms.create('heartbeat', { periodInMinutes: 0.5 });
  kick();
}

api.runtime.onInstalled.addListener(async ({ reason }) => {
  const { settings } = await api.storage.local.get('settings');
  if (!settings) await saveSettings(await getSettings());
  if (reason === 'install') api.tabs.create({ url: DASHBOARD + '#/welcome' });
});
api.runtime.onStartup.addListener(init);
init();
