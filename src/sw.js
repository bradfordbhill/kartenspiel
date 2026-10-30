/* Kartenspiel service worker (public site only). Lets the installed app open offline and keeps it fast:
   - the page itself: network first, so updates arrive whenever you're online; the stored copy when you aren't
   - icons, manifest and Google Fonts: from the cache, refreshed in the background
   - the game server's /api and its WebSocket are never touched
   build.sh replaces __VERSION__ with a hash of the page, so each new build replaces the old cache. */
const CACHE = 'kartenspiel-__VERSION__';
const CORE = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('kartenspiel-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || (url.origin === location.origin && url.pathname.includes('/api/'))) return;
  if (req.mode === 'navigate') {          // the page: network first
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./', copy)); return res; })
      .catch(() => caches.match('./')));
    return;
  }
  const font = /^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !font) return;
  e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {   // everything else: cache, refreshed in the background
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  })));
});
