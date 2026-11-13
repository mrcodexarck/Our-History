import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp,
  doc, deleteDoc // <-- Importado para eliminar
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { FIREBASE_CONFIG, PAREJA_ID } from "../citas/firebase-config.js";

/* ============================================================
   ⚠️ CONFIGURACIÓN DE SPOTIFY
============================================================ */
const SPOTIFY_CLIENT_ID = "7c1083ac6f59422287c7da3cc69b7076"; 
const REDIRECT_URI = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/'); 
const SCOPES = "streaming user-read-email user-read-private user-modify-playback-state";

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

const selectedUri  = document.getElementById("selected-uri");
const selectedTitle= document.getElementById("selected-title");
const selectedArtist= document.getElementById("selected-artist");
const selectedCover = document.getElementById("selected-cover");
const selectedSongDisplay = document.getElementById("selected-song-display");
const selectedSongText= document.getElementById("selected-song-text");

const playerCont   = document.getElementById("player-container");
const playerVinyl  = document.getElementById("player-vinyl");
const currentTitle = document.getElementById("current-title");
const currentArtist= document.getElementById("current-artist");
const currentDedic = document.getElementById("current-dedication");

const btnSpotifyLogin = document.getElementById("btn-spotify-login");

let currentUri = null;
let isPlaying = false;
let spotifyPlayer = null;
let deviceId = null;
let accessToken = null;
let tokenExpiresAt = 0;

/* ============================================================
   HELPERS DE AUTENTICACIÓN (PKCE)
============================================================ */
function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64encode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function redirectToSpotifyAuth() {
  const codeVerifier = generateRandomString(64);
  localStorage.setItem('spotify_code_verifier', codeVerifier);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);
  
  const authUrl = new URL('https://accounts.spotify.com/authorize');
  const params = {
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  };
  authUrl.search = new URLSearchParams(params).toString();
  window.location.href = authUrl.toString();
}

async function exchangeCodeForToken(code) {
  const codeVerifier = localStorage.getItem('spotify_code_verifier');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
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
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
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
    if (success) {
      initSpotifyPlayer();
    } else {
      alert('Error al conectar con Spotify. Inténtalo de nuevo.');
    }
  } else {
    const storedToken = localStorage.getItem('spotify_access_token');
    const storedRefresh = localStorage.getItem('spotify_refresh_token');
    if (storedToken && storedRefresh) {
      accessToken = storedToken;
      tokenExpiresAt = 0; 
      await ensureValidToken();
      initSpotifyPlayer();
    }
  }
}

/* ============================================================
   INICIALIZAR SPOTIFY WEB PLAYBACK SDK
============================================================ */
function initSpotifyPlayer() {
  if (spotifyPlayer || !accessToken) return;
  
  spotifyPlayer = new Spotify.Player({
    name: 'Nuestra Música Player',
    getOAuthToken: async cb => {
      await ensureValidToken();
      cb(accessToken);
    },
    volume: 0.8
  });

  spotifyPlayer.addListener('ready', ({ device_id }) => {
    deviceId = device_id;
    console.log('✅ Spotify Player listo, Device ID:', deviceId);
    btnSpotifyLogin.style.display = 'none';
  });

  spotifyPlayer.addListener('not_ready', ({ device_id }) => {
    console.log('❌ Device ID offline:', device_id);
    deviceId = null;
  });

  spotifyPlayer.addListener('player_state_changed', state => {
    if (!state) return;
    isPlaying = !state.paused;
    if (isPlaying) {
      playerVinyl.classList.add("playing");
    } else {
      playerVinyl.classList.remove("playing");
    }
  });

  spotifyPlayer.connect();
}

// El SDK llama a esta función global cuando está listo
window.onSpotifyWebPlaybackSDKReady = () => {
  if (accessToken) initSpotifyPlayer();
};

/* ============================================================
   HELPERS GENERALES
============================================================ */
function nombreAutor(id) {
  if (id === "joan")  return "🤎 Joan";
  if (id === "emily") return "💛 Emily";
  return "🤎";
}

/* ============================================================
   BUSCADOR CON SPOTIFY API
============================================================ */
btnSearch.addEventListener("click", async () => {
  const query = inputSearch.value.trim();
  if (!query) {
    alert("Escribe el nombre de una canción o artista.");
    return;
  }

  if (!await ensureValidToken()) {
    alert("Tu sesión de Spotify ha expirado. Vuelve a conectar.");
    btnSpotifyLogin.style.display = 'block';
    return;
  }

  btnSearch.textContent = "...";
  btnSearch.disabled = true;
  searchResultsDiv.style.display = "none";

  try {
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const data = await res.json();

    if (!data.tracks || !data.tracks.items || data.tracks.items.length === 0) {
      alert("No se encontraron canciones. Intenta con otro término.");
      return;
    }

    searchResultsDiv.innerHTML = "";
    searchResultsDiv.style.display = "block";

    data.tracks.items.forEach(item => {
      const uri = item.uri;
      const titulo = item.name;
      const artista = item.artists.map(a => a.name).join(", ");
      const coverUrl = item.album.images[0]?.url || '';

      const resultDiv = document.createElement("div");
      resultDiv.className = "search-item";
      resultDiv.innerHTML = `
        <img src="${coverUrl}" alt="${titulo}">
        <div class="search-item-info">
          <div class="search-item-title">${titulo}</div>
          <div class="search-item-artist">${artista}</div>
        </div>
      `;

      resultDiv.addEventListener("click", () => {
        selectedUri.value = uri;
        selectedTitle.value = titulo;
        selectedArtist.value = artista;
        selectedCover.value = coverUrl;

        selectedSongText.textContent = `${titulo} - ${artista}`;
        selectedSongDisplay.style.display = "block";
        searchResultsDiv.style.display = "none";
        inputSearch.value = ""; 
      });

      searchResultsDiv.appendChild(resultDiv);
    });

  } catch (err) {
    console.error("Error en búsqueda:", err);
    alert("Error de conexión al buscar en Spotify.");
  } finally {
    btnSearch.textContent = "🔍";
    btnSearch.disabled = false;
  }
});

