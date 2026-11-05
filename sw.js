/* ============================================================
   SERVICE WORKER — Nuestra Historia Juntos
   Estrategia: Network First. Sin versiones manuales.
============================================================ */

// 👇 El caché se genera automáticamente con la fecha y hora actual.
// Cada vez que este archivo cambie, el navegador lo detecta,
// crea un caché nuevo y borra el anterior.
const CACHE_NAME = `nuestra-historia-${Date.now()}`;

const ASSETS_ESTATICOS = [
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png"
];

/* INSTALL */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(
        ASSETS_ESTATICOS.map(url => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

/* ACTIVATE — limpiar TODOS los cachés viejos */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* FETCH */
self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Ignorar Firebase, Google Fonts y CDNs externos
  if (
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("gstatic") ||
    url.hostname.includes("fonts.g")
  ) return;

  // HTML, CSS, JS → NETWORK FIRST (sin caché HTTP)
  if (
    request.destination === "document" ||
    request.destination === "style"    ||
    request.destination === "script"   ||
    request.destination === "worker"   ||
    url.pathname.endsWith(".html")     ||
    url.pathname.endsWith(".css")      ||
    url.pathname.endsWith(".js")       ||
    url.pathname.endsWith(".json")
  ) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cached => {
            if (cached) return cached;
            if (request.mode === "navigate") return caches.match("./index.html");
          });
        })
    );
    return;
  }

  // Imágenes, fuentes → CACHE FIRST
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

/* MESSAGE */
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});