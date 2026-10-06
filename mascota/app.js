/* ============================================================
   IMPORTS
============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { FIREBASE_CONFIG, PAREJA_ID } from "../citas/firebase-config.js";
import { ESCENAS } from "./escenas.js";
import { CATALOGO, RECOMPENSAS, MONEDAS_INICIALES, DESBLOQUEADOS_INICIALES, SUBCATEGORIAS } from "./catalogo.js";

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const auth = getAuth(app);

let myUid = null;
let mascotaRef = null;
let mascotaActual = null;
let tipoSeleccionado = null;

/* Estado del color picker */
let slotActivo = "principal";
let coloresTemp = { principal: "#e8d5b8", claro: "#f5ebe0", rosa: "#f5a8b8" };
let recientes = [];

/* ============================================================
   PALETA DE COLORES (estilo Paint)
============================================================ */
const PALETA_PRESETS = [
  // Neutros
  "#000000", "#3b322b", "#6b5b4a", "#a89a86", "#d9cfbf", "#ffffff", "#f5f0e6", "#e8e0d0",
  // Básicos
  "#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa", "#ec407a", "#00acc1",
  // Pastel
  "#ffcdd2", "#ffe0b2", "#fff9c4", "#c8e6c9", "#bbdefb", "#e1bee7", "#f8bbd0", "#b2ebf2",
  // Oscuros
  "#b71c1c", "#e65100", "#f57f17", "#1b5e20", "#0d47a1", "#4a148c", "#880e4f", "#004d40",
  // Tierra
  "#8d6e63", "#a1887f", "#bcaaa4", "#d7ccc8", "#795548", "#5d4037", "#a0703c", "#c9a37a",
  // Neón
  "#ff1744", "#ff9100", "#ffea00", "#00e676", "#00b0ff", "#d500f9", "#ff4081", "#18ffff",
];

/* ============================================================
   CONFIG
============================================================ */
const DECAY = { hambre: 0.30, felicidad: 0.20, energia: 0.15, limpieza: 0.10 };

const FRASES = {
  cabeza:  ["¡Miau!", "¡Eso cosquillas!", "¡Te quiero!", "Mmm... rico", "¡Otra vez!"],
  barriga: ["¡Ja ja ja!", "¡No tan fuerte!", "Qué rico...", "¡Sigue!"],
  orejas:  ["¡Mis orejas!", "¡Sensible!", "Mmm..."],
  cola:    ["¡Miau! ¡Cuidado!", "¡No me jales!", "¡Eso duele!", "¡Grrr!"],
  acaricia: ["Mmm... 🥰", "¡Qué rico!", "Sigue, sigue...", "Te adoro"],
  pegar:   ["¡Auch!", "¡Por qué?!", "😿 Me dolió...", "¡No me pegues!"],
  feliz:   ["¡Estoy feliz!", "¡Qué buen día!", "Te adoro 🥰"],
  triste:  ["Me siento solo...", "¿Me das cariño?", "Estoy triste 😿"],
  hambre:  ["¡Tengo hambre!", "¡Comida por favor!", "¡Me muero de hambre!"],
  sucio:   ["¡Necesito un baño!", "Huelo mal...", "¡Ayuda! 🛁"],
  sueno:   ["Tengo sueño...", "Zzz...", "Cinco minutos más..."],
  comer:   ["¡Mmm delicioso!", "¡Qué rico!", "¡Más, más!", "¡Ñam ñam!"],
  noComer: ["No me gusta eso...", "¡Puaj!", "Mejor otra cosa"]
};

/* ============================================================
   HELPERS
============================================================ */
const el = id => document.getElementById(id);
const clamp = v => Math.max(0, Math.min(100, v));
const rand = arr => arr[Math.floor(Math.random() * arr.length)];

function aplicarDecaimiento(stats, ultimaVez) {
  const min = (Date.now() - ultimaVez) / 60000;
  return {
    hambre:    clamp(stats.hambre    - min * DECAY.hambre),
    felicidad: clamp(stats.felicidad - min * DECAY.felicidad),
    energia:   clamp(stats.energia   - min * DECAY.energia),
    limpieza:  clamp(stats.limpieza  - min * DECAY.limpieza),
    salud:     clamp(stats.salud ?? 100)
  };
}

function calcularAnimo(s) {
  const avg = (s.hambre + s.felicidad + s.energia + s.limpieza) / 4;
  if (s.hambre < 25)   return "hambriento";
  if (s.energia < 20)  return "dormido";
  if (s.limpieza < 25) return "triste";
  if (avg >= 70)       return "feliz";
  if (avg >= 40)       return "neutral";
  return "triste";
}

function xpParaNivel(n) { return n * 100; }
function calcularNivel(xp) {
  let nivel = 1, restante = xp;
  while (restante >= xpParaNivel(nivel)) { restante -= xpParaNivel(nivel); nivel++; }
  return { nivel, xpEnNivel: restante, xpNecesario: xpParaNivel(nivel) };
}

function getItem(id) {
  const todos = [...CATALOGO.fondos, ...CATALOGO.objetos, ...CATALOGO.comidas];
  return todos.find(i => i.id === id);
}

function estaDesbloqueado(id) {
  return (mascotaActual?.desbloqueados || []).includes(id);
}

