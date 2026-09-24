(function () {
  // 👇 ESTA ES LA LÍNEA CLAVE: "caer" para cascada
  const MODO = "caer";

  const EMOJIS = ["🤎", "🐵", "🤎", "🐒", "✨", "🤎"];
  const contenedor = document.querySelector(".decoraciones");
  if (!contenedor) return;

  const esMovil  = window.innerWidth < 700;
  const cantidad = esMovil ? 14 : 32;

  for (let i = 0; i < cantidad; i++) {
    const el = document.createElement("span");
    el.className = "deco-item";
    el.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

    const size = 18 + Math.random() * 30;
    el.style.fontSize = size + "px";
    el.style.left     = Math.random() * 100 + "%";
    el.style.opacity  = (0.3 + Math.random() * 0.5).toFixed(2);

    // --- CASCADA ---
    const duracion = 9 + Math.random() * 12;
    const retraso  = -Math.random() * duracion;   // negativo = ya están cayendo
    const deriva   = (Math.random() - 0.5) * 120;
    el.style.animationDuration = duracion + "s";
    el.style.animationDelay    = retraso + "s";
    el.style.setProperty("--deriva", deriva + "px");

    contenedor.appendChild(el);
  }
})();