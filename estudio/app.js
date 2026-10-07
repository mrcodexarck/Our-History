/* ============================================================
   IMPORTS FIREBASE (deben ir arriba)
============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { FIREBASE_CONFIG, PAREJA_ID } from "../citas/firebase-config.js";

/* ============================================================
   PROTECCIÓN DE ACCESO
============================================================ */
if (sessionStorage.getItem("acceso-libro") !== "ok") {
  location.replace("../");
}

/* ============================================================
   ESTUDIO DE ARTE — Motor de dibujo
============================================================ */

/* ---- Referencias ---- */
const canvas        = document.getElementById("canvas");
const ctx           = canvas.getContext("2d", { willReadFrequently: true });
const previewCanvas = document.getElementById("preview-canvas");
const previewCtx    = previewCanvas.getContext("2d");
const wrapper       = document.getElementById("canvas-wrapper");

let W = canvas.width;
let H = canvas.height;
const COLOR_FONDO = "#fdfaf3";

/* ---- Estado ---- */
let herramienta   = "pencil";
let colorActual   = "#3b322b";
let tamano        = 8;
let opacidad      = 1;
let dibujando     = false;
let startPoint    = null;
let lastPoint     = null;
let snapshotAntes = null;
let textoPosicion = null;

/* ---- Historial ---- */
const MAX_HISTORY = 25;
const history = [];
let historyIndex = -1;

/* ---- Firebase / Proyecto ---- */
const fireApp  = initializeApp(FIREBASE_CONFIG);
const fireDb   = getFirestore(fireApp);
const fireAuth = getAuth(fireApp);

const params      = new URLSearchParams(location.search);
const PROYECTO_ID = params.get("id");
let proyectoFirestore = null;
let firebaseListo = false;

/* ============================================================
   PALETA
============================================================ */
const PALETA = [
  // Fila 1: neutros
  "#000000", "#3b322b", "#6b5b4a", "#a89a86", "#d9cfbf", "#ffffff",
  // Fila 2: básicos
  "#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa",
  // Fila 3: pasteles
  "#ffcdd2", "#ffe0b2", "#fff9c4", "#c8e6c9", "#bbdefb", "#e1bee7",
  // Fila 4: oscuros
  "#b71c1c", "#e65100", "#f57f17", "#1b5e20", "#0d47a1", "#4a148c",
  // Fila 5: tierra
  "#8d6e63", "#a1887f", "#d7ccc8", "#795548", "#5d4037", "#c9a37a",
];

const paletaEl = document.getElementById("paleta");
function renderPaleta() {
  paletaEl.innerHTML = "";
  PALETA.forEach(hex => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch" + (hex === colorActual ? " active" : "");
    btn.style.background = hex;
    btn.dataset.color = hex;
    btn.addEventListener("click", () => seleccionarColor(hex));
    paletaEl.appendChild(btn);
  });
}

function seleccionarColor(hex) {
  colorActual = hex;
  document.querySelectorAll(".swatch").forEach(sw => {
    sw.classList.toggle("active", sw.dataset.color === hex);
  });
  document.getElementById("color-actual").style.background = hex;
  document.getElementById("color-custom").value = hex;
}

/* ============================================================
   HERRAMIENTAS
============================================================ */
document.querySelectorAll(".tool").forEach(btn => {
  btn.addEventListener("click", () => {
    herramienta = btn.dataset.tool;
    document.querySelectorAll(".tool").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

/* ============================================================
   COLOR CUSTOM
============================================================ */
const colorCustom = document.getElementById("color-custom");
colorCustom.addEventListener("input", e => {
  seleccionarColor(e.target.value);
});

/* ============================================================
   SLIDERS
============================================================ */
const sliderSize = document.getElementById("slider-size");
const sizeVal    = document.getElementById("size-val");
sliderSize.addEventListener("input", () => {
  tamano = parseInt(sliderSize.value, 10);
  sizeVal.textContent = tamano;
});

const sliderOpacity = document.getElementById("slider-opacity");
const opacityVal    = document.getElementById("opacity-val");
sliderOpacity.addEventListener("input", () => {
  opacidad = parseInt(sliderOpacity.value, 10) / 100;
  opacityVal.textContent = sliderOpacity.value + "%";
});

/* ============================================================
   INICIALIZACIÓN
============================================================ */
function pintarFondo() {
  ctx.fillStyle = COLOR_FONDO;
  ctx.fillRect(0, 0, W, H);
}

function guardarHistorial() {
  history.splice(historyIndex + 1);
  const estado = ctx.getImageData(0, 0, W, H);
  history.push(estado);
  if (history.length > MAX_HISTORY) history.shift();
  historyIndex = history.length - 1;
}

function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    ctx.putImageData(history[historyIndex], 0, 0);
    mostrarToast("↶ Deshecho");
  } else if (historyIndex === 0) {
    ctx.putImageData(history[0], 0, 0);
    mostrarToast("↶ Inicio");
  }
  programarAutoguardado();
}

function redo() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    ctx.putImageData(history[historyIndex], 0, 0);
    mostrarToast("↷ Rehecho");
  } else {
    mostrarToast("Ya estás al final");
  }
  programarAutoguardado();
}

