// Minimal service worker for PWA "Add to Home Screen" support
const CACHE_NAME = 'mt-automation-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through for real-time trading data
  event.respondWith(fetch(event.request));
});