/* ============================================================
   MIGRACIÓN AUTOMÁTICA
============================================================ */
async function migrarMascota(data) {
  const cambios = {};

  if (typeof data.monedas !== "number") {
    cambios.monedas = MONEDAS_INICIALES;
  }

  if (!Array.isArray(data.desbloqueados) || data.desbloqueados.length === 0) {
    cambios.desbloqueados = [...DESBLOQUEADOS_INICIALES];
  }

  if (!data.equipamiento || typeof data.equipamiento !== "object") {
    cambios.equipamiento = { fondo: "fondo-sala", objetos: [] };
  } else {
    if (!data.equipamiento.fondo) cambios.equipamiento = { ...data.equipamiento, fondo: "fondo-sala" };
    if (!Array.isArray(data.equipamiento.objetos)) {
      cambios.equipamiento = { ...(cambios.equipamiento || data.equipamiento), objetos: [] };
    }
  }

  if (Object.keys(cambios).length > 0) {
    console.log("🔧 Migrando mascota con campos faltantes:", cambios);
    try {
      await setDoc(mascotaRef, cambios, { merge: true });
    } catch (err) {
      console.error("Error migrando:", err);
    }
  }
}

/* ============================================================
   NAVEGACIÓN
============================================================ */
const TITULOS = {
  home:      { t: "Nuestra Mascota", s: "Cuídala con cariño" },
  alimentar: { t: "Hora de comer",    s: "Arrastra la comida" },
  jugar:     { t: "Hora de jugar",    s: "Diviértanse juntos" },
  banar:     { t: "Hora del baño",    s: "¡A limpiarse!" },
  dormir:    { t: "Hora de dormir",   s: "Zzz..." },
  carino:    { t: "Mimos",            s: "Consiente a la mascota" },
  curar:     { t: "Enfermería",       s: "Cuídala si está mal" },
  crear:     { t: "Nueva mascota",    s: "Elijan juntos" },
  tienda:    { t: "Tienda",           s: "Gana monedas y decora" }
};

function irA(nombre) {
  const pantallas = document.querySelectorAll(".pantalla");
  pantallas.forEach(p => p.classList.remove("activa"));
  const objetivo = document.querySelector(`[data-pantalla="${nombre}"]`);
  if (!objetivo) return;

  objetivo.classList.add("activa");
  const info = TITULOS[nombre];
  if (info) {
    el("titulo-pantalla").textContent = info.t;
    el("subtitulo-pantalla").textContent = info.s;
  }
  el("btn-volver").classList.toggle("oculto", nombre === "home" || nombre === "crear");

  if (nombre === "tienda") {
    renderizarTienda();
  } else if (nombre === "alimentar") {
    cargarEscena("alimentar");
    renderizarComidas();
  } else if (ESCENAS[nombre]) {
    cargarEscena(nombre);
  }
}

document.querySelectorAll(".accion-home").forEach(btn => {
  btn.addEventListener("click", () => irA(btn.dataset.ir));
});

el("btn-volver").addEventListener("click", () => {
  const activa = document.querySelector(".pantalla.activa");
  if (activa && activa.dataset.pantalla !== "home") irA("home");
  else location.href = "../menu.html";
});

/* ============================================================
   EXPRESIONES
============================================================ */
function aplicarExpresion(tipo) {
  const svg = el("mascota-svg");
  if (!svg) return;
  svg.classList.remove("exp-feliz", "exp-triste", "exp-enojado", "exp-dormido", "exp-hambriento");
  const mapa = {
    feliz: "exp-feliz", neutral: "exp-feliz", triste: "exp-triste",
    enojado: "exp-enojado", dormido: "exp-dormido", hambriento: "exp-hambriento"
  };
  svg.classList.add(mapa[tipo] || "exp-feliz");
}

/* ============================================================
   BURBUJA + PARTÍCULAS
============================================================ */
function mostrarBurbuja(texto, duracion = 2200) {
  const b = el("mascota-bubble");
  if (!b) return;
  b.textContent = texto;
  b.classList.add("visible");
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove("visible"), duracion);
}

function lanzarParticula(emoji, cantidad = 5, containerId = "particulas-home") {
  const contenedor = el(containerId);
  if (!contenedor) return;
  for (let i = 0; i < cantidad; i++) {
    const p = document.createElement("span");
    p.className = "particula";
    p.textContent = emoji;
    p.style.left = (30 + Math.random() * 40) + "%";
    p.style.top = (40 + Math.random() * 20) + "%";
    p.style.setProperty("--dx", (Math.random() * 60 - 30) + "px");
    p.style.animationDelay = (i * 0.08) + "s";
    contenedor.appendChild(p);
    setTimeout(() => p.remove(), 1800);
  }
}

/* ============================================================
   SONIDOS
============================================================ */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  return audioCtx;
}

function sonido(tipo) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);

  const plays = {
    miau: () => {
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + 0.15);
      osc.frequency.exponentialRampToValueAtTime(500, t + 0.35);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.start(t); osc.stop(t + 0.4);
    },
    ronroneo: () => {
      osc.type = "sawtooth"; osc.frequency.setValueAtTime(80, t);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t); osc.stop(t + 0.6);
    },
    pop: () => {
      osc.type = "triangle"; osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.start(t); osc.stop(t + 0.15);
    },
    error: () => {
      osc.type = "square"; osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.25);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t); osc.stop(t + 0.3);
    },
    sueno: () => {
      osc.type = "sine"; osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(200, t + 0.5);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t); osc.stop(t + 0.55);
    },
    comer: () => {
      osc.type = "square"; osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(400, t + 0.1);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.start(t); osc.stop(t + 0.15);
    },
    moneda: () => {
      osc.type = "triangle"; osc.frequency.setValueAtTime(1200, t);
      osc.frequency.exponentialRampToValueAtTime(1800, t + 0.05);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.start(t); osc.stop(t + 0.2);
    }
  };
  (plays[tipo] || plays.pop)();
}

/* ============================================================
   RENDER
============================================================ */
function renderStats(s) {
  el("mini-hambre").textContent    = Math.round(s.hambre);
  el("mini-felicidad").textContent = Math.round(s.felicidad);
  el("mini-energia").textContent   = Math.round(s.energia);
  el("mini-limpieza").textContent  = Math.round(s.limpieza);
}

