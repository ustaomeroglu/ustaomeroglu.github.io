// Network-first cache so the page still opens if the venue's signal drops.
const CACHE = 'rd26-v1';
const FILES = ['./', './index.html', './data.enc.json', './oturma.html', './oturma.enc.json'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).catch(() => {}));
});

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(networkFirst(e.request));
});

function networkFirst(req) {
  return new Promise((resolve) => {
    let done = false;
    const fromCache = async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (!done && hit) { done = true; resolve(hit); }
      return hit;
    };
    const timer = setTimeout(fromCache, 4000);
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        if (!done) { done = true; clearTimeout(timer); resolve(res); }
      })
      .catch(async () => {
        clearTimeout(timer);
        const hit = await fromCache();
        if (!done) { done = true; resolve(hit || Response.error()); }
      });
  });
}
