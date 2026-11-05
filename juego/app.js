const GAMES = [
  { title: "Carrera de Carros", icon: "🚗", url: "./carrera-carros/index.html", active: true },
  { title: "Gatos y Peces", icon: "🐱", url: "./gatos-peces/index.html", active: true },
  { title: "Air Hockey", icon: "🏒", url: "./air-hockey/index.html", active: false },
  { title: "Carrera de Pollos", icon: "🐔", url: "./pollos/index.html", active: false }
];

function renderMenu() {
  const gamesGrid = document.getElementById("games-grid");
  gamesGrid.innerHTML = "";
  
  GAMES.forEach(game => {
    const card = document.createElement("div");
    card.className = "game-card";
    card.innerHTML = `
      <div class="game-icon">${game.icon}</div>
      <div class="game-title">${game.title}</div>
      ${!game.active ? '<div style="font-size:0.7rem; color:#e88a7a; margin-top:5px;">(Próximamente)</div>' : ''}
    `;
    if (game.active) {
      card.addEventListener("click", () => window.location.href = game.url);
    }
    gamesGrid.appendChild(card);
  });
}
renderMenu();