function renderNivel(xp) {
  const { nivel } = calcularNivel(xp);
  el("mascota-nivel").textContent = nivel;
}

function aplicarImagenMascota(tipo) {
  const rutaImg = null;
  const svgHome = el("mascota-svg");
  const imgHome = el("mascota-img");
  const svgCocina = document.querySelector(".mascota-svg-cocina");
  const imgCocina = el("mascota-img-cocina");

  if (rutaImg) {
    if (imgHome) { imgHome.src = rutaImg; imgHome.hidden = false; }
    if (svgHome) svgHome.hidden = true;
    if (imgCocina) { imgCocina.src = rutaImg; imgCocina.hidden = false; }
    if (svgCocina) svgCocina.style.display = "none";
  } else {
    if (imgHome) imgHome.hidden = true;
    if (svgHome) { svgHome.hidden = false; svgHome.dataset.tipo = tipo; }
    if (imgCocina) imgCocina.hidden = true;
    if (svgCocina) svgCocina.style.display = "";
  }
}

function renderMascota(m) {
  mascotaActual = m;
  const tipo = m.tipo || "conejo";
  aplicarImagenMascota(tipo);
  el("mascota-nombre").textContent = m.nombre;

  const stats = aplicarDecaimiento(m.stats, m.ultimaVezActualizado);
  aplicarExpresion(calcularAnimo(stats));
  renderStats(stats);
  renderNivel(m.xp || 0);

  const mc = el("monedas-cantidad");
  if (mc) mc.textContent = m.monedas || 0;

  aplicarColoresPersonalizados();

  const activa = document.querySelector(".pantalla.activa");
  if (activa && ESCENAS[activa.dataset.pantalla]) {
    cargarEscena(activa.dataset.pantalla);
  }
}

/* ============================================================
   CARGAR ESCENA
============================================================ */
function cargarEscena(nombreEscena) {
  const config = ESCENAS[nombreEscena];
  if (!config) return;

  const capaFondo = el(`fondo-${nombreEscena}`);
  const capaObjetos = el(`objetos-${nombreEscena}`);
  const eq = mascotaActual?.equipamiento || {};

  if (capaFondo) {
    let fondoId = config.fondoDefault;
    if (eq.fondo) {
      const fondoEquip = getItem(eq.fondo);
      if (fondoEquip && fondoEquip.categoria === config.categoria) {
        fondoId = eq.fondo;
      }
    }
    const fondo = getItem(fondoId);
    capaFondo.style.backgroundImage = "";

    if (fondo?.img) {
      const img = new Image();
      img.onload = () => { capaFondo.style.backgroundImage = `url("${fondo.img}")`; };
      img.onerror = () => {
        capaFondo.style.background = fondoGradiente(nombreEscena);
      };
      img.src = fondo.img;
    } else {
      capaFondo.style.background = fondoGradiente(nombreEscena);
    }
  }

  if (capaObjetos) {
    capaObjetos.innerHTML = "";
    const objetos = eq.objetos || [];
    objetos.forEach((id, i) => {
      const zona = (config.zonasObjetos || [])[i];
      if (!zona) return;
      const obj = getItem(id);
      if (!obj) return;

      const img = new Image();
      img.className = "objeto-deco";
      img.style.left = zona.x;
      img.style.top = zona.y;
      img.style.width = zona.w;
      img.alt = "";
      img.onerror = () => {
        img.remove();
        const span = document.createElement("span");
        span.className = "objeto-deco emoji";
        span.textContent = obj.emoji;
        span.style.left = zona.x;
        span.style.top = zona.y;
        capaObjetos.appendChild(span);
      };
      img.src = obj.img;
      capaObjetos.appendChild(img);
    });
  }
}

function fondoGradiente(nombre) {
  const map = {
    home: "linear-gradient(180deg, #5a4232 0%, #7d5a44 40%, #6b4a38 100%)",
    alimentar: "linear-gradient(180deg, #6b4a38 0%, #8b6a4a 60%, #a47e5a 100%)",
    jugar: "linear-gradient(180deg, #4a6b3a 0%, #7da654 100%)",
    banar: "linear-gradient(180deg, #4a6b8b 0%, #7cc0d4 100%)",
    dormir: "linear-gradient(180deg, #1a1d2e 0%, #3b322b 100%)",
    carino: "linear-gradient(180deg, #6b3a4a 0%, #b06a8a 100%)",
    curar: "linear-gradient(180deg, #e8e0d0 0%, #c9b48e 100%)"
  };
  return map[nombre] || "linear-gradient(180deg, #5a4232, #8b6a4a)";
}

/* ============================================================
   COLOR PICKER
============================================================ */
function inicializarPaleta() {
  const grid = el("paleta-basicos");
  if (!grid) return;
  grid.innerHTML = "";
  PALETA_PRESETS.forEach(color => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "paleta-swatch";
    btn.style.background = color;
    btn.dataset.color = color;
    btn.addEventListener("click", () => aplicarColorSlot(color));
    grid.appendChild(btn);
  });
}

function renderRecientes() {
  const sec = el("seccion-recientes");
  const grid = el("paleta-recientes");
  if (!grid || !sec) return;
  if (recientes.length === 0) {
    sec.hidden = true;
    return;
  }
  sec.hidden = false;
  grid.innerHTML = "";
  recientes.forEach(color => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "paleta-swatch";
    btn.style.background = color;
    btn.dataset.color = color;
    btn.addEventListener("click", () => aplicarColorSlot(color));
    grid.appendChild(btn);
  });
}

