/* ============================================================
   DOM
============================================================ */
const contenedor   = document.getElementById("hojas");
const contador     = document.getElementById("contador");
const barra        = document.getElementById("barra");
const inputBuscar  = document.getElementById("busqueda");
const selectFiltro = document.getElementById("filtro");
const selectEstado = document.getElementById("filtro-estado");

/* ============================================================
   ESTADO
============================================================ */
const CLAVE_STORAGE = "citas-hechas";
let hechas = JSON.parse(localStorage.getItem(CLAVE_STORAGE) || "{}");
let estadoActual = "todas";

let docRef = null;
let firebaseListo = false;

/* ============================================================
   AGRUPAR POR CATEGORÍA
============================================================ */
const categorias = [];
const porCat = {};
IDEAS.forEach((idea, i) => {
  if (!porCat[idea.cat]) {
    porCat[idea.cat] = [];
    categorias.push(idea.cat);
  }
  porCat[idea.cat].push({ ...idea, id: i });
});

/* ============================================================
   SELECT DE CATEGORÍAS
============================================================ */
categorias.forEach(cat => {
  const opt = document.createElement("option");
  opt.value = cat;
  opt.textContent = cat;
  selectFiltro.appendChild(opt);
});

/* ============================================================
   RENDERIZAR
============================================================ */
categorias.forEach(cat => {
  const hoja = document.createElement("section");
  hoja.className = "hoja";
  hoja.dataset.cat = cat;

  const h2 = document.createElement("h2");
  h2.textContent = cat;
  hoja.appendChild(h2);

  const grid = document.createElement("div");
  grid.className = "grid";

  porCat[cat].forEach(idea => {
    const item = document.createElement("div");
    item.className = "item" + (hechas[idea.id] ? " hecho" : "");
    item.dataset.id = idea.id;
    item.dataset.texto = idea.txt.toLowerCase();
    item.innerHTML = `
      <span class="check"></span>
      <span class="texto">${idea.txt}</span>
    `;
    item.addEventListener("click", () => marcarIdea(idea.id, item));
    grid.appendChild(item);
  });

  hoja.appendChild(grid);
  contenedor.appendChild(hoja);
});

/* ============================================================
   MARCAR / DESMARCAR
============================================================ */
function marcarIdea(id, itemEl) {
  hechas[id] = !hechas[id];
  if (itemEl) itemEl.classList.toggle("hecho", hechas[id]);
  actualizarProgreso();

  // Guardar SOLO esta idea (no todo el objeto)
  localStorage.setItem(CLAVE_STORAGE, JSON.stringify(hechas));
  guardarUnaIdea(id, hechas[id]);
}

function actualizarItem(id) {
  const item = document.querySelector(`.item[data-id="${id}"]`);
  if (item) item.classList.toggle("hecho", hechas[id] === true);
}

/* ============================================================
   PROGRESO
============================================================ */
function actualizarProgreso() {
  const total = IDEAS.length;
  const num   = Object.values(hechas).filter(Boolean).length;
  contador.textContent = `${num} / ${total} completados`;
  barra.style.width = (num / total * 100) + "%";
}
actualizarProgreso();

/* ============================================================
   FILTROS
============================================================ */
function aplicarFiltros() {
  const q      = inputBuscar.value.trim().toLowerCase();
  const catSel = selectFiltro.value;

  document.querySelectorAll(".hoja").forEach(hoja => {
    const cat = hoja.dataset.cat;
    const coincideCat = !catSel || cat === catSel;

    let visibles = 0;
    hoja.querySelectorAll(".item").forEach(item => {
      const coincideTexto = !q || item.dataset.texto.includes(q);
      const estaHecho = hechas[item.dataset.id] === true;

      let coincideEstado = true;
      if (estadoActual === "pendientes")  coincideEstado = !estaHecho;
      if (estadoActual === "completadas") coincideEstado = estaHecho;

      const visible = coincideCat && coincideTexto && coincideEstado;
      item.style.display = visible ? "" : "none";
      if (visible) visibles++;
    });

    hoja.style.display = visibles > 0 ? "" : "none";
  });

  const visiblesTotal = [...document.querySelectorAll(".hoja")]
    .filter(h => h.style.display !== "none").length;
  let vacio = document.querySelector(".vacio");
  if (visiblesTotal === 0) {
    if (!vacio) {
      vacio = document.createElement("div");
      vacio.className = "vacio";
      vacio.textContent = "No encontramos ningún plan con esos filtros 🤔";
      contenedor.appendChild(vacio);
    }
  } else if (vacio) {
    vacio.remove();
  }
}

inputBuscar.addEventListener("input", aplicarFiltros);
selectFiltro.addEventListener("change", aplicarFiltros);
selectEstado.addEventListener("change", () => {
  estadoActual = selectEstado.value;
  aplicarFiltros();
});

/* ============================================================
   FIREBASE
============================================================ */
async function initFirebase() {
  if (!window.FIREBASE) {
    console.warn("⚠️ Firebase no está cargado. Solo localStorage.");
    return;
  }

  const { db, auth, signInAnonymously, doc, onSnapshot, PAREJA_ID } = window.FIREBASE;

  try {
    await signInAnonymously(auth);
  } catch (err) {
    console.error("Error autenticando:", err);
    return;
  }

  docRef = doc(db, "parejas", PAREJA_ID);

  onSnapshot(docRef, snap => {
    const data = snap.data();
    if (!data || !data.hechas) return;

    // Actualizar solo las ideas que cambiaron
    const nuevas = data.hechas;
    let huboCambios = false;

    Object.keys(nuevas).forEach(id => {
      const valor = nuevas[id] === true;
      if (hechas[id] !== valor) {
        hechas[id] = valor;
        actualizarItem(id);
        huboCambios = true;
      }
    });

    if (huboCambios) {
      localStorage.setItem(CLAVE_STORAGE, JSON.stringify(hechas));
      actualizarProgreso();
      aplicarFiltros();
      console.log("☁️ Sincronizado desde Firebase");
    }
  }, err => {
    console.error("Error escuchando cambios:", err);
  });

  firebaseListo = true;
  console.log("✅ Firebase listo");
}

async function guardarUnaIdea(id, valor) {
  if (!firebaseListo || !docRef) return;

  try {
    const { updateDoc } = window.FIREBASE;
    await updateDoc(docRef, { [`hechas.${id}`]: valor });
    console.log(`💾 Guardado: idea ${id} = ${valor}`);
  } catch (err) {
    console.error("Error guardando en Firebase:", err);
  }
}

window.addEventListener("firebase-listo", initFirebase);
if (window.FIREBASE) initFirebase();

/* ============================================================
   API pública para la ruleta
============================================================ */
window.CitasApp = {
  getIdeas: () => IDEAS,
  estaHecha: (id) => hechas[id] === true,
  marcarHecha: (id) => {
    hechas[id] = true;
    actualizarItem(id);
    actualizarProgreso();
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(hechas));
    guardarUnaIdea(id, true);
  }
};