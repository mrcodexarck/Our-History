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
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
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

let myUid = null;              // UID anónimo de Firebase
let firebaseListo = false;

/* Hoja actual */
let hojaActual = 1;

/* Trazos locales (ya confirmados por Firestore) */
let localStrokes = [];

/* Trazo en curso (aún no confirmado) */
let currentStroke = null;

/* Refs de Firestore por hoja */
const strokesRefs = { 1: null, 2: null };
const unsubscribers = { 1: null, 2: null };

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
   DIBUJO DE TRAZOS EN CANVAS
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
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
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
   POINTER EVENTS — INICIAR TRAZO
============================================================ */
canvas.addEventListener("pointerdown", e => {
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

  // Dibujar el primer punto
  drawStroke(currentStroke);
  e.preventDefault();
});

/* ============================================================
   POINTER MOVE — DIBUJAR SOLO EL ÚLTIMO SEGMENTO
   (para que sea rápido aunque haya muchos trazos)
============================================================ */
canvas.addEventListener("pointermove", e => {
  if (!dibujando || !currentStroke) return;

  const p = getPos(e);
  const prev = currentStroke.points[currentStroke.points.length - 1];

  // Añadir punto
  currentStroke.points.push(p);

  // Dibujar solo el segmento nuevo
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

/* ============================================================
   POINTER UP — COMMIT DEL TRAZO A FIRESTORE
============================================================ */
async function terminarTrazo() {
  if (!dibujando || !currentStroke) return;
  dibujando = false;

  const strokeToSave = currentStroke;
  // Dejamos currentStroke visible hasta que Firestore lo confirme

  if (!firebaseListo || !strokesRefs[hojaActual]) {
    // Sin Firebase → agregar solo localmente
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
    // El listener onSnapshot detectará el nuevo trazo y hará redrawAll()
  } catch (err) {
    console.error("❌ Error guardando trazo:", err);
    currentStroke = null;
  }
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
  // Cancelar listener anterior
  if (unsubscribers[hojaActual]) {
    unsubscribers[hojaActual]();
    unsubscribers[hojaActual] = null;
  }

  hojaActual = nuevaHoja;

  // Actualizar tabs
  tabsHoja.forEach(t =>
    t.classList.toggle("active", parseInt(t.dataset.hoja, 10) === nuevaHoja)
  );

  // Limpiar estado local
  localStrokes = [];
  currentStroke = null;
  pintarFondo();

  // Suscribirse a la nueva hoja
  if (firebaseListo) {
    suscribirHoja(hojaActual);
  }

  console.log(`📄 Cambiado a hoja ${hojaActual}`);
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
   HERRAMIENTAS Y TAMAÑOS
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

document.querySelectorAll(".tamanos button").forEach(btn => {
  btn.addEventListener("click", () => {
    tamanoActual = parseInt(btn.dataset.size, 10) || 8;
    document.querySelectorAll(".tamanos button")
      .forEach(b => b.classList.toggle("active", b === btn));
  });
});

/* ============================================================
   UNDO — borra MI último trazo
============================================================ */
const btnUndo = document.getElementById("btn-undo");
if (btnUndo) {
  btnUndo.addEventListener("click", async () => {
    if (!firebaseListo || !strokesRefs[hojaActual]) return;

    // Buscar mi último trazo (no cuenta el que estoy dibujando ahora)
    const misTrazos = localStrokes
      .filter(s => s.author === myUid)
      .sort((a, b) => b.ts - a.ts);

    if (misTrazos.length === 0) {
      console.log("No hay trazos propios que deshacer");
      return;
    }

    const ultimo = misTrazos[0];
    const docId  = `${hoyISO()}-${hojaActual}`;

    try {
      // Referencia correcta al documento del trazo
      const strokeDocRef = doc(
        db,
        "parejas", PAREJA_ID,
        "dibujos", docId,
        "strokes", ultimo.id
      );
      await deleteDoc(strokeDocRef);
      console.log("🗑️ Trazo borrado:", ultimo.id);
    } catch (err) {
      console.error("❌ Error borrando trazo:", err);
    }
  });
}

/* ============================================================
   CLEAR — añade un marcador de "borrar todo"
============================================================ */
const btnClear = document.getElementById("btn-clear");
if (btnClear) {
  btnClear.addEventListener("click", async () => {
    if (!confirm("¿Borrar todo el dibujo de esta hoja para ambos?")) return;
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
   INDICADOR DE ESTADO
============================================================ */
const statusEl = document.getElementById("status");
function setStatus(estado) {
  if (!statusEl) return;
  statusEl.classList.remove("conectado", "guardando");
  if (estado) statusEl.classList.add(estado);
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

function suscribirHoja(hoja) {
  const docId = `${hoyISO()}-${hoja}`;
  const ref = collection(db, "parejas", PAREJA_ID, "dibujos", docId, "strokes");
  strokesRefs[hoja] = ref;

  const q = query(ref, orderBy("ts", "asc"));

  unsubscribers[hoja] = onSnapshot(q, snap => {
    // Reconstruir todos los trazos desde cero (robusto y simple)
    const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Respetar el último marcador "clear"
    let lastClearTs = 0;
    todos.forEach(s => {
      if (s.type === "clear" && s.ts > lastClearTs) lastClearTs = s.ts;
    });

    localStrokes = todos.filter(s => s.type !== "clear" && s.ts > lastClearTs);
    localStrokes.sort((a, b) => a.ts - b.ts);

    // Si nuestro currentStroke ya llegó a Firestore, quitarlo del "current"
    if (currentStroke) {
      const found = localStrokes.some(s => s.ts === currentStroke.ts && s.author === myUid);
      if (found) currentStroke = null;
    }

    redrawAll();
    setStatus("conectado");
    console.log(`☁️ Hoja ${hoja}: ${localStrokes.length} trazos`);
  }, err => {
    console.error("❌ Listener error:", err);
    setStatus(null);
  });
}

async function initFirebase() {
  try {
    // Intentamos inicializar Firebase
    const app  = initializeApp(FIREBASE_CONFIG);
    const db   = getFirestore(app);
    const auth = getAuth(app);
    
    const cred = await signInAnonymously(auth);
    myUid = cred.user.uid;
    console.log("🔐 UID:", myUid);

    firebaseListo = true;
    setStatus("conectado");
    suscribirHoja(hojaActual);
    console.log("✅ Firebase listo");
  } catch (err) {
    // Si falla, la app sigue funcionando en modo local
    console.error("❌ Error Firebase (Modo local activado):", err);
    setStatus(null);
  }
}

// Iniciar Firebase sin bloquear el resto de la app
initFirebase();

// ¡IMPORTANTE! Asegurar que el fondo se pinte al cargar
pintarFondo();
/* ============================================================
   ACTUALIZACIÓN AUTOMÁTICA DE LA PWA
============================================================ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // Detectar si hay una nueva versión instalándose
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          // Si el nuevo Service Worker terminó de instalarse y hay uno activo antes
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Aquí puedes mostrar un toast en lugar de un confirm si prefieres
            if (confirm("✨ ¡Nueva versión disponible! ¿Actualizar ahora?")) {
              // Enviar mensaje al SW para que se active de inmediato
              newWorker.postMessage({ type: 'SKIP_WAITING' });
              // Recargar la página para ver los cambios
              window.location.reload();
            }
          }
        });
      });
    });
  });
}

// Escuchar cuando el SW cambie para recargar la página automáticamente
let refreshing;
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (refreshing) return;
  refreshing = true;
  window.location.reload();
});

/* ============================================================
   ACTUALIZACIÓN AUTOMÁTICA — SIN VERSIONES MANUALES
============================================================ */
/* ============================================================
   ACTUALIZACIÓN AUTOMÁTICA DE LA PWA — SIN VERSIONES MANUALES
============================================================ */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", {
      updateViaCache: "none" // Fuerza a revisar el sw.js siempre en la red
    }).then(reg => {
      reg.update(); // Busca actualizaciones cada vez que se abre la app

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // Envía mensaje al SW para que se active de inmediato
            newWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    });
  });
}
/* ============================================================
   OCULTAR BOTÓN DE INSTALAR SI YA ESTÁ INSTALADA (PWA)
============================================================ */
function estaInstalada() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
}

// Busca todos los botones de instalar (ajusta el selector según tu HTML)
const botonesInstalar = document.querySelectorAll(
  '#btn-instalar, .btn-instalar, [data-install]'
);

if (estaInstalada()) {
  botonesInstalar.forEach(btn => btn.style.display = 'none');
  console.log('📱 App ya instalada → ocultando botón de instalar');
}