function cargarColoresDeMascota() {
  if (mascotaActual?.coloresPersonalizados) {
    coloresTemp = { ...mascotaActual.coloresPersonalizados };
  } else {
    coloresTemp = { principal: "#e8d5b8", claro: "#f5ebe0", rosa: "#f5a8b8" };
  }
}

function actualizarPreviewModal() {
  el("preview-circulo-principal").style.background = coloresTemp.principal;
  el("preview-circulo-claro").style.background = coloresTemp.claro;
  el("preview-circulo-rosa").style.background = coloresTemp.rosa;

  el("slot-valor-principal").textContent = coloresTemp.principal.toUpperCase();
  el("slot-valor-claro").textContent = coloresTemp.claro.toUpperCase();
  el("slot-valor-rosa").textContent = coloresTemp.rosa.toUpperCase();

  el("color-custom").value = coloresTemp[slotActivo];
  el("color-custom-hex").textContent = coloresTemp[slotActivo].toUpperCase();
}

function aplicarColorSlot(color) {
  coloresTemp[slotActivo] = color;
  actualizarPreviewModal();

  const circulo = el(`preview-circulo-${slotActivo}`);
  if (circulo) {
    circulo.classList.remove("pulso");
    void circulo.offsetWidth;
    circulo.classList.add("pulso");
  }

  aplicarColoresPersonalizadosTemp();
  sonido("pop");
}

function aplicarColoresPersonalizadosTemp() {
  const svg = el("mascota-svg");
  const svgCocina = document.querySelector(".mascota-svg-cocina");
  [svg, svgCocina].forEach(s => {
    if (!s) return;
    s.style.setProperty("--color-principal", coloresTemp.principal);
    s.style.setProperty("--color-claro", coloresTemp.claro);
    s.style.setProperty("--color-rosa", coloresTemp.rosa);
  });
}

function aplicarColoresPersonalizados() {
  const svg = el("mascota-svg");
  const svgCocina = document.querySelector(".mascota-svg-cocina");
  const colores = mascotaActual?.coloresPersonalizados;

  [svg, svgCocina].forEach(s => {
    if (!s) return;
    if (colores) {
      s.style.setProperty("--color-principal", colores.principal);
      s.style.setProperty("--color-claro", colores.claro);
      s.style.setProperty("--color-rosa", colores.rosa);
    } else {
      s.style.removeProperty("--color-principal");
      s.style.removeProperty("--color-claro");
      s.style.removeProperty("--color-rosa");
    }
  });
}

function abrirModalColor() {
  const modal = el("modal-color");
  if (!modal) return;
  cargarColoresDeMascota();
  slotActivo = "principal";
  document.querySelectorAll(".slot-color").forEach(s => {
    s.classList.toggle("active", s.dataset.slot === "principal");
  });
  actualizarPreviewModal();
  aplicarColoresPersonalizadosTemp();
  renderRecientes();
  modal.hidden = false;
}

function cerrarModalColor() {
  const modal = el("modal-color");
  if (!modal) return;
  modal.hidden = true;
  aplicarColoresPersonalizados();
}

async function guardarColores() {
  if (!mascotaRef) return;
  try {
    await setDoc(mascotaRef, {
      coloresPersonalizados: { ...coloresTemp }
    }, { merge: true });

    const todos = [coloresTemp.principal, coloresTemp.claro, coloresTemp.rosa];
    todos.forEach(c => {
      recientes = [c, ...recientes.filter(x => x !== c)].slice(0, 16);
    });
    localStorage.setItem("mascota-colores-recientes", JSON.stringify(recientes));

    mostrarToast("🎨 ¡Colores guardados!");
    sonido("moneda");
    cerrarModalColor();
  } catch (err) {
    console.error(err);
    mostrarToast("❌ Error guardando");
  }
}

// Cargar recientes al inicio
try {
  recientes = JSON.parse(localStorage.getItem("mascota-colores-recientes") || "[]");
} catch(e) { recientes = []; }

// Listeners del modal
el("btn-personalizar")?.addEventListener("click", abrirModalColor);
el("modal-color-cerrar")?.addEventListener("click", cerrarModalColor);
el("modal-color")?.addEventListener("click", e => {
  if (e.target.id === "modal-color") cerrarModalColor();
});

document.querySelectorAll(".slot-color").forEach(slot => {
  slot.addEventListener("click", () => {
    document.querySelectorAll(".slot-color").forEach(s => s.classList.remove("active"));
    slot.classList.add("active");
    slotActivo = slot.dataset.slot;
    el("color-custom").value = coloresTemp[slotActivo];
    el("color-custom-hex").textContent = coloresTemp[slotActivo].toUpperCase();
  });
});

el("color-custom")?.addEventListener("input", e => {
  aplicarColorSlot(e.target.value);
});

el("btn-color-reset")?.addEventListener("click", () => {
  coloresTemp = { principal: "#e8d5b8", claro: "#f5ebe0", rosa: "#f5a8b8" };
  actualizarPreviewModal();
  aplicarColoresPersonalizadosTemp();
  mostrarToast("🔄 Colores reseteados");
});

el("btn-color-guardar")?.addEventListener("click", guardarColores);

inicializarPaleta();

/* ============================================================
   MONEDAS
============================================================ */
async function darMonedas(cantidad) {
  if (!mascotaRef) return;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(mascotaRef);
      if (!snap.exists()) return;
      const data = snap.data();
      tx.update(mascotaRef, { monedas: (data.monedas || 0) + cantidad });
    });
    sonido("moneda");
    const cont = el("particulas-home");
    if (cont) {
      const p = document.createElement("span");
      p.className = "particula";
      p.textContent = "🪙";
      p.style.left = "50%";
      p.style.top = "50%";
      cont.appendChild(p);
      setTimeout(() => p.remove(), 1800);
    }
  } catch (err) { console.error(err); }
}

