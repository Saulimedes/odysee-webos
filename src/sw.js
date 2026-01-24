// Service Worker for Odysee WebOS
// Caches thumbnails and static assets for faster loading

const CACHE_NAME = 'odysee-cache-v1';
const THUMBNAIL_CACHE = 'odysee-thumbnails-v1';

// Thumbnail domains to cache
const THUMBNAIL_HOSTS = [
  'thumbnails.lbry.com',
  'spee.ch',
  'player.odycdn.com',
];

// Max thumbnails to cache (prevent storage bloat)
const MAX_THUMBNAILS = 200;

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== THUMBNAIL_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - cache thumbnails
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only cache GET requests
  if (event.request.method !== 'GET') return;

  // Check if this is a thumbnail request
  const isThumbnail = THUMBNAIL_HOSTS.some((host) => url.hostname.includes(host));

  if (isThumbnail) {
    event.respondWith(
      caches.open(THUMBNAIL_CACHE).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            // Return cached thumbnail immediately
            return cachedResponse;
          }

          // Fetch and cache the thumbnail
          return fetch(event.request)
            .then((networkResponse) => {
              // Only cache successful responses
              if (networkResponse.ok) {
                // Clone the response since we need to use it twice
                const responseToCache = networkResponse.clone();

                // Cache the thumbnail (async, don't block response)
                cache.put(event.request, responseToCache).then(() => {
                  // Trim cache if too large
                  trimCache(THUMBNAIL_CACHE, MAX_THUMBNAILS);
                });
              }
              return networkResponse;
            })
            .catch((err) => {
              console.log('[SW] Fetch failed for thumbnail:', url.href);
              // Return a placeholder or let it fail
              return new Response('', { status: 404 });
            });
        });
      })
    );
  }
});

// Trim cache to max entries (LRU-style, removes oldest)
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length > maxItems) {
    // Delete oldest entries (first in the list)
    const toDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(toDelete.map((key) => cache.delete(key)));
    console.log(`[SW] Trimmed ${toDelete.length} items from ${cacheName}`);
  }
}

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data === 'clearThumbnailCache') {
    caches.delete(THUMBNAIL_CACHE).then(() => {
      console.log('[SW] Thumbnail cache cleared');
    });
  }
});
