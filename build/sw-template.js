/*
 * Service worker de Finanzas familiares (generado al compilar).
 * Guarda la app para que abra sin conexión. No guarda ni envía datos
 * personales: esos viven en IndexedDB y no pasan por aquí.
 */
const VERSION = '__VERSION__';
const PREFIX = 'finanzas-familiares-';
const CACHE = PREFIX + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

// La página pide activar la versión nueva cuando la persona toca «Actualizar».
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;

  // Abrir la app: siempre la versión guardada (rápido y sin conexión).
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(new URL('index.html', self.registration.scope).href, { cacheName: CACHE }).then((hit) => hit || fetch(req)),
    );
    return;
  }

  event.respondWith(caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