/* ============================================================
   TIENDA
============================================================ */
let categoriaActual = "fondos";
let subcategoriaActual = "todas";

function esEquipado(item) {
  const eq = mascotaActual?.equipamiento || {};
  if (item.id.startsWith("fondo-")) return eq.fondo === item.id;
  if (item.id.startsWith("obj-"))   return (eq.objetos || []).includes(item.id);
  return false;
}

async function comprarItem(id) {
  const item = getItem(id);
  if (!item) return;
  const monedasActuales = mascotaActual?.monedas || 0;
  if (monedasActuales < item.precio) {
    mostrarToast("❌ No tienes suficientes monedas");
    return;
  }
  if (estaDesbloqueado(id)) {
    mostrarToast("Ya lo tienes");
    return;
  }
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(mascotaRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const desc = data.desbloqueados || [];
      if (desc.includes(id)) return;
      tx.update(mascotaRef, {
        monedas: (data.monedas || 0) - item.precio,
        desbloqueados: [...desc, id]
      });
    });
    mostrarToast(`✨ ¡Compraste ${item.nombre}!`);
    sonido("pop");
  } catch (err) {
    console.error(err);
    mostrarToast("❌ Error");
  }
}

async function equiparFondo(id) {
  try {
    const eq = mascotaActual?.equipamiento || {};
    await setDoc(mascotaRef, { equipamiento: { ...eq, fondo: id } }, { merge: true });
    mostrarToast("🏠 Fondo equipado");
    sonido("pop");
  } catch (err) { console.error(err); }
}

async function equiparObjeto(id) {
  const eq = mascotaActual?.equipamiento || {};
  const equipados = eq.objetos || [];
  if (equipados.includes(id)) {
    mostrarToast("Ya está colocado");
    return;
  }
  if (equipados.length >= 5) {
    mostrarToast("Máximo 5 objetos por escena");
    return;
  }
  try {
    await setDoc(mascotaRef, {
      equipamiento: { ...eq, objetos: [...equipados, id] }
    }, { merge: true });
    mostrarToast("🪴 Objeto colocado");
    sonido("pop");
  } catch (err) { console.error(err); }
}

async function quitarObjeto(id) {
  const eq = mascotaActual?.equipamiento || {};
  const equipados = eq.objetos || [];
  try {
    await setDoc(mascotaRef, {
      equipamiento: { ...eq, objetos: equipados.filter(x => x !== id) }
    }, { merge: true });
    mostrarToast("🗑️ Objeto quitado");
  } catch (err) { console.error(err); }
}

function renderizarTienda() {
  const cont = el("tienda-contenido");
  if (!cont || !mascotaActual) return;

  cont.innerHTML = "";
  const monedas = mascotaActual.monedas || 0;
  el("tienda-monedas").textContent = monedas;

  if (categoriaActual === "equipados") {
    renderizarEquipados(cont);
    return;
  }

  const subs = SUBCATEGORIAS[categoriaActual] || [];
  if (subs.length > 1) {
    const filtros = document.createElement("div");
    filtros.className = "subcategorias";
    subs.forEach(sub => {
      const btn = document.createElement("button");
      btn.className = "subcat" + (sub.id === subcategoriaActual ? " active" : "");
      btn.innerHTML = `${sub.emoji} ${sub.nombre}`;
      btn.addEventListener("click", () => {
        subcategoriaActual = sub.id;
        renderizarTienda();
      });
      filtros.appendChild(btn);
    });
    cont.appendChild(filtros);
  }

  let items = CATALOGO[categoriaActual] || [];
  if (subcategoriaActual !== "todas") {
    items = items.filter(i => i.categoria === subcategoriaActual);
  }

  items = [...items].sort((a, b) => {
    const da = estaDesbloqueado(a.id) ? 0 : 1;
    const db = estaDesbloqueado(b.id) ? 0 : 1;
    if (da !== db) return da - db;
    return a.precio - b.precio;
  });

  items.forEach(item => {
    const desbloqueado = estaDesbloqueado(item.id);
    const equipado = esEquipado(item);

    const div = document.createElement("div");
    div.className = "tienda-item";
    if (!desbloqueado) div.classList.add("bloqueado");
    if (equipado) div.classList.add("equipado");

    if (equipado) {
      const s = document.createElement("span");
      s.className = "item-estado equipado";
      s.textContent = "✓ Equipado";
      div.appendChild(s);
    } else if (desbloqueado) {
      const s = document.createElement("span");
      s.className = "item-estado comprado";
      s.textContent = "Comprado";
      div.appendChild(s);
    } else if (item.precio === 0) {
      const s = document.createElement("span");
      s.className = "item-estado gratis";
      s.textContent = "Gratis";
      div.appendChild(s);
    }

    const iconoDiv = document.createElement("div");
    iconoDiv.className = "item-icono";
    const img = document.createElement("img");
    img.src = item.img;
    img.alt = item.emoji;
    img.onerror = () => {
      img.remove();
      iconoDiv.textContent = item.emoji;
    };
    iconoDiv.appendChild(img);

    const nombre = document.createElement("div");
    nombre.className = "item-nombre";
    nombre.textContent = item.nombre;

    if (!desbloqueado) {
      const precio = document.createElement("div");
      precio.className = "item-precio";
      precio.innerHTML = `🪙 ${item.precio}`;
      div.appendChild(precio);
    }

    const botones = document.createElement("div");
    botones.className = "item-botones";

    if (!desbloqueado) {
      const btnComprar = document.createElement("button");
      btnComprar.className = "btn-comprar";
      btnComprar.textContent = "Comprar";
      btnComprar.disabled = monedas < item.precio;
      btnComprar.addEventListener("click", () => comprarItem(item.id));
      botones.appendChild(btnComprar);
    } else if (equipado) {
      if (item.id.startsWith("obj-")) {
        const btnQuitar = document.createElement("button");
        btnQuitar.className = "btn-quitar";
        btnQuitar.textContent = "Quitar";
        btnQuitar.addEventListener("click", () => quitarObjeto(item.id));
        botones.appendChild(btnQuitar);
      } else if (item.id.startsWith("fondo-")) {
        const tag = document.createElement("span");
        tag.className = "tag-equipado";
        tag.textContent = "En uso";
        botones.appendChild(tag);
      }
    } else {
      const btnEquipar = document.createElement("button");
      btnEquipar.className = "btn-equipar";
      btnEquipar.textContent = "Equipar";
      btnEquipar.addEventListener("click", () => {
        if (categoriaActual === "fondos") equiparFondo(item.id);
        else if (categoriaActual === "objetos") equiparObjeto(item.id);
      });
      botones.appendChild(btnEquipar);
    }

    div.appendChild(iconoDiv);
    div.appendChild(nombre);
    if (botones.children.length > 0) div.appendChild(botones);
    cont.appendChild(div);
  });
}

