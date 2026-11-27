// Vienkāršs service worker (v2), lai Android ļautu instalēt lietotni. Dati vienmēr nāk no tīkla.
// © VAITKEVIX, SIA
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
