// The rules engine shared by the background script and every page.
// Everything here is pure: give it settings + today's usage + runtime state
// and it tells you whether a site is available and how much time is left.

import { reportCategoryOf } from './categories.js';
import { toMinutes, minuteOfDay, startOfDay } from './time.js';

// ---------------------------------------------------------------- domains

export function normalizeDomain(input) {
  if (!input) return '';
  let s = String(input).trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split(/[/?#]/)[0];
  s = s.replace(/^[^@]*@/, '').replace(/:\d+$/, '');
  s = s.replace(/^(www\d?|m|mobile)\./, '');
  return s.replace(/\.$/, '');
}

export function domainOfUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    return normalizeDomain(new URL(url).hostname) || null;
  } catch {
    return null;
  }
}

export function matchesPattern(domain, pattern) {
  if (!domain || !pattern) return false;
  const p = normalizeDomain(pattern);
  return domain === p || domain.endsWith(`.${p}`);
}

const matchesAny = (domain, list) => (list || []).some((p) => matchesPattern(domain, p));

export function isAlwaysAllowed(settings, domain) {
  return matchesAny(domain, settings.alwaysAllowed);
}

// ------------------------------------------------------------- allowances

/**
 * Builds a cached domain -> allowance items resolver.
 *  - site:      single-website items matching the domain
 *  - cat:       category items containing the domain
 *  - others:    the "All Others" item when nothing else matches
 *  - all:       every item whose limit applies
 *  - effective: the most specific items (site > category > others), used by the schedule
 */
export function createMatcher(settings) {
  const items = settings.allowanceItems || [];
  const others = items.find((i) => i.kind === 'others') || null;
  const overrides = settings.siteCategories || {};
  const cache = new Map();

  const categoryContains = (item, domain) => {
    if (matchesAny(domain, item.exclude)) return false;
    if (matchesAny(domain, item.sites)) return true;
    return !!item.source && reportCategoryOf(domain, overrides) === item.source;
  };

  return (domain) => {
    if (cache.has(domain)) return cache.get(domain);
    const site = items.filter((i) => i.kind === 'site' && matchesPattern(domain, i.domain));
    const cat = items.filter((i) => i.kind === 'category' && categoryContains(i, domain));
    const other = !site.length && !cat.length && others ? [others] : [];
    const res = {
      site,
      cat,
      others: other[0] || null,
      all: [...site, ...cat, ...other],
      effective: site.length ? site : cat.length ? cat : other,
    };
    cache.set(domain, res);
    return res;
  };
}

/** Seconds used today per allowance item, plus the shared pool. */
export function usageByItem(settings, sites, matcher = createMatcher(settings)) {
  const byItem = {};
  let shared = 0;
  for (const [domain, sec] of Object.entries(sites || {})) {
    if (isAlwaysAllowed(settings, domain)) continue; // Always Allowed never counts against limits
    const m = matcher(domain);
    for (const it of m.all) byItem[it.id] = (byItem[it.id] || 0) + sec;
    if (m.all.some((i) => i.shared)) shared += sec;
  }
  return { byItem, shared };
}

// --------------------------------------------------------------- schedule

export const windowStart = (w) => toMinutes(w.start);
export const windowEnd = (w) => (w.end === '23:59' ? 1440 : toMinutes(w.end));

export function groupForDay(settings, weekday) {
  return (settings.schedule?.groups || []).find((g) => g.days.includes(weekday)) || null;
}

/** Where are we in the Screen Time Schedule at `date`? */
export function scheduleAt(settings, date = new Date()) {
  const sch = settings.schedule;
  if (!sch?.enabled || !settings.tracking) return { active: false };
  const group = groupForDay(settings, date.getDay());
  if (!group) return { active: false };
  const min = minuteOfDay(date);
  const window = group.windows.find((w) => min >= windowStart(w) && min < windowEnd(w)) || null;
  const bounds = group.windows
    .flatMap((w) => [windowStart(w), windowEnd(w)])
    .filter((b) => b > min)
    .sort((a, b) => a - b);
  const next = bounds.length ? bounds[0] : 1440;
  return { active: true, group, window, nextAt: startOfDay(date).getTime() + next * 60_000 };
}

export function sortedWindows(group) {
  return [...group.windows].sort((a, b) => windowStart(a) - windowStart(b));
}

