import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { FIREBASE_CONFIG, PAREJA_ID } from "../citas/firebase-config.js";

const SPOTIFY_CLIENT_ID = "7c1083ac6f59422287c7da3cc69b7076"; 
const REDIRECT_URI = "https://mrcodexarck.github.io/Our-History/canciones/index.html";
const SCOPES = "streaming user-read-email user-read-private user-modify-playback-state";

// Verificamos si venimos de un redireccionamiento de Spotify
const urlParams = new URLSearchParams(window.location.search);
const isSpotifyCallback = urlParams.has('code');

if (sessionStorage.getItem("acceso-libro") !== "ok" && !isSpotifyCallback) { 
  location.replace("../"); 
}
const PERFIL_KEY = "perfil-dibujo";
let perfilActual = localStorage.getItem(PERFIL_KEY) || "joan";

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const auth = getAuth(app);

// DOM Selectores (Nuevos IDs)
const grid = document.getElementById("music-grid");
const libraryList = document.getElementById("library-list");
const queueList = document.getElementById("queue-list");
const userNameSpan = document.getElementById("user-name");
const contador = document.getElementById("contador");

const modal = document.getElementById("modal-overlay");
const btnOpenModal = document.getElementById("btn-open-modal");
const btnAddSongLib = document.getElementById("btn-add-song");
const btnClose = document.getElementById("modal-close");
const btnSave = document.getElementById("btn-save");

const inputSearch = document.getElementById("input-search");
const btnSearch = document.getElementById("btn-search");
const searchResultsDiv = document.getElementById("search-results");
const inputDedic = document.getElementById("input-dedication");
const selectedUri = document.getElementById("selected-uri");
const selectedTitle = document.getElementById("selected-title");
const selectedArtist = document.getElementById("selected-artist");
const selectedCover = document.getElementById("selected-cover");
const selectedSongDisplay = document.getElementById("selected-song-display");
const selectedSongText = document.getElementById("selected-song-text");
const btnSpotifyLogin = document.getElementById("btn-spotify-login");

// Reproductor UI (Bottom y Right Panel)
const bottomPlayer = document.getElementById("bottom-player");
const bpCover = document.getElementById("bp-cover");
const bpTitle = document.getElementById("bp-title");
const bpArtist = document.getElementById("bp-artist");
const npCard = document.getElementById("now-playing-card");
const npCover = document.getElementById("np-cover");
const npTitle = document.getElementById("np-title");
const npArtist = document.getElementById("np-artist");
const npDedic = document.getElementById("np-dedication");

const btnPlayPause = document.getElementById("btn-play-pause");
const iconPlay = document.getElementById("icon-play");
const iconPause = document.getElementById("icon-pause");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const bpProgressBar = document.getElementById("bp-progress-bar");
const bpTimeCurrent = document.getElementById("bp-time-current");
const bpTimeTotal = document.getElementById("bp-time-total");
const bpVolume = document.getElementById("bp-volume");

let currentUri = null;
let isPlaying = false;
let spotifyPlayer = null;
let deviceId = null;
let accessToken = null;
let tokenExpiresAt = 0;
let appSongs = []; // Guarda las canciones para la cola y la UI

// Autenticación PKCE
function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}
async function sha256(plain) {
  const encoder = new TextEncoder(); const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}
function base64encode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
async function redirectToSpotifyAuth() {
  const codeVerifier = generateRandomString(64);
  localStorage.setItem('spotify_code_verifier', codeVerifier);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);
  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.search = new URLSearchParams({
    response_type: 'code', client_id: SPOTIFY_CLIENT_ID, scope: SCOPES,
    redirect_uri: REDIRECT_URI, code_challenge_method: 'S256', code_challenge: codeChallenge,
  }).toString();
  window.location.href = authUrl.toString();
}
async function exchangeCodeForToken(code) {
  const codeVerifier = localStorage.getItem('spotify_code_verifier');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID, grant_type: 'authorization_code', code: code,
      redirect_uri: REDIRECT_URI, code_verifier: codeVerifier,
    }),
  });
  const data = await response.json();
  if (data.access_token) {
    localStorage.setItem('spotify_access_token', data.access_token);
    localStorage.setItem('spotify_refresh_token', data.refresh_token);
    tokenExpiresAt = Date.now() + (data.expires_in * 1000);
    accessToken = data.access_token;
    return true;
  }
  return false;
}
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('spotify_refresh_token');
  if (!refreshToken) return false;
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const data = await response.json();
  if (data.access_token) {
    localStorage.setItem('spotify_access_token', data.access_token);
    tokenExpiresAt = Date.now() + (data.expires_in * 1000);
    accessToken = data.access_token;
    return true;
  }
  return false;
}
async function ensureValidToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60000) return true;
  return await refreshAccessToken();
}
async function handleSpotifyCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  if (code) {
    const success = await exchangeCodeForToken(code);
    window.history.replaceState({}, document.title, window.location.pathname);
    if (success) initSpotifyPlayer();
  } else {
    const storedToken = localStorage.getItem('spotify_access_token');
    const storedRefresh = localStorage.getItem('spotify_refresh_token');
    if (storedToken && storedRefresh) {
      accessToken = storedToken; tokenExpiresAt = 0; 
      await ensureValidToken(); initSpotifyPlayer();
    }
  }
}

