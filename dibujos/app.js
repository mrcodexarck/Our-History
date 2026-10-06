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

let myUid = null;
let firebaseListo = false;

let hojaActual = 1;
let localStrokes = [];
let currentStroke = null;

const strokesRefs = { 1: null, 2: null };
const unsubscribers = { 1: null, 2: null };

/* Presencia */
let presenciaInterval = null;
let presenciaUnsub = null;

/* Mensajes */
let mensajeUnsub = null;
let mensajeJoan  = "";
let mensajeEmily = "";

/* Perfiles */
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
   DIBUJO
============================================================ */
function drawStroke(stroke) {
  if (!stroke || stroke.type === "clear") return;
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
   POINTER EVENTS
============================================================ */
canvas.addEventListener("pointerdown", e => {
  if (!esMiHoja(hojaActual)) return;
  if (e.pointerType === "touch" && e.isPrimary === false) return;
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

  const enModoLectura = !esMiHoja(nuevaHoja);
  document.body.classList.toggle("modo-lectura", enModoLectura);
  document.getElementById("canvas-wrapper").classList.toggle("readonly", enModoLectura);

  localStrokes = [];
  currentStroke = null;
  pintarFondo();

  if (firebaseListo) suscribirHoja(hojaActual);

  publicarPresencia();
  actualizarBanana();
}

/* ============================================================
   PALETA
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
  herramienta = "lapiz";
  document.querySelectorAll(".lapiz").forEach(l => l.classList.remove("active"));
  btnEl?.classList.add("active");
  document.querySelectorAll(".tool").forEach(t => t.classList.remove("active"));
  document.querySelector('[data-tool="lapiz"]')?.classList.add("active");
}
renderLapices();

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

document.querySelectorAll(".tamanos button").forEach(btn => {
  btn.addEventListener("click", () => {
    tamanoActual = parseInt(btn.dataset.size, 10) || 8;
    document.querySelectorAll(".tamanos button")
      .forEach(b => b.classList.toggle("active", b === btn));
  });
});

/* ============================================================
   UNDO
============================================================ */
const btnUndo = document.getElementById("btn-undo");
if (btnUndo) {
  btnUndo.addEventListener("click", async () => {
    if (!esMiHoja(hojaActual)) return;
    if (!firebaseListo || !strokesRefs[hojaActual]) return;

    const misTrazos = localStrokes
      .filter(s => s.author === myUid)
      .sort((a, b) => b.ts - a.ts);

    if (misTrazos.length === 0) return;

    const ultimo = misTrazos[0];
    const docId = `${hoyISO()}-${hojaActual}`;

    try {
      await deleteDoc(doc(db, "parejas", PAREJA_ID, "dibujos", docId, "strokes", ultimo.id));
    } catch (err) {
      console.error("❌ Error borrando trazo:", err);
    }
  });
}

/* ============================================================
   CLEAR
============================================================ */
const btnClear = document.getElementById("btn-clear");
if (btnClear) {
  btnClear.addEventListener("click", async () => {
    if (!esMiHoja(hojaActual)) return;
    if (!confirm("¿Borrar todo el dibujo de tu hoja?")) return;
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
}

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
  // Header
  if (perfilActual) {
    const p = PERFILES[perfilActual];
    const elEmoji  = document.getElementById("perfil-btn-emoji");
    const elNombre = document.getElementById("perfil-btn-nombre");
    if (elEmoji)  elEmoji.textContent  = p.emoji;
    if (elNombre) elNombre.textContent = p.nombre;
  }

  // Tabs labels
  const label1 = document.getElementById("tab-label-1");
  const label2 = document.getElementById("tab-label-2");
  if (label1) label1.textContent = PERFILES.joan.nombre;
  if (label2) label2.textContent = PERFILES.emily.nombre;

  // Selector de perfil
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

  if (!nombre) {
    alert("El nombre no puede estar vacío");
    return;
  }

  const btn = document.getElementById("perfil-guardar");
  btn.disabled = true;
  btn.textContent = "Guardando…";

  try {
    await setDoc(docPerfil(perfilActual), {
      nombre, emoji, cumple, bio,
      actualizadoEn: Date.now()
    }, { merge: true });

    PERFILES[perfilActual] = {
      ...PERFILES[perfilActual],
      nombre, emoji, cumple, bio
    };
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
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "Guardar";
    }, 1500);
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

  // Si estoy viendo MI hoja y el otro me escribió → mostrar badge
  // Si estoy viendo SU hoja y él escribió → mostrar badge
  const esMia = esMiHoja(hojaActual);
  let mostrarBadge = false;

  if (esMia) {
    // En mi hoja: badge si el otro escribió (para que sepa que hay mensaje)
    mostrarBadge = !!mensajeDelOtro();
  } else {
    // En su hoja: badge si escribió algo
    mostrarBadge = !!mensajeDelOtro();
  }

  badge.hidden = !mostrarBadge;
}

function abrirMensaje() {
  const overlay = document.getElementById("message-overlay");
  const titulo  = document.getElementById("message-titulo");
  const sub     = document.getElementById("message-sub");
  const lectura = document.getElementById("message-lectura");
  const editor  = document.getElementById("message-editor");

  const esMia = esMiHoja(hojaActual);

  if (esMia) {
    // Escribir mi mensaje
    titulo.textContent = "Escribe un mensaje";
    sub.textContent = `Para ${PERFILES[otroPerfil].nombre}`;
    lectura.hidden = true;
    editor.hidden = false;
    document.getElementById("message-input").value = miMensaje();
  } else {
    // Leer el mensaje del otro
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
    if (!texto) {
      // Borrar mi mensaje
      await setDoc(mensajeDoc(), {
        [perfilActual]: "",
        actualizadoEn: Date.now()
      }, { merge: true });
    } else {
      await setDoc(mensajeDoc(), {
        [perfilActual]: texto,
        actualizadoEn: Date.now()
      }, { merge: true });
    }

    // Actualizar local
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
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "Guardar mensaje";
    }, 1500);
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
  } catch (err) {
    console.warn("Error presencia:", err);
  }
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

function cerrarModalPerfil() {
  overlayEditar.hidden = true;
}

/* ============================================================
   SELECTOR DE PERFIL
============================================================ */
const perfilOverlay = document.getElementById("perfil-overlay");

function mostrarSelectorPerfil() {
  perfilOverlay?.classList.remove("oculto");
}
function ocultarSelectorPerfil() {
  perfilOverlay?.classList.add("oculto");
}

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

    // Forzar cambio de hoja
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
   EVENT LISTENERS DE MODALES
============================================================ */
document.getElementById("perfil-btn").addEventListener("click", abrirModalPerfil);
document.getElementById("perfil-editar-cerrar").addEventListener("click", cerrarModalPerfil);
overlayEditar.addEventListener("click", e => {
  if (e.target === overlayEditar) cerrarModalPerfil();
});

document.querySelectorAll(".perfil-emoji-opcion").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".perfil-emoji-opcion").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

document.getElementById("perfil-guardar").addEventListener("click", guardarPerfil);

document.getElementById("perfil-cambiar-usuario").addEventListener("click", () => {
  cerrarModalPerfil();
  mostrarSelectorPerfil();
});

// Banana — mensajes
document.getElementById("banana-btn").addEventListener("click", abrirMensaje);
document.getElementById("message-cerrar").addEventListener("click", cerrarMensaje);
document.getElementById("message-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("message-overlay")) cerrarMensaje();
});
document.getElementById("message-guardar").addEventListener("click", guardarMensaje);

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

if (perfilActual && PERFILES[perfilActual]) {
  configurarPerfil(perfilActual);
  actualizarUIconPerfiles();
  pintarTabsConEstado();
  hojaActual = miTab;

  tabsHoja.forEach(t =>
    t.classList.toggle("active", parseInt(t.dataset.hoja, 10) === miTab)
  );
  ocultarSelectorPerfil();

  const enModoLectura = !esMiHoja(hojaActual);
  document.body.classList.toggle("modo-lectura", enModoLectura);
  document.getElementById("canvas-wrapper").classList.toggle("readonly", enModoLectura);
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