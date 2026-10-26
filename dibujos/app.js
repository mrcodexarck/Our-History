/* ============================================================
   IMPORTS
============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  initializeFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  setDoc,
  updateDoc,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { FIREBASE_CONFIG, PAREJA_ID } from "../citas/firebase-config.js";

/* ============================================================
   PARÁMETROS DE URL (MODO EDICIÓN)
============================================================ */
const urlParams = new URLSearchParams(window.location.search);
const fechaUrl = urlParams.get('fecha');
const hojaUrl  = urlParams.get('hoja');

/* ============================================================
   PERFILES
============================================================ */
const PERFILES_DEFAULT = {
  joan:  { nombre: "Joan",  emoji: "🤎", tab: 1, cumple: "", bio: "" },
  emily: { nombre: "Emily", emoji: "💛", tab: 2, cumple: "", bio: "" }
};

const PERFIL_KEY = "perfil-dibujo";
let perfilActual = localStorage.getItem(PERFIL_KEY);

const PERFILES = {
  joan:  { ...PERFILES_DEFAULT.joan },
  emily: { ...PERFILES_DEFAULT.emily }
};

let miTab = null;
let otroTab = null;
let otroPerfil = null;

function configurarPerfil(id) {
  perfilActual = id;
  const otroId = id === "joan" ? "emily" : "joan";
  miTab = PERFILES[id].tab;
  otroTab = PERFILES[otroId].tab;
  otroPerfil = otroId;
  localStorage.setItem(PERFIL_KEY, id);
}

function esMiHoja(tab) { return tab === miTab; }

/* ============================================================
   FECHA (CONGELADA AL ABRIR PARA EVITAR CRUCE DE MEDIANOCHE)
============================================================ */
const FECHA_SESION = (function() {
  if (fechaUrl && /^\d{4}-\d{2}-\d{2}$/.test(fechaUrl)) return fechaUrl;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
})();

function hoyISO() {
  return FECHA_SESION;
}

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const hoy = new Date();
const fechaDiaEl  = document.getElementById("fecha-dia");
const fechaAnioEl = document.getElementById("fecha-anio");
if (fechaDiaEl)  fechaDiaEl.textContent  = `${hoy.getDate()} de ${MESES[hoy.getMonth()]}`;
if (fechaAnioEl) fechaAnioEl.textContent = hoy.getFullYear();

/* ============================================================
   CANVAS Y CAPA TEMPORAL
============================================================ */
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const W = canvas.width;
const H = canvas.height;
const COLOR_FONDO = "#fdfaf3";

let tempLayerCanvas = null;
let tempLayerCtx = null;

function getTempLayer() {
  if (!tempLayerCanvas) {
    tempLayerCanvas = document.createElement("canvas");
    tempLayerCanvas.width = W;
    tempLayerCanvas.height = H;
    tempLayerCtx = tempLayerCanvas.getContext("2d", { willReadFrequently: true });
  }
  return tempLayerCtx;
}

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

let myUid = null;
let firebaseListo = false;

let hojaActual = 1;
let localStrokes = [];
let currentStroke = null;

const strokesRefs = { 1: null, 2: null };
const unsubscribers = { 1: null, 2: null };

const DEFAULT_LAYER_ID = "capa-inicial";
const defaultLayer = () => ({ id: DEFAULT_LAYER_ID, name: "Capa 1", order: 0, visible: true, locked: false });
const layersBySheet = { 1: [defaultLayer()], 2: [defaultLayer()] };
const layerUnsubscribers = { 1: null, 2: null };
const layerMetadataReady = { 1: false, 2: false };
const activeLayerIds = { 1: DEFAULT_LAYER_ID, 2: DEFAULT_LAYER_ID };
let selectedStrokeId = null;
let selectionDragState = null;
let activeDrawPointerId = null;
let pendingBucketTap = null;
const touchPointers = new Map();
let gestureActive = false;
let gestureStart = null;
const canvasView = { scale: 1, x: 0, y: 0 };
const canvasSurface = document.getElementById("canvas-surface");
const canvasWrapper = document.getElementById("canvas-wrapper");
const zoomValueEl = document.getElementById("zoom-value");

let fillCanvasCache = new Map();
let layersPanelSignature = "";
let lastThumbnailTs = 0;

let presenciaInterval = null;
let mensajeUnsub = null;
let mensajeJoan  = "";
let mensajeEmily = "";

let perfilUnsubs = { joan: null, emily: null };
let timeoutThumbnail = null;

/* ============================================================
   HELPERS
============================================================ */
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.round((e.clientX - rect.left) * (W / rect.width)),
    y: Math.round((e.clientY - rect.top)  * (H / rect.height))
  };
}

function tsToMillis(ts) {
  if (ts == null) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  return 0;
}

function strokeOrderTs(s) {
  return Number(s.clientTs || tsToMillis(s.ts) || 0);
}

let redrawPending = false;
function scheduleRedraw() {
  if (redrawPending) return;
  redrawPending = true;
  requestAnimationFrame(() => {
    redrawPending = false;
    redrawAll();
  });
}

function mostrarAviso(msg) {
  const ind = document.getElementById("save-indicator");
  if (!ind) return;
  const span = ind.querySelector("span");
  if (span) span.textContent = msg;
  ind.classList.add("visible");
  clearTimeout(ind._timeout);
  ind._timeout = setTimeout(() => {
    ind.classList.remove("visible");
    if (span) span.textContent = "Guardado";
  }, 2200);
}

function capasOrdenadas(tab = hojaActual) {
  const capas = layersBySheet[tab] || [];
  if (!capas.length) return [defaultLayer()];
  return [...capas].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

function capaActiva(tab = hojaActual) {
  const capas = capasOrdenadas(tab);
  return capas.find(c => c.id === activeLayerIds[tab] && c.visible !== false)
    || capas.find(c => c.visible !== false)
    || capas[0] || defaultLayer();
}

function capaIdDeTrazo(stroke) {
  if (stroke?.layerId) return stroke.layerId;
  const capas = capasOrdenadas();
  return capas.some(c => c.id === DEFAULT_LAYER_ID) ? DEFAULT_LAYER_ID : (capas[0]?.id || DEFAULT_LAYER_ID);
}

function capaBloqueada(layerId) {
  return capasOrdenadas().some(c => c.id === layerId && c.locked === true);
}

function actualizarVistaCanvas() {
  if (canvasSurface) canvasSurface.style.transform = `translate(${canvasView.x}px, ${canvasView.y}px) scale(${canvasView.scale})`;
  if (zoomValueEl) zoomValueEl.textContent = `${Math.round(canvasView.scale * 100)}%`;
}

function cambiarZoom(nuevoZoom, puntoCliente = null) {
  const zoomAnterior = canvasView.scale;
  const nuevo = Math.max(0.5, Math.min(4, nuevoZoom));
  if (nuevo === zoomAnterior) return;
  const rect = canvasWrapper.getBoundingClientRect();
  const centroX = rect.left + rect.width / 2;
  const centroY = rect.top + rect.height / 2;
  const px = puntoCliente?.x ?? centroX;
  const py = puntoCliente?.y ?? centroY;
  const anclaX = (px - centroX - canvasView.x) / zoomAnterior;
  const anclaY = (py - centroY - canvasView.y) / zoomAnterior;
  canvasView.scale = nuevo;
  canvasView.x = px - centroX - anclaX * nuevo;
  canvasView.y = py - centroY - anclaY * nuevo;
  actualizarVistaCanvas();
}

function restablecerVistaCanvas() {
  canvasView.scale = 1;
  canvasView.x = 0;
  canvasView.y = 0;
  actualizarVistaCanvas();
}

function cloneStroke(stroke) {
  return JSON.parse(JSON.stringify(stroke));
}

function getStrokeBounds(stroke) {
  if (!stroke) return null;
  if (stroke.type === "fill") {
    const r = Math.max(12, (stroke.size || 8) / 2);
    return { minX: stroke.x - r, minY: stroke.y - r, maxX: stroke.x + r, maxY: stroke.y + r };
  }
  const points = stroke.points || [];
  if (!points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const padding = Math.max(4, (stroke.size || 1) / 2);
  return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
}

function distanciaPuntoSegmento(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function hitTestStroke(point) {
  const rect = canvas.getBoundingClientRect();
  const tolerancia = Math.max(8, 16 * (W / Math.max(rect.width, 1)));
  const capas = capasOrdenadas().filter(c => c.visible !== false);
  for (const capa of capas) {
    const trazos = localStrokes
      .filter(s => capaIdDeTrazo(s) === capa.id)
      .sort((a, b) => strokeOrderTs(b) - strokeOrderTs(a));
    for (const stroke of trazos) {
      if (stroke.type === "fill") {
        if (Math.hypot(point.x - stroke.x, point.y - stroke.y) <= tolerancia * 1.5) return stroke;
        continue;
      }
      const pts = stroke.points || [];
      if (!pts.length) continue;
      const limite = tolerancia + (Number(stroke.size) || 1) / 2;
      if (pts.length === 1 && Math.hypot(point.x - pts[0].x, point.y - pts[0].y) <= limite) return stroke;
      for (let i = 1; i < pts.length; i++) {
        if (distanciaPuntoSegmento(point, pts[i - 1], pts[i]) <= limite) return stroke;
      }
    }
  }
  return null;
}

function actualizarUISeleccion() {
  const actions = document.getElementById("selection-actions");
  const label = document.getElementById("selection-label");
  const rawSelected = localStrokes.find(s => s.id === selectedStrokeId);
  const selectedLayer = rawSelected && capasOrdenadas().find(c => c.id === capaIdDeTrazo(rawSelected));
  const selected = rawSelected && selectedLayer?.visible !== false ? rawSelected : null;
  if (actions) actions.hidden = !selected;
  if (label && selected) label.textContent = selected.type === "fill" ? "Relleno seleccionado" : "Trazo seleccionado";
  const locked = selected ? capaBloqueada(capaIdDeTrazo(selected)) : false;
  const moveButton = document.getElementById("layer-move-selected");
  if (moveButton) moveButton.disabled = !layerMetadataReady[hojaActual] || !selected || locked || capaBloqueada(capaActiva().id);
  const addButton = document.getElementById("layer-add");
  if (addButton) addButton.disabled = !firebaseListo || !layerMetadataReady[hojaActual];
  const deleteButton = document.getElementById("btn-delete-selection");
  if (deleteButton) deleteButton.disabled = !selected || locked;
  const menuDeleteButton = document.getElementById("btn-menu-delete-selection");
  if (menuDeleteButton) menuDeleteButton.disabled = !selected || locked;
}

function actualizarCapasDocumentoRef(tab, layerId) {
  const docId = `${hoyISO()}-${tab}`;
  return doc(db, "parejas", PAREJA_ID, "dibujos", docId, "layers", layerId);
}

function estilosDeTrazo() {
  switch (herramienta) {
    case "borrador": return { color: COLOR_FONDO, ancho: tamanoActual * 1.8, alpha: 1 };
    case "marcador": return { color: colorActual, ancho: tamanoActual * 1.6, alpha: 0.55 };
    case "pincel":   return { color: colorActual, ancho: tamanoActual * 1.2, alpha: 0.85 };
    case "lapiz":
    default:         return { color: colorActual, ancho: tamanoActual, alpha: 1 };
  }
}

/* ============================================================
   CONVERSIONES DE COLOR
============================================================ */
function hsvToRgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h, s, v };
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function normalizarHex(hex) {
  if (!hex) return null;
  hex = String(hex).trim();
  if (!hex.startsWith("#")) hex = "#" + hex;
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    hex = "#" + hex[1]+hex[1] + hex[2]+hex[2] + hex[3]+hex[3];
  }
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return hex.toLowerCase();
}

/* ============================================================
   DIBUJO
============================================================ */
function drawStroke(stroke, targetCtx = ctx) {
  if (!stroke) return;

  if (stroke.type === "fill") {
    const key = stroke.clientId || stroke.id;
    let cached = fillCanvasCache.get(key);
    if (cached === undefined) {
      // 🛠️ FIX CRÍTICO: Pasamos "targetCtx" para que lea los bordes del lienzo donde se está dibujando
      cached = floodFillToCanvas(stroke.x, stroke.y, stroke.hex, targetCtx);
      fillCanvasCache.set(key, cached);
    }
    if (cached) targetCtx.drawImage(cached, 0, 0);
    return;
  }

  if (stroke.type === "clear") return;

  const pts = stroke.points;
  if (!pts || pts.length === 0) return;

  const isEraser = stroke.tool === "borrador";

  targetCtx.save();
  if (isEraser) {
    targetCtx.globalCompositeOperation = "destination-out";
    targetCtx.strokeStyle = "#000";
    targetCtx.fillStyle = "#000";
  } else {
    targetCtx.globalCompositeOperation = "source-over";
    targetCtx.strokeStyle = stroke.color;
    targetCtx.fillStyle = stroke.color;
  }

  targetCtx.lineWidth = stroke.size;
  targetCtx.lineCap = "round";
  targetCtx.lineJoin = "round";
  targetCtx.globalAlpha = stroke.alpha ?? 1;

  if (pts.length === 1) {
    targetCtx.beginPath();
    targetCtx.arc(pts[0].x, pts[0].y, stroke.size / 2, 0, Math.PI * 2);
    targetCtx.fill();
  } else {
    targetCtx.beginPath();
    targetCtx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) targetCtx.lineTo(pts[i].x, pts[i].y);
    targetCtx.stroke();
  }
  targetCtx.restore();
}

