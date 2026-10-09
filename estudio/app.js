/* ============================================================
   IMPORTS FIREBASE
============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
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
   REFERENCIAS DEL DOM  (todas arriba para evitar TDZ)
============================================================ */
const canvas        = document.getElementById("canvas");
const ctx           = canvas.getContext("2d", { willReadFrequently: true });
const previewCanvas = document.getElementById("preview-canvas");
const previewCtx    = previewCanvas.getContext("2d");
const wrapper       = document.getElementById("canvas-wrapper");
const estudioMain   = document.getElementById("estudio-main");
const btnResetZoom  = document.getElementById("btn-reset-zoom");
const btnFullscreen = document.getElementById("btn-fullscreen");
const eraserCursor  = document.getElementById("eraser-cursor");

let W = canvas.width;
let H = canvas.height;
const COLOR_FONDO = "#fdfaf3";

/* ============================================================
   ESTADO GENERAL
============================================================ */
let herramienta   = "pencil";
let colorActual   = "#3b322b";
let tamano        = 8;
let opacidad      = 1;
let dibujando     = false;
let startPoint    = null;
let lastPoint     = null;
let snapshotAntes = null;
let textoPosicion = null;

/* ============================================================
   HISTORIAL
============================================================ */
const MAX_HISTORY = 25;
const history = [];
let historyIndex = -1;

/* ============================================================
   FIREBASE / PROYECTO
============================================================ */
const fireApp  = initializeApp(FIREBASE_CONFIG);
const fireDb   = getFirestore(fireApp);
const fireAuth = getAuth(fireApp);

const params      = new URLSearchParams(location.search);
const PROYECTO_ID = params.get("id");
let proyectoFirestore = null;
let firebaseListo = false;

/* ============================================================
   SISTEMA DE CAPAS
============================================================ */
let capas = [];
let capaActivaId = null;

function crearCapa(nombre, insertIndex = null) {
  const cv = document.createElement("canvas");
  cv.width  = W;
  cv.height = H;

  const capa = {
    id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    nombre: nombre || ("Capa " + (capas.length + 1)),
    visible: true,
    bloqueada: false,
    opacidad: 1,
    canvas: cv
  };

  if (insertIndex === null || insertIndex >= capas.length) {
    capas.push(capa);
  } else {
    capas.splice(insertIndex, 0, capa);
  }
  return capa;
}

function capaActiva() {
  return capas.find(c => c.id === capaActivaId) || capas[capas.length - 1];
}

function ctxCapa(capa = capaActiva()) {
  return capa.canvas.getContext("2d", { willReadFrequently: true });
}

function setCapaActiva(id) {
  capaActivaId = id;
  actualizarPanelCapas();
}

function recomponer() {
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLOR_FONDO;
  ctx.fillRect(0, 0, W, H);

  capas.forEach(capa => {
    if (!capa.visible) return;
    ctx.globalAlpha = capa.opacidad;
    ctx.drawImage(capa.canvas, 0, 0);
  });
  ctx.globalAlpha = 1;
}

function redimensionarCapas(nuevoW, nuevoH) {
  const copias = capas.map(c => {
    const tmp = document.createElement("canvas");
    tmp.width  = c.canvas.width;
    tmp.height = c.canvas.height;
    tmp.getContext("2d").drawImage(c.canvas, 0, 0);
    return { capa: c, snapshot: tmp };
  });

  capas.forEach((capa, i) => {
    capa.canvas.width  = nuevoW;
    capa.canvas.height = nuevoH;
    const ctx2 = capa.canvas.getContext("2d");
    ctx2.drawImage(copias[i].snapshot, 0, 0, nuevoW, nuevoH);
  });
}

/* ============================================================
   PALETA
============================================================ */
const PALETA = [
  "#000000", "#3b322b", "#6b5b4a", "#a89a86", "#d9cfbf", "#ffffff",
  "#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa",
  "#ffcdd2", "#ffe0b2", "#fff9c4", "#c8e6c9", "#bbdefb", "#e1bee7",
  "#b71c1c", "#e65100", "#f57f17", "#1b5e20", "#0d47a1", "#4a148c",
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
   HISTORIAL
============================================================ */
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
   POSICIÓN DEL POINTER
============================================================ */
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.round((e.clientX - rect.left) * (W / rect.width)),
    y: Math.round((e.clientY - rect.top)  * (H / rect.height))
  };
}

