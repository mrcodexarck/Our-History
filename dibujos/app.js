/* ============================================================
   IMPORTS
============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { FIREBASE_CONFIG, PAREJA_ID } from "../citas/firebase-config.js";

/* ============================================================
   FECHA
============================================================ */
function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const hoy = new Date();
const fechaDiaEl  = document.getElementById("fecha-dia");
const fechaAnioEl = document.getElementById("fecha-anio");
if (fechaDiaEl)  fechaDiaEl.textContent  = `${hoy.getDate()} de ${MESES[hoy.getMonth()]}`;
if (fechaAnioEl) fechaAnioEl.textContent = hoy.getFullYear();

/* ============================================================
   CANVAS
============================================================ */
const canvas = document.getElementById("canvas");
const ctx    = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;
const COLOR_FONDO = "#fdfaf3";

function pintarFondo() {
  ctx.fillStyle = COLOR_FONDO;
  ctx.fillRect(0, 0, W, H);
}

/* ============================================================
   ESTADO
============================================================ */
let colorActual  = "#3b322b";
let tamanoActual = 8;
let herramienta  = "lapiz";
let dibujando    = false;
let ultimoPunto  = null;
let ultimoTrazo  = 0;
let esMiTrazo    = false;

let firebaseListo = false;
let guardando     = false;
let timeoutGuardar = null;

/* Hoja actual: 1 o 2 */
let hojaActual = 1;

/* Estado local de cada hoja (imagen en memoria) */
const estadoHojas = {
  1: { imagen: null },
  2: { imagen: null }
};

/* docRefs para cada hoja */
const docRefs = { 1: null, 2: null };

/* ============================================================
   UNDO
============================================================ */
const undoStack = [];
const MAX_UNDO = 15;

function guardarEstadoUndo() {
  try {
    undoStack.push(ctx.getImageData(0, 0, W, H));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  } catch (e) { /* silencioso */ }
}

function deshacer() {
  if (undoStack.length === 0) return;
  const estado = undoStack.pop();
  ctx.putImageData(estado, 0, 0);
  programarGuardar(150);
}

/* ============================================================
   DIBUJO
============================================================ */
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top)  * (H / rect.height)
  };
}

function estilosDeTrazo() {
  switch (herramienta) {
    case "borrador":
      return { color: COLOR_FONDO, ancho: tamanoActual * 1.8, alpha: 1 };
    case "marcador":
      return { color: colorActual, ancho: tamanoActual * 1.6, alpha: 0.55 };
    case "pincel":
      return { color: colorActual, ancho: tamanoActual * 1.2, alpha: 0.85 };
    case "lapiz":
    default:
      return { color: colorActual, ancho: tamanoActual, alpha: 1 };
  }
}

canvas.addEventListener("pointerdown", e => {
  if (e.pointerType === "touch" && e.isPrimary === false) return;
  canvas.setPointerCapture(e.pointerId);

  dibujando = true;
  esMiTrazo = true;
  ultimoPunto = getPos(e);
  guardarEstadoUndo();

  const s = estilosDeTrazo();
  ctx.beginPath();
  ctx.arc(ultimoPunto.x, ultimoPunto.y, s.ancho / 2, 0, Math.PI * 2);
  ctx.fillStyle = s.color;
  ctx.globalAlpha = s.alpha;
  ctx.fill();
  ctx.globalAlpha = 1;
  e.preventDefault();
});

canvas.addEventListener("pointermove", e => {
  if (!dibujando) return;
  const p = getPos(e);
  const s = estilosDeTrazo();

  ctx.beginPath();
  ctx.moveTo(ultimoPunto.x, ultimoPunto.y);
  ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.ancho;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = s.alpha;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ultimoPunto = p;
  ultimoTrazo = Date.now();
  programarGuardar(500);
  e.preventDefault();
});

function terminarTrazo() {
  if (!dibujando) return;
  dibujando = false;
  esMiTrazo = false;
  ultimoPunto = null;
  ultimoTrazo = Date.now();
  programarGuardar(300);
}

canvas.addEventListener("pointerup", terminarTrazo);
canvas.addEventListener("pointercancel", terminarTrazo);
canvas.addEventListener("pointerleave", terminarTrazo);

/* ============================================================
   TABS DE HOJAS
============================================================ */
const tabsHoja = document.querySelectorAll(".tabs-hojas .tab");

tabsHoja.forEach(tab => {
  tab.addEventListener("click", () => {
    const n = parseInt(tab.dataset.hoja, 10);
    if (n === hojaActual) return;
    cambiarHoja(n);
  });
});

