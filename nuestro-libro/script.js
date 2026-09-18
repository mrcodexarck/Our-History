const libro       = document.getElementById("libro");
const contador    = document.getElementById("contador");
const btnAtras    = document.getElementById("atras");
const btnAdelante = document.getElementById("adelante");

const DURACION = 900;      // debe coincidir con --duracion en CSS
let actual    = 0;
let animando  = false;
let paginas   = [];

/* --- helpers --- */
function crearPagina(html, clase = "") {
  const d = document.createElement("div");
  d.className = "pagina " + clase;
  d.innerHTML = html;
  libro.appendChild(d);
  return d;
}

function htmlRecuerdo(r) {
  return `
    ${r.foto ? `<div class="foto"><img src="${r.foto}" alt="${r.titulo}" loading="lazy"></div>` : ""}
    ${r.fecha ? `<p class="fecha">${r.fecha}</p>` : ""}
    <h2 class="titulo">${r.titulo}</h2>
    ${r.lugar ? `<p class="lugar">${r.lugar}</p>` : ""}
    <p class="texto">${r.texto}</p>
  `;
}

/* --- construir el libro --- */
crearPagina(`<h1>${TITULO_LIBRO}</h1><p class="sub">${SUBTITULO_LIBRO}</p>`, "portada-pagina");

RECUERDOS.forEach(r => crearPagina(htmlRecuerdo(r)));

crearPagina(`<h1>Continuará…</h1><p class="sub">Seguimos escribiendo ✦</p>`, "portada-pagina");

paginas = [...libro.querySelectorAll(".pagina")];
paginas[0].classList.add("activa");
actualizarUI();

/* --- navegación --- */
function actualizarUI() {
  contador.textContent    = `${actual + 1} / ${paginas.length}`;
  btnAtras.disabled       = actual === 0;
  btnAdelante.disabled    = actual === paginas.length - 1;
}

function irA(destino) {
  if (animando || destino === actual || destino < 0 || destino >= paginas.length) return;
  animando = true;

  const vieja  = paginas[actual];
  const nueva  = paginas[destino];
  const avanzar = destino > actual;

  /* la nueva aparece sin animación de opacidad */
  nueva.style.transition = "none";
  nueva.classList.add("activa");

  if (avanzar) {
    nueva.style.zIndex = 1;
    vieja.style.zIndex = 2;
    nueva.style.transition = "";
    void nueva.offsetWidth;
    requestAnimationFrame(() => vieja.classList.add("volteada"));
  } else {
    nueva.style.zIndex = 2;
    vieja.style.zIndex = 1;
    nueva.classList.add("volteada");
    void nueva.offsetWidth;             // forzar reflow
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
      p.style.zIndex = "";
    });

    animando = false;
  }, DURACION);
}

/* --- eventos --- */
btnAtras.addEventListener("click",    () => irA(actual - 1));
btnAdelante.addEventListener("click", () => irA(actual + 1));

document.addEventListener("keydown", e => {
  if (e.key === "ArrowRight") irA(actual + 1);
  if (e.key === "ArrowLeft")  irA(actual - 1);
});

/* swipe en móvil */
let x0 = null;
libro.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
libro.addEventListener("touchend", e => {
  if (x0 === null) return;
  const dx = e.changedTouches[0].clientX - x0;
  if (Math.abs(dx) > 50) irA(actual + (dx < 0 ? 1 : -1));
  x0 = null;
}, { passive: true });