function redrawAll() {
  pintarFondo();
  const capas = capasOrdenadas();
  const ids = new Set(capas.map(c => c.id));

  const porCapa = new Map();
  for (const s of localStrokes) {
    const lid = capaIdDeTrazo(s);
    if (!porCapa.has(lid)) porCapa.set(lid, []);
    porCapa.get(lid).push(s);
  }
  for (const arr of porCapa.values()) {
    arr.sort((a, b) => strokeOrderTs(a) - strokeOrderTs(b));
  }

  const tCtx = getTempLayer();

  for (const capa of [...capas].reverse()) {
    if (capa.visible === false) continue;
    
    tCtx.clearRect(0, 0, W, H);
    (porCapa.get(capa.id) || []).forEach(s => drawStroke(s, tCtx));
    ctx.drawImage(tCtx.canvas, 0, 0);
  }
  
  for (const [lid, arr] of porCapa) {
    if (!ids.has(lid)) {
      tCtx.clearRect(0, 0, W, H);
      arr.forEach(s => drawStroke(s, tCtx));
      ctx.drawImage(tCtx.canvas, 0, 0);
    }
  }

  if (currentStroke && !capaBloqueada(currentStroke.layerId || capaActiva().id)) {
    tCtx.clearRect(0, 0, W, H);
    drawStroke(currentStroke, tCtx);
    ctx.drawImage(tCtx.canvas, 0, 0);
  }

  drawSelectionOverlay();
}

function drawSelectionOverlay() {
  const stroke = localStrokes.find(s => s.id === selectedStrokeId);
  const layer = stroke && capasOrdenadas().find(c => c.id === capaIdDeTrazo(stroke));
  const bounds = getStrokeBounds(stroke);
  if (!stroke || !bounds || layer?.visible === false) return;
  const rect = canvas.getBoundingClientRect();
  const unit = W / Math.max(rect.width, 1);
  const handle = 9 * unit;
  ctx.save();
  ctx.strokeStyle = "#b58a5a";
  ctx.fillStyle = "#fff7e8";
  ctx.lineWidth = 2 * unit;
  ctx.setLineDash([7 * unit, 5 * unit]);
  ctx.strokeRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  ctx.setLineDash([]);
  ctx.fillStyle = "#fff7e8";
  ctx.strokeStyle = "#8c5b34";
  if (stroke.type !== "fill") {
    [[bounds.minX,bounds.minY],[bounds.maxX,bounds.minY],[bounds.minX,bounds.maxY],[bounds.maxX,bounds.maxY]].forEach(([x,y]) => {
      ctx.beginPath();
      ctx.rect(x - handle/2, y - handle/2, handle, handle);
      ctx.fill();
      ctx.stroke();
    });
  }
  ctx.restore();
}

/* ============================================================
   FLOOD FILL (BOTE DE PINTURA)
============================================================ */
function floodFillToCanvas(startX, startY, fillColorHex, sourceCtx = ctx) {
  if (startX < 0 || startY < 0 || startX >= W || startY >= H) return null;

  // 🛠️ FIX: Leemos desde el lienzo fuente (puede ser el temporal o el principal)
  const imgData = sourceCtx.getImageData(0, 0, W, H);
  const src = imgData.data;

  const idx = (startY * W + startX) * 4;
  const sr = src[idx], sg = src[idx + 1], sb = src[idx + 2], sa = src[idx + 3];

  const rgbFill = hexToRgb(fillColorHex);
  if (!rgbFill) return null;
  const fr = rgbFill.r, fg = rgbFill.g, fb = rgbFill.b;
  if (sr === fr && sg === fg && sb === fb && sa === 255) return null;

  const tol = 35;
  const dentro = (i) =>
    Math.abs(src[i] - sr) <= tol &&
    Math.abs(src[i + 1] - sg) <= tol &&
    Math.abs(src[i + 2] - sb) <= tol &&
    Math.abs(src[i + 3] - sa) <= tol;

  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const outCtx = out.getContext("2d");
  const outData = outCtx.createImageData(W, H);
  const dst = outData.data;

  const stack = [[startX, startY]];
  const visitados = new Uint8Array(W * H);
  let count = 0;

  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const pos = y * W + x;
    if (visitados[pos]) continue;
    visitados[pos] = 1;
    const i = pos * 4;
    if (!dentro(i)) continue;
    dst[i] = fr; dst[i + 1] = fg; dst[i + 2] = fb; dst[i + 3] = 255;
    count++;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  if (!count) return null;
  outCtx.putImageData(outData, 0, 0);
  return out;
}

async function guardarRelleno(x, y, hex) {
  const capa = capaActiva();
  if (capa.locked || capa.visible === false) return;

  const clientId = (crypto.randomUUID?.() ?? `c${Date.now()}${Math.random().toString(36).slice(2,8)}`);
  const localId = "fill-" + clientId;

  // Aquí lee del ctx principal, que tiene todos los trazos ya dibujados
  const fillCanvas = floodFillToCanvas(x, y, hex, ctx);
  if (!fillCanvas) return;
  fillCanvasCache.set(clientId, fillCanvas);

  const localStroke = {
    id: localId,
    clientId,
    type: "fill",
    x, y, hex,
    layerId: capa.id,
    author: myUid,
    ts: Date.now()
  };
  localStrokes.push(localStroke);
  scheduleRedraw();

  if (!firebaseListo || !strokesRefs[hojaActual]) return;

  try {
    await addDoc(strokesRefs[hojaActual], {
      type: "fill",
      x, y, hex,
      layerId: capa.id,
      author: myUid,
      clientId,
      clientTs: localStroke.ts,
      ts: serverTimestamp()
    });
    mostrarGuardado();
    programarGuardarThumbnail();
  } catch (err) {
    console.error("❌ Error guardando relleno:", err);
    localStrokes = localStrokes.filter(s => s.id !== localId);
    fillCanvasCache.delete(clientId);
    scheduleRedraw();
  }
}

/* ============================================================
   POINTER EVENTS, PINCH-ZOOM Y SELECCIÓN
============================================================ */
function cancelarInteraccionParaGesto() {
  if (selectionDragState) {
    const original = selectionDragState.original;
    const idx = localStrokes.findIndex(s => s.id === original.id);
    if (idx >= 0) localStrokes[idx] = cloneStroke(original);
  }
  selectionDragState = null;
  dibujando = false;
  activeDrawPointerId = null;
  currentStroke = null;
  pendingBucketTap = null;
  scheduleRedraw();
}

function comenzarGestoDosDedos() {
  const pts = [...touchPointers.values()].slice(0, 2);
  if (pts.length < 2) return;
  cancelarInteraccionParaGesto();
  gestureActive = true;
  const rect = canvasWrapper.getBoundingClientRect();
  const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const midpoint = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  gestureStart = {
    distance: Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)),
    scale: canvasView.scale,
    panX: canvasView.x,
    panY: canvasView.y,
    center,
    anchorX: (midpoint.x - center.x - canvasView.x) / canvasView.scale,
    anchorY: (midpoint.y - center.y - canvasView.y) / canvasView.scale
  };
}

