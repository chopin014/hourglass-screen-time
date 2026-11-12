// Isolated-world relay for notify-main.js -> background.
(() => {
  let last = 0;
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.__screenTime !== 'notification') return;
    const now = Date.now();
    if (now - last < 1000) return; // simple flood guard
    last = now;
    browser.runtime.sendMessage({ type: 'notification' }).catch(() => {});
  });
})();