/* ============================================================
   ESTILO DE TRAZO
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
  const capa = capaActiva();
  if (!capa) return;
  if (capa.bloqueada) { mostrarToast("🔒 Capa bloqueada"); return; }
  if (!capa.visible)  { mostrarToast("👁️ Capa oculta");    return; }

  const p = getPos(e);
  dibujando  = true;
  startPoint = p;
  lastPoint  = p;
  puntosTrazoActual = [p];

  snapshotAntes = ctx.getImageData(0, 0, W, H);

  if (HERRAMIENTAS_LIBRES.includes(herramienta)) {
    const lCtx = ctxCapa(capa);
    aplicarEstilo(lCtx, herramienta === "eraser");
    lCtx.globalAlpha *= capa.opacidad;
    lCtx.beginPath();
    if (herramienta === "spray") sprayAt(lCtx, p.x, p.y, tamano);
    else { lCtx.arc(p.x, p.y, lCtx.lineWidth / 2, 0, Math.PI * 2); lCtx.fill(); }
    lCtx.globalAlpha = 1;

    emitirPresencia({
      tipo: "trazo", capaId: capa.id,
      herramienta, color: colorActual, tamano, opacidad,
      puntos: puntosTrazoActual
    });

  } else if (herramienta === "text") {
    textoPosicion = p;
    abrirModalTexto();
    dibujando = false;

  } else if (herramienta === "fill") {
    floodFill(p.x, p.y, colorActual);
    emitirEvento({ tipo: "relleno", capaId: capa.id, x: p.x, y: p.y, color: colorActual });
    dibujando = false;
  }
}

function moverTrazo(e) {
  if (!dibujando) return;
  const capa = capaActiva();
  if (!capa) return;

  const p = getPos(e);
  const lCtx = ctxCapa(capa);
  const esBorrador = herramienta === "eraser";

  if (HERRAMIENTAS_LIBRES.includes(herramienta)) {
    aplicarEstilo(lCtx, esBorrador);
    lCtx.globalAlpha *= capa.opacidad;

    if (herramienta === "spray") {
      sprayAt(lCtx, p.x, p.y, tamano);
    } else {
      lCtx.beginPath();
      lCtx.moveTo(lastPoint.x, lastPoint.y);
      lCtx.lineTo(p.x, p.y);
      lCtx.stroke();
    }
    lCtx.globalAlpha = 1;

    if (capa.visible) {
      aplicarEstilo(ctx, esBorrador);
      ctx.globalAlpha *= capa.opacidad;
      if (herramienta === "spray") {
        sprayAt(ctx, p.x, p.y, tamano);
      } else {
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    lastPoint = p;
    puntosTrazoActual.push(p);

    emitirPresencia({
      tipo: "trazo", capaId: capa.id,
      herramienta, color: colorActual, tamano, opacidad,
      puntos: puntosTrazoActual
    });

  } else if (HERRAMIENTAS_FORMAS.includes(herramienta)) {
    dibujarPreviewForma(startPoint, p);
    emitirPresencia({
      tipo: "forma", capaId: capa.id,
      herramienta, color: colorActual, tamano, opacidad,
      inicio: startPoint, fin: p
    });
  }
}

function finalizarTrazo(e) {
  if (!dibujando) return;
  dibujando = false;

  const capa = capaActiva();

  if (HERRAMIENTAS_FORMAS.includes(herramienta) && startPoint && capa) {
    const p = e ? getPos(e) : startPoint;
    dibujarFormaFinalEn(ctxCapa(capa), startPoint, p, capa);
    limpiarPreview();

    emitirEvento({
      tipo: "forma", capaId: capa.id,
      herramienta, color: colorActual, tamano, opacidad,
      inicio: startPoint, fin: p
    });

  } else if (HERRAMIENTAS_LIBRES.includes(herramienta) && capa && puntosTrazoActual.length) {
    emitirEvento({
      tipo: "trazo", capaId: capa.id,
      herramienta, color: colorActual, tamano, opacidad,
      puntos: puntosTrazoActual
    });
  }

  puntosTrazoActual = [];
  limpiarPresencia();

  if (snapshotAntes) {
    recomponer();
    guardarHistorial();
    snapshotAntes = null;
  }
  startPoint = null;
  lastPoint  = null;

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
  targetCtx.globalAlpha = (targetCtx.globalAlpha || 1) * 0.6;
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
  trazarForma(previewCtx, a, b);
  previewCtx.stroke();
  previewCtx.restore();
}

function trazarForma(c, a, b) {
  if (herramienta === "line") {
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
  } else if (herramienta === "rect") {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    c.rect(x, y, w, h);
  } else if (herramienta === "circle") {
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const rx = Math.abs(b.x - a.x) / 2;
    const ry = Math.abs(b.y - a.y) / 2;
    c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }
}

function dibujarFormaFinalEn(targetCtx, a, b, capa) {
  targetCtx.save();
  aplicarEstilo(targetCtx);
  targetCtx.globalAlpha *= (capa?.opacidad ?? 1);
  targetCtx.beginPath();
  trazarForma(targetCtx, a, b);
  targetCtx.stroke();
  targetCtx.restore();

  recomponer();
}

function limpiarPreview() {
  previewCtx.clearRect(0, 0, W, H);
}

/* ============================================================
   FLOOD FILL
============================================================ */
function floodFill(startX, startY, fillColorHex) {
  const capa = capaActiva();
  if (!capa) return;
  if (capa.bloqueada) { mostrarToast("🔒 Capa bloqueada"); return; }
  if (!capa.visible)  { mostrarToast("👁️ Capa oculta"); return; }

  const layerCanvas = capa.canvas;
  const lCtx = ctxCapa(capa);

  const w = layerCanvas.width;
  const h = layerCanvas.height;

  startX = Math.floor(startX);
  startY = Math.floor(startY);

  if (startX < 0 || startX >= w || startY < 0 || startY >= h) return;

  const imgData = lCtx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const startIdx = startY * w + startX;
  const i4 = startIdx * 4;

  const tR = data[i4];
  const tG = data[i4 + 1];
  const tB = data[i4 + 2];
  const tA = data[i4 + 3];

  const fillRGB = hexToRgb(fillColorHex);
  const fR = fillRGB.r, fG = fillRGB.g, fB = fillRGB.b, fA = 255;

  if (Math.abs(tR - fR) < 5 && Math.abs(tG - fG) < 5 && Math.abs(tB - fB) < 5) {
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
    const ii  = idx * 4;

    const r = data[ii], g = data[ii+1], b = data[ii+2], a = data[ii+3];

    if (Math.abs(r - tR) > tolerance ||
        Math.abs(g - tG) > tolerance ||
        Math.abs(b - tB) > tolerance ||
        Math.abs(a - tA) > tolerance) continue;

    data[ii]   = fR;
    data[ii+1] = fG;
    data[ii+2] = fB;
    data[ii+3] = fA;
    filled++;

    if (filled > maxFilled) break;

    if (x > 0)     { const ni = idx - 1; if (!visited[ni]) { visited[ni] = 1; queueX[tail] = x-1; queueY[tail] = y; tail++; } }
    if (x < w - 1) { const ni = idx + 1; if (!visited[ni]) { visited[ni] = 1; queueX[tail] = x+1; queueY[tail] = y; tail++; } }
    if (y > 0)     { const ni = idx - w; if (!visited[ni]) { visited[ni] = 1; queueX[tail] = x; queueY[tail] = y-1; tail++; } }
    if (y < h - 1) { const ni = idx + w; if (!visited[ni]) { visited[ni] = 1; queueX[tail] = x; queueY[tail] = y+1; tail++; } }
  }

  lCtx.putImageData(imgData, 0, 0);
  recomponer();
  guardarHistorial();
  mostrarToast(`🎨 ${filled.toLocaleString()} px`);
  programarAutoguardado();
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

/* ---- GUARDAR ---- */
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
  const cloudJPEG = tempCanvas.toDataURL("image/jpeg", 0.8);
  const thumbJPEG = generateThumbnail(tempCanvas, 400);

  const link = document.createElement("a");
  link.download = `mi-arte-${Date.now()}.png`;
  link.href = fullPNG;
  link.click();

  if (firebaseListo && PROYECTO_ID) {
    try {
      await guardarProyectoEnFirestore(cloudJPEG, thumbJPEG);
      mostrarToast("💾 Guardado en la nube ✅");
    } catch (err) {
      console.error("❌ Error guardando:", err);
      mostrarToast("⚠️ Local OK · error en nube");
    }
  } else {
    mostrarToast("💾 Imagen guardada");
  }
});

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

