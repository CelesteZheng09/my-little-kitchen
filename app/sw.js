/* 我的小厨房 · Service Worker（离线缓存外壳 + 本地素材） */
const CACHE = 'my-kitchen-v19';
const ASSETS = [
  './', './index.html', './manifest.json', './config.js?v=20260624-v7a',
  './css/app.css?v=20260624-v7a',
  './js/db.js?v=20260624-v7a', './js/match.js?v=20260624-v7a', './js/parser.js?v=20260624-v7a',
  './js/sticker.js?v=20260624-v7a', './js/app.js?v=20260624-v7a',
  './icons/cat-staple.jpg', './icons/cat-meat.jpg', './icons/cat-veg.jpg',
  './icons/cat-seafood.jpg', './icons/cat-soup.jpg', './icons/cat-cold.jpg', './icons/cat-drink.jpg',
  './icons/dish-fanqie.jpg', './icons/dish-hongshao.jpg', './icons/dish-xilanhua.jpg', './icons/dish-zicai.jpg',
  './icons/ing-tomato.jpg', './icons/ing-egg.jpg', './icons/ing-veg.jpg',
  './icons/ing-garlic.jpg', './icons/ing-pork.jpg', './icons/ing-scallion.jpg',
  './icons/app-icon.png', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // 同源：cache-first；跨源（字体/模型 CDN）：network-first 失败回退缓存
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if (sameOrigin) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res;
    }).catch(() => caches.match('./index.html'))));
  } else {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res;
    }).catch(() => caches.match(req)));
  }
});
