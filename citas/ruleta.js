(function () {
  "use strict";

  /* ============================================================
     CONFIGURACIÓN
  ============================================================ */
  const MAX_SEGMENTOS  = 8;
  const MIN_SEGMENTOS  = 2;
  const DURACION_GIRO  = 5500;
  const MAX_DESCARTES  = 3;

  /* ============================================================
     ESTADO
  ============================================================ */
  let segmentos          = [];
  let rotacionActual     = 0;
  let girando            = false;
  let ultimoGanador      = null;
  let descartesCount     = 0;
  let audioCtx           = null;
  let modoPersonalizando = false;
  let seleccionadosPersonalizar = new Set();

  /* ============================================================
     DOM
  ============================================================ */
  const $ = id => document.getElementById(id);
  const modal             = $("ruleta-modal");
  const btnAbrir          = $("btn-ruleta");
  const btnCerrar         = $("ruleta-cerrar");
  const btnGirar          = $("ruleta-girar-btn");
  const btnRandom         = $("ruleta-random");
  const btnLimpiar        = $("ruleta-limpiar");
  const btnEditar         = $("ruleta-personalizar");
  const svg               = $("ruleta-svg");
  const rueda             = $("ruleta-rueda");
  const lista             = $("ruleta-lista");
  const resultado         = $("ruleta-resultado");
  const resultadoEmoji    = $("resultado-emoji");
  const resultadoTitulo   = $("resultado-titulo");
  const resultadoCat      = $("resultado-cat");
  const btnAceptar        = $("resultado-aceptar");
  const btnOtraVez        = $("resultado-otra-vez");
  const btnDescartar      = $("resultado-descartar");
  const personalizarPanel    = $("ruleta-personalizar-panel");
  const personalizarLista    = $("personalizar-lista");
  const personalizarContador = $("personalizar-contador");
  const btnPersonalizarAplicar  = $("personalizar-aplicar");
  const btnPersonalizarCancelar = $("personalizar-cancelar");
  const personalizarBuscar   = $("personalizar-buscar");

  /* ============================================================
     UTILS
  ============================================================ */
  function emojiDeCategoria(cat) {
    if (!cat) return "✨";
    const partes = cat.trim().split(/\s+/);
    return partes[0] || "✨";
  }
  function puntoEnCirculo(anguloGrados, radio) {
    const a = anguloGrados * Math.PI / 180;
    return { x: Math.sin(a) * radio, y: -Math.cos(a) * radio };
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ============================================================
     AUDIO (WebAudio, sin archivos)
  ============================================================ */
  function initAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { audioCtx = null; }
    }
  }
  function tic() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 700 + Math.random() * 300;
    osc.type = "triangle";
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.06);
  }
  function sonidoVictoria() {
    if (!audioCtx) return;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      const t0 = audioCtx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.08, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.4);
    });
  }
  function agendarTics(duracion) {
    let t = 0, intervalo = 55;
    const factor = 1.08;
    while (t < duracion - 300) {
      (function (tt) { setTimeout(tic, tt); })(t);
      t += intervalo;
      intervalo *= factor;
    }
  }

  /* ============================================================
     IDEAS
  ============================================================ */
  function getIdeasTodas() {
    if (window.CitasApp && window.CitasApp.getIdeas) return window.CitasApp.getIdeas();
    if (typeof IDEAS !== "undefined") return IDEAS;
    return [];
  }
  function estaHecha(id) {
    if (window.CitasApp && window.CitasApp.estaHecha) return window.CitasApp.estaHecha(id);
    return false;
  }
  function getIdeasPendientes() {
    return getIdeasTodas()
      .map((idea, id) => ({ ...idea, id }))
      .filter(idea => !estaHecha(idea.id));
  }

  /* ============================================================
     GENERAR RUEDA
  ============================================================ */
  function generarRueda() {
    const n = segmentos.length;
    if (n < 2) return;
    const anguloPorSegmento = 360 / n;
    const r = 130;

    svg.innerHTML = "";

    // Fondo
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    bg.setAttribute("cx", "0");
    bg.setAttribute("cy", "0");
    bg.setAttribute("r", r + 4);
    bg.setAttribute("fill", "#3b2a1e");
    svg.appendChild(bg);

    segmentos.forEach((item, i) => {
      const inicio = i * anguloPorSegmento - anguloPorSegmento / 2;
      const fin    = inicio + anguloPorSegmento;
      const mid    = i * anguloPorSegmento;

      const p1 = puntoEnCirculo(inicio, r);
      const p2 = puntoEnCirculo(fin, r);
      const largeArc = anguloPorSegmento > 180 ? 1 : 0;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d",
        `M 0 0 L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ` +
        `A ${r} ${r} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z`
      );
      path.setAttribute("fill", i % 2 === 0 ? "#f7f1e5" : "#ead9b8");
      path.setAttribute("stroke", "#b58a5a");
      path.setAttribute("stroke-width", "1.2");
      path.setAttribute("class", "seg");
      path.dataset.idx = i;
      svg.appendChild(path);

      // Emoji
      const ep = puntoEnCirculo(mid, 95);
      const emojiT = document.createElementNS("http://www.w3.org/2000/svg", "text");
      emojiT.setAttribute("x", ep.x.toFixed(2));
      emojiT.setAttribute("y", ep.y.toFixed(2));
      emojiT.setAttribute("text-anchor", "middle");
      emojiT.setAttribute("dominant-baseline", "central");
      emojiT.setAttribute("font-size", "20");
      emojiT.setAttribute("class", "seg-emoji");
      emojiT.dataset.idx = i;
      emojiT.textContent = item.emoji;
      svg.appendChild(emojiT);

      // Número
      const np = puntoEnCirculo(mid, 42);
      const numT = document.createElementNS("http://www.w3.org/2000/svg", "text");
      numT.setAttribute("x", np.x.toFixed(2));
      numT.setAttribute("y", np.y.toFixed(2));
      numT.setAttribute("text-anchor", "middle");
      numT.setAttribute("dominant-baseline", "central");
      numT.setAttribute("font-size", "13");
      numT.setAttribute("font-family", "Playfair Display, serif");
      numT.setAttribute("font-weight", "700");
      numT.setAttribute("fill", "#b58a5a");
      numT.setAttribute("class", "seg-num");
      numT.dataset.idx = i;
      numT.textContent = i + 1;
      svg.appendChild(numT);
    });

    // Aro dorado
    const aro = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    aro.setAttribute("cx", "0");
    aro.setAttribute("cy", "0");
    aro.setAttribute("r", r);
    aro.setAttribute("fill", "none");
    aro.setAttribute("stroke", "#d4af37");
    aro.setAttribute("stroke-width", "2");
    svg.appendChild(aro);
  }

  function renderLista() {
    lista.innerHTML = "";
    segmentos.forEach((item, i) => {
      const div = document.createElement("div");
      div.className = "ruleta-item";
      div.innerHTML = `
        <span class="ruleta-item-num">${i + 1}</span>
        <span class="ruleta-item-emoji">${item.emoji}</span>
        <span class="ruleta-item-txt">${item.txt}</span>
      `;
      lista.appendChild(div);
    });
  }

  /* ============================================================
     RELLENAR
  ============================================================ */
  function rellenarAlAzar() {
    const pendientes = getIdeasPendientes();
    if (pendientes.length === 0) {
      alert("¡Ya hicieron todos los planes! 🎉");
      return;
    }
    const shuffled = shuffle(pendientes);
    const n = Math.min(MAX_SEGMENTOS, shuffled.length);

    segmentos = shuffled.slice(0, n).map(idea => ({
      id: idea.id,
      txt: idea.txt,
      cat: idea.cat,
      emoji: emojiDeCategoria(idea.cat)
    }));

    rotacionActual = 0;
    rueda.style.transition = "none";
    rueda.style.transform = "rotate(0deg)";
    ultimoGanador = null;
    descartesCount = 0;

    generarRueda();
    renderLista();
  }

  /* ============================================================
     ILUMINAR
  ============================================================ */
  function iluminarSegmento(idx) {
    svg.querySelectorAll(".seg, .seg-emoji, .seg-num").forEach(el => {
      el.classList.toggle("ganador", parseInt(el.dataset.idx, 10) === idx);
    });
  }
  function apagarIluminacion() {
    svg.querySelectorAll(".ganador").forEach(el => el.classList.remove("ganador"));
  }

  /* ============================================================
     GIRAR
  ============================================================ */
  function girar() {
    if (girando || segmentos.length < 2) return;
    girando = true;
    initAudio();

    const n = segmentos.length;
    const anguloPorSegmento = 360 / n;

    // Elegir ganador (sin repetir el último)
    let posibles = [...Array(n).keys()];
    if (ultimoGanador !== null && posibles.length > 1) {
      posibles = posibles.filter(i => i !== ultimoGanador);
    }
    const ganadorIdx = posibles[Math.floor(Math.random() * posibles.length)];

    // Variación para no caer en el centro exacto
    const variacion = (Math.random() - 0.5) * anguloPorSegmento * 0.7;
    const base = -ganadorIdx * anguloPorSegmento + variacion;
    const giros = 4 + Math.floor(Math.random() * 3);

    let destino = base + 360 * giros;
    while (destino <= rotacionActual + 720) destino += 360;

    rotacionActual = destino;

    apagarIluminacion();
    modal.classList.add("modo-teatro");
    btnGirar.disabled = true;

    rueda.style.transition = `transform ${DURACION_GIRO}ms cubic-bezier(.17,.67,.13,1)`;
    rueda.style.transform = `rotate(${rotacionActual}deg)`;

    agendarTics(DURACION_GIRO);

    setTimeout(() => {
      girando = false;
      btnGirar.disabled = false;
      ultimoGanador = ganadorIdx;
      iluminarSegmento(ganadorIdx);
      sonidoVictoria();

      setTimeout(() => mostrarResultado(ganadorIdx), 500);
    }, DURACION_GIRO + 100);
  }

  /* ============================================================
     RESULTADO
  ============================================================ */
  function mostrarResultado(idx) {
    const item = segmentos[idx];
    if (!item) return;

    resultadoEmoji.textContent  = item.emoji;
    resultadoTitulo.textContent = item.txt;
    resultadoCat.textContent    = item.cat;
    resultado.dataset.idx = idx;

    resultado.classList.add("activo");
  }
  function cerrarResultado() {
    resultado.classList.remove("activo");
    modal.classList.remove("modo-teatro");
  }

  function aceptarPlan() {
    const idx = parseInt(resultado.dataset.idx, 10);
    const item = segmentos[idx];
    if (!item) return;

    if (window.CitasApp && window.CitasApp.marcarHecha) {
      window.CitasApp.marcarHecha(item.id);
    }
    cerrarResultado();

    setTimeout(() => {
      segmentos.splice(idx, 1);

      if (segmentos.length < MIN_SEGMENTOS) {
        rellenarAlAzar();
        return;
      }
      const pendientes = getIdeasPendientes().filter(p =>
        !segmentos.some(s => s.id === p.id)
      );
      if (pendientes.length > 0) {
        const nuevo = pendientes[Math.floor(Math.random() * pendientes.length)];
        segmentos.push({
          id: nuevo.id, txt: nuevo.txt, cat: nuevo.cat,
          emoji: emojiDeCategoria(nuevo.cat)
        });
      }
      rotacionActual = 0;
      rueda.style.transition = "none";
      rueda.style.transform = "rotate(0deg)";
      ultimoGanador = null;
      descartesCount = 0;
      generarRueda();
      renderLista();
    }, 400);
  }

  function descartarPlan() {
    descartesCount++;
    if (descartesCount > MAX_DESCARTES) {
      btnDescartar.disabled = true;
      btnDescartar.textContent = "Ya no puedes descartar más 🤭";
      setTimeout(() => {
        btnDescartar.disabled = false;
        btnDescartar.textContent = "✕ No me convence";
      }, 2500);
      return;
    }

    const idx = parseInt(resultado.dataset.idx, 10);
    segmentos.splice(idx, 1);

    if (segmentos.length < MIN_SEGMENTOS) {
      cerrarResultado();
      rellenarAlAzar();
      return;
    }
    const pendientes = getIdeasPendientes().filter(p =>
      !segmentos.some(s => s.id === p.id)
    );
    if (pendientes.length > 0) {
      const nuevo = pendientes[Math.floor(Math.random() * pendientes.length)];
      segmentos.push({
        id: nuevo.id, txt: nuevo.txt, cat: nuevo.cat,
        emoji: emojiDeCategoria(nuevo.cat)
      });
    }
    rotacionActual = 0;
    rueda.style.transition = "none";
    rueda.style.transform = "rotate(0deg)";
    ultimoGanador = null;
    generarRueda();
    renderLista();
    cerrarResultado();
  }

  /* ============================================================
     ABRIR / CERRAR
  ============================================================ */
  function abrir() {
    modal.classList.add("activo");
    document.body.style.overflow = "hidden";
    if (segmentos.length === 0) rellenarAlAzar();
    descartesCount = 0;
  }
  function cerrar() {
    modal.classList.remove("activo", "modo-teatro");
    resultado.classList.remove("activo");
    document.body.style.overflow = "";
  }

  /* ============================================================
     PERSONALIZAR
  ============================================================ */
  function abrirPersonalizar() {
    modoPersonalizando = true;
    seleccionadosPersonalizar = new Set(segmentos.map(s => s.id));
    personalizarPanel.classList.add("activo");
    renderizarPersonalizar();
  }
  function cerrarPersonalizar() {
    modoPersonalizando = false;
    personalizarPanel.classList.remove("activo");
  }
  function renderizarPersonalizar() {
    const pendientes = getIdeasPendientes();
    const q = (personalizarBuscar.value || "").trim().toLowerCase();
    const filtradas = pendientes.filter(p =>
      !q || p.txt.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q)
    );

    personalizarLista.innerHTML = "";
    if (filtradas.length === 0) {
      personalizarLista.innerHTML = `<p class="ruleta-vacio">No hay planes que coincidan</p>`;
    } else {
      filtradas.forEach(idea => {
        const label = document.createElement("label");
        label.className = "personalizar-item";
        const checked = seleccionadosPersonalizar.has(idea.id);
        label.innerHTML = `
          <input type="checkbox" data-id="${idea.id}" ${checked ? "checked" : ""}>
          <span class="personalizar-emoji">${emojiDeCategoria(idea.cat)}</span>
          <span class="personalizar-txt">${idea.txt}</span>
        `;
        const cb = label.querySelector("input");
        cb.addEventListener("change", e => {
          if (e.target.checked) {
            if (seleccionadosPersonalizar.size >= MAX_SEGMENTOS) {
              e.target.checked = false;
              alert(`Máximo ${MAX_SEGMENTOS} planes en la ruleta`);
              return;
            }
            seleccionadosPersonalizar.add(idea.id);
          } else {
            seleccionadosPersonalizar.delete(idea.id);
          }
          actualizarContadorPersonalizar();
        });
        personalizarLista.appendChild(label);
      });
    }
    actualizarContadorPersonalizar();
  }
  function actualizarContadorPersonalizar() {
    const n = seleccionadosPersonalizar.size;
    personalizarContador.textContent = `${n} / ${MAX_SEGMENTOS}`;
    btnPersonalizarAplicar.disabled = n < MIN_SEGMENTOS;
    btnPersonalizarAplicar.textContent = `Aplicar (${n})`;
  }
  function aplicarPersonalizar() {
    const todas = getIdeasTodas();
    segmentos = [];
    todas.forEach((idea, id) => {
      if (seleccionadosPersonalizar.has(id)) {
        segmentos.push({
          id, txt: idea.txt, cat: idea.cat,
          emoji: emojiDeCategoria(idea.cat)
        });
      }
    });
    rotacionActual = 0;
    rueda.style.transition = "none";
    rueda.style.transform = "rotate(0deg)";
    ultimoGanador = null;
    descartesCount = 0;
    generarRueda();
    renderLista();
    cerrarPersonalizar();
  }

  /* ============================================================
     EVENTOS
  ============================================================ */
  btnAbrir.addEventListener("click", abrir);
  btnCerrar.addEventListener("click", cerrar);
  modal.addEventListener("click", e => { if (e.target === modal) cerrar(); });

  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !modal.classList.contains("activo")) return;
    if (resultado.classList.contains("activo"))       cerrarResultado();
    else if (modoPersonalizando)                       cerrarPersonalizar();
    else                                                cerrar();
  });

  btnGirar.addEventListener("click", girar);

  btnRandom.addEventListener("click", () => {
    apagarIluminacion();
    rellenarAlAzar();
  });
  btnLimpiar.addEventListener("click", () => {
    if (segmentos.length === 0) return;
    if (!confirm("¿Vaciar la ruleta?")) return;
    segmentos = [];
    svg.innerHTML = "";
    lista.innerHTML = "";
    rueda.style.transition = "none";
    rueda.style.transform = "rotate(0deg)";
    rotacionActual = 0;
  });
  btnEditar.addEventListener("click", abrirPersonalizar);
  btnPersonalizarCancelar.addEventListener("click", cerrarPersonalizar);
  btnPersonalizarAplicar.addEventListener("click", aplicarPersonalizar);
  personalizarBuscar.addEventListener("input", renderizarPersonalizar);

  btnAceptar.addEventListener("click", aceptarPlan);
  btnOtraVez.addEventListener("click", () => {
    cerrarResultado();
    apagarIluminacion();
    setTimeout(girar, 300);
  });
  btnDescartar.addEventListener("click", descartarPlan);

})();