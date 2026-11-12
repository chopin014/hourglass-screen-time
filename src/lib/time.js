// Date / duration helpers. All day keys are in local time.

export const MINUTE = 60;
export const HOUR = 3600;
export const DAY_MS = 86_400_000;

const pad = (n) => String(n).padStart(2, '0');

export function dayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Weeks start on Sunday, like the iOS Screen Time chart (S M T W T F S). */
export function startOfWeek(date = new Date()) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function nextMidnight(date = new Date()) {
  return addDays(startOfDay(date), 1);
}

export function sameDay(a, b) {
  return dayKey(a) === dayKey(b);
}

/** "HH:MM" -> minutes since midnight. */
export function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** minutes since midnight -> "HH:MM" */
export function fromMinutes(min) {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function minuteOfDay(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

/** Usage durations like the iOS reports: 45s, 35m, 1h 46m, 2h. */
export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  if (sec < 60) return `${sec}s`;
  const totalMin = Math.floor(sec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Limits: "10 min", "1 hr", "1 hr 30 min". */
export function fmtLimit(min) {
  if (min == null) return 'Unlimited';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** Big headline for the shared allowance slider: "1h 30m", "Unlimited". */
export function fmtBigLimit(min) {
  if (min == null) return 'Unlimited';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Remaining time phrase used by notifications and the popup. */
export function fmtRemaining(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec} second${sec === 1 ? '' : 's'}`;
  const min = Math.ceil(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hour${h === 1 ? '' : 's'}`;
}

export function fmtClock(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function fmtDayTitle(date, now = new Date()) {
  if (sameDay(date, now)) return 'Today';
  if (sameDay(date, addDays(now, -1))) return 'Yesterday';
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function fmtWeekTitle(weekStart, now = new Date()) {
  const thisWeek = startOfWeek(now);
  if (sameDay(weekStart, thisWeek)) return 'This Week';
  if (sameDay(weekStart, addDays(thisWeek, -7))) return 'Last Week';
  const end = addDays(weekStart, 6);
  const a = `${weekStart.getDate()} ${MONTHS_SHORT[weekStart.getMonth()]}`;
  const b = `${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;
  return `${a} – ${b}`;
}

/** Human summary of a set of weekdays, as iOS shows it. */
export function fmtDays(days) {
  const s = [...new Set(days)].sort((a, b) => a - b);
  const key = s.join(',');
  if (key === '0,1,2,3,4,5,6') return 'Every Day';
  if (key === '1,2,3,4,5') return 'Weekdays';
  if (key === '0,6') return 'Weekends';
  if (s.length === 1) return `${WEEKDAYS[s[0]]}s`;
  return s.map((d) => WEEKDAYS_SHORT[d]).join(', ');
}
