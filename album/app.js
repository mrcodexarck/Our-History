/* ============================================================
   IMPORTS
============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { FIREBASE_CONFIG, PAREJA_ID } from "../citas/firebase-config.js";

/* ============================================================
   PROTECCIÓN
============================================================ */
if (sessionStorage.getItem("acceso-libro") !== "ok") {
  location.replace("../");
}

/* ============================================================
   FIREBASE
============================================================ */
const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

/* ============================================================
   DOM
============================================================ */
const feed       = document.getElementById("album-feed");
const vacio      = document.getElementById("album-vacio");
const contador   = document.getElementById("contador");

const lightbox   = document.getElementById("lightbox");
const lbImg      = document.getElementById("lb-img");
const lbFecha    = document.getElementById("lb-fecha");
const lbAutor    = document.getElementById("lb-autor");
const lbCerrar   = document.getElementById("lb-cerrar");
const lbPrev     = document.getElementById("lb-prev");
const lbNext     = document.getElementById("lb-next");

/* ============================================================
   ESTADO
============================================================ */
let items = [];       // array de { id, imagen, fecha, hoja, autor, ... }
let idxActual = 0;

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

/* ============================================================
   HELPERS
============================================================ */
function formatearFecha(fechaISO) {
  // fechaISO: "2026-10-06"
  if (!fechaISO) return "";
  const [y, m, d] = fechaISO.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} ${y}`;
}

function nombreAutor(id) {
  if (id === "joan")  return "🤎 Joan";
  if (id === "emily") return "💛 Emily";
  return "";
}

/* ============================================================
   RENDERIZAR FEED
   Orden: más NUEVO arriba, más VIEJO abajo
============================================================ */
function renderizar() {
  feed.innerHTML = "";

  if (items.length === 0) {
    vacio.hidden = false;
    contador.textContent = "0 dibujos";
    return;
  }
  vacio.hidden = true;
  contador.textContent = `${items.length} ${items.length === 1 ? "dibujo" : "dibujos"}`;

  items.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "album-card";
    card.style.animationDelay = (idx * 0.04) + "s";

    const fechaFmt = formatearFecha(item.fecha);
    const esHoja1 = item.hoja === 1;
    const labelHoja = esHoja1 ? "Hoja 1" : "Hoja 2";

    card.innerHTML = `
      <div class="album-marco">
        <div class="album-img">
          <img src="${item.imagen}" alt="${fechaFmt}" loading="lazy">
        </div>
        <div class="album-leyenda">
          <span class="album-fecha-txt">${fechaFmt}</span>
          <span class="album-hoja-badge">${labelHoja}</span>
        </div>
      </div>
    `;

    card.addEventListener("click", () => abrirLightbox(idx));
    feed.appendChild(card);
  });
}

/* ============================================================
   LIGHTBOX
============================================================ */
function abrirLightbox(idx) {
  if (idx < 0 || idx >= items.length) return;
  idxActual = idx;
  actualizarLightbox();
  lightbox.hidden = false;
  document.body.style.overflow = "hidden";
}

function cerrarLightbox() {
  lightbox.hidden = true;
  document.body.style.overflow = "";
}

function actualizarLightbox() {
  const item = items[idxActual];
  if (!item) return;

  lbImg.src = item.imagen;
  lbFecha.textContent = formatearFecha(item.fecha);
  lbAutor.textContent = nombreAutor(item.autor);

  lbPrev.disabled = idxActual === 0;
  lbNext.disabled = idxActual === items.length - 1;
}

function irA(delta) {
  const nuevo = idxActual + delta;
  if (nuevo < 0 || nuevo >= items.length) return;
  idxActual = nuevo;
  actualizarLightbox();
}

/* ============================================================
   EVENT LISTENERS
============================================================ */
lbCerrar.addEventListener("click", cerrarLightbox);
lightbox.addEventListener("click", e => {
  if (e.target === lightbox) cerrarLightbox();
});
lbPrev.addEventListener("click", e => { e.stopPropagation(); irA(-1); });
lbNext.addEventListener("click", e => { e.stopPropagation(); irA(+1); });

document.addEventListener("keydown", e => {
  if (lightbox.hidden) return;
  if (e.key === "Escape")     cerrarLightbox();
  if (e.key === "ArrowLeft")  irA(-1);
  if (e.key === "ArrowRight") irA(+1);
});

// Swipe en móvil dentro del lightbox
let lbX0 = null;
lightbox.addEventListener("touchstart", e => {
  lbX0 = e.touches[0].clientX;
}, { passive: true });
lightbox.addEventListener("touchend", e => {
  if (lbX0 === null) return;
  const dx = e.changedTouches[0].clientX - lbX0;
  if (Math.abs(dx) > 50) irA(dx < 0 ? +1 : -1);
  lbX0 = null;
}, { passive: true });

/* ============================================================
   CARGAR DATOS DESDE FIRESTORE
============================================================ */
async function initFirebase() {
  try {
    await signInAnonymously(auth);

    const ref = collection(db, "parejas", PAREJA_ID, "album");

    onSnapshot(ref, snap => {
      const nuevos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Ordenar por ID (que es "YYYY-MM-DD-N") descendente:
      // el más nuevo primero (arriba), el más viejo al final (abajo)
      nuevos.sort((a, b) => b.id.localeCompare(a.id));

      items = nuevos;
      renderizar();
      console.log(`🖼️ ${items.length} dibujos cargados`);
    }, err => {
      console.error("❌ Listener error:", err);
      vacio.hidden = false;
      vacio.textContent = "No se pudieron cargar los dibujos 😢";
    });

  } catch (err) {
    console.error("❌ Error Firebase:", err);
  }
}

initFirebase();