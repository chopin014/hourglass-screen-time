import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowser, installClock, advance, settle, clock } from './mock-browser.js';

installClock();
const { browser, state } = createBrowser();
globalThis.browser = browser;

const send = async (msg) => (await browser.runtime.onMessage.fire(msg, { tab: state.tabs[0] }))[0];
const heartbeat = async () => {
  await browser.alarms.onAlarm.fire({ name: 'heartbeat' });
  await settle();
};
const today = () => state.local['day:2026-11-12'];
const blockedUpdates = () => state.updates.filter((u) => u.url?.includes('blocked.html'));

await import('../src/background.js');
await browser.runtime.onInstalled.fire({ reason: 'install' });
await settle();

test('tracks active tab time, pickups and first used', async () => {
  advance(30);
  await heartbeat();
  advance(30);
  await heartbeat();
  assert.ok(Math.abs(today().sites['youtube.com'] - 60) < 0.01, `got ${today().sites['youtube.com']}`);
  assert.equal(today().pickups, 1);
  assert.equal(today().firstUsed['youtube.com'], 1);
  assert.ok(today().hours[10]['youtube.com'] > 59);
  assert.equal(state.alarms.heartbeat.periodInMinutes, 0.5);
});

test('idle and unfocused time is not counted; coming back is a pickup', async () => {
  state.focused = false;
  await browser.windows.onFocusChanged.fire(-1);
  await settle();
  advance(300);
  await heartbeat();
  const before = today().sites['youtube.com'];
  assert.ok(before < 61, `counted unfocused time: ${before}`);
  state.focused = true;
  await browser.windows.onFocusChanged.fire(1);
  await settle();
  assert.equal(today().pickups, 2);
  advance(20);
  state.idle = 'idle';
  await browser.idle.onStateChanged.fire('idle');
  await settle();
  advance(600);
  await heartbeat();
  assert.ok(today().sites['youtube.com'] < before + 21);
  state.idle = 'active';
  await browser.idle.onStateChanged.fire('active');
  await settle();
});

test('a hidden page is not counted even if the window still claims focus', async () => {
  // GNOME/Wayland: after switching workspaces the window stays "focused" but the page is hidden.
  advance(10);
  await heartbeat();
  const before = today().sites['youtube.com'];
  await send({ type: 'visibility', hidden: true });
  await settle();
  advance(300);
  await heartbeat();
  assert.ok(today().sites['youtube.com'] - before < 0.01, `counted hidden time: ${today().sites['youtube.com'] - before}`);
  await send({ type: 'visibility', hidden: false });
  await settle();
  advance(30);
  await heartbeat();
  assert.ok(Math.abs(today().sites['youtube.com'] - before - 30) < 0.01);
  assert.deepEqual(state.session.hiddenTabs ?? {}, {});
});

test('time check notification and blocking at end of allowance', async () => {
  const settings = structuredClone(state.local.settings);
  settings.allowanceItems.find((i) => i.id === 'entertainment').limit = 5;
  await browser.storage.local.set({ settings });
  await settle();
  // ~80s used so far → < 5 min remaining → Time Check
  const tc = state.notifications.find((n) => n.title === 'Time Check');
  assert.ok(tc, 'time check sent');
  assert.match(tc.message, /minutes remaining for Entertainment today\./);
  assert.ok(state.badge.endsWith('m'));

  for (let i = 0; i < 12 && !blockedUpdates().length; i++) {
    advance(30);
    await heartbeat();
  }
  assert.ok(state.notifications.some((n) => n.message === '1 minute remaining for Entertainment today.'));
  const b = blockedUpdates().at(-1);
  assert.ok(b, 'tab was blocked');
  assert.equal(b.loadReplace, true);
  const params = new URL(b.url.replace('moz-extension://test/', 'http://x/')).searchParams;
  assert.equal(params.get('r'), 'allowance');
  assert.equal(params.get('d'), 'youtube.com');
  assert.equal(params.get('n'), 'Entertainment');
  // blocked page is not counted
  const used = today().sites['youtube.com'];
  advance(60);
  await heartbeat();
  assert.equal(today().sites['youtube.com'], used);
});

