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
pintarFondo();

/* ============================================================
   ESTADO
============================================================ */
let colorActual  = "#3b322b";
let tamanoActual = 8;
let herramienta  = "lapiz";           // lapiz | marcador | pincel | borrador
let dibujando    = false;
let ultimoPunto  = null;
let ultimoTrazo  = 0;
let esMiTrazo    = false;

let firebaseListo = false;
let docRef        = null;
let guardando     = false;
let timeoutGuardar = null;

/* ============================================================
   UNDO (deshacer)
============================================================ */
const undoStack = [];
const MAX_UNDO = 15;

function guardarEstadoUndo() {
  try {
    undoStack.push(ctx.getImageData(0, 0, W, H));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  } catch (e) {
    console.warn("No se pudo guardar undo:", e);
  }
}

function deshacer() {
  if (undoStack.length === 0) return;
  const estado = undoStack.pop();
  ctx.putImageData(estado, 0, 0);
  programarGuardar(150);
}

/* ============================================================
   HELPERS DE TRAZO
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

/* ============================================================
   DIBUJO — POINTER EVENTS
============================================================ */
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

  // Guardado en tiempo real: cada 500ms mientras dibuja
  programarGuardar(500);
  e.preventDefault();
});

function terminarTrazo(e) {
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
   HERRAMIENTAS (lápiz, marcador, pincel, borrador)
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
   BOTONES LIMPIAR Y DESHACER
============================================================ */
const btnUndo  = document.getElementById("btn-undo");
const btnClear = document.getElementById("btn-clear");

if (btnUndo)  btnUndo.addEventListener("click", deshacer);
if (btnClear) btnClear.addEventListener("click", () => {
  if (!confirm("¿Borrar todo el dibujo de hoy?")) return;
  guardarEstadoUndo();
  pintarFondo();
  programarGuardar(100);
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
  if (!firebaseListo || !docRef) return;
  if (guardando) {
    programarGuardar(300);
    return;
  }

  guardando = true;
  setStatus("guardando");

  try {
    const dataURL = canvas.toDataURL("image/png");
    await setDoc(docRef, {
      imagen: dataURL,
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

    docRef = doc(db, "parejas", PAREJA_ID, "dibujos", hoyISO());
    console.log("📡 Escuchando:", `parejas/${PAREJA_ID}/dibujos/${hoyISO()}`);

    onSnapshot(docRef, snap => {
      const data = snap.data();
      if (!data || !data.imagen) return;

      // No pisar nuestro propio trazo en curso
      if (esMiTrazo) return;
      if (Date.now() - ultimoTrazo < 800) return;

      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(img, 0, 0, W, H);
        console.log("☁️ Dibujo sincronizado");
      };
      img.onerror = () => console.warn("⚠️ No se pudo cargar la imagen del dibujo");
      img.src = data.imagen;
    }, err => {
      console.error("❌ Error en listener:", err);
      setStatus(null);
    });

    firebaseListo = true;
    setStatus("conectado");
    console.log("✅ Firebase listo");
  } catch (err) {
    console.error("❌ Error inicializando Firebase:", err);
    setStatus(null);
  }
}

initFirebase();

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
    // No await — solo disparamos el guardado
    guardarEnFirebase();
  }
});

