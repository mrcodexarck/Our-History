const btnP1 = document.getElementById("btn-p1");
const btnP2 = document.getElementById("btn-p2");
const fish = document.getElementById("fish");
const statusMsg = document.getElementById("status-msg");

let posicion = 50; // 0 es el lado de Joan, 100 es el lado de Emily
let gameOver = false;

function mover(jugador) {
  if (gameOver) return;

  if (jugador === 1) {
    posicion -= 2; // Joan tira hacia la izquierda (resta)
    if (posicion < 0) posicion = 0;
  } else {
    posicion += 2; // Emily tira hacia la derecha (suma)
    if (posicion > 100) posicion = 100;
  }

  // Actualizamos la posición visual del pez (restando 50% para centrarlo)
  fish.style.left = `${posicion}%`;

  checkWin();
}

function checkWin() {
  if (posicion <= 0) terminarJuego("Joan 🤎");
  else if (posicion >= 100) terminarJuego("Emily 💛");
}

function terminarJuego(ganador) {
  gameOver = true;
  statusMsg.textContent = `🏆 ¡${ganador} atrapó el pez! 🏆`;
  btnP1.disabled = true;
  btnP2.disabled = true;

  setTimeout(() => {
    posicion = 50;
    gameOver = false;
    fish.style.left = "50%";
    btnP1.disabled = false; btnP2.disabled = false;
    statusMsg.textContent = "¡El pez está en el centro!";
  }, 3000);
}

btnP1.addEventListener("pointerdown", () => mover(1));
btnP2.addEventListener("pointerdown", () => mover(2));