function renderizarEquipados(cont) {
  const eq = mascotaActual?.equipamiento || { fondo: null, objetos: [] };
  const fondo = eq.fondo ? getItem(eq.fondo) : null;

  let html = `<div class="tienda-seccion">Fondo actual</div>`;
  if (fondo) {
    html += `
      <div class="tienda-item equipado">
        <div class="item-icono">${fondo.emoji}</div>
        <div class="item-nombre">${fondo.nombre}</div>
      </div>`;
  } else {
    html += `<div class="tienda-item bloqueado"><div class="item-nombre">Sin fondo</div></div>`;
  }

  const objetos = eq.objetos || [];
  html += `<div class="tienda-seccion">Objetos colocados (${objetos.length}/5)</div>`;
  if (objetos.length === 0) {
    html += `<div class="tienda-item bloqueado"><div class="item-nombre">Sin objetos</div></div>`;
  } else {
    objetos.forEach(id => {
      const obj = getItem(id);
      if (!obj) return;
      html += `
        <div class="tienda-item equipado">
          <div class="item-icono">${obj.emoji}</div>
          <div class="item-nombre">${obj.nombre}</div>
          <div class="item-botones">
            <button class="btn-quitar" data-quitar="${id}">Quitar</button>
          </div>
        </div>`;
    });
  }

  cont.innerHTML = html;
  cont.querySelectorAll("[data-quitar]").forEach(btn => {
    btn.addEventListener("click", () => quitarObjeto(btn.dataset.quitar));
  });
}

document.querySelectorAll(".tienda-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tienda-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    categoriaActual = tab.dataset.cat;
    subcategoriaActual = "todas";
    renderizarTienda();
  });
});

el("btn-tienda")?.addEventListener("click", () => irA("tienda"));

/* ============================================================
   INTERACCIONES HOME
============================================================ */
const svg = el("mascota-svg");
let interaccion = { activa: false, inicio: null, inicioTiempo: 0, acariciando: false, ultimaParticula: 0 };

svg.addEventListener("pointerdown", e => {
  e.preventDefault();
  svg.setPointerCapture(e.pointerId);
  interaccion.activa = true;
  interaccion.inicio = { x: e.clientX, y: e.clientY };
  interaccion.inicioTiempo = Date.now();
  interaccion.acariciando = false;
});

svg.addEventListener("pointermove", e => {
  if (!interaccion.activa) return;
  const dx = e.clientX - interaccion.inicio.x;
  const dy = e.clientY - interaccion.inicio.y;
  const dist = Math.sqrt(dx*dx + dy*dy);

  if (dist > 20 && !interaccion.acariciando) {
    interaccion.acariciando = true;
    mostrarBurbuja(rand(FRASES.acaricia));
    sonido("ronroneo");
  }

  if (interaccion.acariciando) {
    const ahora = Date.now();
    if (ahora - interaccion.ultimaParticula > 150) {
      interaccion.ultimaParticula = ahora;
      const cont = el("particulas-home");
      const p = document.createElement("span");
      p.className = "particula";
      p.textContent = "❤️";
      p.style.left = (e.clientX - cont.getBoundingClientRect().left) + "px";
      p.style.top = (e.clientY - cont.getBoundingClientRect().top) + "px";
      p.style.setProperty("--dx", (Math.random() * 40 - 20) + "px");
      cont.appendChild(p);
      setTimeout(() => p.remove(), 1800);
    }
  }
});

svg.addEventListener("pointerup", e => {
  if (!interaccion.activa) return;
  const dx = e.clientX - interaccion.inicio.x;
  const dy = e.clientY - interaccion.inicio.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  const tiempo = Date.now() - interaccion.inicioTiempo;
  const velocidad = dist / tiempo;

  if (interaccion.acariciando) {
    cambiarStat("felicidad", 5);
    aplicarExpresion("feliz");
    setTimeout(() => {
      if (mascotaActual) aplicarExpresion(calcularAnimo(aplicarDecaimiento(mascotaActual.stats, mascotaActual.ultimaVezActualizado)));
    }, 1500);
  } else if (velocidad > 1.2 && dist > 40) {
    mostrarBurbuja(rand(FRASES.pegar));
    lanzarParticula("💢", 4);
    sonido("error");
    aplicarExpresion("enojado");
    cambiarStat("felicidad", -15);
    cambiarStat("salud", -5);
    setTimeout(() => {
      if (mascotaActual) aplicarExpresion(calcularAnimo(aplicarDecaimiento(mascotaActual.stats, mascotaActual.ultimaVezActualizado)));
    }, 2000);
  } else {
    const zona = detectarZona(e.clientX, e.clientY);
    reaccionZona(zona);
  }

  interaccion.activa = false;
  interaccion.acariciando = false;
});