/* ============================================================
   REPRODUCIR CANCIÓN EN SPOTIFY
============================================================ */
async function playSong(song, cardElement) {
  if (!deviceId) {
    alert("El reproductor de Spotify aún no está listo. Espera unos segundos o asegúrate de tener Spotify Premium activo.");
    return;
  }

  if (!await ensureValidToken()) {
    alert("Sesión de Spotify expirada. Vuelve a conectar.");
    return;
  }

  const uri = song.spotifyUri;
  if (!uri) {
    alert("Esta canción no tiene un enlace válido de Spotify.");
    return;
  }

  // Si ya está sonando la misma canción, pausamos/reanudamos usando el SDK (más rápido y seguro)
  if (currentUri === uri) {
    spotifyPlayer.togglePlay();
    return;
  }

  currentUri = uri;
  
  playerCont.hidden = false;
  currentTitle.textContent = song.titulo;
  currentArtist.textContent = song.artista;
  currentDedic.textContent = song.dedicatoria ? `"${song.dedicatoria}"` : `Dedicada por ${nombreAutor(song.autor)}`;

  if (song.portada) {
    playerVinyl.style.backgroundImage = `url('${song.portada}')`;
  }

  // Reproducir en el dispositivo virtual
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ uris: [uri] })
  });

  document.querySelectorAll(".song-card").forEach(c => c.classList.remove("active"));
  if (cardElement) cardElement.classList.add("active");
}

/* ============================================================
   RENDERIZAR GRID Y BOTÓN DE ELIMINAR
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
    const coverUrl = song.portada || "";

    const card = document.createElement("div");
    card.className = "song-card";
    card.id = `card-${song.id}`;
    
    // Se añade el botón ✕ al final de la tarjeta
    card.innerHTML = `
      <div class="song-thumb">
        ${coverUrl ? `<img src="${coverUrl}" alt="${song.titulo}">` : ''}
      </div>
      <div class="song-details">
        <div class="song-title">${song.titulo}</div>
        <div class="song-artist">${song.artista}</div>
        <div class="song-author">Para ${nombreAutor(song.autor === "joan" ? "emily" : "joan")}</div>
      </div>
      <button class="btn-delete-song" title="Eliminar canción">✕</button>
    `;

    // Evento para reproducir
    card.addEventListener("click", () => playSong(song, card));

    // Evento para eliminar
    const btnDelete = card.querySelector(".btn-delete-song");
    btnDelete.addEventListener("click", async (e) => {
      e.stopPropagation(); // Evita que se dispare el playSong al hacer clic en la ✕
      
      if (confirm(`¿Eliminar "${song.titulo}" de Nuestra Música?`)) {
        try {
          const songRef = doc(db, "parejas", PAREJA_ID, "canciones", song.id);
          await deleteDoc(songRef);

          // Si la canción eliminada es la que suena actualmente, apagamos el reproductor
          if (currentUri === song.spotifyUri) {
            if (spotifyPlayer && isPlaying) {
              spotifyPlayer.pause();
            }
            playerCont.hidden = true;
            currentUri = null;
            playerVinyl.classList.remove("playing");
          }
        } catch (err) {
          console.error("Error al eliminar la canción:", err);
          alert("No se pudo eliminar la canción. Intenta de nuevo.");
        }
      }
    });

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
  selectedUri.value = "";
  selectedTitle.value = "";
  selectedArtist.value = "";
  selectedCover.value = "";
  selectedSongDisplay.style.display = "none";
  inputDedic.value = "";
  searchResultsDiv.style.display = "none";
});

btnSave.addEventListener("click", async () => {
  const uri = selectedUri.value;
  const titulo = selectedTitle.value;
  const artista = selectedArtist.value;
  const portada = selectedCover.value;
  const dedicatoria = inputDedic.value.trim();

  if (!uri) {
    alert("Por favor, busca y selecciona una canción de la lista.");
    return;
  }

  btnSave.disabled = true;
  btnSave.textContent = "Guardando...";

  try {
    await addDoc(collection(db, "parejas", PAREJA_ID, "canciones"), {
      spotifyUri: uri,
      titulo: titulo,
      artista: artista,
      portada: portada,
      dedicatoria: dedicatoria,
      autor: perfilActual,
      ts: serverTimestamp()
    });
    
    modal.hidden = true;
    inputSearch.value = "";
    selectedUri.value = "";
    selectedTitle.value = "";
    selectedArtist.value = "";
    selectedCover.value = "";
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
   BOTÓN DE LOGIN Y ARRANQUE
============================================================ */
btnSpotifyLogin.addEventListener("click", redirectToSpotifyAuth);

async function boot() {
  await handleSpotifyCallback();
  
  if (!accessToken) {
    btnSpotifyLogin.style.display = 'block';
  }
  
  initFirebase();
}

boot();