/* ---- LIMPIAR (solo capa activa) ---- */
document.getElementById("btn-clear").addEventListener("click", () => {
  const capa = capaActiva();
  if (!capa) return;
  if (capa.bloqueada) { mostrarToast("🔒 Capa bloqueada"); return; }

  if (!confirm("¿Borrar el contenido de esta capa?")) return;

  const lCtx = ctxCapa(capa);
  lCtx.clearRect(0, 0, W, H);

  recomponer();
  guardarHistorial();
  mostrarToast("🗑️ Capa limpiada");
  programarAutoguardado();
  emitirEvento({ tipo: "limpiar", capaId: capa.id });
});

/* ============================================================
   TOAST
============================================================ */
function mostrarToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("visible");
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove("visible"), 1500);
}

/* ============================================================
   ATAJOS DE TECLADO
============================================================ */
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
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
    document.querySelector(`[data-tool="${map[e.key.toLowerCase()]}"]`)?.click();
  }
});

/* ============================================================
   CURSOR DE BORRADOR
============================================================ */
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
  if (e.pointerType === "touch") ocultarCursorBorrador();
});

sliderSize.addEventListener("input", () => {
  if (herramienta === "eraser" && eraserCursor.classList.contains("visible")) {
    actualizarTamanoCursorBorrador();
  }
});

document.querySelectorAll(".tool").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.tool !== "eraser") ocultarCursorBorrador();
  });
});

/* ============================================================
   RESOLUCIÓN LÓGICA FIJA DEL LIENZO  ★ NUEVO
============================================================
   W×H son el buffer real en píxeles. Igual en TODOS los
   dispositivos (desktop y móvil). El tamaño visible lo controla
   SOLO el CSS del wrapper. Nunca se multiplica por DPR.
============================================================ */

function fijarResolucionLienzo(nuevoW, nuevoH) {
  if (!Number.isFinite(nuevoW) || !Number.isFinite(nuevoH)) return;
  if (nuevoW < 100 || nuevoH < 100) return;
  if (nuevoW > 4096 || nuevoH > 4096) return;
  if (nuevoW === W && nuevoH === H &&
      canvas.width === nuevoW && canvas.height === nuevoH) return;

  // 1) Reescalar capas existentes al nuevo buffer
  redimensionarCapas(nuevoW, nuevoH);

  // 2) Redimensionar canvas principal y preview
  canvas.width  = nuevoW;
  canvas.height = nuevoH;
  previewCanvas.width  = nuevoW;
  previewCanvas.height = nuevoH;

  W = nuevoW;
  H = nuevoH;

  if (capas.length === 0) {
    const capa = crearCapa("Capa 1");
    capaActivaId = capa.id;
  }

  recomponer();
  history.length = 0;
  historyIndex = -1;
  guardarHistorial();

  console.log(`📐 Resolución lógica: ${W}×${H}`);
}

/* Ajusta SOLO el tamaño visible (CSS) del wrapper. Nunca el buffer. */
function ajustarTamanoCanvas() {
  if (!estudioMain) return;

  const contRect = estudioMain.getBoundingClientRect();
  if (contRect.width === 0 || contRect.height === 0) return;

  const availW = contRect.width  - 12;
  const availH = contRect.height - 12;
  if (availW <= 0 || availH <= 0) return;

  const ratio = W / H;
  let w = availW;
  let h = w / ratio;
  if (h > availH) { h = availH; w = h * ratio; }

  wrapper.style.width  = Math.round(w) + "px";
  wrapper.style.height = Math.round(h) + "px";
}

/* Reajustar CSS cuando cambie el viewport (sin tocar el buffer) */
window.addEventListener("resize", () => requestAnimationFrame(ajustarTamanoCanvas));
window.addEventListener("orientationchange", () => setTimeout(ajustarTamanoCanvas, 250));

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize",
    () => requestAnimationFrame(ajustarTamanoCanvas));
}

/* ResizeObserver: mide el contenedor DESPUÉS del reflow */
if (window.ResizeObserver && estudioMain) {
  const ro = new ResizeObserver(() => requestAnimationFrame(ajustarTamanoCanvas));
  ro.observe(estudioMain);
}

/* ============================================================
   ARRANQUE
============================================================ */
function pintarFondoInicial() {
  ctx.fillStyle = COLOR_FONDO;
  ctx.fillRect(0, 0, W, H);
}

pintarFondoInicial();

if (capas.length === 0) {
  const capa = crearCapa("Capa 1");
  capaActivaId = capa.id;
}

guardarHistorial();
renderPaleta();
document.getElementById("color-actual").style.background = colorActual;
document.getElementById("color-custom").value = colorActual;

/* Ajuste inicial del wrapper (solo CSS) */
ajustarTamanoCanvas();

