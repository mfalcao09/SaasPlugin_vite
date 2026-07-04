// Minimal Service Worker — only purpose is to enable PWA installability.
// Does NOT cache anything. We deliberately avoid intercepting fetches so
// the live app is always served from the network and never stuck on an
// old bundle (which previously caused infinite spinners after deploys).

const SW_VERSION = '2026.04.28.1';

self.addEventListener('install', (event) => {
  // Take over immediately so users don't have to close/reopen the PWA.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop any caches an older SW might have created.
    if (self.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    await self.clients.claim();
  })());
});

// Empty passthrough fetch handler — required for installability criteria,
// but we never short-circuit responses, so the network is always the source
// of truth.
self.addEventListener('fetch', () => {});

// Allow the page to ask for an immediate update.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── Web Push (platform CRM) ──────────────────────────────────────────────
// Network-only SW: these handlers only DISPLAY notifications and route clicks.
// No caching is added (see the note at the top — intentionally network-only).
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Nexvy', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Nexvy';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-192x192.png',
    tag: payload.tag || undefined,
    renotify: !!payload.tag,
    data: {
      url: payload.url || '/',
      ...(payload.data || {}),
    },
    vibrate: payload.vibrate || [120, 60, 120],
    requireInteraction: !!payload.requireInteraction,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Focus an existing tab on the same origin, if any.
    for (const client of allClients) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          client.postMessage({ type: 'PUSH_NAVIGATE', url: targetUrl });
          return;
        }
      } catch {}
    }
    // Otherwise open a new window.
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

// Browser rotated the push keys — the app re-subscribes on next foreground.
self.addEventListener('pushsubscriptionchange', () => {});