function actualizarGestoDosDedos() {
  if (!gestureActive || touchPointers.size < 2 || !gestureStart) return;
  const pts = [...touchPointers.values()].slice(0, 2);
  const distance = Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
  const midpoint = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  const nextScale = Math.max(0.5, Math.min(4, gestureStart.scale * distance / gestureStart.distance));
  canvasView.scale = nextScale;
  canvasView.x = midpoint.x - gestureStart.center.x - gestureStart.anchorX * nextScale;
  canvasView.y = midpoint.y - gestureStart.center.y - gestureStart.anchorY * nextScale;
  actualizarVistaCanvas();
}

function comenzarTrazo(e, point) {
  const capa = capaActiva();
  if (capa.locked) {
    mostrarAviso(`La capa “${capa.name}” está bloqueada.`);
    return;
  }
  if (capa.visible === false) {
    mostrarAviso(`La capa “${capa.name}” está oculta. Actívala para dibujar.`);
    return;
  }
  canvas.setPointerCapture?.(e.pointerId);
  activeDrawPointerId = e.pointerId;
  dibujando = true;
  const s = estilosDeTrazo();
  currentStroke = {
    points: [point],
    color: colorActual,
    size: s.ancho,
    tool: herramienta,
    alpha: s.alpha,
    layerId: capa.id,
    author: myUid,
    ts: Date.now()
  };
  redrawAll();
}

function iniciarSeleccion(e, point) {
  const selected = localStrokes.find(s => s.id === selectedStrokeId);
  const rect = canvas.getBoundingClientRect();
  const hitTolerance = Math.max(10, 12 * (W / Math.max(rect.width, 1)));
  const bounds = getStrokeBounds(selected);
  const handles = bounds && selected?.type !== "fill" ? [
    { id: "nw", x: bounds.minX, y: bounds.minY, anchorX: bounds.maxX, anchorY: bounds.maxY },
    { id: "ne", x: bounds.maxX, y: bounds.minY, anchorX: bounds.minX, anchorY: bounds.maxY },
    { id: "sw", x: bounds.minX, y: bounds.maxY, anchorX: bounds.maxX, anchorY: bounds.minY },
    { id: "se", x: bounds.maxX, y: bounds.maxY, anchorX: bounds.minX, anchorY: bounds.minY }
  ] : [];
  const resizeHandle = handles.find(h => Math.hypot(point.x - h.x, point.y - h.y) <= hitTolerance * 1.7);

  if (resizeHandle) {
    if (capaBloqueada(capaIdDeTrazo(selected))) return;
    selectionDragState = { pointerId: e.pointerId, mode: "resize", handle: resizeHandle, original: cloneStroke(selected), start: point, changed: false };
    canvas.setPointerCapture?.(e.pointerId);
    return;
  }

  const hit = hitTestStroke(point);
  selectedStrokeId = hit?.id || null;
  actualizarUISeleccion();
  if (hit && !capaBloqueada(capaIdDeTrazo(hit))) {
    selectionDragState = { pointerId: e.pointerId, mode: "move", original: cloneStroke(hit), start: point, changed: false };
    canvas.setPointerCapture?.(e.pointerId);
  } else {
    selectionDragState = null;
  }
  scheduleRedraw();
}

function actualizarSeleccionArrastrada(point) {
  const state = selectionDragState;
  if (!state) return;
  const original = state.original;
  const idx = localStrokes.findIndex(s => s.id === original.id);
  if (idx < 0) return;
  const dx = point.x - state.start.x;
  const dy = point.y - state.start.y;
  const changed = cloneStroke(original);

  if (state.mode === "move") {
    if (changed.type === "fill") {
      changed.x = original.x + dx;
      changed.y = original.y + dy;
    } else {
      changed.points = original.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
    }
  } else if (state.mode === "resize" && changed.points?.length) {
    const bounds = getStrokeBounds(original);
    const handle = state.handle;
    const anchorX = handle?.anchorX ?? bounds.minX;
    const anchorY = handle?.anchorY ?? bounds.minY;
    const baseHandleX = handle?.x ?? bounds.maxX;
    const baseHandleY = handle?.y ?? bounds.maxY;
    const baseDx = baseHandleX - anchorX || 1;
    const baseDy = baseHandleY - anchorY || 1;
    const sx = Math.max(0.1, (point.x - anchorX) / baseDx);
    const sy = Math.max(0.1, (point.y - anchorY) / baseDy);
    changed.points = original.points.map(p => ({
      ...p,
      x: anchorX + (p.x - anchorX) * sx,
      y: anchorY + (p.y - anchorY) * sy
    }));
    changed.size = Math.max(1, (original.size || 1) * Math.max(0.1, (sx + sy) / 2));
  }
  localStrokes[idx] = changed;
  state.changed = true;
  scheduleRedraw();
}

async function guardarTrazoModificado(state) {
  if (!state?.changed) return;
  
  // 🛠️ FIX: Al mover o redimensionar un trazo, limpiamos la caché de rellenos
  // para que los colores se adapten al nuevo espacio.
  fillCanvasCache.clear();

  const stroke = localStrokes.find(s => s.id === state.original.id);
  if (!stroke) return;
  const patch = { layerId: capaIdDeTrazo(stroke) };
  if (stroke.type === "fill") {
    patch.x = stroke.x;
    patch.y = stroke.y;
  } else {
    patch.points = stroke.points;
    patch.size = stroke.size;
  }
  if (!firebaseListo || !strokesRefs[hojaActual] || String(stroke.id).startsWith("local-") || String(stroke.id).startsWith("fill-")) {
    mostrarGuardado();
    return;
  }
  try {
    await updateDoc(doc(strokesRefs[hojaActual], stroke.id), patch);
    mostrarGuardado();
    programarGuardarThumbnail();
  } catch (err) {
    console.error("Error actualizando el trazo seleccionado:", err);
    const idx = localStrokes.findIndex(s => s.id === state.original.id);
    if (idx >= 0) localStrokes[idx] = cloneStroke(state.original);
    scheduleRedraw();
  }
}

async function eliminarSeleccion() {
  const selected = localStrokes.find(s => s.id === selectedStrokeId);
  if (!selected || capaBloqueada(capaIdDeTrazo(selected))) return;
  
  // 🛠️ FIX: Si borramos un trazo, cualquier relleno pudo haber cambiado su forma, limpiamos caché
  if (selected.type !== "fill") fillCanvasCache.clear();

  if (String(selected.id).startsWith("local-") || String(selected.id).startsWith("fill-") || !firebaseListo || !strokesRefs[hojaActual]) {
    localStrokes = localStrokes.filter(s => s.id !== selected.id);
    if (selected.type === "fill") fillCanvasCache.delete(selected.clientId || selected.id);
    selectedStrokeId = null;
    actualizarUISeleccion();
    scheduleRedraw();
    return;
  }
  try {
    await deleteDoc(doc(strokesRefs[hojaActual], selected.id));
    if (selected.type === "fill") fillCanvasCache.delete(selected.clientId || selected.id);
    selectedStrokeId = null;
    actualizarUISeleccion();
    scheduleRedraw();
    mostrarGuardado();
    programarGuardarThumbnail();
  } catch (err) {
    console.error("Error eliminando selección:", err);
  }
}

document.addEventListener("gesturestart", e => { if (!canvas.contains(e.target)) e.preventDefault(); }, { passive: false });
document.addEventListener("gesturechange", e => { if (!canvas.contains(e.target)) e.preventDefault(); }, { passive: false });
document.addEventListener("gestureend", e => { if (!canvas.contains(e.target)) e.preventDefault(); }, { passive: false });
canvas.addEventListener("dblclick", e => e.preventDefault());

canvas.addEventListener("pointerdown", e => {
  cerrarTodosLosMenus();
  try { canvas.setPointerCapture?.(e.pointerId); } catch (_) {}

  if (e.pointerType === "touch") {
    touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchPointers.size >= 2) {
      comenzarGestoDosDedos();
      e.preventDefault();
      return;
    }
    if (gestureActive) { e.preventDefault(); return; }
  } else if (gestureActive) {
    e.preventDefault();
    return;
  }

  const point = getPos(e);
  if (herramienta === "bote") {
    pendingBucketTap = { pointerId: e.pointerId, point, pointerType: e.pointerType };
    e.preventDefault();
    return;
  }
  if (herramienta === "seleccionar") {
    iniciarSeleccion(e, point);
    e.preventDefault();
    return;
  }
  comenzarTrazo(e, point);
  e.preventDefault();
});

canvas.addEventListener("pointermove", e => {
  if (e.pointerType === "touch" && touchPointers.has(e.pointerId)) {
    touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gestureActive) {
      actualizarGestoDosDedos();
      e.preventDefault();
      return;
    }
  }
  if (gestureActive) { e.preventDefault(); return; }

  if (selectionDragState && selectionDragState.pointerId === e.pointerId) {
    actualizarSeleccionArrastrada(getPos(e));
    e.preventDefault();
    return;
  }

  if (!dibujando || !currentStroke || activeDrawPointerId !== e.pointerId) return;
  const p = getPos(e);
  const prev = currentStroke.points[currentStroke.points.length - 1];
  currentStroke.points.push(p);

  const isEraser = currentStroke.tool === "borrador";
  ctx.save();
  if (isEraser) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "#000";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = currentStroke.color;
  }
  ctx.lineWidth = currentStroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = currentStroke.alpha ?? 1;
  ctx.beginPath();
  ctx.moveTo(prev.x, prev.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.restore();
  
  drawSelectionOverlay();
  e.preventDefault();
});

