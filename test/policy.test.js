import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings } from '../src/lib/defaults.js';
import { evaluate, normalizeDomain, domainOfUrl, createMatcher, usageByItem, scheduleAt, windowConflict, contentBlocked } from '../src/lib/policy.js';
import { reportCategoryOf } from '../src/lib/categories.js';
import { fmtDuration, fmtLimit, fmtDays } from '../src/lib/time.js';

const at = (h, m = 0) => new Date(2026, 10, 12, h, m); // Thursday

test('domain normalisation', () => {
  assert.equal(normalizeDomain('https://www.YouTube.com/watch?v=1'), 'youtube.com');
  assert.equal(normalizeDomain('m.facebook.com'), 'facebook.com');
  assert.equal(normalizeDomain('user@host.example.org:8080/x'), 'host.example.org');
  assert.equal(domainOfUrl('about:blank'), null);
  assert.equal(domainOfUrl('moz-extension://abc/page.html'), null);
  assert.equal(domainOfUrl('https://old.reddit.com/r/x'), 'old.reddit.com');
});

test('report categories', () => {
  assert.equal(reportCategoryOf('youtube.com'), 'entertainment');
  assert.equal(reportCategoryOf('old.reddit.com'), 'social');
  assert.equal(reportCategoryOf('mail.google.com'), 'productivity');
  assert.equal(reportCategoryOf('random-site.xyz'), 'other');
  assert.equal(reportCategoryOf('youtube.com', { 'youtube.com': 'education' }), 'education');
});

test('matcher: site > category > others', () => {
  const s = defaultSettings();
  s.allowanceItems.splice(3, 0, { id: 'ig', kind: 'site', domain: 'instagram.com', name: 'Instagram', limit: 15, shared: false });
  const m = createMatcher(s);
  assert.deepEqual(m('instagram.com').effective.map((i) => i.id), ['ig']);
  assert.deepEqual(m('instagram.com').all.map((i) => i.id), ['ig', 'social']);
  assert.deepEqual(m('example.com').all.map((i) => i.id), ['others']);
  assert.deepEqual(m('youtube.com').all.map((i) => i.id), ['entertainment']);
});

test('allowance exhaustion and shared pool', () => {
  const s = defaultSettings();
  s.allowanceItems.find((i) => i.id === 'social').limit = 10;
  s.sharedLimit = 30;
  const sites = { 'reddit.com': 300, 'youtube.com': 1200 };
  const ctx = { settings: s, sites, runtime: {} };
  let v = evaluate(ctx, 'reddit.com', at(10));
  assert.equal(v.blocked, false);
  assert.equal(v.remaining, 300); // 10 min - 5 min used
  // shared pool: 1500s used of 1800
  assert.equal(v.limits.find((l) => l.id === 'shared').remaining, 300);

  const ctx2 = { settings: s, sites: { 'reddit.com': 600 }, runtime: {} };
  v = evaluate(ctx2, 'reddit.com', at(10));
  assert.equal(v.blocked, true);
  assert.equal(v.reason, 'allowance');
  assert.equal(v.limitName, 'Social Media');

  // shared exhausted blocks youtube too
  const ctx3 = { settings: s, sites: { 'youtube.com': 1800 }, runtime: {} };
  assert.equal(evaluate(ctx3, 'youtube.com', at(10)).blocked, true);
  // but not unrelated "All Others" (not shared)
  assert.equal(evaluate(ctx3, 'example.com', at(10)).blocked, false);
});

test('always allowed and grants bypass limits; usage of always allowed is not counted', () => {
  const s = defaultSettings();
  s.allowanceItems.find((i) => i.id === 'social').limit = 5;
  s.alwaysAllowed = ['reddit.com'];
  const ctx = { settings: s, sites: { 'reddit.com': 9999, 'x.com': 10 }, runtime: {} };
  assert.equal(evaluate(ctx, 'reddit.com', at(10)).blocked, false);
  assert.equal(usageByItem(s, ctx.sites).byItem.social, 10);

  s.alwaysAllowed = [];
  const now = at(10);
  const ctx2 = { settings: s, sites: { 'reddit.com': 400 }, runtime: { grants: { 'reddit.com': { until: now.getTime() + 60000 } } } };
  const v = evaluate(ctx2, 'reddit.com', now);
  assert.equal(v.blocked, false);
  assert.ok(v.granted);
});