/* ============================================================
   POINTER — POSICIÓN
============================================================ */
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.round((e.clientX - rect.left) * (W / rect.width)),
    y: Math.round((e.clientY - rect.top)  * (H / rect.height))
  };
}

/* ============================================================
   ESTILOS DE TRAZO
============================================================ */
function aplicarEstilo(targetCtx, esBorrador = false) {
  targetCtx.strokeStyle = esBorrador ? COLOR_FONDO : colorActual;
  targetCtx.fillStyle   = esBorrador ? COLOR_FONDO : colorActual;
  targetCtx.lineWidth   = tamano;
  targetCtx.lineCap     = "round";
  targetCtx.lineJoin    = "round";
  targetCtx.globalAlpha = esBorrador ? 1 : opacidad;

  switch (herramienta) {
    case "brush":
      targetCtx.lineWidth = tamano * 1.4;
      targetCtx.globalAlpha = opacidad * 0.9;
      break;
    case "marker":
      targetCtx.lineWidth = tamano * 1.6;
      targetCtx.globalAlpha = opacidad * 0.5;
      break;
    case "eraser":
      targetCtx.lineWidth = tamano * 2;
      break;
    case "pencil":
    default:
      break;
  }
}

/* ============================================================
   DIBUJO LIBRE
============================================================ */
const HERRAMIENTAS_LIBRES = ["pencil", "brush", "marker", "eraser", "spray"];
const HERRAMIENTAS_FORMAS = ["line", "rect", "circle"];

