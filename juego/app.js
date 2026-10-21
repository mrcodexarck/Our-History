import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  setDoc, 
  runTransaction 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { FIREBASE_CONFIG, PAREJA_ID } from "../citas/firebase-config.js";

/* ============================================================
   PROTECCIÓN Y PERFIL
============================================================ */
if (sessionStorage.getItem("acceso-libro") !== "ok") {
  location.replace("../");
}

const PERFIL_KEY = "perfil-dibujo";
let perfilActual = localStorage.getItem(PERFIL_KEY) || "joan";
let otroPerfil = perfilActual === "joan" ? "emily" : "joan";

/* ============================================================
   FIREBASE
============================================================ */
const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);
const gameDocRef = doc(db, "parejas", PAREJA_ID, "juego", "piedra-papel-tijera");

/* ============================================================
   DOM
============================================================ */
const scoreJoan = document.getElementById("score-joan");
const scoreEmily = document.getElementById("score-emily");
const handJoan = document.getElementById("hand-joan");
const handEmily = document.getElementById("hand-emily");
const centerDisplay = document.getElementById("center-display");
const statusMessage = document.getElementById("status-message");
const controls = document.getElementById("controls");
const instructionText = document.getElementById("instruction-text");
const choiceBtns = document.querySelectorAll(".choice-btn");
const btnReset = document.getElementById("btn-reset");

/* ============================================================
   ESTADO GLOBAL
============================================================ */
const EMOJIS = { piedra: "✊", papel: "✋", tijeras: "✌️" };
let gameState = {};
let countdownInterval = null;
let revealTimeout = null;

const DEFAULT_STATE = {
  status: "choosing", // choosing, countdown, revealing, gameover
  joan: { choice: null, score: 0 },
  emily: { choice: null, score: 0 },
  roundWinner: null,
  gameWinner: null
};

/* ============================================================
   INICIALIZAR JUEGO
============================================================ */
async function initGame() {
  await signInAnonymously(auth);

  onSnapshot(gameDocRef, (snap) => {
    if (snap.exists()) {
      gameState = snap.data();
      if (!gameState.status) {
         resetGameData();
         return;
      }
      updateUI();
      handleGamePhase();
    } else {
      setDoc(gameDocRef, DEFAULT_STATE);
    }
  });
}

async function resetGameData() {
  await setDoc(gameDocRef, DEFAULT_STATE);
}

/* ============================================================
   ACTUALIZAR INTERFAZ GRÁFICA
============================================================ */
function updateUI() {
  scoreJoan.textContent = gameState.joan.score;
  scoreEmily.textContent = gameState.emily.score;

  const myData = gameState[perfilActual];
  const otherData = gameState[otroPerfil];
  
  // Verificamos si la otra persona ya eligió
  const otherHasChosen = !!otherData.choice;

  if (gameState.status === "choosing") {
    handJoan.textContent = gameState.joan.choice ? EMOJIS[gameState.joan.choice] : "❔";
    handEmily.textContent = gameState.emily.choice ? EMOJIS[gameState.emily.choice] : "❔";
    centerDisplay.textContent = "VS";
    centerDisplay.className = "vs-text";
    
    controls.hidden = false;
    
    // 🔥 CAMBIO CLAVE: Solo deshabilitamos los botones si el OTRO ya eligió
    choiceBtns.forEach(btn => {
      btn.disabled = otherHasChosen; 
      btn.classList.toggle("selected", btn.dataset.choice === myData.choice);
    });

    // Mensajes dinámicos
    if (myData.choice && !otherHasChosen) {
      instructionText.textContent = "Puedes cambiar tu elección...";
      statusMessage.hidden = false;
      statusMessage.textContent = `Esperando a que ${otroPerfil === "joan" ? "Joan" : "Emily"} elija...`;
    } else if (!myData.choice && otherHasChosen) {
      instructionText.textContent = "¡El otro ya eligió! Date prisa:";
      statusMessage.hidden = true;
    } else if (!myData.choice && !otherHasChosen) {
      instructionText.textContent = "Elige tu jugada:";
      statusMessage.hidden = true;
    }

  } else if (gameState.status === "countdown") {
    handJoan.textContent = "❔";
    handEmily.textContent = "❔";
    handJoan.className = "hand shake";
    handEmily.className = "hand shake";
    controls.hidden = true;
    statusMessage.hidden = true;
    
  } else if (gameState.status === "revealing") {
    handJoan.textContent = EMOJIS[gameState.joan.choice];
    handEmily.textContent = EMOJIS[gameState.emily.choice];
    handJoan.className = "hand reveal";
    handEmily.className = "hand reveal";
    controls.hidden = true;
    statusMessage.hidden = true;

    if (gameState.roundWinner === "empate") {
      centerDisplay.textContent = "¡Empate!";
    } else {
      centerDisplay.textContent = gameState.roundWinner === "joan" ? "Gana Joan 🤎" : "Gana Emily 💛";
    }
    centerDisplay.className = "vs-text result";

  } else if (gameState.status === "gameover") {
    handJoan.textContent = EMOJIS[gameState.joan.choice] || "❔";
    handEmily.textContent = EMOJIS[gameState.emily.choice] || "❔";
    handJoan.className = "hand reveal";
    handEmily.className = "hand reveal";
    controls.hidden = true;
    statusMessage.hidden = false;
    statusMessage.textContent = `🏆 ¡${gameState.gameWinner === "joan" ? "Joan" : "Emily"} llega a 3 y Ama Más! 🏆`;
    centerDisplay.textContent = "FIN";
    centerDisplay.className = "vs-text";
  }
}

