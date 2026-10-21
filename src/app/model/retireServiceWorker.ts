export function retireServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => registrations.forEach((registration) => { void registration.unregister(); }))
      .catch(() => undefined);
  }
  if (typeof caches !== 'undefined') {
    caches.keys()
      .then((names) => names.filter((name) => name.startsWith('odysee-')).forEach((name) => { void caches.delete(name); }))
      .catch(() => undefined);
  }
}