function iniciarTrazo(e) {
  const p = getPos(e);
  dibujando    = true;
  startPoint   = p;
  lastPoint    = p;

  snapshotAntes = ctx.getImageData(0, 0, W, H);

  if (HERRAMIENTAS_LIBRES.includes(herramienta)) {
    if (herramienta === "spray") {
      sprayAt(ctx, p.x, p.y, tamano);
    } else {
      const esBorrador = herramienta === "eraser";
      aplicarEstilo(ctx, esBorrador);
      ctx.beginPath();
      ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  } else if (herramienta === "text") {
    textoPosicion = p;
    abrirModalTexto();
    dibujando = false;
  } else if (herramienta === "fill") {
    floodFill(p.x, p.y, colorActual);
    dibujando = false;
  }
}

function moverTrazo(e) {
  if (!dibujando) return;
  const p = getPos(e);

  if (HERRAMIENTAS_LIBRES.includes(herramienta)) {
    const esBorrador = herramienta === "eraser";
    aplicarEstilo(ctx, esBorrador);

    if (herramienta === "spray") {
      sprayAt(ctx, p.x, p.y, tamano);
    } else {
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    lastPoint = p;
  } else if (HERRAMIENTAS_FORMAS.includes(herramienta)) {
    dibujarPreviewForma(startPoint, p);
  }
}

function finalizarTrazo(e) {
  if (!dibujando) return;
  dibujando = false;

  if (HERRAMIENTAS_FORMAS.includes(herramienta) && startPoint) {
    const p = e ? getPos(e) : startPoint;
    dibujarFormaFinal(startPoint, p);
    limpiarPreview();
  }

  if (snapshotAntes) {
    guardarHistorial();
    snapshotAntes = null;
  }
  startPoint = null;
  lastPoint  = null;

  // 🆕 Autoguardado después de cada trazo
  programarAutoguardado();
}

/* ============================================================
   SPRAY
============================================================ */
function sprayAt(targetCtx, x, y, radio) {
  const density = Math.max(8, radio);
  const radius  = radio * 1.5;
  targetCtx.save();
  targetCtx.fillStyle = colorActual;
  targetCtx.globalAlpha = opacidad * 0.6;
  for (let i = 0; i < density; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r   = Math.random() * radius;
    const px  = x + Math.cos(ang) * r;
    const py  = y + Math.sin(ang) * r;
    targetCtx.beginPath();
    targetCtx.arc(px, py, 1, 0, Math.PI * 2);
    targetCtx.fill();
  }
  targetCtx.restore();
}

/* ============================================================
   FORMAS
============================================================ */
function dibujarPreviewForma(a, b) {
  previewCtx.clearRect(0, 0, W, H);
  previewCtx.save();
  aplicarEstilo(previewCtx);
  previewCtx.beginPath();

  if (herramienta === "line") {
    previewCtx.moveTo(a.x, a.y);
    previewCtx.lineTo(b.x, b.y);
    previewCtx.stroke();
  } else if (herramienta === "rect") {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    previewCtx.strokeRect(x, y, w, h);
  } else if (herramienta === "circle") {
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const rx = Math.abs(b.x - a.x) / 2;
    const ry = Math.abs(b.y - a.y) / 2;
    previewCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    previewCtx.stroke();
  }
  previewCtx.restore();
}

function dibujarFormaFinal(a, b) {
  ctx.save();
  aplicarEstilo(ctx);
  ctx.beginPath();

  if (herramienta === "line") {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  } else if (herramienta === "rect") {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    ctx.strokeRect(x, y, w, h);
  } else if (herramienta === "circle") {
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const rx = Math.abs(b.x - a.x) / 2;
    const ry = Math.abs(b.y - a.y) / 2;
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function limpiarPreview() {
  previewCtx.clearRect(0, 0, W, H);
}

/* ============================================================
   FLOOD FILL
============================================================ */
function floodFill(startX, startY, fillColorHex) {
  const w = canvas.width;
  const h = canvas.height;

  startX = Math.floor(startX);
  startY = Math.floor(startY);

  if (startX < 0 || startX >= w || startY < 0 || startY >= h) {
    console.log("❌ FloodFill: fuera del canvas");
    return;
  }

  console.log(`🎨 FloodFill en (${startX}, ${startY}) → ${fillColorHex}`);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const startIdx = startY * w + startX;
  const i4 = startIdx * 4;

  const tR = data[i4];
  const tG = data[i4 + 1];
  const tB = data[i4 + 2];
  const tA = data[i4 + 3];

  console.log(`🎯 Pixel objetivo: R=${tR} G=${tG} B=${tB} A=${tA}`);

  const fillRGB = hexToRgb(fillColorHex);
  const fR = fillRGB.r;
  const fG = fillRGB.g;
  const fB = fillRGB.b;
  const fA = 255;

  if (Math.abs(tR - fR) < 5 && Math.abs(tG - fG) < 5 && Math.abs(tB - fB) < 5) {
    console.log("⚠️ Mismo color, no se rellena");
    mostrarToast("⚠️ Ya está de ese color");
    return;
  }

  mostrarToast("🎨 Rellenando...");

  const tolerance = 40;
  const visited = new Uint8Array(w * h);
  const queueX  = new Int32Array(w * h);
  const queueY  = new Int32Array(w * h);
  let head = 0, tail = 0;

  visited[startIdx] = 1;
  queueX[tail] = startX;
  queueY[tail] = startY;
  tail++;

  let filled = 0;
  const maxFilled = w * h;

  while (head < tail) {
    const x = queueX[head];
    const y = queueY[head];
    head++;

    const idx = y * w + x;
    const ii = idx * 4;

    const r = data[ii];
    const g = data[ii + 1];
    const b = data[ii + 2];
    const a = data[ii + 3];

    if (Math.abs(r - tR) > tolerance ||
        Math.abs(g - tG) > tolerance ||
        Math.abs(b - tB) > tolerance ||
        Math.abs(a - tA) > tolerance) continue;

    data[ii]     = fR;
    data[ii + 1] = fG;
    data[ii + 2] = fB;
    data[ii + 3] = fA;
    filled++;

    if (filled > maxFilled) break;

    if (x > 0) {
      const ni = idx - 1;
      if (!visited[ni]) { visited[ni] = 1; queueX[tail] = x - 1; queueY[tail] = y; tail++; }
    }
    if (x < w - 1) {
      const ni = idx + 1;
      if (!visited[ni]) { visited[ni] = 1; queueX[tail] = x + 1; queueY[tail] = y; tail++; }
    }
    if (y > 0) {
      const ni = idx - w;
      if (!visited[ni]) { visited[ni] = 1; queueX[tail] = x; queueY[tail] = y - 1; tail++; }
    }
    if (y < h - 1) {
      const ni = idx + w;
      if (!visited[ni]) { visited[ni] = 1; queueX[tail] = x; queueY[tail] = y + 1; tail++; }
    }
  }

  console.log(`✅ Rellenados ${filled.toLocaleString()} píxeles`);

  ctx.putImageData(imgData, 0, 0);
  guardarHistorial();
  mostrarToast(`🎨 ${filled.toLocaleString()} px rellenados`);

  programarAutoguardado();
}

function pixelMatch(data, i, target, tol) {
  return Math.abs(data[i]   - target[0]) <= tol &&
         Math.abs(data[i+1] - target[1]) <= tol &&
         Math.abs(data[i+2] - target[2]) <= tol &&
         Math.abs(data[i+3] - target[3]) <= tol;
}

function colorsEqual(a, b) {
  return Math.abs(a[0]-b[0]) < 5 &&
         Math.abs(a[1]-b[1]) < 5 &&
         Math.abs(a[2]-b[2]) < 5;
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16)
  };
}

/* ============================================================
   EVENTOS DEL CANVAS
============================================================ */
canvas.addEventListener("pointerdown", e => {
  canvas.setPointerCapture(e.pointerId);
  iniciarTrazo(e);
  e.preventDefault();
});

canvas.addEventListener("pointermove", e => {
  if (!dibujando) return;
  moverTrazo(e);
  e.preventDefault();
});

canvas.addEventListener("pointerup", e => {
  finalizarTrazo(e);
  e.preventDefault();
});

canvas.addEventListener("pointercancel", e => {
  finalizarTrazo(e);
  e.preventDefault();
});

canvas.addEventListener("pointerleave", e => {
  if (dibujando) finalizarTrazo(e);
});

/* ============================================================
   BOTONES DEL HEADER
============================================================ */
document.getElementById("btn-undo").addEventListener("click", undo);
document.getElementById("btn-redo").addEventListener("click", redo);

/* ---- GUARDAR (descarga PNG + guarda en Firestore) ---- */
document.getElementById("btn-save").addEventListener("click", async () => {
  const wrapperRect = canvas.getBoundingClientRect();
  const ratio = canvas.width / wrapperRect.width;

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext("2d");

  tempCtx.fillStyle = COLOR_FONDO;
  tempCtx.fillRect(0, 0, canvas.width, canvas.height);
  tempCtx.drawImage(canvas, 0, 0);

  const textLayer = document.getElementById("text-layer");
  if (textLayer) {
    textLayer.querySelectorAll(".texto-flotante").forEach(el => {
      const elRect = el.getBoundingClientRect();
      const x = (elRect.left - wrapperRect.left) * ratio;
      const y = (elRect.top  - wrapperRect.top)  * ratio;
      const size = parseFloat(el.style.fontSize) * ratio;
      const font = el.style.fontFamily;
      const color = el.style.color;
      const texto = el.textContent.replace(/✕/g, "").trim();

      tempCtx.save();
      tempCtx.font = `bold ${size}px ${font}`;
      tempCtx.fillStyle = color;
      tempCtx.textBaseline = "top";
      tempCtx.fillText(texto, x, y);
      tempCtx.restore();
    });
  }

  const fullPNG   = tempCanvas.toDataURL("image/png");
  const thumbJPEG = generateThumbnail(tempCanvas, 400);

  const link = document.createElement("a");
  link.download = `mi-arte-${Date.now()}.png`;
  link.href = fullPNG;
  link.click();

  if (firebaseListo && PROYECTO_ID) {
    try {
      await setDoc(
        doc(fireDb, "parejas", PAREJA_ID, "proyectos", PROYECTO_ID),
        {
          thumbnail: thumbJPEG,
          canvasData: fullPNG,
          actualizadoEn: Date.now()
        },
        { merge: true }
      );
      mostrarToast("💾 Guardado en la nube ✅");
      console.log("☁️ Proyecto guardado en Firestore");
    } catch (err) {
      console.error("❌ Error guardando:", err);
      mostrarToast("⚠️ Local OK · error en nube");
    }
  } else {
    mostrarToast("💾 Imagen guardada");
  }
});

/* ---- Generar thumbnail (canvas reutilizable = más rápido) ---- */
function generateThumbnail(sourceCanvas, maxSize) {
  if (!generateThumbnail._canvas) {
    generateThumbnail._canvas = document.createElement("canvas");
  }
  const temp = generateThumbnail._canvas;

  const ratio = sourceCanvas.width / sourceCanvas.height;
  let w, h;
  if (ratio > 1) { w = maxSize; h = Math.round(maxSize / ratio); }
  else           { h = maxSize; w = Math.round(maxSize * ratio); }

  temp.width  = w;
  temp.height = h;
  const tCtx = temp.getContext("2d");
  tCtx.clearRect(0, 0, w, h);
  tCtx.drawImage(sourceCanvas, 0, 0, w, h);
  return temp.toDataURL("image/jpeg", 0.7);
}

/* ---- LIMPIAR ---- */
document.getElementById("btn-clear").addEventListener("click", () => {
  if (!confirm("¿Borrar todo el dibujo?")) return;
  pintarFondo();

  const textLayer = document.getElementById("text-layer");
  if (textLayer) textLayer.innerHTML = "";

  guardarHistorial();
  mostrarToast("🗑️ Lienzo limpio");
  programarAutoguardado();
});

/* ============================================================
   TOAST
============================================================ */
function mostrarToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("visible");
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove("visible"), 1500);
}