function cambiarHoja(nuevaHoja) {
  // 1. Guardar la hoja actual
  estadoHojas[hojaActual].imagen = canvas.toDataURL("image/png");

  // 2. Cambiar
  hojaActual = nuevaHoja;

  // 3. Actualizar tabs
  tabsHoja.forEach(t => {
    t.classList.toggle("active", parseInt(t.dataset.hoja, 10) === nuevaHoja);
  });

  // 4. Pintar la otra hoja
  const img = estadoHojas[hojaActual].imagen;
  if (img) {
    dibujarImagen(img);
  } else {
    pintarFondo();
  }

  // 5. Limpiar el undo (porque era de la otra hoja)
  undoStack.length = 0;

  console.log(`📄 Cambiado a hoja ${hojaActual}`);
}

function dibujarImagen(dataURL) {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
  };
  img.onerror = () => console.warn("⚠️ No se pudo cargar imagen");
  img.src = dataURL;
}

/* ============================================================
   PALETA DE LÁPICES
============================================================ */
const COLORES = [
  { hex: "#3b322b", nombre: "Café oscuro" },
  { hex: "#7d6c5c", nombre: "Café" },
  { hex: "#b58a5a", nombre: "Bronce" },
  { hex: "#d9a86c", nombre: "Dorado" },
  { hex: "#e88a7a", nombre: "Coral" },
  { hex: "#e8b07a", nombre: "Durazno" },
  { hex: "#f4d03f", nombre: "Amarillo" },
  { hex: "#a8c66c", nombre: "Verde claro" },
  { hex: "#7da654", nombre: "Verde" },
  { hex: "#7cc0d4", nombre: "Cielo" },
  { hex: "#5b8fb0", nombre: "Azul" },
  { hex: "#8b6cb0", nombre: "Morado" },
  { hex: "#e88ea7", nombre: "Rosa" },
  { hex: "#c9524a", nombre: "Rojo" },
  { hex: "#ffffff", nombre: "Blanco" },
  { hex: "#000000", nombre: "Negro" }
];

const lapicesEl = document.getElementById("lapices");

function renderLapices() {
  if (!lapicesEl) return;
  lapicesEl.innerHTML = "";

  COLORES.forEach(c => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lapiz" + (c.hex === colorActual ? " active" : "");
    btn.title = c.nombre;
    btn.dataset.color = c.hex;
    btn.innerHTML = `
      <div class="cuerpo" style="background:${c.hex};"></div>
      <div class="punta"></div>
      <div class="grafito" style="border-bottom-color:${c.hex};"></div>
    `;
    btn.addEventListener("click", () => seleccionarColor(c.hex, btn));
    lapicesEl.appendChild(btn);
  });
}

function seleccionarColor(hex, btnEl) {
  colorActual = hex;
  herramienta = "lapiz";

  document.querySelectorAll(".lapiz").forEach(l => l.classList.remove("active"));
  btnEl?.classList.add("active");

  document.querySelectorAll(".tool").forEach(t => t.classList.remove("active"));
  document.querySelector('[data-tool="lapiz"]')?.classList.add("active");
}

renderLapices();

/* ============================================================
   HERRAMIENTAS
============================================================ */
document.querySelectorAll(".tool[data-tool]").forEach(btn => {
  btn.addEventListener("click", () => {
    herramienta = btn.dataset.tool;

    document.querySelectorAll(".tool").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    if (herramienta === "borrador") {
      document.querySelectorAll(".lapiz").forEach(l => l.classList.remove("active"));
    } else {
      const match = [...document.querySelectorAll(".lapiz")].find(l => l.dataset.color === colorActual);
      match?.classList.add("active");
    }
  });
});

/* ============================================================
   TAMAÑOS
============================================================ */
document.querySelectorAll(".tamanos button").forEach(btn => {
  btn.addEventListener("click", () => {
    tamanoActual = parseInt(btn.dataset.size, 10) || 8;
    document.querySelectorAll(".tamanos button")
      .forEach(b => b.classList.toggle("active", b === btn));
  });
});

/* ============================================================
   BOTONES UNDO / CLEAR
============================================================ */
const btnUndo  = document.getElementById("btn-undo");
const btnClear = document.getElementById("btn-clear");

if (btnUndo)  btnUndo.addEventListener("click", deshacer);
if (btnClear) btnClear.addEventListener("click", () => {
  if (!confirm("¿Borrar todo el dibujo de esta hoja?")) return;
  guardarEstadoUndo();
  pintarFondo();
  programarGuardar(100);
});

