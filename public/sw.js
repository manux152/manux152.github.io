// Super Strikers service worker: lets the website open with no signal and installs as an app.
// It only handles files from this website (never Supabase, payments or video). Change VERSION to clear everything it saved.
const VERSION = 'ss-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.add('/')).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname === '/sw.js') return;
  // Pages: always try the network first so people get the newest version, and fall back to the saved app shell offline.
  if (req.mode === 'navigate' && !url.pathname.includes('.')) {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('/', copy)); } return r; }).catch(() => caches.match('/')));
    return;
  }
  // Built files and images: saved after the first visit.
  if (url.pathname.startsWith('/_expo/static/') || /\.(png|jpe?g|webp|svg|ico|woff2?|ttf)$/i.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; })));
  }
});