// Reproductor
function initSpotifyPlayer() {
  if (spotifyPlayer || !accessToken) return;
  spotifyPlayer = new Spotify.Player({
    name: 'Nuestra Música Web Player',
    getOAuthToken: async cb => { await ensureValidToken(); cb(accessToken); },
    volume: parseFloat(bpVolume.value)
  });

  spotifyPlayer.addListener('ready', ({ device_id }) => {
    deviceId = device_id;
    btnSpotifyLogin.style.display = 'none';
  });

  spotifyPlayer.addListener('player_state_changed', state => {
    if (!state) return;
    
    isPlaying = !state.paused;
    iconPlay.style.display = isPlaying ? "none" : "block";
    iconPause.style.display = isPlaying ? "block" : "none";

    const progress = (state.position / state.duration) * 100;
    bpProgressBar.value = progress;
    bpTimeCurrent.textContent = formatTime(state.position);
    bpTimeTotal.textContent = formatTime(state.duration);

    const playingUri = state.track_window.current_track.uri;
    if (currentUri !== playingUri) {
      currentUri = playingUri;
      const song = appSongs.find(s => s.spotifyUri === playingUri);
      if (song) updatePlayerUI(song);
    }
  });
  spotifyPlayer.connect();
}
window.onSpotifyWebPlaybackSDKReady = () => { if (accessToken) initSpotifyPlayer(); };

function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
function nombreAutor(id) {
  if (id === "joan") return "🤎 Joan";
  if (id === "emily") return "💛 Emily";
  return "🤎";
}

async function ensureDeviceReady() {
  if (deviceId) return true;
  if (spotifyPlayer && spotifyPlayer.connect) await spotifyPlayer.connect();
  for (let i = 0; i < 30; i++) {
    if (deviceId) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

// Lógica para reproducir toda la lista (Queue)
async function playSong(song, startIndex) {
  const ready = await ensureDeviceReady();
  if (!ready) { alert("El reproductor no está listo. Verifica tu conexión o Spotify Premium."); return; }
  if (!await ensureValidToken()) { alert("Sesión de Spotify expirada. Vuelve a conectar."); return; }

  // Creamos un array con las URIs de TODAS las canciones para que funcione el botón Siguiente/Anterior
  const allUris = appSongs.map(s => s.spotifyUri);
  
  // Buscamos el índice exacto de la canción seleccionada
  const uriIndex = appSongs.findIndex(s => s.id === song.id);
  if (uriIndex === -1) return;

  // Reordenamos la lista para que empiece por la canción seleccionada
  const queuedUris = [...allUris.slice(uriIndex), ...allUris.slice(0, uriIndex)];

  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: queuedUris })
  });

  updatePlayerUI(song);
  currentUri = song.spotifyUri;
}

function updatePlayerUI(song) {
  bottomPlayer.hidden = false;
  npCard.hidden = false;
  
  const cover = song.portada || '';
  const dedic = song.dedicatoria ? `"${song.dedicatoria}"` : `Para ${nombreAutor(song.autor === "joan" ? "emily" : "joan")}`;
  
  // Bottom Player
  bpCover.src = cover; bpTitle.textContent = song.titulo; bpArtist.textContent = song.artista;
  
  // Right Panel
  npCover.src = cover; npTitle.textContent = song.titulo; npArtist.textContent = song.artista; npDedic.textContent = dedic;

  renderQueue(song.id);
}