/* ============================================================
   ATAJOS DE TECLADO (PC)
============================================================ */
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.key === "z" && e.shiftKey) {
      e.preventDefault();
      redo();
    } else if (e.key === "s") {
      e.preventDefault();
      document.getElementById("btn-save").click();
    }
    return;
  }
  const map = {
    "p": "pencil", "b": "brush", "m": "marker",
    "e": "eraser", "l": "line", "r": "rect",
    "c": "circle", "f": "fill", "t": "text"
  };
  if (map[e.key.toLowerCase()]) {
    const tool = map[e.key.toLowerCase()];
    document.querySelector(`[data-tool="${tool}"]`)?.click();
  }
});

/* ============================================================
   CURSOR DE BORRADOR
============================================================ */
const eraserCursor = document.getElementById("eraser-cursor");

function actualizarTamanoCursorBorrador() {
  const rect = canvas.getBoundingClientRect();
  const factor = rect.width / W;
  const diametro = tamano * 2 * factor;

  eraserCursor.style.width  = diametro + "px";
  eraserCursor.style.height = diametro + "px";
}

function mostrarCursorBorrador() {
  if (herramienta !== "eraser") return;
  actualizarTamanoCursorBorrador();
  eraserCursor.classList.add("visible");
}

function ocultarCursorBorrador() {
  eraserCursor.classList.remove("visible");
}

