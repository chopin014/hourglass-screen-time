import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowser, installClock, advance, settle } from './mock-browser.js';
import { directTarget } from '../src/lib/directlinks.js';

installClock();
const { browser, state } = createBrowser();
globalThis.browser = browser;

const tab = state.tabs[0];
const send = async (msg) => (await browser.runtime.onMessage.fire(msg, { tab }))[0];
const blocks = () => state.updates.filter((u) => u.url?.includes('blocked.html'));
const lastBlock = () => new URL(blocks().at(-1).url.replace('moz-extension://test/', 'http://x/')).searchParams;
const nav = async (url, kind = 'onBeforeNavigate', tabId = 1) => {
  await browser.webNavigation[kind].fire({ tabId, frameId: 0, url });
  await settle();
};

await import('../src/background.js');
await browser.runtime.onInstalled.fire({ reason: 'install' });
await settle();

test('content keys', () => {
  assert.equal(directTarget('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42').key, 'v:dQw4w9WgXcQ');
  assert.equal(directTarget('https://youtu.be/dQw4w9WgXcQ?si=abc').key, 'v:dQw4w9WgXcQ');
  assert.equal(directTarget('https://m.youtube.com/shorts/abcdefghijk').key, 'v:abcdefghijk');
  assert.equal(directTarget('https://www.youtube.com/'), null);
  assert.equal(directTarget('https://www.youtube.com/@channel'), null);
  assert.equal(directTarget('https://www.youtube.com/results?search_query=x'), null);
  assert.equal(directTarget('https://www.reddit.com/r/linux/comments/1abcde/some_title/').key, 'p:1abcde');
  assert.equal(directTarget('https://old.reddit.com/r/linux/comments/1ABCDE/x/k2/').key, 'p:1abcde');
  assert.equal(directTarget('https://redd.it/1abcde').key, 'p:1abcde');
  assert.equal(directTarget('https://www.reddit.com/r/linux/'), null);
  assert.equal(directTarget('https://www.reddit.com/user/someone/'), null);
  assert.equal(directTarget('https://x.com/user/status/123456').key, 's:123456');
  assert.equal(directTarget('https://www.instagram.com/reel/Cabc_12/').key, 'p:Cabc_12');
  assert.equal(directTarget('https://www.tiktok.com/@u/video/7123').key, 'v:7123');
});

test('setup: YouTube allowance used up', async () => {
  const settings = structuredClone(state.local.settings);
  settings.allowanceItems.find((i) => i.id === 'entertainment').limit = 5;
  await browser.storage.local.set({ settings, 'day:2026-11-12': { sites: { 'youtube.com': 400 }, hours: {}, pickups: 0, pickupHours: {}, firstUsed: {}, notifs: {}, notifHours: {} } });
  tab.url = 'https://www.google.com/search?q=x';
  await settle();
});

test('direct video link is blocked but offered; home page is not offered', async () => {
  const video = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  await nav(video);
  assert.equal(lastBlock().get('u'), video);
  assert.equal(lastBlock().get('via'), null);
  let info = await send({ type: 'directInfo', url: video, reason: 'allowance', via: '' });
  assert.equal(info.offer, true);
  assert.equal(info.left, 3);
  info = await send({ type: 'directInfo', url: 'https://www.youtube.com/', reason: 'allowance', via: '' });
  assert.equal(info.offer, false);
  assert.equal(info.supported, true);
});

test('pass opens exactly that video; in-site navigation is blocked as internal', async () => {
  const video = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  tab.url = 'moz-extension://test/src/pages/blocked.html';
  const r = await send({ type: 'directLink', url: video, reason: 'allowance' });
  assert.equal(r.ok, true);
  assert.equal(r.left, 2);
  state.updates.length = 0;
  await nav(video);
  tab.url = video;
  assert.equal(blocks().length, 0, 'video opens');
  // timestamp / replaceState on the same video is fine
  await nav(video + '&t=60', 'onHistoryStateUpdated');
  advance(30);
  await browser.alarms.onAlarm.fire({ name: 'heartbeat' });
  await settle();
  assert.equal(blocks().length, 0, 'still allowed after a tick');
  // clicking a recommended video (SPA pushState) → blocked, no new offer
  await nav('https://www.youtube.com/watch?v=OTHERVIDEO1', 'onHistoryStateUpdated');
  assert.equal(blocks().length, 1);
  assert.equal(lastBlock().get('via'), 'internal');
  const info = await send({ type: 'directInfo', url: 'https://www.youtube.com/watch?v=OTHERVIDEO1', reason: 'allowance', via: 'internal' });
  assert.equal(info.offer, false);
  assert.equal(info.internal, true);
});

test('redirects keep the pass (youtu.be → watch)', async () => {
  tab.url = 'moz-extension://test/src/pages/blocked.html';
  state.updates.length = 0;
  const r = await send({ type: 'directLink', url: 'https://youtu.be/abcdefghijk', reason: 'allowance' });
  assert.equal(r.ok, true);
  await nav('https://youtu.be/abcdefghijk');
  await nav('https://www.youtube.com/watch?v=abcdefghijk&feature=youtu.be', 'onCommitted');
  tab.url = 'https://www.youtube.com/watch?v=abcdefghijk&feature=youtu.be';
  advance(30); // past nothing yet, but re-keyed
  await browser.alarms.onAlarm.fire({ name: 'heartbeat' });
  await settle();
  assert.equal(blocks().length, 0);
  // new tab opened from the passed page → internal
  await browser.webNavigation.onCreatedNavigationTarget.fire({ sourceTabId: 1, tabId: 2, url: 'https://www.youtube.com/@someone' });
  await settle();
  await nav('https://www.youtube.com/watch?v=ZZZZZZZZZZZ', 'onBeforeNavigate', 2);
  assert.equal(lastBlock().get('via'), 'internal');
});

test('daily quota', async () => {
  tab.url = 'moz-extension://test/src/pages/blocked.html';
  const r1 = await send({ type: 'directLink', url: 'https://www.reddit.com/r/linux/comments/1abcde/x/', reason: 'allowance' });
  // reddit is in Social Media, which is unlimited → still grants (feature doesn't check blocked state)
  assert.equal(r1.ok, true);
  assert.equal(r1.left, 0);
  const r2 = await send({ type: 'directLink', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', reason: 'allowance' });
  assert.equal(r2.error, 'quota');
  const info = await send({ type: 'directInfo', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', reason: 'allowance' });
  assert.equal(info.offer, false);
  assert.equal(info.left, 0);
});

test('disabled sites and schedule toggle', async () => {
  const settings = structuredClone(state.local.settings);
  settings.directLinks.perDay = null;
  settings.directLinks.sites.youtube = false;
  settings.directLinks.duringSchedule = false;
  await browser.storage.local.set({ settings });
  await settle();
  let info = await send({ type: 'directInfo', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', reason: 'allowance' });
  assert.equal(info.supported, false);
  info = await send({ type: 'directInfo', url: 'https://x.com/a/status/1', reason: 'schedule' });
  assert.equal(info.supported, false);
  info = await send({ type: 'directInfo', url: 'https://x.com/a/status/1', reason: 'allowance' });
  assert.equal(info.offer, true);
  assert.equal(info.left, null); // unlimited
  info = await send({ type: 'directInfo', url: 'https://x.com/a/status/1', reason: 'content' });
  assert.equal(info.supported, false);
});