async function terminarTrazo() {
  if (!dibujando || !currentStroke) return;
  dibujando = false;
  activeDrawPointerId = null;
  const strokeToSave = currentStroke;
  const capa = capasOrdenadas().find(c => c.id === strokeToSave.layerId);

  if (capa?.locked) {
    mostrarAviso("La capa se bloqueó mientras dibujabas. Trazo descartado.");
    currentStroke = null;
    scheduleRedraw();
    return;
  }

  const clientId = (crypto.randomUUID?.() ?? `c${Date.now()}${Math.random().toString(36).slice(2,8)}`);
  const localId = "local-" + clientId;
  localStrokes.push({ id: localId, clientId, ...strokeToSave });
  currentStroke = null;
  scheduleRedraw();

  if (!firebaseListo || !strokesRefs[hojaActual]) return;

  try {
    await addDoc(strokesRefs[hojaActual], {
      points: strokeToSave.points,
      color: strokeToSave.color,
      size: strokeToSave.size,
      tool: strokeToSave.tool,
      alpha: strokeToSave.alpha,
      layerId: strokeToSave.layerId || capaActiva().id,
      author: strokeToSave.author,
      clientId,
      clientTs: strokeToSave.ts,
      ts: serverTimestamp()
    });
    programarGuardarThumbnail();
  } catch (err) {
    console.error("❌ Error guardando trazo:", err);
    localStrokes = localStrokes.filter(s => s.id !== localId);
    scheduleRedraw();
  }
}

function finalizarSeleccion() {
  const state = selectionDragState;
  selectionDragState = null;
  if (state) guardarTrazoModificado(state);
}

function finalizarPuntero(e, cancelado = false) {
  if (e.pointerType === "touch" && touchPointers.has(e.pointerId)) {
    touchPointers.delete(e.pointerId);
    if (gestureActive) {
      if (touchPointers.size === 0) {
        gestureActive = false;
        gestureStart = null;
      }
      e.preventDefault();
      return;
    }
  }

  if (gestureActive) return;
  if (pendingBucketTap?.pointerId === e.pointerId) {
    const tap = pendingBucketTap;
    pendingBucketTap = null;
    if (!cancelado) {
      const capa = capaActiva();
      if (!capa.locked && capa.visible !== false) {
        guardarRelleno(Math.round(tap.point.x), Math.round(tap.point.y), colorActual);
      }
    }
  }
  if (selectionDragState?.pointerId === e.pointerId) {
    if (cancelado) {
      const original = selectionDragState.original;
      const idx = localStrokes.findIndex(s => s.id === original.id);
      if (idx >= 0) localStrokes[idx] = cloneStroke(original);
      selectionDragState = null;
      scheduleRedraw();
    } else {
      finalizarSeleccion();
    }
  }
  if (activeDrawPointerId === e.pointerId) {
    if (cancelado) {
      dibujando = false;
      activeDrawPointerId = null;
      currentStroke = null;
      scheduleRedraw();
    } else {
      terminarTrazo();
    }
  }
  if (e.pointerType === "touch") touchPointers.delete(e.pointerId);
  e.preventDefault?.();
}

canvas.addEventListener("pointerup", e => finalizarPuntero(e, false));
canvas.addEventListener("pointercancel", e => finalizarPuntero(e, true));
canvas.addEventListener("lostpointercapture", e => {
  if (e.pointerType === "touch" && touchPointers.has(e.pointerId)) finalizarPuntero(e, true);
});

/* ============================================================
   TABS
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
  if (unsubscribers[hojaActual]) {
    unsubscribers[hojaActual]();
    unsubscribers[hojaActual] = null;
  }
  if (layerUnsubscribers[hojaActual]) {
    layerUnsubscribers[hojaActual]();
    layerUnsubscribers[hojaActual] = null;
  }

  hojaActual = nuevaHoja;
  selectedStrokeId = null;
  selectionDragState = null;
  pendingBucketTap = null;
  touchPointers.clear();
  gestureActive = false;
  gestureStart = null;
  actualizarUISeleccion();

  tabsHoja.forEach(t =>
    t.classList.toggle("active", parseInt(t.dataset.hoja, 10) === nuevaHoja)
  );

  localStrokes = [];
  currentStroke = null;
  fillCanvasCache.clear();
  actualizarUISeleccion();
  renderLayersPanel();

  pintarFondo();
  scheduleRedraw();

  if (firebaseListo) {
    suscribirHoja(hojaActual);
    suscribirCapas(hojaActual);
  }

  publicarPresencia();
  actualizarBanana();
}

/* ============================================================
   PALETA RÁPIDA (lápices de colores)
============================================================ */
const COLORES = [
  "#3b322b", "#7d6c5c", "#b58a5a", "#d9a86c",
  "#e88a7a", "#e8b07a", "#f4d03f", "#a8c66c",
  "#7da654", "#7cc0d4", "#5b8fb0", "#8b6cb0",
  "#e88ea7", "#c9524a", "#ffffff", "#000000"
];

const lapicesEl = document.getElementById("lapices");
function renderLapices() {
  if (!lapicesEl) return;
  lapicesEl.innerHTML = "";
  COLORES.forEach(hex => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lapiz" + (hex === colorActual ? " active" : "");
    btn.dataset.color = hex;
    btn.innerHTML = `
      <div class="cuerpo" style="background:${hex};"></div>
      <div class="punta"></div>
      <div class="grafito" style="border-bottom-color:${hex};"></div>
    `;
    btn.addEventListener("click", () => seleccionarColor(hex, btn));
    lapicesEl.appendChild(btn);
  });
}

function seleccionarColor(hex, btnEl) {
  colorActual = hex;
  if (herramienta !== "borrador" && herramienta !== "bote") {
    herramienta = "lapiz";
    actualizarBotonLapicesActivo();
  }
  document.querySelectorAll(".lapiz").forEach(l => l.classList.remove("active"));
  btnEl?.classList.add("active");
}

renderLapices();

/* ============================================================
   MENÚS DESPLEGABLES — Lápices y Acciones
============================================================ */
const ICONOS_TOOL = {
  lapiz:    '<svg viewBox="0 0 24 24"><path d="M12 19l7-7 3 3-7 7-3-3z" fill="currentColor"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" fill="currentColor"/></svg>',
  marcador: '<svg viewBox="0 0 24 24"><path d="M15 3l6 6-9 9H6v-6l9-9z" fill="currentColor"/><rect x="3" y="19" width="18" height="2" rx="1" fill="currentColor"/></svg>',
  pincel:   '<svg viewBox="0 0 24 24"><path d="M9.5 14.5c-1 2-3 3.5-6 4 2-3 3.5-5 5.5-6l.5 2z" fill="currentColor"/><path d="M14 10l-4 4-1-1 4-4c1-1 3-3 5-5 1.5-1.5 3-2 4-1 1 1 .5 2.5-1 4-2 2-4 4-5 3z" fill="currentColor"/></svg>',
  borrador: '<svg viewBox="0 0 24 24"><path d="M20 20H7L3 16a2 2 0 010-3L14 2l8 8-7 7" fill="currentColor"/></svg>',
  bote:     '<svg viewBox="0 0 24 24"><path d="M18 4l-1.5-1.5a1 1 0 00-1.4 0L4 13.5V17l8-8 4 4-8 8h3.5l10.5-10.5a1 1 0 000-1.4L18 4z" fill="currentColor"/><path d="M20 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" fill="currentColor"/></svg>',
  seleccionar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l14 10-6 1-3 6-5-17z"/><path d="M13 15l5 5"/></svg>'
};

const NOMBRES_TOOL = {
  lapiz:    "Lápiz",
  marcador: "Marcador",
  pincel:   "Pincel",
  borrador: "Borrador",
  bote:     "Bote",
  seleccionar: "Seleccionar"
};

const btnLapices     = document.getElementById("btn-lapices");
const btnLapicesIcon = document.getElementById("btn-lapices-icono");
const btnLapicesTxt  = document.getElementById("btn-lapices-texto");
const menuLapices    = document.getElementById("menu-lapices");

const btnAcciones    = document.getElementById("btn-acciones");
const menuAcciones   = document.getElementById("menu-acciones");

function cerrarTodosLosMenus() {
  menuLapices?.classList.remove("abierto");
  btnLapices?.classList.remove("abierto");
  menuAcciones?.classList.remove("abierto");
  btnAcciones?.classList.remove("abierto");
  btnLapices?.setAttribute("aria-expanded", "false");
  btnAcciones?.setAttribute("aria-expanded", "false");
}

btnLapices?.addEventListener("click", e => {
  e.stopPropagation();
  const abierto = menuLapices?.classList.contains("abierto");
  cerrarTodosLosMenus();
  if (!abierto) {
    menuLapices?.classList.add("abierto");
    btnLapices?.classList.add("abierto");
    btnLapices?.setAttribute("aria-expanded", "true");
  }
});

btnAcciones?.addEventListener("click", e => {
  e.stopPropagation();
  const abierto = menuAcciones?.classList.contains("abierto");
  cerrarTodosLosMenus();
  if (!abierto) {
    menuAcciones?.classList.add("abierto");
    btnAcciones?.classList.add("abierto");
    btnAcciones?.setAttribute("aria-expanded", "true");
  }
});

document.addEventListener("click", e => {
  if (!e.target.closest(".bloque-menu")) {
    cerrarTodosLosMenus();
  }
});

function actualizarBotonLapicesActivo() {
  document.querySelectorAll(".tool-item").forEach(item => {
    item.classList.toggle("active", item.dataset.tool === herramienta);
  });
  if (btnLapicesIcon) btnLapicesIcon.innerHTML = ICONOS_TOOL[herramienta] || "";
  if (btnLapicesTxt)  btnLapicesTxt.textContent = NOMBRES_TOOL[herramienta] || "Lápiz";
  actualizarUISeleccion();
}