function moverCursorBorrador(e) {
  if (herramienta !== "eraser") {
    ocultarCursorBorrador();
    return;
  }
  eraserCursor.style.left = e.clientX + "px";
  eraserCursor.style.top  = e.clientY + "px";
  mostrarCursorBorrador();
}

canvas.addEventListener("pointermove", moverCursorBorrador);
canvas.addEventListener("pointerdown", moverCursorBorrador);

canvas.addEventListener("pointerleave", ocultarCursorBorrador);
canvas.addEventListener("pointercancel", ocultarCursorBorrador);
canvas.addEventListener("pointerup", e => {
  if (e.pointerType === "touch") {
    ocultarCursorBorrador();
  }
});

document.getElementById("slider-size").addEventListener("input", () => {
  if (herramienta === "eraser" && eraserCursor.classList.contains("visible")) {
    actualizarTamanoCursorBorrador();
  }
});

document.querySelectorAll(".tool").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.tool === "eraser") {
      // Se mostrará al mover el cursor
    } else {
      ocultarCursorBorrador();
    }
  });
});

window.addEventListener("resize", () => {
  if (eraserCursor.classList.contains("visible")) {
    actualizarTamanoCursorBorrador();
  }
});

/* ============================================================
   AJUSTAR RESOLUCIÓN DEL CANVAS AL TAMAÑO REAL DE PANTALLA
============================================================ */
/* ============================================================
   AJUSTAR CANVAS AL TAMAÑO DISPONIBLE (respetando aspect-ratio)
============================================================ */
function ajustarTamanoCanvas() {
  const container = wrapper.parentElement;   // .estudio-main
  if (!container) return;

  const contRect = container.getBoundingClientRect();
  if (contRect.width === 0 || contRect.height === 0) return;

  // Espacio disponible (restamos el padding del contenedor)
  const availW = contRect.width  - 12;
  const availH = contRect.height - 12;
  if (availW <= 0 || availH <= 0) return;

  // Ratio del proyecto (o 1:1 por defecto)
  let ratio = 1;
  if (proyectoFirestore && proyectoFirestore.ancho && proyectoFirestore.alto) {
    ratio = proyectoFirestore.ancho / proyectoFirestore.alto;
  }

  // Calcular el tamaño máximo que respeta el ratio
  let w = availW;
  let h = w / ratio;

  if (h > availH) {
    h = availH;
    w = h * ratio;
  }

  // Redondear para evitar decimales raros
  w = Math.round(w);
  h = Math.round(h);

  // Aplicar tamaño al wrapper (esto hace que el canvas se centre)
  wrapper.style.width  = w + "px";
  wrapper.style.height = h + "px";

  // Ajustar la resolución interna del canvas al tamaño del wrapper
  const dpr = window.devicePixelRatio || 1;
  const nuevoW = Math.round(w * dpr);
  const nuevoH = Math.round(h * dpr);

  if (canvas.width === nuevoW && canvas.height === nuevoH) return;

  // Guardar dibujo actual
  let imgActual = null;
  if (canvas.width > 0 && canvas.height > 0) {
    try {
      imgActual = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (e) { imgActual = null; }
  }

  // Redimensionar canvas (resolución interna)
  canvas.width  = nuevoW;
  canvas.height = nuevoH;
  previewCanvas.width  = nuevoW;
  previewCanvas.height = nuevoH;

  W = nuevoW;
  H = nuevoH;

  // Rellenar fondo BLANCO (no negro)
  ctx.fillStyle = COLOR_FONDO;
  ctx.fillRect(0, 0, W, H);

  // Restaurar dibujo anterior
  if (imgActual) {
    const tmp = document.createElement("canvas");
    tmp.width  = imgActual.width;
    tmp.height = imgActual.height;
    tmp.getContext("2d").putImageData(imgActual, 0, 0);
    ctx.drawImage(tmp, 0, 0, W, H);
  }

  // Reiniciar historial
  history.length = 0;
  historyIndex = -1;
  guardarHistorial();

  console.log(`📐 Canvas: ${w}×${h} (ratio ${ratio.toFixed(2)}, DPR ${dpr})`);
}

window.addEventListener("resize", ajustarTamanoCanvas);
window.addEventListener("orientationchange", () => setTimeout(ajustarTamanoCanvas, 250));

setTimeout(ajustarTamanoCanvas, 100);
window.addEventListener("load", ajustarTamanoCanvas);

/* ============================================================
   ARRANQUE
============================================================ */
pintarFondo();
guardarHistorial();
renderPaleta();
document.getElementById("color-actual").style.background = colorActual;
document.getElementById("color-custom").value = colorActual;

/* ============================================================
   MODAL DE TEXTO
============================================================ */
const textoModal      = document.getElementById("texto-modal");
const textoInput      = document.getElementById("texto-input");
const textoSizeSlider = document.getElementById("texto-size");
const textoSizeVal    = document.getElementById("texto-size-val");
const textoFontSelect = document.getElementById("texto-font");
const textoPreview    = document.getElementById("texto-preview-text");
const textoBtnCerrar  = document.getElementById("texto-modal-cerrar");
const textoBtnCancel  = document.getElementById("texto-cancelar");
const textoBtnAplicar = document.getElementById("texto-aplicar");

function abrirModalTexto() {
  if (!textoModal) return;

  textoInput.value = "";
  textoSizeSlider.value = Math.max(20, tamano * 5);
  textoSizeVal.textContent = textoSizeSlider.value;
  textoFontSelect.value = "Caveat";

  actualizarPreviewTexto();

  textoModal.hidden = false;
  setTimeout(() => textoInput.focus(), 100);
}

function cerrarModalTexto() {
  if (!textoModal) return;
  textoModal.hidden = true;
  textoPosicion = null;
}

function actualizarPreviewTexto() {
  if (!textoPreview) return;
  const size    = parseInt(textoSizeSlider.value, 10);
  const font    = textoFontSelect.value;
  const texto   = textoInput.value.trim() || "Hola";

  textoPreview.textContent = texto;
  textoPreview.style.fontFamily = `"${font}", cursive`;
  textoPreview.style.fontSize   = Math.min(size, 48) + "px";
  textoPreview.style.color      = colorActual;
}

function aplicarTexto() {
  const texto = textoInput.value.trim();
  if (!texto || !textoPosicion) {
    cerrarModalTexto();
    return;
  }

  const size = parseInt(textoSizeSlider.value, 10);
  const font = textoFontSelect.value;

  crearTextoFlotante(texto, textoPosicion.x, textoPosicion.y, size, font);

  cerrarModalTexto();
  mostrarToast("✍️ Texto agregado · arrástralo para moverlo");

  // 🆕 Autoguardar cuando se agrega texto
  programarAutoguardado();
}

function crearTextoFlotante(texto, x, y, size, font) {
  const textLayer = document.getElementById("text-layer");
  if (!textLayer) return;

  const div = document.createElement("div");
  div.className = "texto-flotante editable";
  div.textContent = texto;
  div.style.left = x + "px";
  div.style.top  = y + "px";
  div.style.fontSize = size + "px";
  div.style.fontFamily = `"${font}", cursive`;
  div.style.color = colorActual;

  const btnX = document.createElement("button");
  btnX.className = "texto-eliminar";
  btnX.textContent = "✕";
  btnX.addEventListener("pointerdown", e => {
    e.stopPropagation();
    div.remove();
    mostrarToast("🗑️ Texto eliminado");
    programarAutoguardado();
  });
  div.appendChild(btnX);

  const handle = document.createElement("div");
  handle.className = "texto-resize";
  div.appendChild(handle);

  div.addEventListener("dblclick", e => {
    e.stopPropagation();
    editarTextoFlotante(div);
  });

  hacerArrastrable(div, handle);
  hacerRedimensionable(div, handle);

  textLayer.appendChild(div);

  setTimeout(() => {
    if (div.classList.contains("editable")) {
      div.classList.remove("editable");
    }
  }, 4000);
}

function hacerArrastrable(div, handleResize) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  div.addEventListener("pointerdown", e => {
    if (e.target.classList.contains("texto-resize") ||
        e.target.classList.contains("texto-eliminar")) return;

    dragging = true;
    div.classList.add("dragging", "editable");
    div.setPointerCapture(e.pointerId);

    const rect = div.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    e.stopPropagation();
    e.preventDefault();
  });

  div.addEventListener("pointermove", e => {
    if (!dragging) return;

    const wRect = wrapper.getBoundingClientRect();

    let newX = e.clientX - wRect.left - offsetX;
    let newY = e.clientY - wRect.top  - offsetY;

    newX = Math.max(0, Math.min(newX, wRect.width  - div.offsetWidth));
    newY = Math.max(0, Math.min(newY, wRect.height - div.offsetHeight));

    div.style.left = newX + "px";
    div.style.top  = newY + "px";
  });

  div.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    div.classList.remove("dragging");
    programarAutoguardado();
  });

  div.addEventListener("pointercancel", () => {
    dragging = false;
    div.classList.remove("dragging");
  });
}