/* ============================================================
   PANEL DE CAPAS — UI
============================================================ */
const capasPanel    = document.getElementById("capas-panel");
const capasOverlay  = document.getElementById("capas-overlay");
const capasLista    = document.getElementById("capas-lista");
const btnCapas      = document.getElementById("btn-capas");
const btnNuevaCapa  = document.getElementById("btn-nueva-capa");
const btnCerrarCaps = document.getElementById("btn-cerrar-capas");

function abrirPanelCapas() {
  capasPanel.classList.add("abierto");
  capasOverlay.classList.add("visible");
  capasPanel.setAttribute("aria-hidden", "false");
  btnCapas.classList.add("activo");
  actualizarPanelCapas();
}

function cerrarPanelCapas() {
  capasPanel.classList.remove("abierto");
  capasOverlay.classList.remove("visible");
  capasPanel.setAttribute("aria-hidden", "true");
  btnCapas.classList.remove("activo");
}

btnCapas.addEventListener("click", () => {
  if (capasPanel.classList.contains("abierto")) {
    cerrarPanelCapas();
  } else {
    abrirPanelCapas();
  }
});
btnCerrarCaps.addEventListener("click", cerrarPanelCapas);
capasOverlay.addEventListener("click", cerrarPanelCapas);

btnNuevaCapa.addEventListener("click", () => {
  const capa = crearCapa();
  setCapaActiva(capa.id);
  actualizarPanelCapas();
  mostrarToast("➕ Capa creada");
  programarAutoguardado();
  emitirEvento({ tipo: "capa-nueva", capaIdNueva: capa.id, nombre: capa.nombre });
});

/* Iconos para el menú de capa */
const ICONO_OJO_VISIBLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICONO_OJO_OCULTO  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
const ICONO_ARRRIBA      = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
const ICONO_ABAJO        = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const ICONO_BLOQUEAR     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const ICONO_BORRAR       = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;

function actualizarPanelCapas() {
  capasLista.innerHTML = "";

  for (let i = capas.length - 1; i >= 0; i--) {
    const capa = capas[i];
    const activa = capa.id === capaActivaId;

    const item = document.createElement("div");
    item.className = "capa-item";
    if (activa) item.classList.add("activa");
    if (!capa.visible) item.classList.add("oculta");
    item.dataset.id = capa.id;

    item.innerHTML = `
      <button type="button" class="capa-visibilidad" aria-label="Mostrar/ocultar" title="Mostrar/ocultar">
        ${capa.visible ? ICONO_OJO_VISIBLE : ICONO_OJO_OCULTO}
      </button>

      <span class="capa-nombre">${capa.nombre}</span>

      <div class="capa-opacidad-wrap">
        <input type="range" min="0" max="100" value="${Math.round(capa.opacidad * 100)}" aria-label="Opacidad de la capa">
      </div>

      <button type="button" class="capa-opciones" aria-label="Opciones">⋯</button>
    `;

    item.addEventListener("click", (e) => {
      if (e.target.closest(".capa-visibilidad") ||
          e.target.closest(".capa-opciones")   ||
          e.target.closest(".capa-opacidad-wrap") ||
          e.target.closest(".capa-nombre-input")) return;
      setCapaActiva(capa.id);
    });

    item.querySelector(".capa-visibilidad").addEventListener("click", (e) => {
      e.stopPropagation();
      capa.visible = !capa.visible;
      recomponer();
      actualizarPanelCapas();
      programarAutoguardado();
      emitirEvento({ tipo: "capa-visibilidad", capaId: capa.id, visible: capa.visible });
    });

    const slider = item.querySelector(".capa-opacidad-wrap input");
    slider.addEventListener("input", (e) => {
      e.stopPropagation();
      capa.opacidad = parseInt(e.target.value, 10) / 100;
      recomponer();
    });
    slider.addEventListener("change", () => {
      programarAutoguardado();
      emitirEvento({ tipo: "capa-opacidad", capaId: capa.id, opacidad: capa.opacidad });
    });
    slider.addEventListener("pointerdown", (e) => e.stopPropagation());

    item.querySelector(".capa-opciones").addEventListener("click", (e) => {
      e.stopPropagation();
      abrirMenuCapa(capa, item);
    });

    capasLista.appendChild(item);
  }
}

function abrirMenuCapa(capa, itemEl) {
  document.querySelectorAll(".capa-menu").forEach(m => m.remove());

  const menu = document.createElement("div");
  menu.className = "capa-menu";

  menu.innerHTML = `
    <button type="button" data-accion="renombrar">
      ✏️ Renombrar
    </button>
    <button type="button" data-accion="subir" ${capas.indexOf(capa) === capas.length - 1 ? "disabled style='opacity:.4'" : ""}>
      ${ICONO_ARRRIBA} Subir
    </button>
    <button type="button" data-accion="bajar" ${capas.indexOf(capa) === 0 ? "disabled style='opacity:.4'" : ""}>
      ${ICONO_ABAJO} Bajar
    </button>
    <button type="button" data-accion="bloquear">
      ${ICONO_BLOQUEAR} ${capa.bloqueada ? "Desbloquear" : "Bloquear"}
    </button>
    ${capas.length > 1 ? `
      <button type="button" data-accion="eliminar" class="danger">
        ${ICONO_BORRAR} Eliminar
      </button>
    ` : ""}
  `;

  itemEl.appendChild(menu);

  setTimeout(() => {
    const cerrar = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener("pointerdown", cerrar);
      }
    };
    document.addEventListener("pointerdown", cerrar);
  }, 10);

  menu.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const accion = btn.dataset.accion;
      menu.remove();

      if (accion === "renombrar") renombrarCapa(capa, itemEl);
      else if (accion === "subir")   moverCapa(capa, 1);
      else if (accion === "bajar")   moverCapa(capa, -1);
      else if (accion === "bloquear") {
        capa.bloqueada = !capa.bloqueada;
        mostrarToast(capa.bloqueada ? "🔒 Bloqueada" : "🔓 Desbloqueada");
        programarAutoguardado();
      }
      else if (accion === "eliminar") eliminarCapa(capa);
    });
  });
}

