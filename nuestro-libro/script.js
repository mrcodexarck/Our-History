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
function htmlFotoRecuerdo(r, num) {
  let fotos = [];
  if (Array.isArray(r.fotos))          fotos = r.fotos;
  else if (Array.isArray(r.foto))      fotos = r.foto;
  else if (typeof r.foto === "string") fotos = [r.foto];
  else if (typeof r.fotos === "string") fotos = [r.fotos];

  const fotosJSON = JSON.stringify(fotos);
  const capNum    = String(num).padStart(2, "0");

  return `
    <div class="capitulo">
      <span class="cap-label">Capítulo</span>
      <span class="cap-num">${capNum}</span>
    </div>

    ${fotos.length ? `
      <div class="foto-wrap" data-total="${fotos.length}" data-fotos="${fotosJSON.replace(/"/g, "&quot;")}">
        <div class="foto">
          <img src="${fotos[0]}" alt="${r.titulo}" loading="lazy" data-idx="0">
        </div>
        ${fotos.length > 1 ? `
          <button type="button" class="foto-prev" aria-label="Foto anterior">‹</button>
          <button type="button" class="foto-next" aria-label="Foto siguiente">›</button>
          <div class="foto-dots">
            ${fotos.map((_, i) => `<span class="dot${i === 0 ? " activo" : ""}" data-idx="${i}"></span>`).join("")}
          </div>
        ` : ""}
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
function htmlTextoRecuerdo(r, num) {
  const capNum = String(num).padStart(2, "0");

  return `
    <div class="capitulo">
      <span class="cap-label">Capítulo</span>
      <span class="cap-num">${capNum}</span>
    </div>

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
RECUERDOS.forEach((r, i) => {
  const num = i + 1;
  const pagFoto = crearPagina(htmlFotoRecuerdo(r, num),  "pagina-recuerdo pagina-foto");
  crearPagina(htmlTextoRecuerdo(r, num), "pagina-recuerdo pagina-texto");
  conectarGaleria(pagFoto);
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

/* ============================================================
   LIGHTBOX (foto en grande al hacer clic)
============================================================ */
const lightbox  = document.getElementById("lightbox");
const lbImg     = document.getElementById("lb-img");
const lbCerrar  = document.getElementById("lb-cerrar");

function abrirLightbox(src, alt = "") {
  lbImg.src = src;
  lbImg.alt = alt;
  lightbox.classList.add("activo");
  document.body.style.overflow = "hidden";
}

function cerrarLightbox() {
  lightbox.classList.remove("activo");
  document.body.style.overflow = "";
  setTimeout(() => { lbImg.src = ""; }, 300);
}

// Delegado: funciona aunque las fotos se creen después
libro.addEventListener("click", e => {
  const img = e.target.closest(".foto img");
  if (img) {
    e.stopPropagation();
    abrirLightbox(img.src, img.alt);
  }
});

lbCerrar.addEventListener("click", cerrarLightbox);
lightbox.addEventListener("click", e => {
  if (e.target === lightbox) cerrarLightbox();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && lightbox.classList.contains("activo")) {
    cerrarLightbox();
  }
});

/* ============================================================
   GALERÍA: cambio de foto dentro del polaroid
============================================================ */

function cambiarFoto(wrap, nuevoIdx) {
  const img       = wrap.querySelector(".foto img");
  const dots      = wrap.querySelectorAll(".dot");
  const fotosAttr = wrap.getAttribute("data-fotos");
  if (!img || !fotosAttr) return;

  // data-fotos viene con &quot; → los navegadores ya lo decodifican al leerlo
  let fotos;
  try { fotos = JSON.parse(fotosAttr); }
  catch (err) { console.error("❌ Error parseando fotos:", fotosAttr, err); return; }

  if (!Array.isArray(fotos) || fotos.length < 2) return;

  const idx = ((nuevoIdx % fotos.length) + fotos.length) % fotos.length;
  console.log("📸 Cambiando a foto", idx, "→", fotos[idx]);

  img.style.opacity = "0";
  setTimeout(() => {
    img.src = fotos[idx];
    img.dataset.idx = idx;
    img.style.opacity = "1";
    dots.forEach((d, i) => d.classList.toggle("activo", i === idx));
  }, 150);
}

/* --- Conectar flechas y dots al momento de crear cada página --- */
function conectarGaleria(pagina) {
  const wrap = pagina.querySelector(".foto-wrap");
  if (!wrap || !wrap.getAttribute("data-fotos")) return;

  const prev = wrap.querySelector(".foto-prev");
  const next = wrap.querySelector(".foto-next");
  const dots = wrap.querySelectorAll(".dot");
  const img  = wrap.querySelector(".foto img");

  if (prev) prev.addEventListener("click", e => {
    e.stopPropagation();
    cambiarFoto(wrap, (parseInt(img.dataset.idx, 10) || 0) - 1);
  });
  if (next) next.addEventListener("click", e => {
    e.stopPropagation();
    cambiarFoto(wrap, (parseInt(img.dataset.idx, 10) || 0) + 1);
  });
  dots.forEach(dot => dot.addEventListener("click", e => {
    e.stopPropagation();
    cambiarFoto(wrap, parseInt(dot.dataset.idx, 10));
  }));
}