/** Returns an error message if a window would overlap another one in its group. */
export function windowConflict(group, candidate) {
  const s = windowStart(candidate);
  const e = windowEnd(candidate);
  if (e <= s) return 'The end time must be later than the start time.';
  for (const w of group.windows) {
    if (w.id === candidate.id) continue;
    if (s < windowEnd(w) && windowStart(w) < e) return `This time window overlaps “${w.name}”.`;
  }
  return null;
}

// ------------------------------------------------------- content filters

const ADULT_DOMAINS = [
  'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com', 'youporn.com', 'onlyfans.com',
  'chaturbate.com', 'stripchat.com', 'livejasmin.com', 'spankbang.com', 'eporner.com', 'rule34.xxx',
  'brazzers.com', 'fansly.com', 'cam4.com', 'bongacams.com', 'motherless.com', 'tnaflix.com', 'hqporner.com',
];
const ADULT_RE = /(porn|xxx|hentai|nsfw|sexcam|camgirl|escort|xvideo|nude|onlyfans|\.adult$|\.porn$|\.sex$)/;

export function isAdultDomain(domain) {
  return matchesAny(domain, ADULT_DOMAINS) || ADULT_RE.test(domain);
}

export function contentBlocked(settings, domain) {
  const c = settings.content || {};
  if (!domain || c.mode === 'unrestricted' || !c.mode) return false;
  if (c.mode === 'approved') return !matchesAny(domain, c.approved);
  // limitAdult
  if (matchesAny(domain, c.allow)) return false;
  if (matchesAny(domain, c.deny)) return true;
  return isAdultDomain(domain);
}

// ---------------------------------------------------------------- grants

export function activeGrant(runtime, domain, now = Date.now()) {
  const g = runtime?.grants?.[domain];
  return g && g.until > now ? g : null;
}

// --------------------------------------------------------------- verdict

/**
 * Evaluate one domain.
 * @param ctx { settings, sites (today's seconds per domain), runtime, matcher?, usage? }
 */
export function evaluate(ctx, domain, now = new Date()) {
  const { settings, runtime } = ctx;
  const res = { domain, blocked: false, reason: null, limits: [], remaining: null, items: [], effective: [] };
  if (!domain) return res;

  if (contentBlocked(settings, domain)) return { ...res, blocked: true, reason: 'content' };
  if (!settings.tracking) return res;
  if (isAlwaysAllowed(settings, domain)) return { ...res, alwaysAllowed: true };

  const matcher = ctx.matcher || (ctx.matcher = createMatcher(settings));
  const usage = ctx.usage || (ctx.usage = usageByItem(settings, ctx.sites, matcher));
  const m = matcher(domain);
  res.items = m.all;
  res.effective = m.effective;

  for (const it of m.all) {
    if (it.limit == null) continue;
    const used = usage.byItem[it.id] || 0;
    res.limits.push({ id: it.id, name: it.name, limitSec: it.limit * 60, usedSec: used, remaining: Math.max(0, it.limit * 60 - used) });
  }
  if (settings.sharedLimit != null && m.all.some((i) => i.shared)) {
    const names = m.all.filter((i) => i.shared).map((i) => i.name);
    res.limits.push({
      id: 'shared',
      name: names.join(', '),
      shared: true,
      limitSec: settings.sharedLimit * 60,
      usedSec: usage.shared,
      remaining: Math.max(0, settings.sharedLimit * 60 - usage.shared),
    });
  }
  if (res.limits.length) res.remaining = Math.min(...res.limits.map((l) => l.remaining));

  const sched = scheduleAt(settings, now);
  res.schedule = sched;

  const grant = activeGrant(runtime, domain, now.getTime());
  if (grant) return { ...res, granted: grant };

  if (sched.active) {
    const allowed = sched.window && m.effective.some((i) => sched.window.allowed.includes(i.id));
    if (!allowed) {
      return { ...res, blocked: true, reason: 'schedule', windowName: sched.window?.name || null, until: sched.nextAt };
    }
  }

  const exhausted = res.limits.find((l) => l.remaining <= 0);
  if (exhausted) return { ...res, blocked: true, reason: 'allowance', limitName: exhausted.name, limitId: exhausted.id };

  return res;
}

/** The categories (items) a time window allows, for display. */
export function allowedItems(settings, window) {
  const ids = new Set(window.allowed || []);
  return (settings.allowanceItems || []).filter((i) => ids.has(i.id));
}