function editarTextoFlotante(div) {
  const textoActual = div.textContent.replace(/✕/g, "").trim();
  const sizeActual  = parseFloat(div.style.fontSize) || 60;
  const fontActual  = div.style.fontFamily.replace(/["']/g, "").split(",")[0] || "Caveat";

  textoInput.value = textoActual;
  textoSizeSlider.value = sizeActual;
  textoSizeVal.textContent = sizeActual;
  textoFontSelect.value = fontActual;
  actualizarPreviewTexto();

  textoModal.hidden = false;
  setTimeout(() => textoInput.focus(), 100);

  const btnAplicar = document.getElementById("texto-aplicar");
  const handler = () => {
    const nuevoTexto = textoInput.value.trim();
    if (nuevoTexto) {
      div.textContent = nuevoTexto;
      const btnX = document.createElement("button");
      btnX.className = "texto-eliminar";
      btnX.textContent = "✕";
      btnX.addEventListener("pointerdown", e => {
        e.stopPropagation();
        div.remove();
        mostrarToast("🗑️ Texto eliminado");
        programarAutoguardado();
      });
      div.appendChild(btnX);

      const handle = document.createElement("div");
      handle.className = "texto-resize";
      div.appendChild(handle);
      hacerRedimensionable(div, handle);

      div.style.fontSize = textoSizeSlider.value + "px";
      div.style.fontFamily = `"${textoFontSelect.value}", cursive`;

      programarAutoguardado();
    }
    cerrarModalTexto();
    btnAplicar.removeEventListener("click", handler);
  };

  btnAplicar.addEventListener("click", handler);
}

function hacerRedimensionable(div, handle) {
  let resizing = false;
  let startX = 0;
  let startY = 0;
  let startSize = 0;

  handle.addEventListener("pointerdown", e => {
    resizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startSize = parseFloat(div.style.fontSize) || 60;
    handle.setPointerCapture(e.pointerId);
    e.stopPropagation();
    e.preventDefault();
  });

  handle.addEventListener("pointermove", e => {
    if (!resizing) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const delta = (dx + dy) / 2;
    const nuevoSize = Math.max(12, Math.min(200, startSize + delta * 0.5));
    div.style.fontSize = nuevoSize + "px";
  });

  handle.addEventListener("pointerup", () => {
    resizing = false;
    programarAutoguardado();
  });
  handle.addEventListener("pointercancel", () => {
    resizing = false;
  });
}

document.addEventListener("pointerdown", e => {
  const textLayer = document.getElementById("text-layer");
  if (!textLayer) return;

  if (e.target.closest(".texto-flotante")) return;

  textLayer.querySelectorAll(".texto-flotante.editable").forEach(el => {
    el.classList.remove("editable");
  });
});

textoBtnCerrar?.addEventListener("click", cerrarModalTexto);
textoBtnCancel?.addEventListener("click", cerrarModalTexto);
textoBtnAplicar?.addEventListener("click", aplicarTexto);
textoModal?.addEventListener("click", e => {
  if (e.target === textoModal) cerrarModalTexto();
});

textoInput?.addEventListener("input", actualizarPreviewTexto);
textoSizeSlider?.addEventListener("input", () => {
  textoSizeVal.textContent = textoSizeSlider.value;
  actualizarPreviewTexto();
});
textoFontSelect?.addEventListener("change", actualizarPreviewTexto);

textoInput?.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    aplicarTexto();
  }
  if (e.key === "Escape") {
    cerrarModalTexto();
  }
});

