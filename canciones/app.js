import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
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

/* ============================================================
   FIREBASE
============================================================ */
const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

/* ============================================================
   DOM
============================================================ */
const grid         = document.getElementById("music-grid");
const emptyState   = document.getElementById("empty-state");
const contador     = document.getElementById("contador");

const modal        = document.getElementById("modal-overlay");
const btnAddSong   = document.getElementById("btn-add-song");
const btnClose     = document.getElementById("modal-close");
const btnSave      = document.getElementById("btn-save");

const inputUrl     = document.getElementById("input-url");
const inputTitle   = document.getElementById("input-title");
const inputArtist  = document.getElementById("input-artist");
const inputDedic   = document.getElementById("input-dedication");

const playerCont   = document.getElementById("player-container");
const playerVinyl  = document.getElementById("player-vinyl");
const currentTitle = document.getElementById("current-title");
const currentArtist= document.getElementById("current-artist");
const currentDedic = document.getElementById("current-dedication");

let currentAudioId = null;
let isPlaying = false;
let ytPlayer = null; // Instancia de la API de YouTube

/* ============================================================
   INICIALIZAR API DE YOUTUBE
============================================================ */
window.onYouTubeIframeAPIReady = function() {
  ytPlayer = new YT.Player('youtube-api-player', {
    height: '1',
    width: '1',
    videoId: '', // Empieza vacío
    playerVars: {
      'autoplay': 1,
      'controls': 0,
      'disablekb': 1,
      'fs': 0,
      'modestbranding': 1
    },
    events: {
      'onStateChange': onPlayerStateChange
    }
  });
};

// Sincronizar el estado del vinilo con el reproductor real de YouTube
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    playerVinyl.classList.add("playing");
    isPlaying = true;
  } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
    playerVinyl.classList.remove("playing");
    isPlaying = false;
  }
}

/* ============================================================
   HELPERS
============================================================ */
function getYouTubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

function nombreAutor(id) {
  if (id === "joan")  return "🤎 Joan";
  if (id === "emily") return "💛 Emily";
  return "🤎";
}

/* ============================================================
   REPRODUCIR CANCIÓN
============================================================ */
function playSong(song, cardElement) {
  const videoId = getYouTubeId(song.url);
  if (!videoId || !ytPlayer) return;

  // Si es la misma canción, hacemos Play/Pause
  if (currentAudioId === videoId) {
    if (isPlaying) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
    return;
  }

  // Si es una canción nueva
  currentAudioId = videoId;
  
  // Actualizar UI
  playerCont.hidden = false;
  currentTitle.textContent = song.titulo;
  currentArtist.textContent = song.artista;
  currentDedic.textContent = song.dedicatoria ? `"${song.dedicatoria}"` : `Dedicada por ${nombreAutor(song.autor)}`;

  // Cargar y reproducir la nueva canción mediante la API
  ytPlayer.loadVideoById(videoId);

  // Actualizar clases de las tarjetas
  document.querySelectorAll(".song-card").forEach(c => c.classList.remove("active"));
  if (cardElement) cardElement.classList.add("active");
}

/* ============================================================
   RENDERIZAR GRID
============================================================ */
function renderSongs(songs) {
  grid.innerHTML = "";

  if (songs.length === 0) {
    emptyState.hidden = false;
    contador.textContent = "0 canciones";
    playerCont.hidden = true;
    return;
  }
  emptyState.hidden = true;
  contador.textContent = `${songs.length} ${songs.length === 1 ? "canción" : "canciones"}`;

  songs.forEach(song => {
    const videoId = getYouTubeId(song.url);
    const thumbUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "";

    const card = document.createElement("div");
    card.className = "song-card";
    card.id = `card-${song.id}`;
    
    card.innerHTML = `
      <div class="song-thumb">
        ${thumbUrl ? `<img src="${thumbUrl}" alt="${song.titulo}">` : ''}
      </div>
      <div class="song-details">
        <div class="song-title">${song.titulo}</div>
        <div class="song-artist">${song.artista}</div>
        <div class="song-author">Para ${nombreAutor(song.autor === "joan" ? "emily" : "joan")}</div>
      </div>
    `;

    card.addEventListener("click", () => playSong(song, card));
    grid.appendChild(card);
  });
}

/* ============================================================
   LÓGICA DE FIREBASE
============================================================ */
async function initFirebase() {
  try {
    await signInAnonymously(auth);
    
    const ref = collection(db, "parejas", PAREJA_ID, "canciones");
    const q = query(ref, orderBy("ts", "desc"));

    onSnapshot(q, snap => {
      const songs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderSongs(songs);
    }, err => {
      console.error("Error cargando canciones:", err);
    });

  } catch (err) {
    console.error("❌ Error Firebase:", err);
  }
}

/* ============================================================
   EVENTOS MODAL
============================================================ */
btnAddSong.addEventListener("click", () => {
  modal.hidden = false;
  inputUrl.focus();
});

btnClose.addEventListener("click", () => {
  modal.hidden = true;
  inputUrl.value = "";
  inputTitle.value = "";
  inputArtist.value = "";
  inputDedic.value = "";
});

btnSave.addEventListener("click", async () => {
  const url = inputUrl.value.trim();
  const titulo = inputTitle.value.trim();
  const artista = inputArtist.value.trim();
  const dedicatoria = inputDedic.value.trim();

  if (!url || !titulo || !artista) {
    alert("Por favor, llena todos los campos obligatorios.");
    return;
  }

  const videoId = getYouTubeId(url);
  if (!videoId) {
    alert("El enlace de YouTube no es válido. Asegúrate de copiar el link correctamente.");
    return;
  }

  btnSave.disabled = true;
  btnSave.textContent = "Guardando...";

  try {
    await addDoc(collection(db, "parejas", PAREJA_ID, "canciones"), {
      url: url,
      titulo: titulo,
      artista: artista,
      dedicatoria: dedicatoria,
      autor: perfilActual,
      ts: serverTimestamp()
    });
    
    modal.hidden = true;
    inputUrl.value = "";
    inputTitle.value = "";
    inputArtist.value = "";
    inputDedic.value = "";
  } catch (err) {
    console.error("Error guardando canción:", err);
    alert("No se pudo guardar la canción. Revisa tu conexión.");
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = "Dedicar canción 🎵";
  }
});

modal.addEventListener("click", e => {
  if (e.target === modal) btnClose.click();
});

/* ============================================================
   ARRANQUE
============================================================ */
initFirebase();