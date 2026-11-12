// Default settings, allowance templates and settings normalisation.

export const SYSTEM_TEMPLATES = [
  { source: 'social', name: 'Social Media', icon: 'social' },
  { source: 'entertainment', name: 'Entertainment', icon: 'entertainment' },
  { source: 'games', name: 'Games', icon: 'games' },
  { source: 'shopping', name: 'Shopping & Food', icon: 'shopping' },
  { source: 'reading', name: 'Information & Reading', icon: 'reading' },
  { source: 'productivity', name: 'Productivity & Finance', icon: 'productivity' },
  { source: 'education', name: 'Education', icon: 'education' },
  { source: 'creativity', name: 'Creativity', icon: 'creativity' },
  { source: 'health', name: 'Health & Fitness', icon: 'health' },
  { source: 'travel', name: 'Travel', icon: 'travel' },
  { source: 'utilities', name: 'Utilities', icon: 'utilities' },
];

export const TILE_COLORS = ['gray', 'blue', 'indigo', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'mint', 'teal', 'cyan', 'brown'];
export const CUSTOM_ICONS = [
  'headphones', 'play', 'social', 'games', 'entertainment', 'music', 'film', 'book', 'shopping', 'code',
  'chat', 'globe', 'star', 'heart', 'bolt', 'camera', 'productivity', 'education', 'travel', 'creativity',
];

export const SHARED_STOPS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, null];

/** Stepper ladder for individual allowances (minutes); null = Unlimited. */
export const STEP_LADDER = (() => {
  const out = [];
  for (let m = 5; m <= 60; m += 5) out.push(m);
  for (let m = 75; m <= 120; m += 15) out.push(m);
  for (let m = 150; m <= 720; m += 30) out.push(m);
  out.push(null);
  return out;
})();

export function uid(prefix = 'i') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function systemItem(template, overrides = {}) {
  return {
    id: overrides.id || uid('c'),
    kind: 'category',
    source: template.source,
    name: template.name,
    icon: template.icon,
    color: 'gray',
    sites: [],
    exclude: [],
    limit: null,
    shared: true,
    ...overrides,
  };
}

export const OTHERS_ID = 'others';

export const APPROVED_DEFAULTS = [
  'apple.com', 'disney.com', 'howstuffworks.com', 'kids.nationalgeographic.com', 'pbskids.org',
  'scholastic.com', 'si.edu', 'timeforkids.com', 'wikipedia.org', 'khanacademy.org',
];

export function defaultSettings() {
  const tpl = (s) => SYSTEM_TEMPLATES.find((t) => t.source === s);
  const items = [
    systemItem(tpl('social'), { id: 'social' }),
    systemItem(tpl('entertainment'), { id: 'entertainment' }),
    systemItem(tpl('games'), { id: 'games' }),
    { id: OTHERS_ID, kind: 'others', name: 'All Others', icon: 'others', color: 'gray', limit: null, shared: false },
  ];
  const all = items.map((i) => i.id);
  return {
    version: 1,
    tracking: true,
    siteCategories: {},
    sharedLimit: null,
    allowanceItems: items,
    blockAtEnd: true,
    schedule: {
      enabled: false,
      groups: [
        {
          id: 'weekdays',
          days: [1, 2, 3, 4, 5],
          windows: [
            { id: 'w-down', name: 'Downtime', start: '00:00', end: '07:00', allowed: [] },
            { id: 'w-day', name: 'Daytime', start: '07:00', end: '23:59', allowed: all },
          ],
        },
        {
          id: 'weekends',
          days: [0, 6],
          windows: [{ id: 'w-all', name: 'All Day', start: '00:00', end: '23:59', allowed: all }],
        },
      ],
    },
    alwaysAllowed: [],
    content: { mode: 'unrestricted', allow: [], deny: [], approved: [...APPROVED_DEFAULTS] },
    passcode: null,
    notifications: { timeCheck: true, schedule: true, weeklyReport: true },
    timer: { enabled: true, onlyLast: false },
    directLinks: {
      enabled: true,
      perDay: 3,
      duringSchedule: true,
      sites: { youtube: true, reddit: true, x: true, instagram: true, tiktok: true },
    },
  };
}

/** Fill in anything missing (older versions, imported files). */
export function normalizeSettings(raw) {
  const def = defaultSettings();
  if (!raw || typeof raw !== 'object') return def;
  const s = { ...def, ...raw };
  s.siteCategories = { ...(raw.siteCategories || {}) };
  s.content = { ...def.content, ...(raw.content || {}) };
  s.notifications = { ...def.notifications, ...(raw.notifications || {}) };
  s.timer = { ...def.timer, ...(raw.timer || {}) };
  s.directLinks = { ...def.directLinks, ...(raw.directLinks || {}) };
  s.directLinks.sites = { ...def.directLinks.sites, ...(raw.directLinks?.sites || {}) };
  s.schedule = { ...def.schedule, ...(raw.schedule || {}) };
  if (!Array.isArray(s.schedule.groups)) s.schedule.groups = def.schedule.groups;
  if (!Array.isArray(s.alwaysAllowed)) s.alwaysAllowed = [];
  if (!Array.isArray(s.allowanceItems)) s.allowanceItems = def.allowanceItems;
  if (!s.allowanceItems.some((i) => i.kind === 'others')) {
    s.allowanceItems.push(def.allowanceItems.find((i) => i.kind === 'others'));
  }
  return s;
}