function renombrarCapa(capa, itemEl) {
  const nombreSpan = itemEl.querySelector(".capa-nombre");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "capa-nombre-input";
  input.value = capa.nombre;
  input.maxLength = 30;

  nombreSpan.replaceWith(input);
  input.focus();
  input.select();

  const confirmar = () => {
    const nuevo = input.value.trim() || capa.nombre;
    capa.nombre = nuevo;
    actualizarPanelCapas();
    programarAutoguardado();
    emitirEvento({ tipo: "capa-renombrar", capaId: capa.id, nombre: nuevo });
  };

  input.addEventListener("blur", confirmar);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    if (e.key === "Escape") { input.value = capa.nombre; input.blur(); }
  });
}

function moverCapa(capa, direccion) {
  const idx = capas.indexOf(capa);
  const nuevoIdx = idx + direccion;
  if (nuevoIdx < 0 || nuevoIdx >= capas.length) return;

  capas.splice(idx, 1);
  capas.splice(nuevoIdx, 0, capa);

  recomponer();
  actualizarPanelCapas();
  programarAutoguardado();
}

function eliminarCapa(capa) {
  if (capas.length <= 1) {
    mostrarToast("⚠️ Debe haber al menos 1 capa");
    return;
  }

  const ok = confirm(`¿Eliminar "${capa.nombre}"?`);
  if (!ok) return;

  emitirEvento({ tipo: "capa-eliminar", capaId: capa.id });

  const idx = capas.indexOf(capa);
  capas.splice(idx, 1);

  if (capaActivaId === capa.id) {
    const nuevaActiva = capas[Math.min(idx, capas.length - 1)];
    capaActivaId = nuevaActiva.id;
  }

  recomponer();
  actualizarPanelCapas();
  mostrarToast("🗑️ Capa eliminada");
  programarAutoguardado();
}

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
  const size = parseInt(textoSizeSlider.value, 10);
  const font = textoFontSelect.value;
  const texto = textoInput.value.trim() || "Hola";
  textoPreview.textContent = texto;
  textoPreview.style.fontFamily = `"${font}", cursive`;
  textoPreview.style.fontSize = Math.min(size, 48) + "px";
  textoPreview.style.color = colorActual;
}

function aplicarTexto() {
  const texto = textoInput.value.trim();
  if (!texto || !textoPosicion) { cerrarModalTexto(); return; }

  const size = parseInt(textoSizeSlider.value, 10);
  const font = textoFontSelect.value;

  crearTextoFlotante(texto, textoPosicion.x, textoPosicion.y, size, font);
  cerrarModalTexto();
  mostrarToast("✍️ Texto agregado");
  programarAutoguardado();
}

function crearTextoFlotante(texto, x, y, size, font) {
  const textLayer = document.getElementById("text-layer");
  if (!textLayer) return;

  const div = document.createElement("div");
  div.className = "texto-flotante editable";
  div.textContent = texto;
  div.style.left = x + "px";
  div.style.top = y + "px";
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

  hacerArrastrable(div);
  hacerRedimensionable(div, handle);

  textLayer.appendChild(div);

  setTimeout(() => div.classList.remove("editable"), 4000);
}

function hacerArrastrable(div) {
  let dragging = false, offsetX = 0, offsetY = 0;

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
  let resizing = false, startX = 0, startY = 0, startSize = 0;

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
  handle.addEventListener("pointercancel", () => resizing = false);
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
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); aplicarTexto(); }
  if (e.key === "Escape") cerrarModalTexto();
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
      console.warn("⚠️ No hay ?id= en la URL.");
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

    const h1 = document.querySelector(".header-titulo");
    if (h1) h1.textContent = "🎨 " + (proyectoFirestore.nombre || "Sin título");

    setTimeout(async () => {
      // 1) Fijar la resolución real del proyecto (una sola vez)
      const ancho = parseInt(proyectoFirestore?.ancho, 10) || 1400;
      const alto  = parseInt(proyectoFirestore?.alto,  10) || 1400;
      fijarResolucionLienzo(ancho, alto);

      // 2) Ajustar solo el tamaño CSS visible
      ajustarTamanoCanvas();

      // 3) Cargar contenido
      if (Array.isArray(proyectoFirestore.capasData) && proyectoFirestore.capasData.length > 0) {
        await cargarCapasDesdeFirestore(proyectoFirestore.capasData);
      } else if (proyectoFirestore.canvasData) {
        await cargarCapaUnicaDesdeFirestore(proyectoFirestore.canvasData);
      }

      recomponer();
      guardarHistorial();

      // 4) Arranca la sincronización colaborativa
      iniciarSyncColaborativa();
    }, 300);

  } catch (err) {
    console.error("❌ Error cargando proyecto:", err);
    mostrarToast("⚠️ Error al cargar proyecto");
    ajustarTamanoCanvas();
  }
}

async function cargarCapasDesdeFirestore(capasData) {
  capas.length = 0;

  for (const cd of capasData) {
    const capa = crearCapa(cd.nombre || "Capa");
    capa.id = cd.id || capa.id;
    capa.visible = cd.visible !== false;
    capa.opacidad = typeof cd.opacidad === "number" ? cd.opacidad : 1;
    capa.bloqueada = cd.bloqueada === true;

    if (cd.data) {
      await new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          ctxCapa(capa).drawImage(img, 0, 0, capa.canvas.width, capa.canvas.height);
          res();
        };
        img.onerror = () => res();
        img.src = cd.data;
      });
    }
  }

  if (capas.length === 0) {
    const capa = crearCapa("Capa 1");
    capaActivaId = capa.id;
  } else {
    capaActivaId = capas[0].id;
  }

  actualizarPanelCapas();
  console.log(`📚 ${capas.length} capas cargadas`);
}

async function cargarCapaUnicaDesdeFirestore(canvasData) {
  capas.length = 0;
  const capa = crearCapa("Capa 1");
  capaActivaId = capa.id;

  await new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      ctxCapa(capa).drawImage(img, 0, 0, capa.canvas.width, capa.canvas.height);
      res();
    };
    img.onerror = () => res();
    img.src = canvasData;
  });

  actualizarPanelCapas();
  console.log("📚 1 capa cargada (formato antiguo)");
}

