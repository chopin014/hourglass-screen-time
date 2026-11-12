// Isolated-world relay for notify-main.js -> background, plus page visibility.
(() => {
  let last = 0;
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.__screenTime !== 'notification') return;
    const now = Date.now();
    if (now - last < 1000) return; // simple flood guard
    last = now;
    browser.runtime.sendMessage({ type: 'notification' }).catch(() => {});
  });

  // Window focus alone isn't reliable: on GNOME (Wayland), Firefox keeps reporting
  // the window as focused after you switch to another workspace. The page does
  // become hidden, though, so report visibility and let the tracker pause on it.
  const report = () =>
    browser.runtime.sendMessage({ type: 'visibility', hidden: document.visibilityState === 'hidden' }).catch(() => {});
  document.addEventListener('visibilitychange', report);
  window.addEventListener('pageshow', (e) => e.persisted && report());
  report();
})();
