/* ============================================================
   SERVICE WORKER — Nuestra Historia Juntos
   Cachea todas las páginas para funcionar offline.
============================================================ */

const CACHE_NAME = "nuestra-historia-v2";

const ASSETS = [
  "./",
  "./index.html",
  "./menu.html",
  "./manifest.json",

  // Estilos y scripts de la raíz
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png",

  // Módulo: nuestro libro
  "./nuestro-libro/index.html",
  "./nuestro-libro/styles.css",
  "./nuestro-libro/script.js",
  "./nuestro-libro/recuerdos.js",
  "./nuestro-libro/decoraciones.js",

  // Módulo: citas / 200 ideas
  "./citas/index.html",
  "./citas/styles.css",
  "./citas/script.js",
  "./citas/ideas.js",
  "./citas/ruleta.css",
  "./citas/ruleta.js",
  "./citas/firebase-config.js",

  // Módulo: dibujos
  "./dibujos/index.html",
  "./dibujos/styles.css",
  "./dibujos/app.js"
];

/* ----------------- INSTALL ----------------- */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cachear uno por uno: si uno falla, no bloquea los demás
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(() => null))
      );
    }).then(() => self.skipWaiting())
  );
});

/* ----------------- ACTIVATE ----------------- */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ----------------- FETCH ----------------- */
self.addEventListener("fetch", event => {
  const { request } = event;

  // Solo GET
  if (request.method !== "GET") return;

  // Ignorar Firebase y CDNs externos
  const url = new URL(request.url);
  if (
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("gstatic") ||
    url.hostname.includes("fonts.g")
  ) {
    return;
  }

  // Estrategia: Cache first → red como fallback
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        // Guardar copia en caché si es exitosa
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => {
        // Si falla la red y es navegación, mostrar index
        if (request.mode === "navigate") {
          return caches.match("./index.html");
        }
      });
    })
  );
});