// Runs in the page's own world: counts web notifications so the activity
// report can show "Notifications" per website, like iOS does per app.
(() => {
  const ping = () => {
    try {
      window.postMessage({ __screenTime: 'notification' }, window.location.origin);
    } catch {
      /* opaque origins */
    }
  };
  const Native = window.Notification;
  if (typeof Native === 'function') {
    window.Notification = new Proxy(Native, {
      construct(target, args, newTarget) {
        const n = Reflect.construct(target, args, newTarget);
        if (Native.permission === 'granted') ping();
        return n;
      },
    });
  }
  const proto = window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype;
  if (proto && typeof proto.showNotification === 'function') {
    const show = proto.showNotification;
    proto.showNotification = function (...args) {
      const p = show.apply(this, args);
      Promise.resolve(p).then(ping, () => {});
      return p;
    };
  }
})();