/* ============================================================
   CARGAR PROYECTO DESDE FIRESTORE
============================================================ */
async function initFirebaseProyecto() {
  try {
    await signInAnonymously(fireAuth);
    firebaseListo = true;
    console.log("🔐 Firebase listo");

    if (!PROYECTO_ID) {
      console.warn("⚠️ No hay ?id= en la URL. Modo sin proyecto.");
      ajustarTamanoCanvas();
      return;
    }

    const ref  = doc(fireDb, "parejas", PAREJA_ID, "proyectos", PROYECTO_ID);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      alert("Este proyecto no existe o fue eliminado.");
      location.href = "./";
      return;
    }

    proyectoFirestore = snap.data();
    console.log("📂 Proyecto cargado:", proyectoFirestore.nombre);
    console.log("📐 Ratio del proyecto:", proyectoFirestore.ancho, "×", proyectoFirestore.alto);

    // Título del header
    const h1 = document.querySelector(".header-titulo");
    if (h1) h1.textContent = "🎨 " + (proyectoFirestore.nombre || "Sin título");

    // Ajustar el canvas con el ratio del proyecto
    // Pequeño delay para que el DOM esté listo
    setTimeout(() => {
      ajustarTamanoCanvas();

      // Cargar el dibujo guardado
      if (proyectoFirestore.canvasData) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, W, H);
          history.length = 0;
          historyIndex = -1;
          guardarHistorial();
          console.log("🖼️ Dibujo restaurado desde Firestore");
        };
        img.onerror = () => {
          console.warn("⚠️ No se pudo restaurar el dibujo");
        };
        img.src = proyectoFirestore.canvasData;
      }
    }, 300);

  } catch (err) {
    console.error("❌ Error cargando proyecto:", err);
    mostrarToast("⚠️ Error al cargar proyecto");
    ajustarTamanoCanvas();
  }
}

