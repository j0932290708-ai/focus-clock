const cachePrefix = `focus-clock-${new URL(self.registration.scope).pathname}-`;
const cacheName = `${cachePrefix}v6`;
const appFiles = [
  './', './index.html', './styles.css', './logic.js', './web-adapter.js', './renderer.js',
  './focus.html', './focus.css', './focus.js', './manifest.json',
  './pwa-icon-192.png', './pwa-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(appFiles)));
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(cachePrefix) && key !== cacheName).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;
  const appUrls = appFiles.map((file) => new URL(file, self.registration.scope).pathname);
  if (!appUrls.includes(requestUrl.pathname)) return;
  // 僅忽略本 App 檔案的 query，不能把其他網站或 API 混進離線快取。
  requestUrl.search = '';
  event.respondWith(caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(requestUrl.href);
    return cached || fetch(event.request);
  }));
});
