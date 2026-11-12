// Minimal in-memory WebExtension API mock + controllable clock for tests.

const RealDate = Date;
export const clock = { now: new RealDate(2026, 10, 12, 10, 0, 0).getTime() }; // Thu 12 Nov 2026 10:00
class FakeDate extends RealDate {
  constructor(...a) {
    if (a.length === 0) super(clock.now);
    else super(...a);
  }
  static now() {
    return clock.now;
  }
}
export function installClock() {
  globalThis.Date = FakeDate;
}
export const advance = (sec) => (clock.now += sec * 1000);
export const setTime = (y, m, d, h, min = 0) => (clock.now = new RealDate(y, m, d, h, min, 0).getTime());

function event() {
  const fns = [];
  return {
    addListener: (fn) => fns.push(fn),
    removeListener: (fn) => fns.splice(fns.indexOf(fn), 1),
    fire: (...args) => Promise.all(fns.map((f) => f(...args))),
    fns,
  };
}

export function createBrowser() {
  const onChanged = event();
  const area = (name, store) => ({
    async get(keys) {
      if (keys == null) return structuredClone(store);
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const out = {};
      for (const k of list) if (k in store) out[k] = structuredClone(store[k]);
      return out;
    },
    async set(obj) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: store[k], newValue: structuredClone(v) };
        store[k] = structuredClone(v);
      }
      onChanged.fire(changes, name);
    },
    async remove(keys) {
      for (const k of [].concat(keys)) delete store[k];
    },
  });

  const state = {
    local: {},
    session: {},
    tabs: [{ id: 1, windowId: 1, active: true, url: 'https://www.youtube.com/watch?v=abc', audible: false, title: 'YouTube' }],
    focused: true,
    idle: 'active',
    alarms: {},
    notifications: [],
    updates: [],
    created: [],
  };

  const browser = {
    storage: { local: area('local', state.local), session: area('session', state.session), onChanged },
    tabs: {
      query: async (q = {}) =>
        state.tabs.filter((t) => (q.active === undefined || t.active === q.active) && (q.windowId === undefined || t.windowId === q.windowId)),
      update: async (id, props) => {
        state.updates.push({ id, ...props });
        const t = state.tabs.find((x) => x.id === id);
        if (t && props.url) t.url = props.url;
        return t;
      },
      create: async (p) => state.created.push(p),
      remove: async () => {},
      getCurrent: async () => state.tabs[0],
      onActivated: event(),
      onUpdated: event(),
      onRemoved: event(),
    },
    windows: { getLastFocused: async () => ({ id: 1, focused: state.focused }), onFocusChanged: event(), update: async () => {} },
    idle: { queryState: async () => state.idle, setDetectionInterval: async () => {}, onStateChanged: event() },
    alarms: { create: (n, o) => (state.alarms[n] = o), get: async (n) => state.alarms[n], onAlarm: event() },
    notifications: { create: async (id, o) => state.notifications.push({ id, ...o }), clear: async () => {}, onClicked: event() },
    webNavigation: { onBeforeNavigate: event(), onHistoryStateUpdated: event(), onCommitted: event(), onCreatedNavigationTarget: event() },
    runtime: {
      getURL: (p) => `moz-extension://test/${p}`,
      getManifest: () => ({ version: '1.0.0' }),
      onMessage: event(),
      onInstalled: event(),
      onStartup: event(),
      sendMessage: async () => {},
    },
    action: { setBadgeText: async (o) => (state.badge = o.text), setBadgeBackgroundColor: async () => {} },
    permissions: { contains: async () => true, request: async () => true },
  };
  return { browser, state };
}

export const settle = async (n = 20) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
