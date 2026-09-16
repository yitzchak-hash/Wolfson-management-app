/* TzviAir — the worker's push receiver.
 *
 * One job: when the office's server pushes a message to this phone, show it
 * as a real notification (sound and vibration are the phone's own), and when
 * the worker taps it, open his portal page — an already-open one is focused
 * rather than a second copy started. Nothing is cached and nothing is
 * intercepted: the app itself is unchanged with or without this worker. */
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data ? e.data.text() : '' }; }
  const title = data.title || 'TzviAir';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/tzviair-logo.png',
    badge: '/favicon.svg',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/' },
    vibrate: [180, 80, 180],
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ('focus' in c) {
        // The portal is one page; a task id in the address is read by the app
        // on arrival, so navigating an open copy lands on the task too.
        if (c.url !== url && 'navigate' in c) c.navigate(url).catch(() => {});
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
