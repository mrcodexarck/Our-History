/* ============================================================
   SERVICE WORKER — Nuestra Historia Juntos
   Estrategia: Network First para código, Cache First para medios
   Así siempre trae los cambios sin tener que borrar caché.
============================================================ */

const CACHE_VERSION = "v1";              // ⚠️ Solo cambia si cambias la estrategia
const CACHE_NAME    = `nuestra-historia-${CACHE_VERSION}`;

/* Recursos que SÍ se cachean (imágenes, iconos) */
const ASSETS_ESTATICOS = [
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png"
];

/* ============================================================
   INSTALL — cachear solo los estáticos
============================================================ */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(
        ASSETS_ESTATICOS.map(url => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

/* ============================================================
   ACTIVATE — limpiar cachés viejos
============================================================ */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ============================================================
   FETCH — la parte clave
============================================================ */
self.addEventListener("fetch", event => {
  const { request } = event;

  // Solo GET
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Ignorar Firebase, Google Fonts y cualquier CDN externo
  if (
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("gstatic") ||
    url.hostname.includes("fonts.g")
  ) {
    return;
  }

  // ==========================================================
  // HTML, CSS, JS → NETWORK FIRST
  // Trae siempre lo más nuevo de la red. Solo usa caché si
  // no hay internet.
  // ==========================================================
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
      fetch(request)
        .then(response => {
          // Guardar copia nueva en caché para uso offline
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Sin red → usar caché (offline)
          return caches.match(request).then(cached => {
            if (cached) return cached;
            if (request.mode === "navigate") {
              return caches.match("./index.html");
            }
          });
        })
    );
    return;
  }

  // ==========================================================
  // Imágenes, fuentes, iconos → CACHE FIRST
  // Son estáticos, no cambian. Carga rápida.
  // ==========================================================
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

/* ============================================================
   MESSAGE — permite forzar actualización desde la página
============================================================ */
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});