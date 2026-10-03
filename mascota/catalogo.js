/* ============================================================
   CATÁLOGO DE LA TIENDA
   - Subcategorías por tipo de sala
============================================================ */
export const CATALOGO = {
  fondos: [
    // ==================== SALA (home) ====================
    { id: "fondo-sala",          nombre: "Sala clásica",     emoji: "🏠", img: "assets/fondos/salas/clasica.jpg",   precio: 0,   categoria: "sala" },
    { id: "fondo-sala-normal",   nombre: "Sala normal",      emoji: "🛋️", img: "assets/fondos/salas/normal.jpg",    precio: 0,   categoria: "sala" },
    { id: "fondo-sala-amor",     nombre: "Sala del amor",    emoji: "💕", img: "assets/fondos/salas/amor.jpg",      precio: 150, categoria: "sala" },
    { id: "fondo-sala-futurista", nombre: "Sala futurista",  emoji: "🚀", img: "assets/fondos/salas/futurista.jpg", precio: 250, categoria: "sala" },
    { id: "fondo-sala-navidad",  nombre: "Navidad",          emoji: "🎄", img: "assets/fondos/salas/navidad.jpg",   precio: 300, categoria: "sala" },
    { id: "fondo-sala-hallow",   nombre: "Halloween",        emoji: "🎃", img: "assets/fondos/salas/halloween.jpg", precio: 300, categoria: "sala" },

    // ==================== COCINA (alimentar) ====================
    { id: "fondo-cocina",         nombre: "Cocina clásica",   emoji: "🍳", img: "assets/fondos/cocina/clasica.jpg",  precio: 0,   categoria: "cocina" },
    { id: "fondo-cocina-italiana", nombre: "Cocina italiana", emoji: "🍝", img: "assets/fondos/cocina/italiana.jpg", precio: 220, categoria: "cocina" },
    { id: "fondo-cocina-japonesa", nombre: "Cocina japonesa", emoji: "🍣", img: "assets/fondos/cocina/japonesa.jpg", precio: 280, categoria: "cocina" },
    { id: "fondo-cocina-pastel",   nombre: "Pastelería",      emoji: "🧁", img: "assets/fondos/cocina/pastel.jpg",   precio: 250, categoria: "cocina" },
    { id: "fondo-cocina-rustica",  nombre: "Cocina rústica",  emoji: "🪵", img: "assets/fondos/cocina/rustica.jpg",  precio: 200, categoria: "cocina" },

    // ==================== JARDÍN (jugar) ====================
    { id: "fondo-jardin",           nombre: "Jardín clásico",   emoji: "🌳", img: "assets/fondos/jardin/clasico.jpg",  precio: 0,   categoria: "jardin" },
    { id: "fondo-jardin-tropical",  nombre: "Jardín tropical",  emoji: "🌴", img: "assets/fondos/jardin/tropical.jpg", precio: 180, categoria: "jardin" },
    { id: "fondo-jardin-nieve",     nombre: "Jardín nevado",    emoji: "❄️", img: "assets/fondos/jardin/nieve.jpg",    precio: 220, categoria: "jardin" },
    { id: "fondo-jardin-flores",    nombre: "Campo de flores",  emoji: "🌻", img: "assets/fondos/jardin/flores.jpg",   precio: 240, categoria: "jardin" },
    { id: "fondo-jardin-otono",     nombre: "Bosque otoñal",    emoji: "🍁", img: "assets/fondos/jardin/otono.jpg",    precio: 260, categoria: "jardin" },

    // ==================== BAÑO (bañar) ====================
    { id: "fondo-bano",              nombre: "Baño clásico",      emoji: "🛁", img: "assets/fondos/bano/clasico.jpg",   precio: 0,   categoria: "bano" },
    { id: "fondo-bano-spa",          nombre: "Spa relax",         emoji: "🧖", img: "assets/fondos/bano/spa.jpg",       precio: 250, categoria: "bano" },
    { id: "fondo-bano-japones",      nombre: "Baño japonés",      emoji: "🎋", img: "assets/fondos/bano/japones.jpg",   precio: 300, categoria: "bano" },
    { id: "fondo-bano-burbujas",     nombre: "Fiesta de burbujas", emoji: "🫧", img: "assets/fondos/bano/burbujas.jpg",  precio: 220, categoria: "bano" },

    // ==================== DORMITORIO (dormir) ====================
    { id: "fondo-dormitorio",           nombre: "Dormitorio clásico",   emoji: "🛏️", img: "assets/fondos/dormitorio/clasico.jpg",   precio: 0,   categoria: "dormitorio" },
    { id: "fondo-dormitorio-nubes",     nombre: "Cama de nubes",        emoji: "☁️", img: "assets/fondos/dormitorio/nubes.jpg",     precio: 280, categoria: "dormitorio" },
    { id: "fondo-dormitorio-cabaña",    nombre: "Cabaña acogedora",     emoji: "🏕️", img: "assets/fondos/dormitorio/cabana.jpg",    precio: 320, categoria: "dormitorio" },
    { id: "fondo-dormitorio-fantasia",  nombre: "Dormitorio mágico",    emoji: "✨", img: "assets/fondos/dormitorio/fantasia.jpg",  precio: 400, categoria: "dormitorio" },

    // ==================== CARIÑO (carino) ====================
    { id: "fondo-carino",              nombre: "Rincón de amor",    emoji: "💕", img: "assets/fondos/carino/clasico.jpg",   precio: 0,   categoria: "carino" },
    { id: "fondo-carino-corazones",    nombre: "Lluvia de corazones", emoji: "❤️", img: "assets/fondos/carino/corazones.jpg", precio: 220, categoria: "carino" },
    { id: "fondo-carino-atardecer",    nombre: "Atardecer romántico", emoji: "🌅", img: "assets/fondos/carino/atardecer.jpg", precio: 300, categoria: "carino" },

    // ==================== ENFERMERÍA (curar) ====================
    { id: "fondo-enfermeria",           nombre: "Enfermería clásica", emoji: "🏥", img: "assets/fondos/enfermeria/clasica.jpg",  precio: 0,   categoria: "enfermeria" },
    { id: "fondo-enfermeria-veterinaria", nombre: "Veterinaria",      emoji: "🩺", img: "assets/fondos/enfermeria/vet.jpg",      precio: 280, categoria: "enfermeria" },
    { id: "fondo-enfermeria-botanica",  nombre: "Botica herbal",       emoji: "🌿", img: "assets/fondos/enfermeria/botanica.jpg", precio: 250, categoria: "enfermeria" },
  ],

  objetos: [
    // ==================== SALA ====================
    { id: "obj-planta",   nombre: "Planta",   emoji: "🪴", img: "assets/objetos/planta.png",   precio: 30,  categoria: "sala" },
    { id: "obj-cuadro",   nombre: "Cuadro",   emoji: "🖼️", img: "assets/objetos/cuadro.png",   precio: 50,  categoria: "sala" },
    { id: "obj-lampara",  nombre: "Lámpara",  emoji: "💡", img: "assets/objetos/lampara.png",  precio: 60,  categoria: "sala" },
    { id: "obj-reloj",    nombre: "Reloj",    emoji: "🕰️", img: "assets/objetos/reloj.png",    precio: 40,  categoria: "sala" },
    { id: "obj-flores",   nombre: "Florero",  emoji: "🌷", img: "assets/objetos/flores.png",   precio: 25,  categoria: "sala" },
    { id: "obj-alfombra", nombre: "Alfombra", emoji: "🟫", img: "assets/objetos/alfombra.png", precio: 20,  categoria: "sala" },
    { id: "obj-libros",   nombre: "Librero",  emoji: "📚", img: "assets/objetos/libros.png",   precio: 80,  categoria: "sala" },
    { id: "obj-ventana",  nombre: "Ventana",  emoji: "🪟", img: "assets/objetos/ventana.png",  precio: 90,  categoria: "sala" },
    { id: "obj-poster",   nombre: "Póster",   emoji: "🎨", img: "assets/objetos/poster.png",   precio: 45,  categoria: "sala" },
    { id: "obj-vela",     nombre: "Vela",     emoji: "🕯️", img: "assets/objetos/vela.png",     precio: 35,  categoria: "sala" },
    { id: "obj-globos",   nombre: "Globos",   emoji: "🎈", img: "assets/objetos/globos.png",   precio: 55,  categoria: "sala" },
    { id: "obj-trofeo",   nombre: "Trofeo",   emoji: "🏆", img: "assets/objetos/trofeo.png",   precio: 200, categoria: "sala" },
    { id: "obj-oso",      nombre: "Osito",    emoji: "🧸", img: "assets/objetos/oso.png",      precio: 100, categoria: "sala" },
    { id: "obj-guitarra", nombre: "Guitarra", emoji: "🎸", img: "assets/objetos/guitarra.png", precio: 150, categoria: "sala" },
    { id: "obj-pecera",   nombre: "Pecera",   emoji: "🐠", img: "assets/objetos/pecera.png",   precio: 180, categoria: "sala" },
  ],

  comidas: [
    { id: "zanahoria", nombre: "Zanahoria", emoji: "🥕", img: "assets/comida/zanahoria.png", precio: 0,  hambre: 25, felicidad: 5 },
    { id: "manzana",   nombre: "Manzana",   emoji: "🍎", img: "assets/comida/manzana.png",   precio: 0,  hambre: 20, felicidad: 3 },
    { id: "lechuga",   nombre: "Lechuga",   emoji: "🥬", img: "assets/comida/lechuga.png",   precio: 0,  hambre: 15, felicidad: 5 },
    { id: "fresa",     nombre: "Fresa",     emoji: "🍓", img: "assets/comida/fresa.png",     precio: 20, hambre: 10, felicidad: 12 },
    { id: "banana",    nombre: "Banana",    emoji: "🍌", img: "assets/comida/banana.png",    precio: 15, hambre: 22, felicidad: 4 },
    { id: "brocoli",   nombre: "Brócoli",   emoji: "🥦", img: "assets/comida/brocoli.png",   precio: 25, hambre: 18, energia: 8 },
    { id: "pan",       nombre: "Pan",       emoji: "🍞", img: "assets/comida/pan.png",       precio: 10, hambre: 15 },
    { id: "galleta",   nombre: "Galleta",   emoji: "🍪", img: "assets/comida/galleta.png",   precio: 30, hambre: 8,  felicidad: 15 },
    { id: "pastel",    nombre: "Pastel",    emoji: "🎂", img: "assets/comida/pastel.png",    precio: 80, hambre: 30, felicidad: 25 },
    { id: "pizza",     nombre: "Pizza",     emoji: "🍕", img: "assets/comida/pizza.png",     precio: 60, hambre: 35, felicidad: 15 },
  ]
};

