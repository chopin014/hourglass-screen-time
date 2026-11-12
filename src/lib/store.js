// storage.local layout
//   settings          -> user configuration (see defaults.js)
//   runtime           -> { grants, minuteUsed, notified, lastWeekly, lastPrune }
//   meta              -> { [domain]: { icon, title } }
//   day:YYYY-MM-DD    -> { sites, hours, pickups, pickupHours, firstUsed, notifs, notifHours, firstPickupAt }

import { normalizeSettings } from './defaults.js';
import { dayKey } from './time.js';

export const api = globalThis.browser;

export const DAY_PREFIX = 'day:';
export const dayStorageKey = (key) => DAY_PREFIX + key;

export function emptyDay() {
  return { sites: {}, hours: {}, pickups: 0, pickupHours: {}, firstUsed: {}, notifs: {}, notifHours: {}, firstPickupAt: null };
}

export async function getSettings() {
  const { settings } = await api.storage.local.get('settings');
  return normalizeSettings(settings);
}

export async function saveSettings(settings) {
  await api.storage.local.set({ settings });
}

export function emptyRuntime() {
  return { grants: {}, minuteUsed: {}, notified: {}, directUsed: {}, lastWeekly: null, lastPrune: null };
}

export async function getRuntime() {
  const { runtime } = await api.storage.local.get('runtime');
  return { ...emptyRuntime(), ...(runtime || {}) };
}

export async function getMeta() {
  const { meta } = await api.storage.local.get('meta');
  return meta || {};
}

/** Load a list of day keys -> { key: dayObject } (missing days are empty). */
export async function getDays(keys) {
  const raw = await api.storage.local.get(keys.map(dayStorageKey));
  const out = {};
  for (const k of keys) out[k] = { ...emptyDay(), ...(raw[dayStorageKey(k)] || {}) };
  return out;
}

export async function getDay(key = dayKey()) {
  return (await getDays([key]))[key];
}

// --------------------------------------------------------------- passcode

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPasscode(code, salt = crypto.randomUUID()) {
  return { salt, hash: await sha256(`${salt}:${code}`) };
}

export async function checkPasscode(settings, code) {
  if (!settings.passcode) return true;
  const { hash } = await hashPasscode(code, settings.passcode.salt);
  return hash === settings.passcode.hash;
}