svg.addEventListener("pointercancel", () => {
  interaccion.activa = false;
  interaccion.acariciando = false;
});

function detectarZona(clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width * 220;
  const y = (clientY - rect.top) / rect.height * 280;
  if (y < 110) return "orejas";
  if (y < 175) return "cabeza";
  if (x > 160 && y > 175) return "cola";
  return "barriga";
}

function reaccionZona(zona) {
  if (!mascotaActual) return;
  const stats = aplicarDecaimiento(mascotaActual.stats, mascotaActual.ultimaVezActualizado);
  const animo = calcularAnimo(stats);

  if (animo === "dormido" && zona !== "cabeza") {
    mostrarBurbuja("Zzz...");
    return;
  }

  const config = {
    cabeza:  { frase: FRASES.cabeza, emoji: "❤️", sonido: "ronroneo", stat: ["felicidad", 5] },
    orejas:  { frase: FRASES.orejas, emoji: "✨", sonido: "miau",     stat: ["felicidad", 3] },
    barriga: { frase: FRASES.barriga, emoji: "✨", sonido: "pop",      stat: ["felicidad", 4] },
    cola:    { frase: FRASES.cola,    emoji: "💢", sonido: "error",    stat: ["felicidad", -8] }
  }[zona] || { frase: FRASES.cabeza, emoji: "❤️", sonido: "pop", stat: ["felicidad", 3] };

  mostrarBurbuja(rand(config.frase));
  lanzarParticula(config.emoji, 4);
  sonido(config.sonido);
  if (config.stat[1] > 0) aplicarExpresion("feliz");
  else { aplicarExpresion("enojado"); setTimeout(() => aplicarExpresion(calcularAnimo(stats)), 1500); }
  cambiarStat(config.stat[0], config.stat[1]);

  svg.style.transform = "scale(1.05)";
  setTimeout(() => svg.style.transform = "", 200);
}

/* ============================================================
   DRAG & DROP COMIDA
============================================================ */
const zonaDrop = el("zona-drop");
const mascotaCocina = el("mascota-cocina");
const bubbleCocina = el("bubble-cocina");
let comidaArrastrada = null;
let fantasma = null;

function mostrarBubbleCocina(texto, duracion = 2000) {
  if (!bubbleCocina) return;
  bubbleCocina.textContent = texto;
  bubbleCocina.classList.add("visible");
  clearTimeout(bubbleCocina._t);
  bubbleCocina._t = setTimeout(() => bubbleCocina.classList.remove("visible"), duracion);
}

function registrarDragComidas() {
  document.querySelectorAll(".comida").forEach(comida => {
    comida.addEventListener("pointerdown", e => {
      e.preventDefault();
      comidaArrastrada = comida;
      comida.classList.add("arrastrando");

      fantasma = document.createElement("span");
      fantasma.className = "comida-fantasma";
      const emojiEl = comida.querySelector("span");
      const imgEl = comida.querySelector("img");
      if (imgEl && !imgEl.hidden) {
        const clone = imgEl.cloneNode();
        fantasma.appendChild(clone);
      } else {
        fantasma.textContent = emojiEl?.textContent || "🍎";
      }
      document.body.appendChild(fantasma);
      moverFantasma(e.clientX, e.clientY);
      comida.setPointerCapture(e.pointerId);
    });

    comida.addEventListener("pointermove", e => {
      if (!fantasma) return;
      moverFantasma(e.clientX, e.clientY);
      const sobre = estaSobreMascota(e.clientX, e.clientY);
      zonaDrop?.classList.toggle("hover", sobre);
    });

    comida.addEventListener("pointerup", e => {
      if (!fantasma) return;
      const sobre = estaSobreMascota(e.clientX, e.clientY);
      if (sobre) alimentarMascota(comida, e.clientX, e.clientY);

      fantasma.remove();
      fantasma = null;
      comidaArrastrada?.classList.remove("arrastrando");
      comidaArrastrada = null;
      zonaDrop?.classList.remove("hover");
    });

    comida.addEventListener("pointercancel", () => {
      if (fantasma) fantasma.remove();
      fantasma = null;
      if (comidaArrastrada) comidaArrastrada.classList.remove("arrastrando");
      comidaArrastrada = null;
      zonaDrop?.classList.remove("hover");
    });
  });
}

function moverFantasma(x, y) {
  if (!fantasma) return;
  fantasma.style.left = x + "px";
  fantasma.style.top = y + "px";
}

function estaSobreMascota(x, y) {
  if (!mascotaCocina) return false;
  const rect = mascotaCocina.getBoundingClientRect();
  const margen = 40;
  return x >= rect.left - margen && x <= rect.right + margen &&
         y >= rect.top - margen && y <= rect.bottom + margen;
}

