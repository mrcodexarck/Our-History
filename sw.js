/* ============================================================
   SERVICE WORKER — DESACTIVADO TEMPORALMENTE
   Este SW se autoelimina y limpia todos los cachés.
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
        clients.forEach(c => c.navigate(c.url));
      })
      .then(() => self.registration.unregister())
      .then(() => console.log("🧹 SW eliminado y caches limpiados"))
  );
});

self.addEventListener("fetch", event => {
  // No cachear nada — dejar pasar todo a la red
  return;
});