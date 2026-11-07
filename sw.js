/**
 * sw.js - Service Worker per PWA Pulizia Strade Firenze (Nuova Versione con Push & Avvisi)
 */

const CACHE_NAME = 'pulizia-fi-nuova-v1.0';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/icons/favicon.ico',
  './assets/icons/icona.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/images/sedan.png',
  './css/main.css',
  './css/components.css',
  './css/map.css',
  './css/notifications.css',
  './css/themes.css',
  './js/app.js',
  './js/state.js',
  './js/schedule.js',
  './js/data-service.js',
  './js/location-service.js',
  './js/map-service.js',
  './js/notification-service.js',
  './js/pwa-service.js',
  './js/views/position-view.js',
  './js/views/schedule-view.js',
  './js/views/favorites-view.js',
  './js/views/notifications-view.js',
  './js/views/settings-view.js',
  './js/views/other-view.js',
  './js/views/detail-sheet.js',
  './data/vie_firenze.json',
  './data/pulizia_firenze.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Installazione: scarica e memorizza gli asset critici
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW Nuova PWA] Pre-caching asset');
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('[SW Nuova PWA] Warning pre-cache asset:', err);
      });
    })
  );
});

// Attivazione: elimina vecchie cache se diverse
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME && key.startsWith('pulizia-fi-nuova')) {
            console.log('[SW Nuova PWA] Rimozione vecchia cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercettazione richieste di rete (Offline-first / Stale-while-revalidate)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Evita richieste non-GET o estensioni del browser
  if (event.request.method !== 'GET' || url.protocol.startsWith('chrome-extension')) {
    return;
  }

  // Non memorizzare in cache le chiamate a Nominatim (per garantire geocoding fresco)
  if (url.hostname.includes('nominatim.openstreetmap.org')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({ error: 'offline' }), {
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // Strategia di cache con fallback rete
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Restituisci subito dalla cache e aggiorna in background
        fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const toCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, toCache);
        });

        return networkResponse;
      }).catch(err => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw err;
      });
    })
  );
});

// ============================================================================
// 🔔 GESTIONE PUSH NOTIFICATIONS
// ============================================================================

self.addEventListener('push', event => {
  console.log('[SW Nuova PWA] Push event ricevuto:', event);

  let data = {
    title: '🧹 Pulizia Strade Firenze',
    body: 'Promemoria: verifica il divieto di sosta per la tua zona.',
    icon: 'assets/icons/icon-192.png',
    badge: 'assets/icons/icon-192.png',
    tag: 'cleaning-reminder',
    vibrate: [200, 100, 200, 100, 200],
    data: {
      url: './index.html#notifiche',
      timestamp: Date.now()
    }
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = Object.assign(data, payload);
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || 'assets/icons/icon-192.png',
    badge: data.badge || 'assets/icons/icon-192.png',
    tag: data.tag || 'pulizia-reminder',
    renotify: true,
    vibrate: data.vibrate || [200, 100, 200],
    data: data.data || { url: './index.html' },
    actions: [
      { action: 'open_app', title: 'Apri Dettagli 🚗' },
      { action: 'dismiss', title: 'Ho Capito ✓' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Click sulla notifica da parte dell'utente
self.addEventListener('notificationclick', event => {
  console.log('[SW Nuova PWA] Click su notifica:', event);
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : './index.html';

  const street = event.notification.data && event.notification.data.street;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Se c'è già una finestra aperta dell'app, focalizzala
      for (let client of windowClients) {
        if ('focus' in client) {
          if (street && client.postMessage) {
            client.postMessage({ type: 'OPEN_STREET_DETAIL', street });
          }
          return client.focus();
        }
      }
      // Altrimenti apri nuova finestra
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Periodic Background Sync (quando supportato da Android/Desktop)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'check-cleaning-reminder') {
    console.log('[SW Nuova PWA] Esecuzione periodicsync per controllo pulizia strade');
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'TRIGGER_SCHEDULED_CHECK' });
        });
      })
    );
  }
});

// Ricezione messaggi dall'applicazione principale
self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Notifica locale richiesta dall'app via Service Worker
  if (event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    self.registration.showNotification(title, options);
  }
});
