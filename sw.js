// Service Worker: کار کامل بدون اینترنت (cache-first برای فایل‌های برنامه)
const CACHE = 'mv-sells-v1.0.0';
const ASSETS = [
  "./",
  "css/app.css",
  "fonts/estedad-ar-400.woff2",
  "fonts/estedad-ar-500.woff2",
  "fonts/estedad-ar-700.woff2",
  "fonts/estedad-la-400.woff2",
  "fonts/estedad-la-500.woff2",
  "fonts/estedad-la-700.woff2",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/icon.svg",
  "index.html",
  "js/app.js",
  "js/db.js",
  "js/icons.js",
  "js/logic.js",
  "js/mark.js",
  "js/scanner.js",
  "js/sync.js",
  "js/utils.js",
  "manifest.webmanifest",
  "vendor/supabase.js",
  "vendor/xlsx.mini.min.js",
  "vendor/zxing.min.js",
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // درخواست‌های Supabase مستقیم به شبکه
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