test('schedule windows', () => {
  const s = defaultSettings();
  s.schedule.enabled = true;
  // Weekdays: Downtime 00:00-07:00 allows nothing, Daytime 07:00-23:59 allows all.
  const ctx = { settings: s, sites: {}, runtime: {} };
  let v = evaluate(ctx, 'youtube.com', at(6, 30));
  assert.equal(v.blocked, true);
  assert.equal(v.reason, 'schedule');
  assert.equal(v.windowName, 'Downtime');
  assert.equal(v.until, at(7).getTime());
  assert.equal(evaluate(ctx, 'youtube.com', at(12)).blocked, false);
  assert.equal(evaluate(ctx, 'youtube.com', at(23, 59)).blocked, false);

  // Only YouTube category allowed in the morning
  s.schedule.groups[0].windows[0].allowed = ['entertainment'];
  assert.equal(evaluate(ctx, 'youtube.com', at(6)).blocked, false);
  assert.equal(evaluate(ctx, 'reddit.com', at(6)).blocked, true);
  assert.equal(evaluate(ctx, 'example.com', at(6)).blocked, true);

  // Gap → only always allowed
  s.schedule.groups[0].windows = [{ id: 'a', name: 'Work', start: '09:00', end: '18:00', allowed: ['others'] }];
  const st = scheduleAt(s, at(19));
  assert.equal(st.window, null);
  assert.equal(evaluate(ctx, 'example.com', at(19)).blocked, true);
  s.alwaysAllowed = ['example.com'];
  assert.equal(evaluate(ctx, 'example.com', at(19)).blocked, false);

  // Weekend: no group for Saturday if removed → unrestricted
  s.schedule.groups = s.schedule.groups.filter((g) => g.id !== 'weekends');
  assert.equal(evaluate(ctx, 'reddit.com', new Date(2026, 10, 14, 3)).blocked, false);
});

test('window conflicts', () => {
  const g = { windows: [{ id: 'a', name: 'Morning', start: '06:00', end: '12:00' }] };
  assert.match(windowConflict(g, { id: 'b', start: '11:00', end: '13:00' }), /overlaps/);
  assert.equal(windowConflict(g, { id: 'b', start: '12:00', end: '13:00' }), null);
  assert.match(windowConflict(g, { id: 'b', start: '14:00', end: '13:00' }), /later/);
});

test('content restrictions', () => {
  const s = defaultSettings();
  assert.equal(contentBlocked(s, 'pornhub.com'), false);
  s.content.mode = 'limitAdult';
  assert.equal(contentBlocked(s, 'pornhub.com'), true);
  assert.equal(contentBlocked(s, 'youtube.com'), false);
  s.content.deny = ['youtube.com'];
  assert.equal(contentBlocked(s, 'm.youtube.com'), true);
  s.content.mode = 'approved';
  assert.equal(contentBlocked(s, 'en.wikipedia.org'), false);
  assert.equal(contentBlocked(s, 'reddit.com'), true);
  const v = evaluate({ settings: s, sites: {}, runtime: {} }, 'reddit.com', at(10));
  assert.equal(v.reason, 'content');
});

test('formatting', () => {
  assert.equal(fmtDuration(6360), '1h 46m');
  assert.equal(fmtDuration(2100), '35m');
  assert.equal(fmtDuration(7200), '2h');
  assert.equal(fmtDuration(42), '42s');
  assert.equal(fmtLimit(10), '10 min');
  assert.equal(fmtLimit(90), '1 hr 30 min');
  assert.equal(fmtDays([1, 2, 3, 4, 5]), 'Weekdays');
  assert.equal(fmtDays([0, 6]), 'Weekends');
});