/* Guardar solo composite + thumbnail */
async function guardarProyectoEnFirestore(compositeJPEG, thumbnailJPEG) {
  await setDoc(
    doc(fireDb, "parejas", PAREJA_ID, "proyectos", PROYECTO_ID),
    {
      canvasData: compositeJPEG,
      thumbnail: thumbnailJPEG,
      actualizadoEn: Date.now()
    },
    { merge: true }
  );
}

/* ============================================================
   AUTOGUARDADO
============================================================ */
let timeoutAutoguardado = null;
let guardandoAhora = false;
let cambiosPendientes = false;
let ultimoGuardadoTs = 0;

const DELAY_AUTOGUARDADO    = 2500;
const DELAY_ENTRE_GUARDADOS = 1500;

function programarAutoguardado() {
  cambiosPendientes = true;
  clearTimeout(timeoutAutoguardado);
  timeoutAutoguardado = setTimeout(autoguardar, DELAY_AUTOGUARDADO);
}

function forzarAutoguardado() {
  cambiosPendientes = true;
  clearTimeout(timeoutAutoguardado);
  autoguardar();
}

async function autoguardar() {
  if (!firebaseListo || !PROYECTO_ID) return;
  if (guardandoAhora) { programarAutoguardado(); return; }
  if (!cambiosPendientes) return;

  const ahora = Date.now();
  if (ahora - ultimoGuardadoTs < DELAY_ENTRE_GUARDADOS) {
    programarAutoguardado();
    return;
  }

  guardandoAhora = true;
  cambiosPendientes = false;

  try {
    const canvasData = canvas.toDataURL("image/jpeg", 0.75);
    const thumbnail  = generateThumbnail(canvas, 320);
    await guardarProyectoEnFirestore(canvasData, thumbnail);
    ultimoGuardadoTs = Date.now();
    mostrarIndicadorGuardado();
  } catch (err) {
    console.error("❌ Autoguardando:", err);
  } finally {
    guardandoAhora = false;
    if (cambiosPendientes) programarAutoguardado();
  }
}

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

window.addEventListener("beforeunload", () => {
  limpiarPresencia();
  unsubEventos?.();
  unsubPresencia?.();

  if (firebaseListo && PROYECTO_ID && cambiosPendientes) {
    const canvasData = canvas.toDataURL("image/jpeg", 0.8);
    const thumbnail  = generateThumbnail(canvas, 320);
    guardarProyectoEnFirestore(canvasData, thumbnail)
      .catch(e => console.warn("No se pudo guardar al salir:", e));
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && firebaseListo && PROYECTO_ID && cambiosPendientes) {
    forzarAutoguardado();
  }
});

/* ============================================================
   INICIALIZAR
============================================================ */
initFirebaseProyecto();

/* ============================================================
   FASE 4 — ZOOM, PAN, DOBLE-TAP Y PANTALLA COMPLETA
============================================================ */

let zoom  = 1;
let panX  = 0;
let panY  = 0;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 5;
const ZOOM_STEP = 1.15;

function aplicarTransform() {
  wrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;

  if (btnResetZoom) {
    const alterado = Math.abs(zoom - 1) > 0.02 || Math.abs(panX) > 2 || Math.abs(panY) > 2;
    btnResetZoom.classList.toggle("visible", alterado);
  }
}

function resetZoom() {
  zoom = 1;
  panX = 0;
  panY = 0;
  aplicarTransform();
  mostrarZoomIndicador();
}

let timeoutZoomInd = null;
function mostrarZoomIndicador() {
  let ind = document.getElementById("zoom-indicador");
  if (!ind) {
    ind = document.createElement("div");
    ind.id = "zoom-indicador";
    ind.className = "zoom-indicador";
    document.body.appendChild(ind);
  }
  ind.textContent = `${Math.round(zoom * 100)}%`;
  ind.classList.add("visible");
  clearTimeout(timeoutZoomInd);
  timeoutZoomInd = setTimeout(() => ind.classList.remove("visible"), 900);
}

btnResetZoom?.addEventListener("click", resetZoom);

/* ============================================================
   GESTOS TÁCTILES (móvil) — 2 dedos para zoom/pan
============================================================ */
let touchMode      = null;
let touchStartDist = 0;
let touchStartZoom = 1;
let touchStartMidX = 0;
let touchStartMidY = 0;
let touchStartPanX = 0;
let touchStartPanY = 0;

function distanciaTouches(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

function midpointTouches(t1, t2) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2
  };
}

estudioMain?.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();

    dibujando = false;
    startPoint = null;
    lastPoint  = null;

    touchMode = "pinch";
    touchStartDist  = distanciaTouches(e.touches[0], e.touches[1]);
    touchStartZoom  = zoom;
    const mid = midpointTouches(e.touches[0], e.touches[1]);
    touchStartMidX  = mid.x;
    touchStartMidY  = mid.y;
    touchStartPanX  = panX;
    touchStartPanY  = panY;

    wrapper.classList.add("gesture-active");
    ocultarCursorBorrador();
  }
}, { passive: false });

estudioMain?.addEventListener("touchmove", (e) => {
  if (touchMode === "pinch" && e.touches.length === 2) {
    e.preventDefault();

    const dist = distanciaTouches(e.touches[0], e.touches[1]);
    const mid  = midpointTouches(e.touches[0], e.touches[1]);

    const factor = dist / touchStartDist;
    let nuevoZoom = touchStartZoom * factor;
    nuevoZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nuevoZoom));

    panX = touchStartPanX + (mid.x - touchStartMidX);
    panY = touchStartPanY + (mid.y - touchStartMidY);

    zoom = nuevoZoom;
    aplicarTransform();
  }
}, { passive: false });

estudioMain?.addEventListener("touchend", (e) => {
  if (e.touches.length < 2 && touchMode === "pinch") {
    touchMode = null;
    wrapper.classList.remove("gesture-active");
    mostrarZoomIndicador();
  }
}, { passive: true });