/* ============================================================
   DRAWER MÓVIL
============================================================ */
const panelHerramientas = document.getElementById("panel-herramientas");
const btnToolsMobile    = document.getElementById("btn-tools-mobile");
const drawerOverlay     = document.getElementById("drawer-overlay");
const drawerCerrar      = document.getElementById("drawer-cerrar");

function abrirDrawer() {
  panelHerramientas?.classList.add("abierto");
  drawerOverlay?.classList.add("visible");
}
function cerrarDrawer() {
  panelHerramientas?.classList.remove("abierto");
  drawerOverlay?.classList.remove("visible");
}

btnToolsMobile?.addEventListener("click", abrirDrawer);
drawerCerrar?.addEventListener("click", cerrarDrawer);
drawerOverlay?.addEventListener("click", cerrarDrawer);

/* ============================================================
   INDICADOR DE ESTADO
============================================================ */
const statusEl = document.getElementById("status");
function setStatus(estado) {
  if (!statusEl) return;
  statusEl.classList.remove("conectado", "guardando");
  if (estado) statusEl.classList.add(estado);
}

/* ============================================================
   FIREBASE
============================================================ */
const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

function programarGuardar(ms = 500) {
  clearTimeout(timeoutGuardar);
  timeoutGuardar = setTimeout(guardarEnFirebase, ms);
}

async function guardarEnFirebase() {
  if (!firebaseListo) return;
  const docRef = docRefs[hojaActual];
  if (!docRef) return;
  if (guardando) {
    programarGuardar(300);
    return;
  }

  guardando = true;
  setStatus("guardando");

  try {
    const dataURL = canvas.toDataURL("image/png");
    estadoHojas[hojaActual].imagen = dataURL;

    await setDoc(docRef, {
      imagen: dataURL,
      hoja: hojaActual,
      fecha: hoyISO(),
      actualizadoEn: Date.now()
    });
    mostrarGuardado();
    setStatus("conectado");
  } catch (err) {
    console.error("❌ Error guardando dibujo:", err);
    setStatus(null);
  } finally {
    guardando = false;
  }
}

function mostrarGuardado() {
  const ind = document.getElementById("save-indicator");
  if (!ind) return;
  ind.classList.add("visible");
  clearTimeout(ind._timeout);
  ind._timeout = setTimeout(() => ind.classList.remove("visible"), 1200);
}

async function initFirebase() {
  try {
    await signInAnonymously(auth);

    const base = `parejas/${PAREJA_ID}/dibujos`;
    docRefs[1] = doc(db, "parejas", PAREJA_ID, "dibujos", `${hoyISO()}-1`);
    docRefs[2] = doc(db, "parejas", PAREJA_ID, "dibujos", `${hoyISO()}-2`);

    console.log("📡 Escuchando:", base + "/" + hoyISO() + "-1 y -2");

    // Listener hoja 1
    onSnapshot(docRefs[1], snap => {
      const data = snap.data();
      if (!data || !data.imagen) return;
      estadoHojas[1].imagen = data.imagen;
      if (hojaActual === 1 && !esMiTrazo && Date.now() - ultimoTrazo > 800) {
        dibujarImagen(data.imagen);
        console.log("☁️ Hoja 1 sincronizada");
      }
    }, err => console.error("❌ Listener hoja 1:", err));

    // Listener hoja 2
    onSnapshot(docRefs[2], snap => {
      const data = snap.data();
      if (!data || !data.imagen) return;
      estadoHojas[2].imagen = data.imagen;
      if (hojaActual === 2 && !esMiTrazo && Date.now() - ultimoTrazo > 800) {
        dibujarImagen(data.imagen);
        console.log("☁️ Hoja 2 sincronizada");
      }
    }, err => console.error("❌ Listener hoja 2:", err));

    firebaseListo = true;
    setStatus("conectado");
    console.log("✅ Firebase listo");
  } catch (err) {
    console.error("❌ Error inicializando Firebase:", err);
    setStatus(null);
  }
}

initFirebase();
pintarFondo();

/* ============================================================
   GUARDAR AL SALIR
============================================================ */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && firebaseListo) {
    clearTimeout(timeoutGuardar);
    guardarEnFirebase();
  }
});

window.addEventListener("beforeunload", () => {
  if (firebaseListo) {
    clearTimeout(timeoutGuardar);
    guardarEnFirebase();
  }
});