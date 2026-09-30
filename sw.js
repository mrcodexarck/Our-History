/* ============================================================
   SERVICE WORKER — autodestructivo temporal
   Fuerza la limpieza de todos los cachés viejos.
============================================================ */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.matchAll())
      .then(clients => {
        clients.forEach(c => {
          try { c.navigate(c.url); } catch(e) {}
        });
      })
      .then(() => self.registration.unregister())
      .then(() => console.log("🧹 SW limpiado y desregistrado"))
  );
});

self.addEventListener("fetch", () => {
  // Sin cache: todo va directo a la red
  return;
});