export const RECOMPENSAS = {
  alimentar: 2, jugar: 5, banar: 3, dormir: 2, carino: 1, curar: 4, minijuego: 15
};

export const MONEDAS_INICIALES = 50;

export const DESBLOQUEADOS_INICIALES = [
  "fondo-sala", "fondo-sala-normal",
  "fondo-cocina", "fondo-jardin", "fondo-bano",
  "fondo-dormitorio", "fondo-carino", "fondo-enfermeria",
  "zanahoria", "manzana", "lechuga"
];

/* ============================================================
   SUBCATEGORÍAS (para filtros en la tienda)
============================================================ */
export const SUBCATEGORIAS = {
  fondos: [
    { id: "todas",        nombre: "Todas",        emoji: "🎨" },
    { id: "sala",         nombre: "Sala",         emoji: "🏠" },
    { id: "cocina",       nombre: "Cocina",       emoji: "🍳" },
    { id: "jardin",       nombre: "Jardín",       emoji: "🌳" },
    { id: "bano",         nombre: "Baño",         emoji: "🛁" },
    { id: "dormitorio",   nombre: "Dormitorio",   emoji: "🛏️" },
    { id: "carino",       nombre: "Rincón amor",  emoji: "💕" },
    { id: "enfermeria",   nombre: "Enfermería",   emoji: "🏥" },
  ],
  objetos: [
    { id: "todas", nombre: "Todos", emoji: "🎨" },
    { id: "sala",  nombre: "Sala",  emoji: "🏠" },
  ],
  comidas: [
    { id: "todas", nombre: "Todas", emoji: "🍽️" },
  ]
};