initFirebaseProyecto();

/* ============================================================
   AUTOGUARDADO EN FIRESTORE — Optimizado (rápido)
============================================================ */
let timeoutAutoguardado = null;
let guardandoAhora = false;
let cambiosPendientes = false;
let ultimoGuardadoTs = 0;

const DELAY_AUTOGUARDADO     = 800;   // ms después del último cambio
const DELAY_ENTRE_GUARDADOS  = 500;   // mínimo entre guardados

/* Programa un guardado 800ms después del último cambio */
function programarAutoguardado() {
  cambiosPendientes = true;
  clearTimeout(timeoutAutoguardado);
  timeoutAutoguardado = setTimeout(autoguardar, DELAY_AUTOGUARDADO);
}

/* Fuerza guardado inmediato (por ej. al salir) */
function forzarAutoguardado() {
  cambiosPendientes = true;
  clearTimeout(timeoutAutoguardado);
  autoguardar();
}

/* Guarda el estado actual del canvas en Firestore */
async function autoguardar() {
  if (!firebaseListo || !PROYECTO_ID) return;
  if (guardandoAhora) {
    programarAutoguardado();
    return;
  }
  if (!cambiosPendientes) return;

  const ahora = Date.now();
  if (ahora - ultimoGuardadoTs < DELAY_ENTRE_GUARDADOS) {
    programarAutoguardado();
    return;
  }

  guardandoAhora = true;
  cambiosPendientes = false;

  try {
    // JPEG es 5-10x más rápido que PNG
    const canvasData = canvas.toDataURL("image/jpeg", 0.9);
    const thumbnail  = generateThumbnail(canvas, 320);

    await setDoc(
      doc(fireDb, "parejas", PAREJA_ID, "proyectos", PROYECTO_ID),
      {
        canvasData,
        thumbnail,
        actualizadoEn: Date.now()
      },
      { merge: true }
    );

    ultimoGuardadoTs = Date.now();
    mostrarIndicadorGuardado();
    console.log("☁️ Autoguardado");
  } catch (err) {
    console.error("❌ Error autoguardando:", err);
  } finally {
    guardandoAhora = false;
    if (cambiosPendientes) programarAutoguardado();
  }
}

/* Indicador visual sutil (icono ☁️) */
function mostrarIndicadorGuardado() {
  let ind = document.getElementById("indicador-guardado");
  if (!ind) {
    ind = document.createElement("div");
    ind.id = "indicador-guardado";
    ind.style.cssText = `
      position: fixed;
      top: 64px;
      right: 12px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(45,100,55,.85);
      color: #fff;
      display: grid;
      place-items: center;
      font-size: 1rem;
      z-index: 999;
      opacity: 0;
      transform: scale(.8);
      transition: opacity .2s, transform .2s;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,.4);
    `;
    ind.textContent = "☁️";
    document.body.appendChild(ind);
  }
  ind.style.opacity = "1";
  ind.style.transform = "scale(1)";
  clearTimeout(ind._timeout);
  ind._timeout = setTimeout(() => {
    ind.style.opacity = "0";
    ind.style.transform = "scale(.8)";
  }, 700);
}

/* ============================================================
   GUARDAR AL SALIR DE LA PÁGINA
============================================================ */
window.addEventListener("beforeunload", () => {
  if (firebaseListo && PROYECTO_ID && cambiosPendientes) {
    const canvasData = canvas.toDataURL("image/jpeg", 0.9);
    const thumbnail  = generateThumbnail(canvas, 320);
    setDoc(
      doc(fireDb, "parejas", PAREJA_ID, "proyectos", PROYECTO_ID),
      { canvasData, thumbnail, actualizadoEn: Date.now() },
      { merge: true }
    ).catch(e => console.warn("No se pudo guardar al salir:", e));
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && firebaseListo && PROYECTO_ID && cambiosPendientes) {
    forzarAutoguardado();
  }
});