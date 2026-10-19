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
   ⚠️ CONFIGURACIÓN: PON TU API KEY DE YOUTUBE AQUÍ
============================================================ */
const YOUTUBE_API_KEY = "AIzaSyC-kcMHCkA3TRn2wCHrq4aOTbLOUbIS59E"; 

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

const inputSearch  = document.getElementById("input-search");
const btnSearch    = document.getElementById("btn-search");
const searchResultsDiv = document.getElementById("search-results");
const inputDedic   = document.getElementById("input-dedication");

const selectedUrl  = document.getElementById("selected-url");
const selectedTitle= document.getElementById("selected-title");
const selectedArtist= document.getElementById("selected-artist");
const selectedSongDisplay = document.getElementById("selected-song-display");
const selectedSongText= document.getElementById("selected-song-text");

const playerCont   = document.getElementById("player-container");
const playerVinyl  = document.getElementById("player-vinyl");
const currentTitle = document.getElementById("current-title");
const currentArtist= document.getElementById("current-artist");
const currentDedic = document.getElementById("current-dedication");

let currentAudioId = null;
let isPlaying = false;
let ytPlayer = null;

/* ============================================================
   INICIALIZAR API DE YOUTUBE
============================================================ */
function initYtPlayer() {
  if (ytPlayer) return;
  
  ytPlayer = new YT.Player('youtube-api-player', {
    height: '200',
    width: '200',
    videoId: '',
    playerVars: {
      'autoplay': 1,
      'controls': 0,
      'disablekb': 1,
      'fs': 0,
      'modestbranding': 1,
      'origin': window.location.origin
    },
    events: {
      'onStateChange': onPlayerStateChange,
      'onError': (e) => {
        console.error("Error de YouTube:", e.data);
        if (e.data === 150 || e.data === 101) {
          alert("Este video tiene la reproducción externa bloqueada por su dueño. Prueba con otro enlace.");
          playerVinyl.classList.remove("playing");
        }
      }
    }
  });
}

window.onYouTubeIframeAPIReady = initYtPlayer;
if (window.YT && window.YT.Player) { initYtPlayer(); }

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
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([^"&?\/\s]{11})/i;
  const match = url.match(regExp);
  return (match && match[1]) ? match[1] : null;
}

function nombreAutor(id) {
  if (id === "joan")  return "🤎 Joan";
  if (id === "emily") return "💛 Emily";
  return "🤎";
}

/* ============================================================
   BUSCADOR AUTOMÁTICO (YouTube API)
============================================================ */
btnSearch.addEventListener("click", async () => {
  const query = inputSearch.value.trim();
  if (!query) {
    alert("Escribe el nombre de una canción o artista.");
    return;
  }

  if (YOUTUBE_API_KEY === "TU_API_KEY_AQUI") {
    alert("⚠️ Falta configurar tu API KEY de YouTube en el archivo app.js para poder buscar automáticamente.");
    return;
  }

  btnSearch.textContent = "...";
  btnSearch.disabled = true;
  searchResultsDiv.style.display = "none";

  try {
    // El parámetro videoEmbeddable=true garantiza que solo salgan videos que se pueden reproducir en tu app
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoEmbeddable=true&maxResults=5&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      alert("No se encontraron resultados reproducibles. Intenta buscar de otra forma.");
      return;
    }

    searchResultsDiv.innerHTML = "";
    searchResultsDiv.style.display = "block";

    data.items.forEach(item => {
      const videoId = item.id.videoId;
      const titulo = item.snippet.title;
      const artista = item.snippet.channelTitle;
      const thumb = item.snippet.thumbnails.default.url;
      const fullUrl = `https://www.youtube.com/watch?v=${videoId}`;

      const resultDiv = document.createElement("div");
      resultDiv.className = "search-item";
      resultDiv.innerHTML = `
        <img src="${thumb}">
        <div class="search-item-info">
          <div class="search-item-title">${titulo}</div>
          <div class="search-item-artist">${artista}</div>
        </div>
      `;

      resultDiv.addEventListener("click", () => {
        // Llenar campos ocultos
        selectedUrl.value = fullUrl;
        selectedTitle.value = titulo;
        selectedArtist.value = artista;

        // Mostrar selección
        selectedSongText.textContent = `${titulo} - ${artista}`;
        selectedSongDisplay.style.display = "block";
        searchResultsDiv.style.display = "none";
        inputSearch.value = ""; 
      });

      searchResultsDiv.appendChild(resultDiv);
    });

  } catch (err) {
    console.error("Error en búsqueda:", err);
    alert("Error de conexión al buscar.");
  } finally {
    btnSearch.textContent = "🔍";
    btnSearch.disabled = false;
  }
});

/* ============================================================
   REPRODUCIR CANCIÓN
============================================================ */
function playSong(song, cardElement) {
  const videoId = getYouTubeId(song.url);
  
  if (!videoId) {
    alert("Enlace inválido.");
    return;
  }

  if (!ytPlayer) {
    alert("El reproductor se está cargando. Espera un segundo.");
    return;
  }

  if (currentAudioId === videoId) {
    if (isPlaying) ytPlayer.pauseVideo();
    else ytPlayer.playVideo();
    return;
  }

  currentAudioId = videoId;
  
  playerCont.hidden = false;
  currentTitle.textContent = song.titulo;
  currentArtist.textContent = song.artista;
  currentDedic.textContent = song.dedicatoria ? `"${song.dedicatoria}"` : `Dedicada por ${nombreAutor(song.autor)}`;

  // Poner la portada del video en el vinilo
  playerVinyl.style.backgroundImage = `url('https://img.youtube.com/vi/${videoId}/hqdefault.jpg')`;

  ytPlayer.loadVideoById(videoId);

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
   FIREBASE LISTENER
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
  inputSearch.focus();
});

btnClose.addEventListener("click", () => {
  modal.hidden = true;
  inputSearch.value = "";
  selectedUrl.value = "";
  selectedTitle.value = "";
  selectedArtist.value = "";
  selectedSongDisplay.style.display = "none";
  inputDedic.value = "";
  searchResultsDiv.style.display = "none";
});

btnSave.addEventListener("click", async () => {
  const url = selectedUrl.value;
  const titulo = selectedTitle.value;
  const artista = selectedArtist.value;
  const dedicatoria = inputDedic.value.trim();

  if (!url) {
    alert("Por favor, busca y selecciona una canción de la lista.");
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
    
    // Limpiar formulario y cerrar
    modal.hidden = true;
    inputSearch.value = "";
    selectedUrl.value = "";
    selectedTitle.value = "";
    selectedArtist.value = "";
    selectedSongDisplay.style.display = "none";
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