const CACHE_NAME = 'iiot-cache-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/logo.svg',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Sadece GET ve http/https isteklerini önbellekle
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http') || url.pathname.startsWith('/api/')) {
    return;
  }

  // Vite ve Nuxt geliştirme modunda HMR ve dinamik modülleri tamamen Service Worker'dan bypass et
  if (
    url.pathname.includes('/@') || // Vite dev internal
    url.pathname.startsWith('/_nuxt/@') || // Nuxt/Vite fs internal
    (url.pathname.startsWith('/_nuxt/') && url.search.length > 0) // Vue SFC query parameters (?vue&type=style...)
  ) {
    return;
  }

  // Network First for HTML, Cache First for assets like JS/CSS/Images
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/');
      })
    );
    return;
  }

  // Stale-While-Revalidate for other static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Vite HMR ve dev mod hatalarını önlemek için kontroller
        if (
          networkResponse && 
          networkResponse.status === 200 && 
          (networkResponse.type === 'basic' || networkResponse.type === 'cors') &&
          !url.pathname.includes('.nuxt/') &&
          !url.pathname.startsWith('/@') && // Vite dev assets
          !url.search.includes('v=') // Vite versioned modules
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fetch failed, returning cached or nothing
      });
      
      return cachedResponse || fetchPromise;
    })
  );
});

self.addEventListener('push', function(event) {
  if (event.data) {
    const payload = event.data.json();
    const title = payload.title || 'BaseApp';
    
    // Fallback: Support both { url: '...' } at root and { data: { url: '...' } }
    const notificationData = payload.data || {};
    if (payload.url && !notificationData.url) {
      notificationData.url = payload.url;
    }

    const options = {
      body: payload.body,
      icon: payload.icon || '/logo.svg', // SVG fallback
      badge: payload.badge || '/logo.svg', // SVG Fallback
      data: notificationData,
      actions: payload.actions || [] // Action buttons array
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  const data = event.notification.data || {};
  let targetUrl = null;
  let webhookUrl = null;

  // If a button was clicked, check if there's a specific URL or webhook for that action
  if (event.action && data[event.action]) {
    targetUrl = data[event.action].url;
    webhookUrl = data[event.action].webhook;
  } 
  // Otherwise default URL/webhook
  else if (!event.action) {
    targetUrl = data.url;
    webhookUrl = data.webhook;
  }

  // 1. Arka planda bir API/Webhook tetiklemek isteniyorsa:
  if (webhookUrl) {
    event.waitUntil(
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: event.action, payload: data })
      }).catch(err => console.error('Webhook failed:', err))
    );
  }

  // 2. Ön yüzde bir sayfa açmak veya açık sayfaya mesaj göndermek isteniyorsa:
  if (targetUrl) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes(targetUrl) && 'focus' in client) {
            client.postMessage({ type: 'NOTIFICATION_CLICK', action: event.action, data: data });
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
    );
  }
});