estudioMain?.addEventListener("touchcancel", () => {
  touchMode = null;
  wrapper.classList.remove("gesture-active");
});

/* ============================================================
   DOBLE TAP para deshacer (móvil)
============================================================ */
let ultimoTapTiempo = 0;
let ultimoTapX = 0;
let ultimoTapY = 0;

estudioMain?.addEventListener("touchend", (e) => {
  if (e.touches.length > 0) return;

  const ahora = Date.now();
  const t = e.changedTouches[0];

  const dx = Math.abs(t.clientX - ultimoTapX);
  const dy = Math.abs(t.clientY - ultimoTapY);
  const dt = ahora - ultimoTapTiempo;

  if (dt < 300 && dx < 30 && dy < 30) {
    e.preventDefault();
    undo();
    ultimoTapTiempo = 0;
    return;
  }

  ultimoTapTiempo = ahora;
  ultimoTapX = t.clientX;
  ultimoTapY = t.clientY;
}, { passive: false });

/* ============================================================
   ZOOM CON RUEDA (PC) — Ctrl + rueda
============================================================ */
estudioMain?.addEventListener("wheel", (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();

  const dir = e.deltaY < 0 ? 1 : -1;
  const nuevoZoom = zoom * (dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
  zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nuevoZoom));

  aplicarTransform();
  mostrarZoomIndicador();
}, { passive: false });

/* ============================================================
   ATAJOS DE TECLADO — Zoom
============================================================ */
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea")) return;

  if (e.key === "+" || e.key === "=") {
    e.preventDefault();
    zoom = Math.min(ZOOM_MAX, zoom * ZOOM_STEP);
    aplicarTransform();
    mostrarZoomIndicador();
  } else if (e.key === "-" || e.key === "_") {
    e.preventDefault();
    zoom = Math.max(ZOOM_MIN, zoom / ZOOM_STEP);
    aplicarTransform();
    mostrarZoomIndicador();
  } else if (e.key === "0") {
    e.preventDefault();
    resetZoom();
  }
});

/* ============================================================
   PANTALLA COMPLETA
============================================================ */
function toggleFullscreen() {
  const doc = document;
  const el  = document.documentElement;

  const estaEnFull =
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement;

  if (!estaEnFull) {
    if (el.requestFullscreen)                  el.requestFullscreen();
    else if (el.webkitRequestFullscreen)       el.webkitRequestFullscreen();
    else if (el.mozRequestFullScreen)          el.mozRequestFullScreen();
    else if (el.msRequestFullscreen)           el.msRequestFullscreen();
  } else {
    if (doc.exitFullscreen)                    doc.exitFullscreen();
    else if (doc.webkitExitFullscreen)         doc.webkitExitFullscreen();
    else if (doc.mozCancelFullScreen)          doc.mozCancelFullScreen();
    else if (doc.msExitFullscreen)             doc.msExitFullscreen();
  }
}

btnFullscreen?.addEventListener("click", toggleFullscreen);

document.addEventListener("fullscreenchange", () => {
  const enFull = !!document.fullscreenElement;
  if (btnFullscreen) {
    btnFullscreen.setAttribute("title", enFull ? "Salir de pantalla completa" : "Pantalla completa");
  }
  setTimeout(ajustarTamanoCanvas, 300);
});

/* ============================================================
   INICIALIZAR
============================================================ */
aplicarTransform();

/* ============================================================
   COLABORACIÓN EN TIEMPO REAL
============================================================ */

const MI_AUTOR = (() => {
  let id = localStorage.getItem("estudio-autor-id");
  if (!id) {
    id = "u" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("estudio-autor-id", id);
  }
  return id;
})();

const eventosProcesados = new Set();
let unsubEventos   = null;
let unsubPresencia = null;
let presenciaRemota = null;

let puntosTrazoActual = [];
let ultimoEnvioPresencia = 0;
const PRESENCIA_INTERVALO = 120;

const refEventos = () =>
  collection(fireDb, "parejas", PAREJA_ID, "proyectos", PROYECTO_ID, "eventos");

const refPresencia = () =>
  doc(fireDb, "parejas", PAREJA_ID, "proyectos", PROYECTO_ID, "presencia", MI_AUTOR);

/* ---------- 1. Arranque de listeners ---------- */
async function iniciarSyncColaborativa() {
  if (!PROYECTO_ID) return;

  const qEv = query(refEventos(), orderBy("ts", "asc"));
  unsubEventos = onSnapshot(qEv, snap => {
    snap.docChanges().forEach(ch => {
      if (ch.type !== "added") return;
      if (eventosProcesados.has(ch.doc.id)) return;
      eventosProcesados.add(ch.doc.id);
      const ev = ch.doc.data();
      if (ev.autor === MI_AUTOR) return;
      aplicarEventoRemoto(ev);
    });
  }, err => console.warn("Sync eventos:", err));

  const qPr = query(
    collection(fireDb, "parejas", PAREJA_ID, "proyectos", PROYECTO_ID, "presencia")
  );
  unsubPresencia = onSnapshot(qPr, snap => {
    let encontrado = null;
    snap.forEach(d => {
      const data = d.data();
      if (data.autor === MI_AUTOR) return;
      if (Date.now() - (data.ts || 0) > 5000) return;
      encontrado = data;
    });
    presenciaRemota = encontrado;
    dibujarPresenciaRemota();
  }, err => console.warn("Sync presencia:", err));
}

/* ---------- 2. Emitir eventos ---------- */
async function emitirEvento(datos) {
  if (!firebaseListo || !PROYECTO_ID) return;
  try {
    await addDoc(refEventos(), { ...datos, autor: MI_AUTOR, ts: Date.now() });
  } catch (e) {
    console.warn("emitirEvento:", e);
  }
}

