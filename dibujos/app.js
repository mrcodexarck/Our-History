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
   FECHA
============================================================ */
function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
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
const ctx    = canvas.getContext("2d", { willReadFrequently: true });
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

let myUid = null;
let firebaseListo = false;

let hojaActual = 1;
let localStrokes = [];
let currentStroke = null;

const strokesRefs = { 1: null, 2: null };
const unsubscribers = { 1: null, 2: null };

let presenciaInterval = null;
let mensajeUnsub = null;
let mensajeJoan  = "";
let mensajeEmily = "";

let perfilUnsubs = { joan: null, emily: null };

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
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
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
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16)
  };
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
function drawStroke(stroke) {
  if (!stroke) return;

  if (stroke.type === "fill") {
    floodFillSilencioso(stroke.x, stroke.y, stroke.hex);
    return;
  }

  if (stroke.type === "clear") return;

  const pts = stroke.points;
  if (!pts || pts.length === 0) return;

  const isEraser = stroke.tool === "borrador";
  const color    = isEraser ? COLOR_FONDO : stroke.color;
  const size     = stroke.size;
  const alpha    = stroke.alpha ?? 1;

  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineWidth   = size;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";
  ctx.globalAlpha = alpha;

  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function redrawAll() {
  pintarFondo();
  localStrokes.forEach(drawStroke);
  if (currentStroke) drawStroke(currentStroke);
}

/* ============================================================
   FLOOD FILL
============================================================ */
function floodFillSilencioso(startX, startY, fillColorHex) {
  if (startX < 0 || startY < 0 || startX >= W || startY >= H) return;

  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;

  const idx = (startY * W + startX) * 4;
  const sr = data[idx], sg = data[idx + 1], sb = data[idx + 2], sa = data[idx + 3];

  const rgbFill = hexToRgb(fillColorHex);
  if (!rgbFill) return;
  const fr = rgbFill.r, fg = rgbFill.g, fb = rgbFill.b;

  if (sr === fr && sg === fg && sb === fb && sa === 255) return;

  const tolerancia = 35;
  const dentro = (i) => {
    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
    return Math.abs(r - sr) <= tolerancia &&
           Math.abs(g - sg) <= tolerancia &&
           Math.abs(b - sb) <= tolerancia &&
           Math.abs(a - sa) <= tolerancia;
  };

  const stack = [[startX, startY]];
  const visitados = new Uint8Array(W * H);

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const pos = y * W + x;
    if (visitados[pos]) continue;
    visitados[pos] = 1;

    const i = pos * 4;
    if (!dentro(i)) continue;

    data[i]     = fr;
    data[i + 1] = fg;
    data[i + 2] = fb;
    data[i + 3] = 255;

    stack.push([x + 1, y]);
    stack.push([x - 1, y]);
    stack.push([x, y + 1]);
    stack.push([x, y - 1]);
  }

  ctx.putImageData(imgData, 0, 0);
}

async function guardarRelleno(x, y, hex) {
  if (!firebaseListo || !strokesRefs[hojaActual]) return;
  try {
    await addDoc(strokesRefs[hojaActual], {
      type:   "fill",
      x, y, hex,
      author: myUid,
      ts:     Date.now()
    });
    mostrarGuardado();
  } catch (err) {
    console.error("❌ Error guardando relleno:", err);
  }
}

/* ============================================================
   POINTER EVENTS
============================================================ */
canvas.addEventListener("pointerdown", e => {
  if (e.pointerType === "touch" && e.isPrimary === false) return;

  cerrarTodosLosMenus();

  if (herramienta === "bote") {
    const p = getPos(e);
    floodFillSilencioso(Math.round(p.x), Math.round(p.y), colorActual);
    guardarRelleno(Math.round(p.x), Math.round(p.y), colorActual);
    e.preventDefault();
    return;
  }

  canvas.setPointerCapture(e.pointerId);
  dibujando = true;
  const p = getPos(e);
  const s = estilosDeTrazo();

  currentStroke = {
    points: [p],
    color: colorActual,
    size: s.ancho,
    tool: herramienta,
    alpha: s.alpha,
    author: myUid,
    ts: Date.now()
  };
  drawStroke(currentStroke);
  e.preventDefault();
});

