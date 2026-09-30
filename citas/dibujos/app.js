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
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const hoy = new Date();
document.getElementById("fecha-dia").textContent  = `${hoy.getDate()} de ${MESES[hoy.getMonth()]}`;
document.getElementById("fecha-anio").textContent = hoy.getFullYear();

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
let herramienta  = "brush";
let dibujando    = false;
let ultimoPunto  = null;
let ultimoTrazo  = 0;
let timeoutGuardar = null;

const undoStack = [];
const MAX_UNDO = 10;

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
  programarGuardar();
}

/* ============================================================
   DRAWING
============================================================ */
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top)  * (H / rect.height)
  };
}

canvas.addEventListener("pointerdown", e => {
  if (e.pointerType === "touch" && e.isPrimary === false) return;
  canvas.setPointerCapture(e.pointerId);
  dibujando = true;
  ultimoPunto = getPos(e);
  guardarEstadoUndo();

  ctx.beginPath();
  ctx.arc(ultimoPunto.x, ultimoPunto.y, tamanoActual / 2, 0, Math.PI * 2);
  ctx.fillStyle = herramienta === "eraser" ? COLOR_FONDO : colorActual;
  ctx.fill();
  e.preventDefault();
});

canvas.addEventListener("pointermove", e => {
  if (!dibujando) return;
  const p = getPos(e);
  ctx.beginPath();
  ctx.moveTo(ultimoPunto.x, ultimoPunto.y);
  ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = herramienta === "eraser" ? COLOR_FONDO : colorActual;
  ctx.lineWidth = tamanoActual;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ultimoPunto = p;
  ultimoTrazo = Date.now();
  e.preventDefault();
});

function terminarTrazo() {
  if (!dibujando) return;
  dibujando = false;
  ultimoPunto = null;
  ultimoTrazo = Date.now();
  programarGuardar();
}

canvas.addEventListener("pointerup", terminarTrazo);
canvas.addEventListener("pointercancel", terminarTrazo);
canvas.addEventListener("pointerleave", terminarTrazo);

/* ============================================================
   PALETA DE COLORES
============================================================ */
const COLORES = [
  "#3b322b", "#7d6c5c", "#b58a5a", "#d9a86c",
  "#e88a7a", "#e8b07a", "#f4d03f", "#7da654",
  "#5b8fb0", "#8b6cb0", "#e88ea7", "#ffffff"
];

const colorsBar = document.getElementById("colors-bar");
COLORES.forEach(c => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "color-swatch" + (c === colorActual ? " active" : "");
  b.style.background = c;
  b.dataset.color = c;
  b.addEventListener("click", () => {
    colorActual = c;
    herramienta = "brush";
    document.querySelectorAll(".color-swatch")
      .forEach(s => s.classList.toggle("active", s.dataset.color === c));
    document.getElementById("tool-brush").classList.add("active");
    document.getElementById("tool-eraser").classList.remove("active");
  });
  colorsBar.appendChild(b);
});

/* ============================================================
   TAMAÑOS
============================================================ */
document.querySelectorAll(".size-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    tamanoActual = parseInt(btn.dataset.size, 10);
    document.querySelectorAll(".size-btn")
      .forEach(b => b.classList.toggle("active", b === btn));
  });
});

/* ============================================================
   HERRAMIENTAS
============================================================ */
document.getElementById("tool-brush").addEventListener("click", () => {
  herramienta = "brush";
  document.getElementById("tool-brush").classList.add("active");
  document.getElementById("tool-eraser").classList.remove("active");
});

document.getElementById("tool-eraser").addEventListener("click", () => {
  herramienta = "eraser";
  document.getElementById("tool-eraser").classList.add("active");
  document.getElementById("tool-brush").classList.remove("active");
});

document.getElementById("btn-undo").addEventListener("click", deshacer);

document.getElementById("btn-clear").addEventListener("click", () => {
  if (!confirm("¿Borrar todo el dibujo de hoy?")) return;
  guardarEstadoUndo();
  pintarFondo();
  programarGuardar();
});

/* ============================================================
   FIREBASE
============================================================ */
const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

let firebaseListo = false;
let docRef = null;

function programarGuardar() {
  clearTimeout(timeoutGuardar);
  timeoutGuardar = setTimeout(guardarEnFirebase, 2000);
}

async function guardarEnFirebase() {
  if (!firebaseListo || !docRef) return;
  try {
    const dataURL = canvas.toDataURL("image/png");
    await setDoc(docRef, {
      imagen: dataURL,
      fecha: hoyISO(),
      actualizadoEn: Date.now()
    });
    mostrarGuardado();
  } catch (err) {
    console.error("❌ Error guardando dibujo:", err);
  }
}

function mostrarGuardado() {
  const ind = document.getElementById("save-indicator");
  ind.classList.add("visible");
  clearTimeout(ind._timeout);
  ind._timeout = setTimeout(() => ind.classList.remove("visible"), 1400);
}

async function initFirebase() {
  try {
    await signInAnonymously(auth);
    docRef = doc(db, "parejas", PAREJA_ID, "dibujos", hoyISO());
    console.log("📡 Escuchando:", "parejas/" + PAREJA_ID + "/dibujos/" + hoyISO());

    onSnapshot(docRef, snap => {
      // No sobreescribir mientras dibuja o hace menos de 3 seg de un trazo
      if (dibujando) return;
      if (Date.now() - ultimoTrazo < 3000) return;

      const data = snap.data();
      if (!data || !data.imagen) return;

      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(img, 0, 0, W, H);
        console.log("☁️ Dibujo sincronizado");
      };
      img.src = data.imagen;
    }, err => {
      console.error("❌ Error en listener:", err);
    });

    firebaseListo = true;
    console.log("✅ Firebase listo");
  } catch (err) {
    console.error("❌ Error en Firebase:", err);
  }
}

initFirebase();

/* Guardar al salir de la página */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && firebaseListo) {
    clearTimeout(timeoutGuardar);
    guardarEnFirebase();
  }
});