async function emitirPresencia(datos) {
  if (!firebaseListo || !PROYECTO_ID) return;
  const ahora = performance.now();
  if (ahora - ultimoEnvioPresencia < PRESENCIA_INTERVALO) return;
  ultimoEnvioPresencia = ahora;
  try {
    await setDoc(refPresencia(), { ...datos, autor: MI_AUTOR, ts: Date.now() });
  } catch (e) { /* silencioso */ }
}

async function limpiarPresencia() {
  if (!firebaseListo || !PROYECTO_ID) return;
  try { await deleteDoc(refPresencia()); } catch (e) {}
}

/* ---------- 3. Aplicar eventos remotos ---------- */
function aplicarEventoRemoto(ev) {
  const capa = capas.find(c => c.id === ev.capaId) || capaActiva();
  if (!capa) return;

  const lCtx = ctxCapa(capa);
  const visibilidadOriginal = capa.visible;
  capa.visible = true;

  try {
    if (ev.tipo === "trazo") {
      aplicarTrazoRemoto(lCtx, ev, capa);
    } else if (ev.tipo === "forma") {
      aplicarFormaRemota(lCtx, ev, capa);
    } else if (ev.tipo === "relleno") {
      const antes = capaActivaId;
      capaActivaId = capa.id;
      floodFill(ev.x, ev.y, ev.color);
      capaActivaId = antes;
    } else if (ev.tipo === "limpiar") {
      lCtx.clearRect(0, 0, capa.canvas.width, capa.canvas.height);
    } else if (ev.tipo === "capa-nueva") {
      const nueva = crearCapa(ev.nombre);
      nueva.id = ev.capaIdNueva;
      actualizarPanelCapas();
    } else if (ev.tipo === "capa-eliminar") {
      const idx = capas.findIndex(c => c.id === ev.capaId);
      if (idx >= 0 && capas.length > 1) capas.splice(idx, 1);
      actualizarPanelCapas();
    } else if (ev.tipo === "capa-visibilidad") {
      capa.visible = ev.visible;
      actualizarPanelCapas();
    } else if (ev.tipo === "capa-opacidad") {
      capa.opacidad = ev.opacidad;
      actualizarPanelCapas();
    } else if (ev.tipo === "capa-renombrar") {
      capa.nombre = ev.nombre;
      actualizarPanelCapas();
    }
  } finally {
    capa.visible = visibilidadOriginal;
  }

  recomponer();
  mostrarToast("👥 Cambio de la otra persona");
}

function aplicarTrazoRemoto(targetCtx, ev, capa) {
  targetCtx.save();
  targetCtx.strokeStyle = ev.herramienta === "eraser" ? COLOR_FONDO : ev.color;
  targetCtx.fillStyle   = ev.herramienta === "eraser" ? COLOR_FONDO : ev.color;
  targetCtx.lineCap     = "round";
  targetCtx.lineJoin    = "round";
  targetCtx.lineWidth   = ev.tamano * (
    ev.herramienta === "eraser" ? 2 :
    ev.herramienta === "brush"  ? 1.4 :
    ev.herramienta === "marker" ? 1.6 : 1
  );
  targetCtx.globalAlpha =
    ev.herramienta === "eraser" ? 1 :
    (ev.herramienta === "marker" ? ev.opacidad * 0.5 : ev.opacidad) * capa.opacidad;

  const pts = ev.puntos || [];
  if (pts.length === 1) {
    targetCtx.beginPath();
    targetCtx.arc(pts[0].x, pts[0].y, targetCtx.lineWidth / 2, 0, Math.PI * 2);
    targetCtx.fill();
  } else if (pts.length > 1) {
    targetCtx.beginPath();
    targetCtx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) targetCtx.lineTo(pts[i].x, pts[i].y);
    targetCtx.stroke();
  }
  targetCtx.restore();
}

function aplicarFormaRemota(targetCtx, ev, capa) {
  targetCtx.save();
  aplicarEstiloPara(targetCtx, ev.herramienta, ev.color, ev.tamano, ev.opacidad);
  targetCtx.globalAlpha *= capa.opacidad;
  targetCtx.beginPath();
  const a = ev.inicio, b = ev.fin;
  if (ev.herramienta === "line") {
    targetCtx.moveTo(a.x, a.y);
    targetCtx.lineTo(b.x, b.y);
  } else if (ev.herramienta === "rect") {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    targetCtx.rect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  } else if (ev.herramienta === "circle") {
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    targetCtx.ellipse(cx, cy, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
  }
  targetCtx.stroke();
  targetCtx.restore();
}

function aplicarEstiloPara(targetCtx, herramienta, color, tamano, opacidad) {
  targetCtx.strokeStyle = color;
  targetCtx.fillStyle   = color;
  targetCtx.lineCap     = "round";
  targetCtx.lineJoin    = "round";
  targetCtx.lineWidth   = tamano;
  targetCtx.globalAlpha = opacidad;
  if (herramienta === "brush")  { targetCtx.lineWidth = tamano * 1.4; targetCtx.globalAlpha = opacidad * 0.9; }
  if (herramienta === "marker") { targetCtx.lineWidth = tamano * 1.6; targetCtx.globalAlpha = opacidad * 0.5; }
  if (herramienta === "eraser") { targetCtx.lineWidth = tamano * 2;   targetCtx.globalAlpha = 1; }
}

/* ---------- 4. Presencia (trazo vivo del otro) ---------- */
function dibujarPresenciaRemota() {
  if (!previewCtx) return;
  if (dibujando && HERRAMIENTAS_FORMAS.includes(herramienta)) return;

  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  if (!presenciaRemota) return;

  const ev = presenciaRemota;
  const capa = capas.find(c => c.id === ev.capaId);
  if (!capa) return;

  previewCtx.save();
  if (ev.tipo === "trazo") {
    aplicarTrazoRemoto(previewCtx, ev, capa);   // ★ fix: era aplicarTrazoRemota (typo)
  } else if (ev.tipo === "forma" && ev.inicio && ev.fin) {
    aplicarFormaRemota(previewCtx, ev, capa);
  }
  previewCtx.restore();
}