canvas.addEventListener("pointermove", e => {
  if (!dibujando || !currentStroke) return;
  const p = getPos(e);
  const prev = currentStroke.points[currentStroke.points.length - 1];
  currentStroke.points.push(p);

  const isEraser = currentStroke.tool === "borrador";
  const color    = isEraser ? COLOR_FONDO : currentStroke.color;

  ctx.strokeStyle = color;
  ctx.lineWidth   = currentStroke.size;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";
  ctx.globalAlpha = currentStroke.alpha ?? 1;

  ctx.beginPath();
  ctx.moveTo(prev.x, prev.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.globalAlpha = 1;

  e.preventDefault();
});

async function terminarTrazo() {
  if (!dibujando || !currentStroke) return;
  dibujando = false;

  const strokeToSave = currentStroke;

  if (!firebaseListo || !strokesRefs[hojaActual]) {
    localStrokes.push({ id: "local-" + Date.now(), ...strokeToSave });
    currentStroke = null;
    return;
  }

  try {
    await addDoc(strokesRefs[hojaActual], {
      points: strokeToSave.points,
      color:  strokeToSave.color,
      size:   strokeToSave.size,
      tool:   strokeToSave.tool,
      alpha:  strokeToSave.alpha,
      author: strokeToSave.author,
      ts:     strokeToSave.ts
    });
  } catch (err) {
    console.error("❌ Error guardando trazo:", err);
    currentStroke = null;
  }
}

canvas.addEventListener("pointerup", terminarTrazo);
canvas.addEventListener("pointercancel", terminarTrazo);
canvas.addEventListener("pointerleave", terminarTrazo);

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

  hojaActual = nuevaHoja;

  tabsHoja.forEach(t =>
    t.classList.toggle("active", parseInt(t.dataset.hoja, 10) === nuevaHoja)
  );

  localStrokes = [];
  currentStroke = null;
  pintarFondo();

  if (firebaseListo) suscribirHoja(hojaActual);

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

  // Si estaba con borrador o bote, dejar esa herramienta
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
  bote:     '<svg viewBox="0 0 24 24"><path d="M18 4l-1.5-1.5a1 1 0 00-1.4 0L4 13.5V17l8-8 4 4-8 8h3.5l10.5-10.5a1 1 0 000-1.4L18 4z" fill="currentColor"/><path d="M20 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" fill="currentColor"/></svg>'
};

const NOMBRES_TOOL = {
  lapiz:    "Lápiz",
  marcador: "Marcador",
  pincel:   "Pincel",
  borrador: "Borrador",
  bote:     "Bote"
};

const btnLapices     = document.getElementById("btn-lapices");
const btnLapicesIcon = document.getElementById("btn-lapices-icono");
const btnLapicesTxt  = document.getElementById("btn-lapices-texto");
const menuLapices    = document.getElementById("menu-lapices");

const btnAcciones    = document.getElementById("btn-acciones");
const menuAcciones   = document.getElementById("menu-acciones");

/* --- Abrir / cerrar menús --- */
function cerrarTodosLosMenus() {
  menuLapices?.classList.remove("abierto");
  btnLapices?.classList.remove("abierto");
  menuAcciones?.classList.remove("abierto");
  btnAcciones?.classList.remove("abierto");
}

btnLapices?.addEventListener("click", e => {
  e.stopPropagation();
  const abierto = menuLapices?.classList.contains("abierto");
  cerrarTodosLosMenus();
  if (!abierto) {
    menuLapices?.classList.add("abierto");
    btnLapices?.classList.add("abierto");
  }
});

btnAcciones?.addEventListener("click", e => {
  e.stopPropagation();
  const abierto = menuAcciones?.classList.contains("abierto");
  cerrarTodosLosMenus();
  if (!abierto) {
    menuAcciones?.classList.add("abierto");
    btnAcciones?.classList.add("abierto");
  }
});

// Cerrar al tocar fuera
document.addEventListener("click", e => {
  if (!e.target.closest(".bloque-menu")) {
    cerrarTodosLosMenus();
  }
});

