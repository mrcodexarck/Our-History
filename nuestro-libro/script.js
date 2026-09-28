const libro       = document.getElementById("libro");
const contador    = document.getElementById("contador");
const btnAtras    = document.getElementById("atras");
const btnAdelante = document.getElementById("adelante");

const DURACION = 900;
let actual    = 0;
let animando  = false;
let paginas   = [];

/* ============================================================
   HELPERS
============================================================ */
function crearPagina(html, clase = "") {
  const d = document.createElement("div");
  d.className = "pagina " + clase;
  d.innerHTML = html;
  libro.appendChild(d);
  return d;
}

/* ============================================================
   PÁGINA 1: FOTO + CABECERA
============================================================ */
function htmlFotoRecuerdo(r) {
  return `
    ${r.foto ? `
      <div class="foto-wrap">
        <div class="foto">
          <img src="${r.foto}" alt="${r.titulo}" loading="lazy">
        </div>
      </div>
    ` : ""}

    <div class="cabecera">
      ${r.fecha ? `<p class="fecha">${r.fecha}</p>` : ""}
      <h2 class="titulo">${r.titulo}</h2>
      ${r.lugar ? `<p class="lugar">${r.lugar}</p>` : ""}
    </div>

    <div class="divisor"><span>❦</span></div>
  `;
}

/* ============================================================
   PÁGINA 2: TEXTO DEL RECUERDO
============================================================ */
function htmlTextoRecuerdo(r) {
  return `
    <div class="cabecera cabecera-mini">
      ${r.fecha ? `<p class="fecha">${r.fecha}</p>` : ""}
      <h2 class="titulo titulo-mini">${r.titulo}</h2>
    </div>

    <div class="divisor"><span>❦</span></div>

    <p class="texto">${r.texto}</p>
  `;
}

/* ============================================================
   CONSTRUIR EL LIBRO
============================================================ */

/* --- Portada --- */
crearPagina(`
  <div class="espiral">
    <div class="anillo"></div><div class="anillo"></div><div class="anillo"></div>
    <div class="anillo"></div><div class="anillo"></div><div class="anillo"></div>
    <div class="anillo"></div><div class="anillo"></div><div class="anillo"></div>
  </div>
  <div class="tapa-borde">
    <h1 class="titulo-tapa">
      <span class="amarillo">NUESTRO</span>
      <span class="blanco">LIBRO DE</span>
      <span class="rosa">AVENTURAS</span>
    </h1>
    <div class="calcomania">🌍</div>
    <p class="firma">Emily y Joan</p>
  </div>
`, "portada-pagina");

/* --- Recuerdos: 2 páginas cada uno --- */
RECUERDOS.forEach(r => {
  crearPagina(htmlFotoRecuerdo(r),  "pagina-recuerdo pagina-foto");
  crearPagina(htmlTextoRecuerdo(r), "pagina-recuerdo pagina-texto");
});

/* --- Página final --- */
crearPagina(
  `<h1>Continuará…</h1><p class="sub">Seguimos escribiendo ✦</p>`,
  "portada-pagina"
);

/* ============================================================
   ESTADO INICIAL
============================================================ */
paginas = [...libro.querySelectorAll(".pagina")];
paginas[0].classList.add("activa");
actualizarUI();

function actualizarUI() {
  contador.textContent = `${actual + 1} / ${paginas.length}`;
  btnAtras.disabled    = actual === 0;
  btnAdelante.disabled = actual === paginas.length - 1;
}

/* ============================================================
   NAVEGACIÓN CON ANIMACIÓN DE VOLTEO
============================================================ */
function irA(destino) {
  if (animando || destino === actual || destino < 0 || destino >= paginas.length) return;
  animando = true;

  const vieja   = paginas[actual];
  const nueva   = paginas[destino];
  const avanzar = destino > actual;

  nueva.style.transition = "none";
  nueva.classList.add("activa");

  if (avanzar) {
    nueva.style.zIndex     = 1;
    vieja.style.zIndex     = 2;
    nueva.style.transition = "";
    void nueva.offsetWidth;
    requestAnimationFrame(() => vieja.classList.add("volteada"));
  } else {
    nueva.style.zIndex = 2;
    vieja.style.zIndex = 1;
    nueva.classList.add("volteada");
    void nueva.offsetWidth;
    nueva.style.transition = "";
    requestAnimationFrame(() => nueva.classList.remove("volteada"));
  }

  actual = destino;
  actualizarUI();

  setTimeout(() => {
    [vieja, nueva].forEach(p => (p.style.transition = "none"));

    if (avanzar) vieja.classList.remove("activa", "volteada");
    else         vieja.classList.remove("activa");

    void vieja.offsetWidth;

    [vieja, nueva].forEach(p => {
      p.style.transition = "";
      p.style.zIndex     = "";
    });

    animando = false;
  }, DURACION);
}

/* ============================================================
   EVENTOS
============================================================ */
btnAtras.addEventListener("click",    () => irA(actual - 1));
btnAdelante.addEventListener("click", () => irA(actual + 1));

document.addEventListener("keydown", e => {
  if (e.key === "ArrowRight") irA(actual + 1);
  if (e.key === "ArrowLeft")  irA(actual - 1);
});

/* --- Swipe móvil --- */
let x0 = null;
libro.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
libro.addEventListener("touchend", e => {
  if (x0 === null) return;
  const dx = e.changedTouches[0].clientX - x0;
  if (Math.abs(dx) > 50) irA(actual + (dx < 0 ? 1 : -1));
  x0 = null;
}, { passive: true });