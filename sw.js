// Service worker «Арканы»: офлайн-режим и быстрая загрузка.
// При каждом обновлении сайта увеличивай VERSION — вместе с ?v= в index.html и импортах.
const VERSION = 'v12';
const CACHE = 'arcana-' + VERSION;
const PRECACHE = [
  './',
  './index.html',
  './css/style.css?v=12',
  './js/app.js?v=12',
  './js/arcana.js?v=12',
  './js/biwheel.js?v=12',
  './js/matrix.js?v=12',
  './js/natal-houses.js?v=12',
  './js/natal-signs.js?v=12',
  './js/natal-texts.js?v=12',
  './js/natal-ui.js?v=12',
  './js/natal.js?v=12',
  './js/partner-texts.js?v=12',
  './js/partner-ui.js?v=12',
  './js/place-field.js?v=12',
  './js/story.js?v=12',
  './js/syn-texts.js?v=12',
  './js/syn-ui.js?v=12',
  './js/transit-texts.js?v=12',
  './js/transit-ui.js?v=12',
  './vendor/astronomy.min.js?v=2.1.19',
  './favicon.svg',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('arcana-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Поиск городов — только из сети
  if (url.hostname.endsWith('open-meteo.com')) return;

  // Страница: сначала сеть (чтобы получать обновления), без сети — из кэша
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // Шрифты Google: отдаём из кэша и обновляем в фоне
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // Файлы сайта: из кэша (у них версия в адресе), иначе из сети с сохранением
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
