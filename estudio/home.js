/* ============================================================
   IMPORTS
============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  setDoc
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
   PERFIL
============================================================ */
const PERFIL_KEY = "perfil-dibujo";
const perfilActual = localStorage.getItem(PERFIL_KEY);

/* ============================================================
   FIREBASE
============================================================ */
const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

/* ============================================================
   DOM
============================================================ */
const grid          = document.getElementById("home-grid");
const vacio         = document.getElementById("home-vacio");
const contador      = document.getElementById("home-count");
const fabNuevo      = document.getElementById("fab-nuevo");
const modalNuevo    = document.getElementById("modal-nuevo");
const modalMenu     = document.getElementById("modal-menu");
const modalCerrar   = document.getElementById("modal-cerrar");
const modalCancelar = document.getElementById("modal-cancelar");
const modalCrear    = document.getElementById("modal-crear");
const menuCerrar    = document.getElementById("menu-cerrar");
const menuTitulo    = document.getElementById("menu-titulo");
const menuRenombrar = document.getElementById("menu-renombrar");
const menuEliminar  = document.getElementById("menu-eliminar");
const inputNombre   = document.getElementById("proyecto-nombre");

/* ============================================================
   ESTADO
============================================================ */
let proyectos = [];
let ratioSeleccionado = 1;
let proyectoActivo = null;   // { id, nombre }
let primerRender = true;     // para saber si mostrar skeleton al inicio
let creandoProyecto = false; // anti doble click

/* ============================================================
   HELPERS
============================================================ */
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const RATIO_KEY = "estudio-ratio-preferido";

function formatearFecha(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const ahora = new Date();
  const diffMs = ahora - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffHr < 24) return `hace ${diffHr} h`;
  if (diffD < 7) return `hace ${diffD} d`;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function mostrarToast(msg, esError = false) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.toggle("error", esError);
  t.classList.add("visible");
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove("visible"), 2000);
}

