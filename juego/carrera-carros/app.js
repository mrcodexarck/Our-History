const btnP1 = document.getElementById("btn-p1");
const btnP2 = document.getElementById("btn-p2");
const carP1 = document.getElementById("car-p1");
const carP2 = document.getElementById("car-p2");
const statusMsg = document.getElementById("status-msg");

let posP1 = 0;
let posP2 = 0;
let gameOver = false;

function mover(jugador) {
  if (gameOver) return;

  if (jugador === 1) {
    posP1 += 3; // Sube 3% por toque
    if (posP1 > 100) posP1 = 100;
    carP1.style.left = `calc(${posP1}% - 30px)`;
  } else {
    posP2 += 3;
    if (posP2 > 100) posP2 = 100;
    carP2.style.left = `calc(${posP2}% - 30px)`;
  }

  checkWin();
}

function checkWin() {
  if (posP1 >= 100) terminarJuego("Joan 🤎");
  else if (posP2 >= 100) terminarJuego("Emily 💛");
}

function terminarJuego(ganador) {
  gameOver = true;
  statusMsg.textContent = `🏆 ¡Ganó ${ganador}! 🏆`;
  btnP1.disabled = true;
  btnP2.disabled = true;

  setTimeout(() => {
    posP1 = 0; posP2 = 0; gameOver = false;
    carP1.style.left = "0";
    carP2.style.left = "0";
    btnP1.disabled = false; btnP2.disabled = false;
    statusMsg.textContent = "¡Revancha!";
  }, 3000);
}

// Usamos 'pointerdown' en lugar de 'click' para que sea instantáneo en móviles
btnP1.addEventListener("pointerdown", () => mover(1));
btnP2.addEventListener("pointerdown", () => mover(2));