// Renderizar Tarjetas Centrales
function renderSongs(songs) {
  appSongs = songs; // Guardar globalmente
  grid.innerHTML = "";
  libraryList.innerHTML = "";
  
  if (songs.length === 0) {
    grid.innerHTML = "<p style='color:gray'>Aún no hay canciones. Añade una nueva.</p>";
    contador.textContent = "0 canciones";
    return;
  }
  contador.textContent = `${songs.length} canciones`;

  songs.forEach((song) => {
    // 1. Tarjeta Central (Grid)
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <button class="btn-delete-song" title="Eliminar">✕</button>
      <img class="card-cover" src="${song.portada || ''}" alt="${song.titulo}">
      <div class="card-title">${song.titulo}</div>
      <div class="card-artist">${song.artista}</div>
      <div class="card-dedic">Para ${nombreAutor(song.autor === "joan" ? "emily" : "joan")}</div>
    `;
    
    card.addEventListener("click", (e) => {
      if (e.target.classList.contains('btn-delete-song')) return;
      playSong(song, 0);
    });

    // Eliminar
    card.querySelector(".btn-delete-song").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm(`¿Eliminar "${song.titulo}"?`)) {
        await deleteDoc(doc(db, "parejas", PAREJA_ID, "canciones", song.id));
        if (currentUri === song.spotifyUri && spotifyPlayer) spotifyPlayer.pause();
      }
    });
    grid.appendChild(card);

    // 2. Lista Lateral Izquierda (Librería)
    const libItem = document.createElement("div");
    libItem.className = "lib-item";
    libItem.innerHTML = `
      <img src="${song.portada || ''}" alt="">
      <div class="lib-item-info">
        <div class="lib-item-title">${song.titulo}</div>
        <div class="lib-item-artist">${song.artista}</div>
      </div>
    `;
    libItem.addEventListener("click", () => playSong(song, 0));
    libraryList.appendChild(libItem);
  });
}

// Renderizar Cola (Right Panel)
function renderQueue(currentSongId) {
  queueList.innerHTML = "";
  const nextSongs = appSongs.filter(s => s.id !== currentSongId).slice(0, 5); // Mostrar las 5 siguientes

  nextSongs.forEach(song => {
    const item = document.createElement("div");
    item.className = "queue-item";
    item.innerHTML = `
      <img src="${song.portada || ''}">
      <div class="queue-info">
        <div class="queue-title">${song.titulo}</div>
        <div class="queue-artist">${song.artista}</div>
      </div>
    `;
    item.addEventListener("click", () => playSong(song, 0));
    queueList.appendChild(item);
  });
}

// Firebase Listener
async function initFirebase() {
  userNameSpan.textContent = perfilActual === "joan" ? "Joan" : "Emily";
  try {
    await signInAnonymously(auth);
    const ref = collection(db, "parejas", PAREJA_ID, "canciones");
    const q = query(ref, orderBy("ts", "desc"));
    onSnapshot(q, snap => {
      const songs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderSongs(songs);
    });
  } catch (err) { console.error("Error Firebase:", err); }
}

// Controles Reproductor
btnPlayPause.addEventListener("click", () => { if (spotifyPlayer) spotifyPlayer.togglePlay(); });
btnNext.addEventListener("click", () => { if (spotifyPlayer) spotifyPlayer.nextTrack(); });
btnPrev.addEventListener("click", () => { if (spotifyPlayer) spotifyPlayer.previousTrack(); });
bpProgressBar.addEventListener("change", (e) => {
  if (spotifyPlayer && currentUri) {
    // Como usamos una cola de Spotify, el SDK maneja la duración de la canción actual
    spotifyPlayer.getCurrentState().then(state => {
      if (state) spotifyPlayer.seek((e.target.value / 100) * state.duration);
    });
  }
});
bpVolume.addEventListener("input", (e) => { if (spotifyPlayer) spotifyPlayer.setVolume(parseFloat(e.target.value)); });

// Modal Lógica (Abrir/Cerrar y Buscar)
btnOpenModal.addEventListener("click", () => { modal.hidden = false; });
btnAddSongLib.addEventListener("click", () => { modal.hidden = false; });
btnClose.addEventListener("click", () => { modal.hidden = true; });

btnSearch.addEventListener("click", async () => {
  const q = inputSearch.value.trim();
  if (!q || !await ensureValidToken()) return;

  btnSearch.textContent = "...";
  try {
    const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const data = await res.json();
    searchResultsDiv.innerHTML = "";
    searchResultsDiv.style.display = "block";

    data.tracks.items.forEach(item => {
      const div = document.createElement("div");
      div.className = "search-item";
      div.innerHTML = `
        <img src="${item.album.images[0]?.url}">
        <div>
          <div class="search-item-title">${item.name}</div>
          <div class="search-item-artist">${item.artists.map(a => a.name).join(", ")}</div>
        </div>
      `;
      div.onclick = () => {
        selectedUri.value = item.uri;
        selectedTitle.value = item.name;
        selectedArtist.value = item.artists.map(a => a.name).join(", ");
        selectedCover.value = item.album.images[0]?.url || '';
        selectedSongText.textContent = `${item.name} - ${selectedArtist.value}`;
        selectedSongDisplay.style.display = "block";
        searchResultsDiv.style.display = "none";
        inputSearch.value = "";
      };
      searchResultsDiv.appendChild(div);
    });
  } catch (e) { console.error(e); } finally { btnSearch.textContent = "🔍"; }
});

btnSave.addEventListener("click", async () => {
  if (!selectedUri.value) return alert("Selecciona una canción primero.");
  btnSave.disabled = true; btnSave.textContent = "Guardando...";
  try {
    await addDoc(collection(db, "parejas", PAREJA_ID, "canciones"), {
      spotifyUri: selectedUri.value, titulo: selectedTitle.value,
      artista: selectedArtist.value, portada: selectedCover.value,
      dedicatoria: inputDedic.value.trim(), autor: perfilActual, ts: serverTimestamp()
    });
    modal.hidden = true;
    inputSearch.value = ""; selectedUri.value = ""; selectedSongDisplay.style.display = "none"; inputDedic.value = "";
  } catch (e) { console.error(e); alert("Error al guardar."); }
  btnSave.disabled = false; btnSave.textContent = "Guardar canción 🎵";
});

btnSpotifyLogin.addEventListener("click", redirectToSpotifyAuth);

// Arranque
handleSpotifyCallback().then(() => {
  initFirebase();
  // Si no hay token tras revisar, mostrar botón de login
  setTimeout(() => { if (!accessToken) btnSpotifyLogin.style.display = 'block'; }, 1000);
});