/* Escapar texto para insertar en innerHTML de forma segura */
function escaparHTML(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Mostrar skeleton de carga mientras llegan datos */
function mostrarSkeleton() {
  grid.innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  `;
}

/* ============================================================
   RENDER GRID
============================================================ */
function renderGrid() {
  grid.innerHTML = "";
  primerRender = false;

  if (proyectos.length === 0) {
    vacio.hidden = false;
    contador.textContent = "0";
    return;
  }
  vacio.hidden = true;
  contador.textContent = proyectos.length;

  proyectos.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "proyecto-card";
    card.style.animationDelay = Math.min(i * 0.03, 0.5) + "s"; // limitar el delay máximo
    card.dataset.id = p.id;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `Abrir proyecto ${p.nombre || "Sin título"}`);

    const tieneThumb = p.thumbnail && typeof p.thumbnail === "string";
    const nombreSeguro = escaparHTML(p.nombre || "Sin título");
    const altSeguro = escaparHTML(p.nombre || "Proyecto");

    card.innerHTML = `
      <button type="button" class="proyecto-menu" data-id="${p.id}" aria-label="Opciones del proyecto">⋯</button>
      <div class="proyecto-thumb">
        ${tieneThumb
          ? `<img src="${p.thumbnail}" alt="${altSeguro}" loading="lazy">`
          : `<div class="placeholder">🎨</div>`}
      </div>
      <div class="proyecto-info">
        <div class="proyecto-nombre">${nombreSeguro}</div>
        <div class="proyecto-fecha">${formatearFecha(p.actualizadoEn || p.creadoEn)}</div>
      </div>
    `;

    // Clic en la tarjeta → abrir editor
    card.addEventListener("click", (e) => {
      if (e.target.closest(".proyecto-menu")) return;
      abrirProyecto(p.id);
    });

    // Teclado: Enter o Space → abrir
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        abrirProyecto(p.id);
      }
    });

    // Botón de opciones
    card.querySelector(".proyecto-menu").addEventListener("click", (e) => {
      e.stopPropagation();
      abrirMenuProyecto(p);
    });

    grid.appendChild(card);
  });
}

/* ============================================================
   NAVEGAR AL EDITOR
============================================================ */
function abrirProyecto(id) {
  location.href = `./editor.html?id=${encodeURIComponent(id)}`;
}

/* ============================================================
   ABRIR MODAL NUEVO PROYECTO
============================================================ */
function abrirModalNuevo() {
  inputNombre.value = "";

  // Cargar último ratio usado
  const ratioGuardado = parseFloat(localStorage.getItem(RATIO_KEY));
  ratioSeleccionado = isNaN(ratioGuardado) ? 1 : ratioGuardado;

  document.querySelectorAll(".canvas-op").forEach(b => {
    b.classList.toggle("active", parseFloat(b.dataset.ratio) === ratioSeleccionado);
  });

  modalNuevo.hidden = false;
  setTimeout(() => inputNombre.focus(), 200);
}

function cerrarModalNuevo() {
  modalNuevo.hidden = true;
}

fabNuevo.addEventListener("click", abrirModalNuevo);

document.querySelectorAll(".canvas-op").forEach(btn => {
  btn.addEventListener("click", () => {
    ratioSeleccionado = parseFloat(btn.dataset.ratio);
    document.querySelectorAll(".canvas-op").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    // Guardar preferencia
    try { localStorage.setItem(RATIO_KEY, String(ratioSeleccionado)); } catch(e) {}
  });
});

modalCerrar.addEventListener("click", cerrarModalNuevo);
modalCancelar.addEventListener("click", cerrarModalNuevo);
modalNuevo.addEventListener("click", e => {
  if (e.target === modalNuevo) cerrarModalNuevo();
});

inputNombre.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    crearProyecto();
  }
  if (e.key === "Escape") {
    cerrarModalNuevo();
  }
});

modalCrear.addEventListener("click", crearProyecto);

/* ============================================================
   CREAR PROYECTO
============================================================ */
async function crearProyecto() {
  // Anti doble click
  if (creandoProyecto) return;
  creandoProyecto = true;

  const nombre = inputNombre.value.trim() || "Sin título";

  modalCrear.disabled = true;
  modalCrear.textContent = "Creando…";

  try {
    // Dimensiones según el ratio: 1 = cuadrado, 0.75 = vertical, 1.333 = horizontal
    const base = 1400;
    let ancho, alto;
    if (ratioSeleccionado < 1) {
      // Vertical
      ancho = Math.round(base * 0.75);
      alto  = base;
    } else if (ratioSeleccionado > 1) {
      // Horizontal
      ancho = base;
      alto  = Math.round(base / 1.333);
    } else {
      ancho = base;
      alto  = base;
    }

    const nuevo = {
      nombre,
      ancho,
      alto,
      ratio: ratioSeleccionado,
      autor: perfilActual || "anon",
      creadoEn: Date.now(),
      actualizadoEn: Date.now(),
      thumbnail: null,
      canvasData: null,
      capas: []
    };

    const ref = await addDoc(collection(db, "parejas", PAREJA_ID, "proyectos"), nuevo);
    mostrarToast("✅ Proyecto creado");
    modalNuevo.hidden = true;

    // Navegar directo al editor
    setTimeout(() => {
      location.href = `./editor.html?id=${encodeURIComponent(ref.id)}`;
    }, 400);
  } catch (err) {
    console.error(err);
    mostrarToast("❌ Error al crear", true);
    modalCrear.disabled = false;
    modalCrear.textContent = "Crear proyecto";
  } finally {
    creandoProyecto = false;
  }
}

/* ============================================================
   MENÚ DE PROYECTO (renombrar / eliminar)
============================================================ */
function abrirMenuProyecto(p) {
  proyectoActivo = p;
  menuTitulo.textContent = p.nombre || "Sin título";
  modalMenu.hidden = false;
}

function cerrarMenuProyecto() {
  modalMenu.hidden = true;
  proyectoActivo = null;
}

menuCerrar.addEventListener("click", cerrarMenuProyecto);
modalMenu.addEventListener("click", e => {
  if (e.target === modalMenu) cerrarMenuProyecto();
});

menuRenombrar.addEventListener("click", async () => {
  if (!proyectoActivo) return;
  const nuevo = prompt("Nuevo nombre:", proyectoActivo.nombre);
  if (!nuevo || !nuevo.trim()) return;

  try {
    await setDoc(
      doc(db, "parejas", PAREJA_ID, "proyectos", proyectoActivo.id),
      { nombre: nuevo.trim(), actualizadoEn: Date.now() },
      { merge: true }
    );
    mostrarToast("✅ Renombrado");
    cerrarMenuProyecto();
  } catch (err) {
    console.error(err);
    mostrarToast("❌ Error", true);
  }
});

menuEliminar.addEventListener("click", async () => {
  if (!proyectoActivo) return;
  const confirmar = confirm(
    `¿Eliminar "${proyectoActivo.nombre}"?\n\nEsta acción no se puede deshacer.`
  );
  if (!confirmar) return;

  try {
    await deleteDoc(doc(db, "parejas", PAREJA_ID, "proyectos", proyectoActivo.id));
    mostrarToast("🗑️ Eliminado");
    cerrarMenuProyecto();
  } catch (err) {
    console.error(err);
    mostrarToast("❌ Error", true);
  }
});

/* ============================================================
   ATAJOS DE TECLADO GLOBALES
============================================================ */
document.addEventListener("keydown", e => {
  // Ctrl/Cmd + N → Nuevo proyecto
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
    e.preventDefault();
    abrirModalNuevo();
    return;
  }
  // Escape → cerrar modales
  if (e.key === "Escape") {
    if (!modalNuevo.hidden)  cerrarModalNuevo();
    if (!modalMenu.hidden)   cerrarMenuProyecto();
  }
});

/* ============================================================
   INICIAR FIREBASE + ESCUCHAR
============================================================ */
async function initFirebase() {
  // Mostrar skeleton mientras cargan los datos
  mostrarSkeleton();

  try {
    await signInAnonymously(auth);

    const ref = collection(db, "parejas", PAREJA_ID, "proyectos");
    const q = query(ref, orderBy("actualizadoEn", "desc"));

    onSnapshot(q, snap => {
      proyectos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderGrid();
      console.log(`📚 ${proyectos.length} proyectos cargados`);
    }, err => {
      console.error("Error listener:", err);
      // Si falla por índice, usar orden simple
      const q2 = query(ref);
      onSnapshot(q2, snap => {
        proyectos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        proyectos.sort((a, b) => (b.actualizadoEn || 0) - (a.actualizadoEn || 0));
        renderGrid();
        console.log(`📚 ${proyectos.length} proyectos cargados (sin índice)`);
      }, err2 => {
        console.error("Error listener fallback:", err2);
        mostrarToast("Error cargando proyectos", true);
        grid.innerHTML = "";
        vacio.hidden = false;
      });
    });

    console.log("✅ Home listo");
  } catch (err) {
    console.error("❌ Error Firebase:", err);
    mostrarToast("Error de conexión", true);
    grid.innerHTML = "";
    vacio.hidden = false;
  }
}

/* ============================================================
   DETECTAR CAMBIO DE PERFIL
   (si el usuario cambia en el editor, se refleja aquí)
============================================================ */
window.addEventListener("storage", e => {
  if (e.key === PERFIL_KEY) {
    console.log("👤 Perfil actualizado:", e.newValue);
    // No hace falta recargar, solo se usa al crear nuevos proyectos
  }
});

/* ============================================================
   RECUPERAR AL VOLVER (para sincronizar)
============================================================ */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    console.log("👁️ Home visible");
  }
});

/* ============================================================
   ARRANQUE
============================================================ */
initFirebase();