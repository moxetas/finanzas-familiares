/*
 * Service worker de Finanzas familiares (generado al compilar).
 * Guarda la app para que abra sin conexión y, donde el navegador lo permite,
 * avisa de los pagos con la app cerrada. No envía nada a ningún sitio: lee los
 * avisos que la propia app dejó preparados en IndexedDB.
 */
const VERSION = '__VERSION__';
const PREFIX = 'finanzas-familiares-';
const CACHE = PREFIX + VERSION;
// Fondos guardados al usarlos. No empieza por PREFIX, así no se borra al actualizar la app.
// Si se cambia una imagen de public/themes, sube el número.
const THEMES_CACHE = 'finanzas-fondos-v1';
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
  // Los archivos que se abren directamente (la guía en PDF, por ejemplo) van a la red.
  const isAppPage = !/\.[a-z0-9]+$/i.test(url.pathname) || url.pathname.endsWith('.html');
  if (req.mode === 'navigate' && !isAppPage) {
    event.respondWith(fetch(req).catch(() => caches.match(req, { cacheName: CACHE }).then((hit) => hit || Response.error())));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(new URL('index.html', self.registration.scope).href, { cacheName: CACHE }).then((hit) => hit || fetch(req)),
    );
    return;
  }

  // Fondos que no van en la copia inicial: se guardan la primera vez que se ven.
  if (url.pathname.includes('/themes/')) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              event.waitUntil(caches.open(THEMES_CACHE).then((c) => c.put(req, copy)));
            }
            return res;
          }),
      ),
    );
    return;
  }

  event.respondWith(caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then((hit) => hit || fetch(req)));
});

// ── Avisos de pagos con la app cerrada ─────────────────────────────────────
// El navegador despierta al service worker más o menos una vez al día
// («periodic background sync», Chrome y Edge en Android con la app instalada).
// La app deja en IndexedDB los avisos ya calculados y traducidos; aquí solo se
// mira cuáles tocan hoy y no se han mostrado todavía.

const DB_NAME = 'finanzas-familiares';
const DB_STORE = 'kv';
const PERIODIC_TAG = 'avisos-pagos';

function openDB() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(DB_STORE)) open.result.createObjectStore(DB_STORE);
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const r = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Añade los avisos mostrados y olvida los de pagos de hace más de 40 días. */
function idbAddShown(db, keys, today) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const get = store.get('shown');
    get.onsuccess = () => {
      const prev = Array.isArray(get.result) ? get.result : [];
      const limit = shiftDate(today, -40);
      const all = Array.from(new Set(prev.concat(keys))).filter((k) => typeof k === 'string' && k.slice(0, 10) >= limit);
      store.put(all, 'shown');
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const pad2 = (n) => String(n).padStart(2, '0');

function localToday() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function shiftDate(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

async function notifyDuePayments() {
  const db = await openDB();
  const file = await idbGet(db, 'reminders');
  if (!file || !Array.isArray(file.items)) return;
  const today = localToday();
  const shown = new Set((await idbGet(db, 'shown')) || []);
  const due = file.items.filter((r) => r.from <= today && today <= r.until && !shown.has(r.key));
  for (const r of due) {
    const n = daysBetween(today, r.date);
    const when = n <= 0 ? file.labels.today : n === 1 ? file.labels.tomorrow : file.labels.inDays.replace('{n}', String(n));
    await self.registration.showNotification(when + ': ' + r.concept, {
      body: r.amountText + ' · ' + r.dateText + (r.estimated ? ' (' + file.labels.estimated + ')' : ''),
      tag: r.key,
      icon: 'icons/icon-192.png',
      data: { url: './#/avisos' },
    });
  }
  if (due.length) await idbAddShown(db, due.map((r) => r.key), today);
  // Número en el icono: pagos de hoy a 7 días.
  const week = new Set(file.items.filter((r) => r.from <= today && today <= r.until).map((r) => r.date + '|' + r.concept)).size;
  if (self.navigator.setAppBadge) {
    try {
      if (week) await self.navigator.setAppBadge(week);
      else await self.navigator.clearAppBadge();
    } catch (e) {
      /* sin permiso para el número del icono */
    }
  }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === PERIODIC_TAG) event.waitUntil(notifyDuePayments().catch(() => undefined));
});

// Avisos que manda el servicio de avisos (repositorio moxetas/avisos-familia) con la app
// cerrada. Llegan cifrados ({ v: 1, p }): se abren con la clave de los avisos que la app
// guardó en IndexedDB (src/storage/avisos-cola.ts). El servidor nunca ve el texto.

function fromB64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function openSealed(key, sealed) {
  const bytes = fromB64url(sealed.slice(3));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  let value = JSON.parse(new TextDecoder().decode(plain));
  if (typeof value === 'string') value = JSON.parse(value);
  return value;
}

async function showPush(data) {
  const db = await openDB();
  const key = await idbGet(db, 'avisos-key');
  if (!key || typeof data.p !== 'string') throw new Error('sin clave');
  const r = await openSealed(key, data.p);
  const today = localToday();
  const n = daysBetween(today, r.date);
  const L = r.l || {};
  const when = n <= 0 ? L.today : n === 1 ? L.tomorrow : String(L.inDays || '').replace('{n}', String(n));
  await self.registration.showNotification((when ? when + ': ' : '') + r.c, {
    body: r.a + ' · ' + r.d + (r.e && L.estimated ? ' (' + L.estimated + ')' : ''),
    tag: r.k,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: './#/avisos' },
  });
  // Así el aviso diario de este mismo móvil (periodic sync) no lo repite.
  await idbAddShown(db, [r.k], today);
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  event.waitUntil(
    showPush(data).catch(() =>
      // Sin la clave (por ejemplo, tras borrar los datos del navegador): un aviso sin detalles.
      self.registration.showNotification(data.title || '💶 Finanzas familiares', {
        body: data.body || '',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: data.tag || undefined,
        data: { url: data.url || './#/avisos' },
      }),
    ),
  );
});

// Tocar la notificación abre la app (o la trae al frente) en Avisos.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
