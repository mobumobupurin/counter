// オフライン対応用 Service Worker
// アプリ本体を更新したら VERSION を上げる（ユーザーの記録データは IndexedDB にあり、ここでは消えない）
const VERSION = 'v1';
const CACHE = `counter-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/store.js',
  './js/util.js',
  './js/ui.js',
  './js/icons.js',
  './js/feedback.js',
  './js/views/card.js',
  './js/views/home.js',
  './js/views/editor.js',
  './js/views/reorder.js',
  './js/views/detail.js',
  './js/views/calendar.js',
  './js/views/stats.js',
  './js/views/settings.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('counter-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ネットワーク優先（最新版を取りにいき、オフライン時はキャッシュ）
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