/* --- Función para actualizar el botón de Lápices --- */
function actualizarBotonLapicesActivo() {
  document.querySelectorAll(".tool-item").forEach(item => {
    item.classList.toggle("active", item.dataset.tool === herramienta);
  });
  if (btnLapicesIcon) btnLapicesIcon.innerHTML = ICONOS_TOOL[herramienta] || "";
  if (btnLapicesTxt)  btnLapicesTxt.textContent = NOMBRES_TOOL[herramienta] || "Lápiz";
}

/* --- Items de herramientas dentro del menú --- */
document.querySelectorAll(".tool-item").forEach(item => {
  item.addEventListener("click", () => {
    const tool = item.dataset.tool;
    herramienta = tool;

    actualizarBotonLapicesActivo();

    if (tool === "borrador" || tool === "bote") {
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
  if (!firebaseListo || !strokesRefs[hojaActual]) return;

  const misTrazos = localStrokes
    .filter(s => s.author === myUid)
    .sort((a, b) => b.ts - a.ts);

  if (misTrazos.length === 0) return;

  const ultimo = misTrazos[0];
  const docId = `${hoyISO()}-${hojaActual}`;

  try {
    await deleteDoc(doc(db, "parejas", PAREJA_ID, "dibujos", docId, "strokes", ultimo.id));
    mostrarGuardado();
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
  if (!firebaseListo || !strokesRefs[hojaActual]) return;

  try {
    await addDoc(strokesRefs[hojaActual], {
      type:   "clear",
      author: myUid,
      ts:     Date.now()
    });
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
}
function cerrarDrawer() {
  panelHerramientas?.classList.remove("abierto");
  drawerOverlay?.classList.remove("visible");
}
btnToolsMobile?.addEventListener("click", abrirDrawer);
drawerCerrar?.addEventListener("click", cerrarDrawer);
drawerOverlay?.addEventListener("click", cerrarDrawer);

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
const db   = getFirestore(app);
const auth = getAuth(app);

function suscribirHoja(tab) {
  const docId = `${hoyISO()}-${tab}`;
  const ref = collection(db, "parejas", PAREJA_ID, "dibujos", docId, "strokes");
  strokesRefs[tab] = ref;

  const q = query(ref, orderBy("ts", "asc"));

  unsubscribers[tab] = onSnapshot(q, snap => {
    if (tab !== hojaActual) return;

    const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    let lastClearTs = 0;
    todos.forEach(s => {
      if (s.type === "clear" && s.ts > lastClearTs) lastClearTs = s.ts;
    });

    localStrokes = todos.filter(s => s.type !== "clear" && s.ts > lastClearTs);
    localStrokes.sort((a, b) => a.ts - b.ts);

    if (currentStroke) {
      const found = localStrokes.some(s => s.ts === currentStroke.ts && s.author === myUid);
      if (found) currentStroke = null;
    }

    redrawAll();
    setStatus("conectado");
  }, err => {
    console.error("❌ Listener error:", err);
    setStatus(null);
  });
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
      unsubscribers[1] = unsubscribers[2] = null;
      strokesRefs[1] = strokesRefs[2] = null;
      localStrokes = [];
      currentStroke = null;
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

    // Reemplazar el lápiz activo (o el primero)
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
pintarBasicos();
pintarCustom();

// Marcar la herramienta inicial (lápiz)
actualizarBotonLapicesActivo();

if (perfilActual && PERFILES[perfilActual]) {
  configurarPerfil(perfilActual);
  actualizarUIconPerfiles();
  pintarTabsConEstado();
  hojaActual = miTab;

  tabsHoja.forEach(t =>
    t.classList.toggle("active", parseInt(t.dataset.hoja, 10) === miTab)
  );
  ocultarSelectorPerfil();
} else {
  mostrarSelectorPerfil();
}

initFirebase();

/* ============================================================
   GUARDAR AL SALIR
============================================================ */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    publicarPresencia();
  } else if (document.visibilityState === "visible") {
    if (firebaseListo && perfilActual) publicarPresencia();
  }
});