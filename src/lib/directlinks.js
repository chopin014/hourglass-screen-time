// Direct Links: open one shared video/post on a blocked site without
// unlocking the rest of the site. Each rule turns a URL into a stable
// "content key" so the pass survives timestamps, tracking params, and
// redirects (youtu.be → youtube.com/watch, reddit share links → post).

import { normalizeDomain, matchesPattern } from './policy.js';

const YT_ID = /^[\w-]{6,20}$/;

export const DIRECT_SITES = [
  {
    id: 'youtube',
    name: 'YouTube',
    noun: 'Video',
    home: 'youtube.com',
    hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
    examples: 'Videos, Shorts, live streams and youtu.be links',
    key(host, url) {
      if (matchesPattern(host, 'youtu.be')) {
        const id = url.pathname.split('/')[1];
        return YT_ID.test(id || '') ? `v:${id}` : null;
      }
      if (url.pathname === '/watch') {
        const v = url.searchParams.get('v');
        return v && YT_ID.test(v) ? `v:${v}` : null;
      }
      const m = url.pathname.match(/^\/(shorts|live|embed)\/([\w-]{6,20})/);
      return m ? `v:${m[2]}` : null;
    },
  },
  {
    id: 'reddit',
    name: 'Reddit',
    noun: 'Post',
    home: 'reddit.com',
    hosts: ['reddit.com', 'redd.it'],
    examples: 'Posts, comment threads, share links and redd.it links',
    key(host, url) {
      if (matchesPattern(host, 'redd.it')) {
        const id = url.pathname.split('/')[1];
        return id && /^[a-z0-9]+$/i.test(id) ? `p:${id.toLowerCase()}` : null;
      }
      let m = url.pathname.match(/^\/(?:r|u|user)\/[^/]+\/comments\/([a-z0-9]+)/i) || url.pathname.match(/^\/comments\/([a-z0-9]+)/i);
      if (m) return `p:${m[1].toLowerCase()}`;
      m = url.pathname.match(/^\/r\/[^/]+\/s\/([\w-]+)/);
      return m ? `s:${m[1]}` : null; // share link; re-keyed after its redirect
    },
  },
  {
    id: 'x',
    name: 'X',
    noun: 'Post',
    home: 'x.com',
    hosts: ['x.com', 'twitter.com'],
    examples: 'Single posts (…/status/…)',
    key(host, url) {
      const m = url.pathname.match(/^\/[^/]+\/status\/(\d+)/);
      return m ? `s:${m[1]}` : null;
    },
  },
  {
    id: 'instagram',
    name: 'Instagram',
    noun: 'Post',
    home: 'instagram.com',
    hosts: ['instagram.com'],
    examples: 'Posts and reels',
    key(host, url) {
      const m = url.pathname.match(/^\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/);
      return m ? `p:${m[1]}` : null;
    },
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    noun: 'Video',
    home: 'tiktok.com',
    hosts: ['tiktok.com'],
    examples: 'Single videos and vm.tiktok.com links',
    key(host, url) {
      if (/^(vm|vt)\.tiktok\.com$/.test(host)) {
        const id = url.pathname.split('/')[1];
        return id ? `t:${id}` : null;
      }
      let m = url.pathname.match(/^\/@[^/]+\/(?:video|photo)\/(\d+)/);
      if (m) return `v:${m[1]}`;
      m = url.pathname.match(/^\/t\/([\w-]+)/);
      return m ? `t:${m[1]}` : null;
    },
  },
];

export const DIRECT_SITE_BY_ID = Object.fromEntries(DIRECT_SITES.map((s) => [s.id, s]));
export const DIRECT_PER_DAY_LADDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, null];

export function siteFor(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = normalizeDomain(u.hostname);
  const site = DIRECT_SITES.find((s) => s.hosts.some((h) => matchesPattern(host, h)));
  return site ? { site, host, url: u } : null;
}

/** { site, key } for a single-content URL, or null (home page, profile, search…). */
export function directTarget(url) {
  const f = siteFor(url);
  if (!f) return null;
  const key = f.site.key(f.host, f.url);
  return key ? { site: f.site, key } : null;
}

export function directEnabledFor(settings, site, reason) {
  const d = settings.directLinks;
  if (!d?.enabled || !site || !d.sites?.[site.id]) return false;
  if (reason === 'schedule') return !!d.duringSchedule;
  return reason === 'allowance';
}

export function directLeft(settings, runtime, day) {
  const per = settings.directLinks?.perDay;
  if (per == null) return Infinity;
  return Math.max(0, per - (runtime?.directUsed?.[day] || 0));
}
