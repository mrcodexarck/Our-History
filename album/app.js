/* ============================================================
   IMPORTS
============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  initializeFirestore, // 👈 Añadido para forzar Long Polling
  collection,
  onSnapshot,
  doc,
  deleteDoc
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

// 🔥 FIX CRÍTICO: Forzar Long Polling evita los errores 404 (WebChannel) 
// que impiden que el álbum cargue las fotos en redes móviles o modo incógnito.
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  experimentalAutoDetectLongPolling: true
});

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
  if (!fechaISO) return "Fecha desconocida";
  const [y, m, d] = fechaISO.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return fechaISO; // Fallback seguro
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

  // Filtramos solo los documentos que realmente tengan una imagen guardada
  const itemsValidos = items.filter(i => i && i.imagen);

  if (itemsValidos.length === 0) {
    vacio.hidden = false;
    contador.textContent = "0 dibujos";
    return;
  }
  vacio.hidden = true;
  contador.textContent = `${itemsValidos.length} ${itemsValidos.length === 1 ? "dibujo" : "dibujos"}`;

  itemsValidos.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "album-card";
    card.style.animationDelay = (idx * 0.04) + "s";

    // Fallback de fecha: si item.fecha no existe, usamos los primeros 10 caracteres del ID (YYYY-MM-DD)
    const fechaSegura = item.fecha || item.id.substring(0, 10);
    const fechaFmt = formatearFecha(fechaSegura);
    
    const esHoja1 = item.hoja === 1;
    const labelHoja = esHoja1 ? "Hoja 1" : "Hoja 2";

    card.innerHTML = `
      <div class="album-marco">
        <div class="album-img">
          <img src="${item.imagen}" alt="Dibujo del ${fechaFmt}" loading="lazy">
        </div>
        <button type="button" class="album-editar" aria-label="Editar dibujo" title="Editar dibujo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
        <button type="button" class="album-eliminar" aria-label="Eliminar dibujo" title="Eliminar del álbum">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <div class="album-leyenda">
          <span class="album-fecha-txt">${fechaFmt}</span>
          <span class="album-hoja-badge">${labelHoja}</span>
        </div>
      </div>
    `;

    // Clic en la tarjeta → abrir lightbox
    card.addEventListener("click", (e) => {
      if (e.target.closest(".album-eliminar") || e.target.closest(".album-editar")) return; 
      abrirLightbox(idx);
    });

    // Clic en el botón editar
    const btnEditar = card.querySelector(".album-editar");
    btnEditar.addEventListener("click", (e) => {
      e.stopPropagation();
      const hoja = item.hoja || 1;
      // Redirige al módulo de dibujos pasándole la fecha y la hoja correctas
      window.location.href = `../dibujos/index.html?fecha=${fechaSegura}&hoja=${hoja}`;
    });

    // Clic en el botón eliminar
    const btnEliminar = card.querySelector(".album-eliminar");
    btnEliminar.addEventListener("click", (e) => {
      e.stopPropagation();
      eliminarDelAlbum(item, btnEliminar, fechaFmt, labelHoja);
    });

    feed.appendChild(card);
  });
}

/* ============================================================
   LIGHTBOX
============================================================ */
function abrirLightbox(idx) {
  const itemsValidos = items.filter(i => i && i.imagen);
  if (idx < 0 || idx >= itemsValidos.length) return;
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
  const itemsValidos = items.filter(i => i && i.imagen);
  const item = itemsValidos[idxActual];
  
  // 🛡️ Seguridad: Si el item ya no existe (porque se borró), cerramos el lightbox
  if (!item) {
    cerrarLightbox();
    return;
  }

  lbImg.src = item.imagen;
  
  const fechaSegura = item.fecha || item.id.substring(0, 10);
  lbFecha.textContent = formatearFecha(fechaSegura);
  lbAutor.textContent = nombreAutor(item.autor);

  lbPrev.disabled = idxActual === 0;
  lbNext.disabled = idxActual === itemsValidos.length - 1;
}

function irA(delta) {
  const itemsValidos = items.filter(i => i && i.imagen);
  const nuevo = idxActual + delta;
  if (nuevo < 0 || nuevo >= itemsValidos.length) return;
  idxActual = nuevo;
  actualizarLightbox();
}

/* ============================================================
   EVENT LISTENERS (LIGHTBOX)
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
      // Extraemos y filtramos para evitar nulos
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
      vacio.textContent = "No se pudieron cargar los dibujos 😢. Revisa tu conexión.";
    });

  } catch (err) {
    console.error("❌ Error Firebase Auth:", err);
    vacio.hidden = false;
    vacio.textContent = "Error de conexión con la base de datos.";
  }
}

initFirebase();

/* ============================================================
   ELIMINAR DEL ÁLBUM
============================================================ */
async function eliminarDelAlbum(item, btnEl, fechaFmt, labelHoja) {
  const confirmar = confirm(
    `¿Eliminar este dibujo del álbum?\n\n` +
    `📅 ${fechaFmt}\n` +
    `📄 ${labelHoja}\n\n` +
    `Se quitará del álbum. El dibujo seguirá existiendo en el módulo de dibujos.`
  );
  if (!confirmar) return;

  btnEl.disabled = true;
  btnEl.style.opacity = "0.5";

  try {
    await deleteDoc(doc(db, "parejas", PAREJA_ID, "album", item.id));
    console.log(`🗑️ Eliminado del álbum: ${item.id}`);
  } catch (err) {
    console.error("❌ Error eliminando:", err);
    alert("No se pudo eliminar. Intenta de nuevo.");
    btnEl.disabled = false;
    btnEl.style.opacity = "";
  }
}