// Vienkāršs service worker, lai Android ļautu instalēt lietotni. Dati vienmēr nāk no tīkla.
// © VAITKEVIX, SIA
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
