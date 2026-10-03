/* ============================================================
   IMPORTS
============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { FIREBASE_CONFIG, PAREJA_ID } from "../citas/firebase-config.js";

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const auth = getAuth(app);

let myUid = null;
let mascotaRef = null;
let mascotaActual = null;
let tipoSeleccionado = null;

/* ============================================================
   CONFIG
============================================================ */
const DECAY = { hambre: 0.30, felicidad: 0.20, energia: 0.15, limpieza: 0.10 };

const ACCIONES = {
  alimentar: { stat: "hambre",    valor: 30, xp: 5,  icono: "🍖", verbo: "alimentó" },
  jugar:     { stat: "felicidad", valor: 25, xp: 8,  icono: "🎾", verbo: "jugó con", energia: -15 },
  banar:     { stat: "limpieza",  valor: 40, xp: 5,  icono: "🛁", verbo: "bañó a" },
  dormir:    { stat: "energia",   valor: 50, xp: 3,  icono: "💤", verbo: "hizo dormir a" },
  carino:    { stat: "felicidad", valor: 12, xp: 3,  icono: "❤️", verbo: "consintió a" },
  curar:     { stat: "salud",     valor: 30, xp: 10, icono: "💊", verbo: "curó a" }
};

// 👇 Emoji fijo según el tipo elegido (NO cambia con el ánimo)
const EMOJI_TIPO = {
  gato:   "🐱",
  perro:  "🐶",
  dragon: "🐲",
  conejo: "🐰"
};

/* ============================================================
   HELPERS
============================================================ */
const el = id => document.getElementById(id);
const clamp = v => Math.max(0, Math.min(100, v));

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

// Solo el TEXTO del estado de ánimo (el emoji ya no se usa para el avatar)
function calcularAnimo(s) {
  const avg = (s.hambre + s.felicidad + s.energia + s.limpieza) / 4;
  if (s.salud < 40) return "No me siento bien...";
  if (avg >= 80)    return "¡Estoy muy feliz!";
  if (avg >= 60)    return "Todo bien";
  if (avg >= 40)    return "Meh...";
  if (avg >= 20)    return "Estoy triste";
  return                   "¡Necesito ayuda!";
}

function xpParaNivel(n) { return n * 100; }
function calcularNivel(xp) {
  let nivel = 1, restante = xp;
  while (restante >= xpParaNivel(nivel)) { restante -= xpParaNivel(nivel); nivel++; }
  return { nivel, xpEnNivel: restante, xpNecesario: xpParaNivel(nivel) };
}
/* ============================================================
   RENDER
============================================================ */
function renderStats(s) {
  ["hambre", "felicidad", "energia", "limpieza"].forEach(k => {
    const bar = el(`stat-${k}`);
    const num = el(`num-${k}`);
    if (bar) {
      bar.style.width = s[k] + "%";
      bar.dataset.level = s[k] >= 60 ? "alto" : s[k] >= 30 ? "medio" : "bajo";
    }
    if (num) num.textContent = Math.round(s[k]) + "%";
  });
}

function renderNivel(xp) {
  const { nivel, xpEnNivel, xpNecesario } = calcularNivel(xp);
  el("mascota-nivel").textContent = nivel;
  el("xp-fill").style.width = (xpEnNivel / xpNecesario * 100) + "%";
}


function renderMascota(m) {
  mascotaActual = m;

  // 👇 FIX: ocultar pantalla de crear, mostrar la de mascota
  el("crear-mascota").hidden = true;
  el("mascota-area").hidden = false;

  const stats = aplicarDecaimiento(m.stats, m.ultimaVezActualizado);

  // 👇 FIX: SIEMPRE usar el emoji del TIPO (no del ánimo)
  const emoji = EMOJI_TIPO[m.tipo] || "🐱";
  el("mascota-avatar").textContent = emoji;

  el("mascota-nombre").textContent = m.nombre;

  renderStats(stats);
  renderNivel(m.xp || 0);

  // Burst de emoción al abrir
  el("mascota-bubble").textContent = calcularAnimo(stats);
  el("mascota-bubble").classList.add("visible");
  setTimeout(() => el("mascota-bubble").classList.remove("visible"), 2500);
}

/* ============================================================
   ACCIONES
============================================================ */
async function ejecutarAccion(nombre) {
  if (!mascotaRef || !mascotaActual) return;
  const cfg = ACCIONES[nombre];
  if (!cfg) return;

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(mascotaRef);
      if (!snap.exists()) return;
      const data = snap.data();

      const stats = aplicarDecaimiento(data.stats, data.ultimaVezActualizado);
      stats[cfg.stat] = clamp((stats[cfg.stat] || 0) + cfg.valor);
      if (cfg.energia) stats.energia = clamp(stats.energia + cfg.energia);

      const xp = (data.xp || 0) + cfg.xp;
      const ultimasAcciones = [
        { uid: myUid, accion: nombre, ts: Date.now() },
        ...(data.ultimasAcciones || [])
      ].slice(0, 20);

      tx.update(mascotaRef, {
        stats, xp,
        ultimaVezActualizado: Date.now(),
        ultimasAcciones
      });
    });

    el("mascota-avatar").classList.add("pop");
    setTimeout(() => el("mascota-avatar").classList.remove("pop"), 500);
    mostrarToast(`${cfg.icono} ¡${cfg.verbo} a ${mascotaActual.nombre}!`);
  } catch (err) {
    console.error("Error acción:", err);
    mostrarToast("❌ Algo salió mal");
  }
}

function mostrarToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("visible");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("visible"), 1800);
}

function setStatus(estado) {
  el("status")?.classList.toggle("conectado", estado === "conectado");
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
    // 👇 FIX: Ocultar manualmente la pantalla de crear al instante
    el("crear-mascota").hidden = true;

    await setDoc(mascotaRef, {
      nombre, tipo: tipoSeleccionado,
      nacimiento: Date.now(),
      nivel: 1, xp: 0,
      stats: { hambre: 100, felicidad: 100, energia: 100, limpieza: 100, salud: 100 },
      ultimaVezActualizado: Date.now(),
      ultimasAcciones: []
    });
    mostrarToast("✨ ¡Mascota creada!");
  } catch (err) {
    console.error(err);
    // Si falla, mostrar de nuevo la pantalla
    el("crear-mascota").hidden = false;
    mostrarToast("❌ Error creando mascota");
  }
});

/* ============================================================
   LISTENERS DE ACCIONES
============================================================ */
document.querySelectorAll(".accion").forEach(btn => {
  btn.addEventListener("click", () => ejecutarAccion(btn.dataset.accion));
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
        renderMascota(snap.data());
      } else {
        // No existe → mostrar pantalla de creación
        el("crear-mascota").hidden = false;
        el("mascota-area").hidden = true;
      }
      setStatus("conectado");
    });
  } catch (err) {
    console.error("Firebase error:", err);
    setStatus(null);
  }
}
init();

/* ============================================================
   DECAIMIENTO EN VIVO (cada 30 seg)
============================================================ */
setInterval(() => {
  if (mascotaActual) {
    const stats = aplicarDecaimiento(mascotaActual.stats, mascotaActual.ultimaVezActualizado);
    renderStats(stats);
  }
}, 30000);