document.querySelectorAll(".tool-item").forEach(item => {
  item.addEventListener("click", () => {
    const tool = item.dataset.tool;
    herramienta = tool;
    actualizarBotonLapicesActivo();

    if (tool === "borrador" || tool === "bote" || tool === "seleccionar") {
      document.querySelectorAll(".lapiz").forEach(l => l.classList.remove("active"));
    } else {
      const match = [...document.querySelectorAll(".lapiz")].find(l => l.dataset.color === colorActual);
      match?.classList.add("active");
    }
    cerrarTodosLosMenus();
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
   DESHACER
============================================================ */
document.getElementById("btn-undo")?.addEventListener("click", async () => {
  cerrarTodosLosMenus();

  const misTrazos = localStrokes
    .filter(s => s.author === myUid)
    .sort((a, b) => strokeOrderTs(b) - strokeOrderTs(a));
  if (!misTrazos.length) return;
  const ultimo = misTrazos[0];

  if (String(ultimo.id).startsWith("local-") || String(ultimo.id).startsWith("fill-")) {
    localStrokes = localStrokes.filter(s => s.id !== ultimo.id);
    if (ultimo.type === "fill") fillCanvasCache.delete(ultimo.clientId || ultimo.id);
    else fillCanvasCache.clear(); // Por si deshacemos un trazo que era límite
    scheduleRedraw();
    mostrarGuardado();
    return;
  }

  if (!firebaseListo || !strokesRefs[hojaActual]) return;
  try {
    await deleteDoc(doc(strokesRefs[hojaActual], ultimo.id));
    if (ultimo.type === "fill") fillCanvasCache.delete(ultimo.clientId || ultimo.id);
    else fillCanvasCache.clear();
    mostrarGuardado();
    programarGuardarThumbnail(500);
  } catch (err) {
    console.error("❌ Error borrando trazo:", err);
  }
});

/* ============================================================
   LIMPIAR
============================================================ */
document.getElementById("btn-clear")?.addEventListener("click", async () => {
  cerrarTodosLosMenus();
  if (!confirm("¿Borrar todo el dibujo de esta hoja?")) return;

  localStrokes = [];
  selectedStrokeId = null;
  fillCanvasCache.clear();
  actualizarUISeleccion();
  scheduleRedraw();

  if (!firebaseListo || !strokesRefs[hojaActual]) {
    mostrarAviso("Borrado local. Conéctate a internet para sincronizar.");
    programarGuardarThumbnail(500);
    return;
  }
  try {
    await addDoc(strokesRefs[hojaActual], {
      type: "clear",
      author: myUid,
      clientTs: Date.now(),
      ts: serverTimestamp()
    });
    programarGuardarThumbnail(500);
  } catch (err) {
    console.error("Error borrando todo:", err);
  }
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
  if (lapicesEl) {
    requestAnimationFrame(() => { lapicesEl.scrollLeft = 0; });
  }
}
function cerrarDrawer() {
  panelHerramientas?.classList.remove("abierto");
  drawerOverlay?.classList.remove("visible");
}
btnToolsMobile?.addEventListener("click", abrirDrawer);
drawerCerrar?.addEventListener("click", cerrarDrawer);
drawerOverlay?.addEventListener("click", cerrarDrawer);

/* ============================================================
   ADMINISTRACIÓN DE CAPAS
============================================================ */
const layersOverlay = document.getElementById("layers-overlay");
const layersListEl = document.getElementById("layers-list");
const layersStatusEl = document.getElementById("layers-status");

function abrirPanelCapas() {
  renderLayersPanel();
  if (layersOverlay) layersOverlay.hidden = false;
}
function cerrarPanelCapas() {
  if (layersOverlay) layersOverlay.hidden = true;
}

function actualizarCapaEnFirebase(layerId, patch, tab = hojaActual) {
  if (!firebaseListo) {
    layersStatusEl && (layersStatusEl.textContent = "Firebase aún no está conectado.");
    return Promise.reject(new Error("Firebase no está conectado"));
  }
  return updateDoc(actualizarCapasDocumentoRef(tab, layerId), patch);
}

function renderLayersPanel() {
  if (!layersListEl) return;

  const capas = capasOrdenadas();
  const activo = capaActiva().id;
  const selected = localStrokes.find(s => s.id === selectedStrokeId);

  const moveButton = document.getElementById("layer-move-selected");
  if (moveButton) moveButton.disabled = !selected || capaBloqueada(activo);

  if (layersStatusEl && !layersStatusEl.textContent.includes("No se pudieron")) {
    const active = capaActiva();
    layersStatusEl.textContent = `Activa: ${active.name}. Las capas ocultas no se dibujan; las bloqueadas no se pueden editar.`;
  }

  const sig = JSON.stringify({
    capas: capas.map(c => [c.id, c.name, c.visible !== false, c.locked === true, c.order]),
    activo,
    selectedId: selectedStrokeId || "",
    ready: layerMetadataReady[hojaActual],
    counts: capas.map(c => localStrokes.filter(s => capaIdDeTrazo(s) === c.id).length)
  });
  if (sig === layersPanelSignature) return;
  layersPanelSignature = sig;

  layersListEl.innerHTML = "";

  capas.forEach((capa, index) => {
    const row = document.createElement("div");
    row.className = "layer-row" + (capa.id === capaActiva().id ? " active" : "");

    const main = document.createElement("button");
    main.type = "button";
    main.className = "layer-main";
    main.title = "Activar esta capa";
    const indicator = document.createElement("span");
    indicator.className = "layer-indicator";
    const copy = document.createElement("span");
    copy.className = "layer-main-copy";
    const name = document.createElement("strong");
    name.textContent = capa.name || `Capa ${index + 1}`;
    const count = localStrokes.filter(s => capaIdDeTrazo(s) === capa.id).length;
    const details = document.createElement("small");
    details.textContent = `${count} elemento${count === 1 ? "" : "s"} · ${capa.visible === false ? "Oculta" : "Visible"}${capa.locked ? " · Bloqueada" : ""}`;
    copy.append(name, details);
    main.append(indicator, copy);
    main.addEventListener("click", () => {
      activeLayerIds[hojaActual] = capa.id;
      renderLayersPanel();
      actualizarUISeleccion();
      scheduleRedraw();
    });

    const actions = document.createElement("div");
    actions.className = "layer-actions";
    const makeAction = (label, title, action, disabled = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.title = title;
      b.setAttribute("aria-label", `${title}: ${capa.name || `Capa ${index + 1}`}`);
      b.disabled = disabled || !layerMetadataReady[hojaActual];
      b.addEventListener("click", action);
      return b;
    };
    actions.append(
      makeAction(capa.visible === false ? "◌" : "◉", capa.visible === false ? "Mostrar capa" : "Ocultar capa", async () => {
        try { await actualizarCapaEnFirebase(capa.id, { visible: capa.visible === false }); }
        catch (err) { console.error("Error cambiando visibilidad:", err); }
      }),
      makeAction(capa.locked ? "🔒" : "🔓", capa.locked ? "Desbloquear capa" : "Bloquear capa", async () => {
        try { await actualizarCapaEnFirebase(capa.id, { locked: !capa.locked }); }
        catch (err) { console.error("Error cambiando bloqueo:", err); }
      }),
      makeAction("✎", "Renombrar capa", async () => {
        const nuevoNombre = prompt("Nombre de la capa:", capa.name || `Capa ${index + 1}`);
        if (!nuevoNombre?.trim()) return;
        try { await actualizarCapaEnFirebase(capa.id, { name: nuevoNombre.trim().slice(0, 40) }); }
        catch (err) { console.error("Error renombrando capa:", err); }
      }),
      makeAction("↑", "Subir capa", () => reordenarCapa(capa.id, -1), index === 0),
      makeAction("↓", "Bajar capa", () => reordenarCapa(capa.id, 1), index === capas.length - 1),
      makeAction("×", "Eliminar capa", () => eliminarCapa(capa), capas.length <= 1)
    );
    row.append(main, actions);
    layersListEl.appendChild(row);
  });
}

async function crearCapa() {
  if (!firebaseListo || !layerMetadataReady[hojaActual]) {
    if (layersStatusEl) layersStatusEl.textContent = "Conectando con Firebase… espera un momento para crear capas sincronizadas.";
    return;
  }
  const capas = capasOrdenadas();
  const id = `capa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const name = `Capa ${capas.length + 1}`;
  try {
    await runTransaction(db, async (tx) => {
      capas.forEach(c =>
        tx.update(actualizarCapasDocumentoRef(hojaActual, c.id), {
          order: (Number(c.order) || 0) + 1
        })
      );
      tx.set(actualizarCapasDocumentoRef(hojaActual, id), {
        name, order: 0, visible: true, locked: false, author: myUid, ts: Date.now()
      });
    });
    activeLayerIds[hojaActual] = id;
    if (layersStatusEl) layersStatusEl.textContent = `Se creó “${name}”.`;
  } catch (err) {
    console.error("Error creando capa:", err);
    if (layersStatusEl) layersStatusEl.textContent = "No se pudo crear la capa. Revisa los permisos de Firebase.";
  }
}

async function reordenarCapa(layerId, direction) {
  const capas = capasOrdenadas();
  const index = capas.findIndex(c => c.id === layerId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= capas.length) return;

  const nuevo = [...capas];
  [nuevo[index], nuevo[next]] = [nuevo[next], nuevo[index]];

  try {
    await runTransaction(db, async (tx) => {
      nuevo.forEach((c, i) => {
        if (Number(c.order) !== i) {
          tx.update(actualizarCapasDocumentoRef(hojaActual, c.id), { order: i });
        }
      });
    });
  } catch (err) {
    console.error("Error reordenando capas:", err);
    if (layersStatusEl) layersStatusEl.textContent = "No se pudo cambiar el orden de las capas.";
  }
}

async function eliminarCapa(capa) {
  const capas = capasOrdenadas();
  if (capas.length <= 1) return;
  const destino = capas.find(c => c.id !== capa.id);
  const elementos = localStrokes.filter(s => capaIdDeTrazo(s) === capa.id);
  if (elementos.length && !confirm(`La capa “${capa.name}” tiene ${elementos.length} elemento(s). ¿Moverlos a “${destino.name}” y eliminar la capa?`)) return;
  try {
    for (const stroke of elementos) {
      if (String(stroke.id).startsWith("local-") || String(stroke.id).startsWith("fill-")) {
        stroke.layerId = destino.id;
      } else {
        await updateDoc(doc(strokesRefs[hojaActual], stroke.id), { layerId: destino.id });
        stroke.layerId = destino.id;
      }
    }
    for (const s of elementos) {
      if (s.type === "fill") fillCanvasCache.delete(s.clientId || s.id);
    }
    await deleteDoc(actualizarCapasDocumentoRef(hojaActual, capa.id));
    if (activeLayerIds[hojaActual] === capa.id) activeLayerIds[hojaActual] = destino.id;
    renderLayersPanel();
    scheduleRedraw();
  } catch (err) {
    console.error("Error eliminando capa:", err);
    if (layersStatusEl) layersStatusEl.textContent = "No se pudo eliminar la capa. Revisa la conexión con Firebase.";
  }
}

async function moverSeleccionACapaActiva() {
  const selected = localStrokes.find(s => s.id === selectedStrokeId);
  const capa = capaActiva();
  if (!selected || capa.locked || capaBloqueada(capaIdDeTrazo(selected))) return;
  if (capaIdDeTrazo(selected) === capa.id) {
    if (layersStatusEl) layersStatusEl.textContent = "El elemento ya está en la capa activa.";
    return;
  }
  try {
    if (String(selected.id).startsWith("local-") || String(selected.id).startsWith("fill-") || !firebaseListo) {
      selected.layerId = capa.id;
    } else {
      await updateDoc(doc(strokesRefs[hojaActual], selected.id), { layerId: capa.id });
      selected.layerId = capa.id;
    }
    renderLayersPanel();
    scheduleRedraw();
    if (layersStatusEl) layersStatusEl.textContent = `Elemento movido a “${capa.name}”.`;
  } catch (err) {
    console.error("Error moviendo el elemento de capa:", err);
    if (layersStatusEl) layersStatusEl.textContent = "No se pudo mover el elemento.";
  }
}

document.getElementById("btn-layers")?.addEventListener("click", () => {
  cerrarTodosLosMenus();
  abrirPanelCapas();
});
document.getElementById("layers-close")?.addEventListener("click", cerrarPanelCapas);
layersOverlay?.addEventListener("click", e => { if (e.target === layersOverlay) cerrarPanelCapas(); });
document.getElementById("layer-add")?.addEventListener("click", crearCapa);
document.getElementById("layer-move-selected")?.addEventListener("click", moverSeleccionACapaActiva);
document.getElementById("btn-delete-selection")?.addEventListener("click", eliminarSeleccion);
document.getElementById("btn-menu-delete-selection")?.addEventListener("click", () => {
  cerrarTodosLosMenus();
  eliminarSeleccion();
});
document.getElementById("zoom-reset")?.addEventListener("click", restablecerVistaCanvas);

/* ============================================================
   STATUS
============================================================ */
const statusDot = document.getElementById("status-dot");
function setStatus(estado) {
  if (!statusDot) return;
  statusDot.classList.remove("conectado", "guardando");
  if (estado) statusDot.classList.add(estado);
}

function mostrarGuardado() {
  const ind = document.getElementById("save-indicator");
  if (!ind) return;
  ind.classList.add("visible");
  clearTimeout(ind._timeout);
  ind._timeout = setTimeout(() => ind.classList.remove("visible"), 900);
}

/* ============================================================
   FIREBASE
============================================================ */
const app  = initializeApp(FIREBASE_CONFIG);
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  experimentalAutoDetectLongPolling: true
});
const auth = getAuth(app);

function suscribirHoja(tab) {
  const docId = `${hoyISO()}-${tab}`;
  const ref = collection(db, "parejas", PAREJA_ID, "dibujos", docId, "strokes");
  strokesRefs[tab] = ref;

  const q = query(ref, orderBy("ts", "asc"), limit(1000));

  unsubscribers[tab] = onSnapshot(q, snap => {
    if (tab !== hojaActual) return;

    const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    let lastClearTs = 0;
    todos.forEach(s => {
      if (s.type === "clear") {
        lastClearTs = Math.max(lastClearTs, Number(s.clientTs || tsToMillis(s.ts) || 0));
      }
    });

    const servidor = todos.filter(
      s => s.type !== "clear" && Number(s.clientTs || tsToMillis(s.ts) || 0) > lastClearTs
    );

    const locales = localStrokes.filter(s =>
      String(s.id).startsWith("local-") || String(s.id).startsWith("fill-")
    );
    const serverClientIds = new Set(servidor.map(s => s.clientId).filter(Boolean));
    const localesPendientes = locales.filter(s => !serverClientIds.has(s.clientId));

    localStrokes = [...servidor, ...localesPendientes]
      .sort((a, b) => strokeOrderTs(a) - strokeOrderTs(b));

    const keepKeys = new Set();
    for (const s of localStrokes) {
      if (s.type === "fill") {
        if (s.clientId) keepKeys.add(s.clientId);
        keepKeys.add(s.id);
      }
    }
    for (const key of fillCanvasCache.keys()) {
      if (!keepKeys.has(key)) fillCanvasCache.delete(key);
    }

    if (selectedStrokeId && !localStrokes.some(s => s.id === selectedStrokeId)) {
      selectedStrokeId = null;
    }
    actualizarUISeleccion();
    renderLayersPanel();
    scheduleRedraw();
    setStatus("conectado");
  }, err => {
    console.error("❌ Listener error:", err);
    setStatus(null);
    setTimeout(() => {
      if (firebaseListo && tab === hojaActual) suscribirHoja(tab);
    }, 3000);
  });
}

function suscribirCapas(tab) {
  if (layerUnsubscribers[tab]) {
    layerUnsubscribers[tab]();
    layerUnsubscribers[tab] = null;
  }
  const docId = `${hoyISO()}-${tab}`;
  const ref = collection(db, "parejas", PAREJA_ID, "dibujos", docId, "layers");
  const q = query(ref, orderBy("order", "asc"));
  layerUnsubscribers[tab] = onSnapshot(q, snap => {
    if (snap.empty) {
      if (!layerMetadataReady[tab]) {
        setDoc(doc(db, "parejas", PAREJA_ID, "dibujos", docId, "layers", DEFAULT_LAYER_ID), {
          name: "Capa 1", order: 0, visible: true, locked: false,
          author: myUid, ts: Date.now()
        }, { merge: true }).catch(err => {
          console.warn("No se pudo crear la capa inicial:", err);
          if (tab === hojaActual && layersStatusEl) {
            layersStatusEl.textContent = "No se pudo preparar la capa inicial. Revisa los permisos de Firebase.";
          }
        });
      }
      layersBySheet[tab] = [defaultLayer()];
    } else {
      layersBySheet[tab] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      layerMetadataReady[tab] = true;
    }
    const activeLayer = layersBySheet[tab].find(c => c.id === activeLayerIds[tab]);
    if (!activeLayer || activeLayer.visible === false) {
      activeLayerIds[tab] = (layersBySheet[tab].find(c => c.visible !== false) || layersBySheet[tab][0] || defaultLayer()).id;
    }
    if (tab === hojaActual) {
      renderLayersPanel();
      actualizarUISeleccion();
      scheduleRedraw();
    }
  }, err => {
    console.error("Error sincronizando capas:", err);
    const status = document.getElementById("layers-status");
    if (status) status.textContent = "No se pudieron cargar las capas. Revisa la conexión y los permisos de Firebase.";
  });
}

/* ============================================================
   ÁLBUM — Guardar thumbnail del dibujo actual
============================================================ */
function programarGuardarThumbnail(delayMs = 5000) {
  clearTimeout(timeoutThumbnail);
  timeoutThumbnail = setTimeout(guardarThumbnail, delayMs);
}

async function guardarThumbnail() {
  if (!firebaseListo || !perfilActual) return;
  const now = Date.now();
  if (now - lastThumbnailTs < 4000) return;
  lastThumbnailTs = now;

  const docId = `${hoyISO()}-${hojaActual}`;
  try {
    const dataURL = canvas.toDataURL("image/jpeg", 0.6);
    await setDoc(
      doc(db, "parejas", PAREJA_ID, "album", docId),
      {
        imagen: dataURL,
        fecha: hoyISO(),
        hoja: hojaActual,
        autor: perfilActual,
        actualizadoEn: now
      },
      { merge: true }
    );
  } catch (err) {
    console.warn("⚠️ Error guardando thumbnail:", err);
  }
}

/* ============================================================
   PERFILES — Firestore
============================================================ */
function docPerfil(perfil) {
  return doc(db, "parejas", PAREJA_ID, "profiles", perfil);
}

function escucharPerfiles() {
  ["joan", "emily"].forEach(perfilId => {
    if (perfilUnsubs[perfilId]) perfilUnsubs[perfilId]();
    perfilUnsubs[perfilId] = onSnapshot(docPerfil(perfilId), snap => {
      const data = snap.data();
      if (data) {
        PERFILES[perfilId] = {
          ...PERFILES_DEFAULT[perfilId],
          nombre: data.nombre || PERFILES_DEFAULT[perfilId].nombre,
          emoji:  data.emoji  || PERFILES_DEFAULT[perfilId].emoji,
          cumple: data.cumple || "",
          bio:    data.bio    || ""
        };
      }
      actualizarUIconPerfiles();
    }, err => console.warn("Perfil listener:", perfilId, err));
  });
}

function actualizarUIconPerfiles() {
  if (perfilActual) {
    const p = PERFILES[perfilActual];
    const elEmoji  = document.getElementById("perfil-btn-emoji");
    const elNombre = document.getElementById("perfil-btn-nombre");
    if (elEmoji)  elEmoji.textContent  = p.emoji;
    if (elNombre) elNombre.textContent = p.nombre;
  }

  const label1 = document.getElementById("tab-label-1");
  const label2 = document.getElementById("tab-label-2");
  if (label1) label1.textContent = PERFILES.joan.nombre;
  if (label2) label2.textContent = PERFILES.emily.nombre;

  document.querySelectorAll("[data-emoji-de]").forEach(el => {
    const id = el.dataset.emojiDe;
    el.textContent = PERFILES[id].emoji;
  });
  document.querySelectorAll("[data-nombre-de]").forEach(el => {
    const id = el.dataset.nombreDe;
    el.textContent = PERFILES[id].nombre;
  });
}

async function guardarPerfil() {
  if (!perfilActual) return;
  const nombre = document.getElementById("perfil-input-nombre").value.trim();
  const cumple = document.getElementById("perfil-input-cumple").value.trim();
  const bio    = document.getElementById("perfil-input-bio").value.trim();
  const emoji  = document.querySelector(".perfil-emoji-opcion.active")?.dataset.emoji
                  || PERFILES[perfilActual].emoji;

  if (!nombre) { alert("El nombre no puede estar vacío"); return; }

  const btn = document.getElementById("perfil-guardar");
  btn.disabled = true;
  btn.textContent = "Guardando…";

  try {
    await setDoc(docPerfil(perfilActual), {
      nombre, emoji, cumple, bio,
      actualizadoEn: Date.now()
    }, { merge: true });

    PERFILES[perfilActual] = { ...PERFILES[perfilActual], nombre, emoji, cumple, bio };
    actualizarUIconPerfiles();

    btn.textContent = "✓ Guardado";
    setTimeout(() => {
      cerrarModalPerfil();
      btn.disabled = false;
      btn.textContent = "Guardar";
    }, 800);
  } catch (err) {
    console.error("Error guardando perfil:", err);
    btn.textContent = "Error al guardar";
    setTimeout(() => { btn.disabled = false; btn.textContent = "Guardar"; }, 1500);
  }
}

/* ============================================================
   MENSAJES DEL DÍA (BANANA)
============================================================ */
const mensajeDoc = () => doc(db, "parejas", PAREJA_ID, "messages", hoyISO());

function suscribirMensajes() {
  if (mensajeUnsub) mensajeUnsub();
  mensajeUnsub = onSnapshot(mensajeDoc(), snap => {
    const data = snap.data() || {};
    mensajeJoan  = data.joan  || "";
    mensajeEmily = data.emily || "";
    actualizarBanana();
  }, err => console.warn("Mensaje listener:", err));
}

function miMensaje() {
  return perfilActual === "joan" ? mensajeJoan : mensajeEmily;
}

function mensajeDelOtro() {
  return otroPerfil === "joan" ? mensajeJoan : mensajeEmily;
}

function actualizarBanana() {
  const badge = document.getElementById("banana-badge");
  if (!badge) return;
  badge.hidden = !mensajeDelOtro();
}

function abrirMensaje() {
  const overlay = document.getElementById("message-overlay");
  const titulo  = document.getElementById("message-titulo");
  const sub     = document.getElementById("message-sub");
  const lectura = document.getElementById("message-lectura");
  const editor  = document.getElementById("message-editor");

  const esMia = esMiHoja(hojaActual);

  if (esMia) {
    titulo.textContent = "Escribe un mensaje";
    sub.textContent = `Para ${PERFILES[otroPerfil].nombre}`;
    lectura.hidden = true;
    editor.hidden = false;
    document.getElementById("message-input").value = miMensaje();
  } else {
    const quienId = hojaActual === 1 ? "joan" : "emily";
    titulo.textContent = `Mensaje de ${PERFILES[quienId].nombre}`;
    sub.textContent = "Solo tú puedes leerlo 🤎";
    editor.hidden = true;
    lectura.hidden = false;
    document.getElementById("message-texto").textContent = mensajeDelOtro() || "Aún no te ha escrito nada hoy…";
  }

  overlay.hidden = false;
}

function cerrarMensaje() {
  document.getElementById("message-overlay").hidden = true;
}

async function guardarMensaje() {
  if (!perfilActual) return;
  const input = document.getElementById("message-input");
  const texto = input.value.trim();

  const btn = document.getElementById("message-guardar");
  btn.disabled = true;
  btn.textContent = "Guardando…";

  try {
    await setDoc(mensajeDoc(), { [perfilActual]: texto, actualizadoEn: Date.now() }, { merge: true });

    if (perfilActual === "joan") mensajeJoan = texto;
    else mensajeEmily = texto;

    btn.textContent = "✓ Guardado";
    setTimeout(() => {
      cerrarMensaje();
      btn.disabled = false;
      btn.textContent = "Guardar mensaje";
      mostrarGuardado();
    }, 700);
  } catch (err) {
    console.error("Error guardando mensaje:", err);
    btn.textContent = "Error";
    setTimeout(() => { btn.disabled = false; btn.textContent = "Guardar mensaje"; }, 1500);
  }
}

/* ============================================================
   PRESENCIA
============================================================ */
const presenciaDoc = perfil => doc(db, "parejas", PAREJA_ID, "presence", perfil);

async function publicarPresencia() {
  if (!firebaseListo || !perfilActual) return;
  try {
    await setDoc(presenciaDoc(perfilActual), {
      perfil: perfilActual,
      vistoEn: Date.now(),
      tab: hojaActual
    });
  } catch (err) { console.warn("Error presencia:", err); }
}

function iniciarPresencia() {
  if (!perfilActual) return;
  publicarPresencia();
  if (presenciaInterval) clearInterval(presenciaInterval);
  presenciaInterval = setInterval(publicarPresencia, 15000);
}

/* ============================================================
   MODAL EDITAR PERFIL
============================================================ */
const overlayEditar = document.getElementById("perfil-editar-overlay");

function abrirModalPerfil() {
  if (!perfilActual) return;
  const p = PERFILES[perfilActual];
  document.getElementById("perfil-input-nombre").value = p.nombre || "";
  document.getElementById("perfil-input-cumple").value = p.cumple || "";
  document.getElementById("perfil-input-bio").value    = p.bio    || "";
  document.querySelectorAll(".perfil-emoji-opcion").forEach(b => {
    b.classList.toggle("active", b.dataset.emoji === p.emoji);
  });
  overlayEditar.hidden = false;
}
function cerrarModalPerfil() { overlayEditar.hidden = true; }

/* ============================================================
   SELECTOR DE PERFIL
============================================================ */
const perfilOverlay = document.getElementById("perfil-overlay");

function mostrarSelectorPerfil() { perfilOverlay?.classList.remove("oculto"); }
function ocultarSelectorPerfil() { perfilOverlay?.classList.add("oculto"); }

document.querySelectorAll(".perfil-opcion").forEach(btn => {
  btn.addEventListener("click", () => {
    const nuevoId = btn.dataset.perfil;
    if (!PERFILES[nuevoId]) return;

    const cambio = perfilActual && perfilActual !== nuevoId;

    if (cambio) {
      Object.values(unsubscribers).forEach(fn => fn && fn());
      Object.values(layerUnsubscribers).forEach(fn => fn && fn());
      unsubscribers[1] = unsubscribers[2] = null;
      layerUnsubscribers[1] = layerUnsubscribers[2] = null;
      strokesRefs[1] = strokesRefs[2] = null;

      localStrokes = [];
      currentStroke = null;
      fillCanvasCache.clear();
      pintarFondo();
    }

    configurarPerfil(nuevoId);
    actualizarUIconPerfiles();
    ocultarSelectorPerfil();

    hojaActual = 0;
    cambiarHoja(miTab);

    if (firebaseListo) iniciarPresencia();
  });
});

function pintarTabsConEstado() {
  tabsHoja.forEach(t => {
    const n = parseInt(t.dataset.hoja, 10);
    t.classList.toggle("mi-hoja", n === miTab);
  });
}

/* ============================================================
   SELECTOR DE COLORES estilo Paint
============================================================ */
const COLOR_BASICOS = [
  "#c9534a","#e53935","#8b2d1f","#5d3a2a","#3b322b","#000000","#cfd8dc","#8fd6ec",
  "#4fc3f7","#1e88e5","#1565c0","#0d2f5c","#fff3b0","#ffd54f","#ffb74d","#ff8a65",
  "#bcaaa4","#795548","#c5e1a5","#aed581","#8bc34a","#4caf50","#2e7d32","#1b5e20",
  "#f8bbd0","#ec407a","#ad1457","#6a1b9a","#b58a5a","#7d6c5c","#d9a86c","#c9a227",
  "#ff5722","#7cc0d4","#5b8fb0","#8b6cb0","#ffffff","#e0e0e0","#9e9e9e","#616161",
  "#424242","#212121"
];

const CUSTOM_KEY = "dibujos-colores-custom";
let coloresCustom = [];
try {
  const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
  if (Array.isArray(saved)) coloresCustom = saved.slice(0, 16);
} catch(e) {}

let cpState = { h: 0, s: 0, v: 100 };
let cpCallback = null;

const cpOverlay        = document.getElementById("color-picker-overlay");
const cpGradient       = document.getElementById("color-gradient");
const cpGradientCanvas = document.getElementById("color-gradient-canvas");
const cpGradientCursor = document.getElementById("color-gradient-cursor");
const cpHue            = document.getElementById("color-hue");
const cpHueCursor      = document.getElementById("color-hue-cursor");
const cpPreviewBox     = document.getElementById("color-preview-box");
const cpHexInput       = document.getElementById("color-hex-input");
const cpRInput         = document.getElementById("color-r-input");
const cpGInput         = document.getElementById("color-g-input");
const cpBInput         = document.getElementById("color-b-input");
const cpBasicos        = document.getElementById("color-basicos");
const cpCustomGrid     = document.getElementById("color-custom");
const cpAddCustom      = document.getElementById("color-add-custom");
const cpCerrar         = document.getElementById("color-picker-cerrar");
const cpCancelar       = document.getElementById("color-cancelar");
const cpAplicar        = document.getElementById("color-aplicar");

let cpRgbActual = { r: 0, g: 0, b: 0 };
let cpHexActual = "#000000";

function pintarGradientCanvas() {
  if (!cpGradientCanvas) return;
  const c = cpGradientCanvas;
  const ctxG = c.getContext("2d");
  const w = c.clientWidth || 300;
  const h = c.clientHeight || 200;
  c.width = w;
  c.height = h;

  const gradH = ctxG.createLinearGradient(0, 0, w, 0);
  const hueRgb = hsvToRgb(cpState.h, 100, 100);
  gradH.addColorStop(0, "#ffffff");
  gradH.addColorStop(1, rgbToHex(hueRgb.r, hueRgb.g, hueRgb.b));
  ctxG.fillStyle = gradH;
  ctxG.fillRect(0, 0, w, h);

  const gradV = ctxG.createLinearGradient(0, 0, 0, h);
  gradV.addColorStop(0, "rgba(0,0,0,0)");
  gradV.addColorStop(1, "rgba(0,0,0,1)");
  ctxG.fillStyle = gradV;
  ctxG.fillRect(0, 0, w, h);
}

function posicionarCursorGradient() {
  if (!cpGradientCursor || !cpGradient) return;
  const x = (cpState.s / 100) * cpGradient.clientWidth;
  const y = (1 - cpState.v / 100) * cpGradient.clientHeight;
  cpGradientCursor.style.left = x + "px";
  cpGradientCursor.style.top  = y + "px";
}

function posicionarCursorHue() {
  if (!cpHueCursor) return;
  cpHueCursor.style.top = (cpState.h / 360) * 100 + "%";
}

function actualizarDesdeGradient(clientX, clientY) {
  const rect = cpGradient.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width,  clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
  cpState.s = (x / rect.width) * 100;
  cpState.v = (1 - y / rect.height) * 100;
  actualizarTodoElPicker();
}

let draggingGradient = false;
cpGradient?.addEventListener("pointerdown", e => {
  draggingGradient = true;
  cpGradient.setPointerCapture(e.pointerId);
  actualizarDesdeGradient(e.clientX, e.clientY);
  e.preventDefault();
});
cpGradient?.addEventListener("pointermove", e => {
  if (!draggingGradient) return;
  actualizarDesdeGradient(e.clientX, e.clientY);
  e.preventDefault();
});
cpGradient?.addEventListener("pointerup", () => { draggingGradient = false; });
cpGradient?.addEventListener("pointercancel", () => { draggingGradient = false; });

function actualizarDesdeHue(clientY) {
  const rect = cpHue.getBoundingClientRect();
  const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
  cpState.h = (y / rect.height) * 360;
  actualizarTodoElPicker();
  pintarGradientCanvas();
}

let draggingHue = false;
cpHue?.addEventListener("pointerdown", e => {
  draggingHue = true;
  cpHue.setPointerCapture(e.pointerId);
  actualizarDesdeHue(e.clientY);
  e.preventDefault();
});
cpHue?.addEventListener("pointermove", e => {
  if (!draggingHue) return;
  actualizarDesdeHue(e.clientY);
  e.preventDefault();
});
cpHue?.addEventListener("pointerup", () => { draggingHue = false; });
cpHue?.addEventListener("pointercancel", () => { draggingHue = false; });

function actualizarTodoElPicker(skipInputs = false) {
  const rgb = hsvToRgb(cpState.h, cpState.s, cpState.v);
  cpRgbActual = rgb;
  cpHexActual = rgbToHex(rgb.r, rgb.g, rgb.b);

  if (cpPreviewBox) cpPreviewBox.style.background = cpHexActual;
  if (!skipInputs) {
    if (cpHexInput) cpHexInput.value = cpHexActual.toUpperCase();
    if (cpRInput)   cpRInput.value = rgb.r;
    if (cpGInput)   cpGInput.value = rgb.g;
    if (cpBInput)   cpBInput.value = rgb.b;
  }

  posicionarCursorGradient();
  posicionarCursorHue();
}

cpHexInput?.addEventListener("change", () => {
  const hex = normalizarHex(cpHexInput.value);
  if (!hex) {
    cpHexInput.value = cpHexActual.toUpperCase();
    return;
  }
  const rgb = hexToRgb(hex);
  cpState = rgbToHsv(rgb.r, rgb.g, rgb.b);
  pintarGradientCanvas();
  actualizarTodoElPicker();
});
cpHexInput?.addEventListener("keydown", e => { if (e.key === "Enter") cpHexInput.blur(); });

[cpRInput, cpGInput, cpBInput].forEach(inp => {
  inp?.addEventListener("change", () => {
    const r = Math.max(0, Math.min(255, parseInt(cpRInput.value, 10) || 0));
    const g = Math.max(0, Math.min(255, parseInt(cpGInput.value, 10) || 0));
    const b = Math.max(0, Math.min(255, parseInt(cpBInput.value, 10) || 0));
    cpState = rgbToHsv(r, g, b);
    pintarGradientCanvas();
    actualizarTodoElPicker();
  });
  inp?.addEventListener("keydown", e => { if (e.key === "Enter") inp.blur(); });
});

function pintarBasicos() {
  if (!cpBasicos) return;
  cpBasicos.innerHTML = "";
  COLOR_BASICOS.forEach(hex => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "color-swatch-item";
    b.style.background = hex;
    b.title = hex.toUpperCase();
    b.addEventListener("click", () => aplicarHexDelSwatch(hex));
    cpBasicos.appendChild(b);
  });
}

function pintarCustom() {
  if (!cpCustomGrid) return;
  cpCustomGrid.innerHTML = "";
  for (let i = 0; i < 16; i++) {
    const hex = coloresCustom[i];
    if (!hex) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "color-swatch-item vacio";
      b.disabled = true;
      cpCustomGrid.appendChild(b);
    } else {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "color-swatch-item";
      b.style.background = hex;
      b.title = hex.toUpperCase() + " (mantén pulsado para eliminar)";
      b.addEventListener("click", () => aplicarHexDelSwatch(hex));
      let pressTimer = null;
      b.addEventListener("pointerdown", () => {
        pressTimer = setTimeout(() => {
          coloresCustom = coloresCustom.filter(c => c !== hex);
          try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(coloresCustom)); } catch(e) {}
          pintarCustom();
          mostrarGuardado();
        }, 700);
      });
      b.addEventListener("pointerup", () => clearTimeout(pressTimer));
      b.addEventListener("pointerleave", () => clearTimeout(pressTimer));
      cpCustomGrid.appendChild(b);
    }
  }
}

function aplicarHexDelSwatch(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  cpState = rgbToHsv(rgb.r, rgb.g, rgb.b);
  pintarGradientCanvas();
  actualizarTodoElPicker();
}

cpAddCustom?.addEventListener("click", () => {
  if (!cpHexActual) return;
  coloresCustom = coloresCustom.filter(c => c !== cpHexActual);
  coloresCustom.unshift(cpHexActual);
  if (coloresCustom.length > 16) coloresCustom.length = 16;
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(coloresCustom)); } catch(e) {}
  pintarCustom();
  mostrarGuardado();
});

function abrirColorPicker(hexInicial, callback) {
  const rgb = hexToRgb(hexInicial) || { r: 0, g: 0, b: 0 };
  cpState = rgbToHsv(rgb.r, rgb.g, rgb.b);
  cpCallback = callback;

  cpOverlay.hidden = false;

  requestAnimationFrame(() => {
    pintarGradientCanvas();
    actualizarTodoElPicker();
  });
}

function cerrarColorPicker() {
  cpOverlay.hidden = true;
  cpCallback = null;
}

function aplicarColorPicker() {
  if (cpCallback) cpCallback(cpHexActual);
  cerrarColorPicker();
}

cpCerrar?.addEventListener("click", cerrarColorPicker);
cpCancelar?.addEventListener("click", cerrarColorPicker);
cpAplicar?.addEventListener("click", aplicarColorPicker);
cpOverlay?.addEventListener("click", e => {
  if (e.target === cpOverlay) cerrarColorPicker();
});

window.addEventListener("resize", () => {
  actualizarVistaCanvas();
  if (!cpOverlay.hidden) {
    pintarGradientCanvas();
    actualizarTodoElPicker();
  }
});

/* ============================================================
   BOTÓN "COLOR" — Botón independiente de la barra
============================================================ */
document.getElementById("btn-color-picker")?.addEventListener("click", () => {
  cerrarTodosLosMenus();
  abrirColorPicker(colorActual, hex => {
    colorActual = hex;

    const activo = document.querySelector(".lapiz.active");
    let idx = 0;
    if (activo) {
      const encontrado = COLORES.indexOf(activo.dataset.color);
      if (encontrado >= 0) idx = encontrado;
    }
    COLORES[idx] = hex;
    renderLapices();

    const nuevo = [...document.querySelectorAll(".lapiz")].find(l => l.dataset.color === hex);
    nuevo?.classList.add("active");

    if (herramienta !== "borrador" && herramienta !== "bote") {
      herramienta = "lapiz";
      actualizarBotonLapicesActivo();
    }

    mostrarGuardado();
  });
});

/* ============================================================
   EVENT LISTENERS GENERALES
============================================================ */
document.getElementById("perfil-btn")?.addEventListener("click", abrirModalPerfil);
document.getElementById("perfil-editar-cerrar")?.addEventListener("click", cerrarModalPerfil);
overlayEditar?.addEventListener("click", e => {
  if (e.target === overlayEditar) cerrarModalPerfil();
});

document.querySelectorAll(".perfil-emoji-opcion").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".perfil-emoji-opcion").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

document.getElementById("perfil-guardar")?.addEventListener("click", guardarPerfil);

document.getElementById("perfil-cambiar-usuario")?.addEventListener("click", () => {
  cerrarModalPerfil();
  mostrarSelectorPerfil();
});

document.getElementById("banana-btn")?.addEventListener("click", abrirMensaje);
document.getElementById("message-cerrar")?.addEventListener("click", cerrarMensaje);
document.getElementById("message-overlay")?.addEventListener("click", e => {
  if (e.target === document.getElementById("message-overlay")) cerrarMensaje();
});
document.getElementById("message-guardar")?.addEventListener("click", guardarMensaje);

/* ============================================================
   INICIAR FIREBASE
============================================================ */
async function initFirebase() {
  try {
    const cred = await signInAnonymously(auth);
    myUid = cred.user.uid;

    firebaseListo = true;
    setStatus("conectado");

    escucharPerfiles();
    suscribirMensajes();

    if (perfilActual) {
      pintarTabsConEstado();
      suscribirHoja(hojaActual);
      suscribirCapas(hojaActual);
      iniciarPresencia();
    }
  } catch (err) {
    console.error("❌ Error Firebase:", err);
    setStatus(null);
  }
}

/* ============================================================
   ARRANQUE
============================================================ */
pintarFondo();
actualizarVistaCanvas();
actualizarUISeleccion();
pintarBasicos();
pintarCustom();

actualizarBotonLapicesActivo();

if (perfilActual && PERFILES[perfilActual]) {
  configurarPerfil(perfilActual);
  actualizarUIconPerfiles();
  pintarTabsConEstado();
  
  hojaActual = (hojaUrl && (hojaUrl === "1" || hojaUrl === "2")) ? parseInt(hojaUrl) : miTab;

  tabsHoja.forEach(t =>
    t.classList.toggle("active", parseInt(t.dataset.hoja, 10) === hojaActual)
  );
  ocultarSelectorPerfil();
} else {
  mostrarSelectorPerfil();
}

if (fechaUrl) {
  const backBtn = document.querySelector('.app-header .icon-btn');
  if (backBtn) backBtn.href = '../album/index.html';
  
  if (fechaDiaEl) fechaDiaEl.textContent = `Editando: ${fechaDiaEl.textContent}`;
}

initFirebase();

/* ============================================================
   GUARDAR AL SALIR
============================================================ */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    publicarPresencia();
    clearTimeout(timeoutThumbnail);
    guardarThumbnail();
  } else if (document.visibilityState === "visible") {
    if (firebaseListo && perfilActual) publicarPresencia();
  }
});