async function alimentarMascota(comidaEl, x, y) {
  const comidaId = comidaEl.dataset.comida;
  const item = getItem(comidaId);
  if (!item) return;
  const hambre = item.hambre || 0;
  const felicidad = item.felicidad || 0;
  const energia = item.energia || 0;

  const volando = document.createElement("span");
  volando.className = "comida-volando";
  volando.textContent = item.emoji;
  volando.style.left = x + "px";
  volando.style.top = y + "px";
  document.body.appendChild(volando);
  setTimeout(() => volando.remove(), 800);

  mascotaCocina?.classList.add("comiendo");
  setTimeout(() => mascotaCocina?.classList.remove("comiendo"), 1000);

  sonido("comer");
  mostrarBubbleCocina(rand(FRASES.comer));
  lanzarParticula("✨", 5, "particulas-home");

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(mascotaRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const stats = aplicarDecaimiento(data.stats, data.ultimaVezActualizado);
      stats.hambre = clamp(stats.hambre + hambre);
      if (felicidad) stats.felicidad = clamp(stats.felicidad + felicidad);
      if (energia) stats.energia = clamp(stats.energia + energia);

      const xp = (data.xp || 0) + 3;
      const monedas = (data.monedas || 0) + RECOMPENSAS.alimentar;
      const ultimasAcciones = [
        { uid: myUid, accion: "alimentar", comida: comidaId, ts: Date.now() },
        ...(data.ultimasAcciones || [])
      ].slice(0, 20);

      tx.update(mascotaRef, { stats, xp, monedas, ultimaVezActualizado: Date.now(), ultimasAcciones });
    });
    mostrarToast(`${item.emoji} ¡Ñam! +${hambre} hambre · +${RECOMPENSAS.alimentar}🪙`);
  } catch (err) {
    console.error(err);
    mostrarToast("❌ Error");
  }
}

/* ============================================================
   COMIDAS (bandeja)
============================================================ */
function renderizarComidas() {
  const bandeja = el("bandeja-comidas");
  if (!bandeja || !mascotaActual) return;
  bandeja.innerHTML = "";

  const comidasDesbloqueadas = CATALOGO.comidas.filter(c => estaDesbloqueado(c.id));
  comidasDesbloqueadas.forEach(c => {
    const div = document.createElement("div");
    div.className = "comida";
    div.dataset.comida = c.id;

    const img = document.createElement("img");
    img.src = c.img;
    img.alt = c.emoji;
    img.onerror = () => {
      img.remove();
      const span = document.createElement("span");
      span.textContent = c.emoji;
      div.insertBefore(span, div.firstChild);
    };

    const small = document.createElement("small");
    small.textContent = c.nombre;

    div.appendChild(img);
    div.appendChild(small);
    bandeja.appendChild(div);
  });

  registrarDragComidas();
}

/* ============================================================
   CAMBIAR STATS
============================================================ */
async function cambiarStat(nombre, valor) {
  if (!mascotaRef || !mascotaActual) return;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(mascotaRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const stats = aplicarDecaimiento(data.stats, data.ultimaVezActualizado);
      stats[nombre] = clamp((stats[nombre] || 0) + valor);
      tx.update(mascotaRef, { stats, ultimaVezActualizado: Date.now() });
    });
  } catch (err) { console.error(err); }
}

/* ============================================================
   TOAST
============================================================ */
function mostrarToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("visible");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("visible"), 1800);
}

/* ============================================================
   CREAR MASCOTA
============================================================ */
document.querySelectorAll(".tipo").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tipo").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    tipoSeleccionado = btn.dataset.tipo;
    actualizarBotonCrear();
  });
});

el("nombre-mascota")?.addEventListener("input", actualizarBotonCrear);

function actualizarBotonCrear() {
  const nombre = el("nombre-mascota")?.value.trim();
  el("btn-crear").disabled = !(tipoSeleccionado && nombre);
}

el("btn-crear")?.addEventListener("click", async () => {
  const nombre = el("nombre-mascota").value.trim();
  if (!tipoSeleccionado || !nombre) return;
  try {
    await setDoc(mascotaRef, {
      nombre, tipo: tipoSeleccionado,
      nacimiento: Date.now(),
      nivel: 1, xp: 0,
      stats: { hambre: 100, felicidad: 100, energia: 100, limpieza: 100, salud: 100 },
      ultimaVezActualizado: Date.now(),
      ultimasAcciones: [],
      monedas: MONEDAS_INICIALES,
      desbloqueados: [...DESBLOQUEADOS_INICIALES],
      equipamiento: { fondo: "fondo-sala", objetos: [] },
      coloresPersonalizados: { principal: "#e8d5b8", claro: "#f5ebe0", rosa: "#f5a8b8" }
    });
    sonido("miau");
    mostrarToast("✨ ¡Mascota creada!");
    irA("home");
  } catch (err) {
    console.error(err);
    mostrarToast("❌ Error creando mascota");
  }
});

/* ============================================================
   FIREBASE
============================================================ */
async function init() {
  try {
    const cred = await signInAnonymously(auth);
    myUid = cred.user.uid;
    mascotaRef = doc(db, "parejas", PAREJA_ID, "mascota", "actual");

    onSnapshot(mascotaRef, snap => {
      if (snap.exists()) {
        const data = snap.data();
        migrarMascota(data);

        renderMascota(data);
        const activa = document.querySelector(".pantalla.activa");
        if (activa?.dataset.pantalla === "crear") irA("home");
        else if (activa?.dataset.pantalla === "home") {
          const stats = aplicarDecaimiento(data.stats, data.ultimaVezActualizado);
          renderStats(stats);
        } else if (activa?.dataset.pantalla === "tienda") {
          renderizarTienda();
        } else if (activa?.dataset.pantalla === "alimentar") {
          renderizarComidas();
        }
      } else {
        irA("crear");
      }
      el("status")?.classList.add("conectado");
    });
  } catch (err) {
    console.error("Firebase error:", err);
  }
}
init();

/* ============================================================
   DECAIMIENTO EN VIVO
============================================================ */
setInterval(() => {
  if (mascotaActual) {
    const stats = aplicarDecaimiento(mascotaActual.stats, mascotaActual.ultimaVezActualizado);
    renderStats(stats);
    if (document.querySelector('[data-pantalla="home"]')?.classList.contains("activa")) {
      aplicarExpresion(calcularAnimo(stats));
    }
  }
}, 30000);