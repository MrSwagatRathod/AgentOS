/* Arrow Escape — service worker: offline-first caching */
'use strict';

const CACHE = 'arrow-escape-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/puzzle.js',
  './js/difficulty.js',
  './js/hints.js',
  './js/renderer.js',
  './js/engine.js',
  './js/audio.js',
  './js/ui.js',
  './js/game.js',
  './js/main.js',
  './manifest.webmanifest',
  './favicon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      });
    })
  );
});