test('navigation to a blocked site is intercepted', async () => {
  state.updates.length = 0;
  await browser.webNavigation.onBeforeNavigate.fire({ tabId: 1, frameId: 0, url: 'https://m.youtube.com/' });
  await settle();
  assert.equal(blockedUpdates().length, 1);
  state.updates.length = 0;
  await browser.webNavigation.onBeforeNavigate.fire({ tabId: 1, frameId: 0, url: 'https://example.com/' });
  await settle();
  assert.equal(blockedUpdates().length, 0);
});

test('ignore limit: one more minute (once), remind me in 15 minutes', async () => {
  let r = await send({ type: 'ignore', domain: 'youtube.com', option: 'minute' });
  assert.equal(r.ok, true);
  r = await send({ type: 'ignore', domain: 'youtube.com', option: 'minute' });
  assert.equal(r.error, 'minute-used');
  r = await send({ type: 'ignore', domain: 'youtube.com', option: 'remind15' });
  assert.equal(r.ok, true);
  state.tabs[0].url = 'https://www.youtube.com/';
  state.updates.length = 0;
  advance(30);
  await heartbeat();
  assert.equal(blockedUpdates().length, 0, 'not blocked during grant');
  const st = await send({ type: 'status', domain: 'youtube.com' });
  assert.ok(st.granted);
  assert.equal(st.minuteUsed, true);
  advance(15 * 60);
  await heartbeat();
  assert.equal(blockedUpdates().length, 1, 'blocked again after 15 minutes');
});

test('passcode: approve requires the right code', async () => {
  const { hashPasscode } = await import('../src/lib/store.js');
  const settings = structuredClone(state.local.settings);
  settings.passcode = await hashPasscode('1234');
  settings.blockAtEnd = true;
  await browser.storage.local.set({ settings });
  await settle();
  let r = await send({ type: 'ignore', domain: 'youtube.com', option: 'today' });
  assert.equal(r.error, 'passcode');
  r = await send({ type: 'ignore', domain: 'youtube.com', option: 'approve60', code: '0000' });
  assert.equal(r.error, 'passcode');
  assert.equal(await send({ type: 'verifyPasscode', code: '1234' }), true);
  r = await send({ type: 'ignore', domain: 'youtube.com', option: 'approve60', code: '1234' });
  assert.equal(r.ok, true);
  assert.equal(r.until - clock.now, 3600_000);
});

test('notifications from pages are counted', async () => {
  state.tabs[0].url = 'https://web.whatsapp.com/';
  await send({ type: 'notification' });
  await send({ type: 'notification' });
  assert.equal(today().notifs['web.whatsapp.com'], 2);
});

test('schedule notice before a restrictive window', async () => {
  const settings = structuredClone(state.local.settings);
  settings.passcode = null;
  settings.schedule.enabled = true;
  settings.schedule.groups[0].windows = [
    { id: 'a', name: 'Daytime', start: '00:00', end: '22:00', allowed: settings.allowanceItems.map((i) => i.id) },
    { id: 'b', name: 'Downtime', start: '22:00', end: '23:59', allowed: ['others'] },
  ];
  await browser.storage.local.set({ settings });
  await settle();
  clock.now = new Date(2026, 10, 12, 21, 56).getTime();
  state.tabs[0].url = 'https://reddit.com/';
  await heartbeat();
  const n = state.notifications.find((x) => x.title === 'Screen Time Schedule');
  assert.ok(n, 'schedule notice');
  assert.match(n.message, /^Downtime will begin in 4 minutes\. Only All Others will be available\./);
  state.updates.length = 0;
  clock.now = new Date(2026, 10, 12, 22, 0, 1).getTime();
  await heartbeat();
  const b = blockedUpdates()[0];
  assert.ok(b && b.url.includes('r=schedule'), 'reddit blocked by schedule');
});