/* ============================================================
   LÓGICA DE FASES Y TIEMPOS
============================================================ */
function handleGamePhase() {
  // Si ambos eligen, pasar a Countdown
  if (gameState.status === "choosing" && gameState.joan.choice && gameState.emily.choice) {
    runTransaction(db, async (tx) => {
      const snap = await tx.get(gameDocRef);
      const data = snap.data();
      if (data.status === "choosing" && data.joan.choice && data.emily.choice) {
        data.status = "countdown";
        tx.set(gameDocRef, data);
      }
    });
  }

  if (gameState.status === "countdown" && !countdownInterval) {
    let count = 3;
    centerDisplay.textContent = count;
    centerDisplay.className = "vs-text countdown";

    countdownInterval = setInterval(() => {
      count--;
      if (count > 0) {
        centerDisplay.textContent = count;
      } else {
        clearInterval(countdownInterval);
        countdownInterval = null;
        resolveRound();
      }
    }, 1000);
  }

  if (gameState.status === "revealing" && !revealTimeout) {
    revealTimeout = setTimeout(async () => {
      revealTimeout = null;
      runTransaction(db, async (tx) => {
        const snap = await tx.get(gameDocRef);
        const data = snap.data();
        if (data.status === "revealing") {
          data.status = "choosing";
          data.joan.choice = null;
          data.emily.choice = null;
          data.roundWinner = null;
          tx.set(gameDocRef, data);
        }
      });
    }, 3500);
  }
}

/* ============================================================
   RESOLVER RONDA
============================================================ */
async function resolveRound() {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameDocRef);
    const data = snap.data();
    if (data.status !== "countdown") return;

    const j = data.joan.choice;
    const e = data.emily.choice;
    let winner = null;

    if (j === e) {
      winner = "empate";
    } else if (
      (j === "piedra" && e === "tijeras") ||
      (j === "papel" && e === "piedra") ||
      (j === "tijeras" && e === "papel")
    ) {
      winner = "joan";
    } else {
      winner = "emily";
    }

    if (winner === "joan") data.joan.score++;
    if (winner === "emily") data.emily.score++;

    data.roundWinner = winner;
    data.status = "revealing";

    if (data.joan.score >= 3) { data.status = "gameover"; data.gameWinner = "joan"; }
    if (data.emily.score >= 3) { data.status = "gameover"; data.gameWinner = "emily"; }

    tx.set(gameDocRef, data);
  });
}

/* ============================================================
   ACCIONES DEL JUGADOR (PERMITE CAMBIAR DE OPINIÓN)
============================================================ */
choiceBtns.forEach(btn => {
  btn.addEventListener("click", async () => {
    if (gameState.status !== "choosing") return;
    // Si el otro ya eligió, no puedes cambiar tu voto
    if (gameState[otroPerfil].choice) return;

    const choice = btn.dataset.choice;

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(gameDocRef);
      const data = snap.data();
      
      if (data.status !== "choosing") return;
      if (data[otroPerfil].choice) return; // Seguro extra por si acaso

      // Sobrescribe tu elección libremente
      data[perfilActual].choice = choice;
      tx.set(gameDocRef, data);
    });
  });
});

btnReset.addEventListener("click", async () => {
  if (!confirm("¿Reiniciar el juego y borrar los puntos?")) return;
  countdownInterval && clearInterval(countdownInterval);
  revealTimeout && clearTimeout(revealTimeout);
  await resetGameData();
});

/* ============================================================
   ARRANQUE
============================================================ */
initGame();