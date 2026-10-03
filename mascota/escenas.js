/* ============================================================
   CONFIGURACIÓN DE ESCENAS
   - fondoDefault: id del fondo que se usa si no hay uno equipado
   - zonasObjetos: dónde se colocan los objetos equipados (5 slots)
============================================================ */
export const ESCENAS = {
  home: {
    fondoDefault: "fondo-sala",
    categoria: "sala",
    zonasObjetos: [
      { x: "8%",  y: "10%", w: "20%" },
      { x: "62%", y: "10%", w: "18%" },
      { x: "76%", y: "58%", w: "16%" },
      { x: "6%",  y: "56%", w: "16%" },
      { x: "42%", y: "78%", w: "18%" },
    ]
  },
  alimentar: {
    fondoDefault: "fondo-cocina",
    categoria: "cocina",
    zonasObjetos: []
  },
  jugar:     { fondoDefault: "fondo-jardin",     categoria: "jardin",     zonasObjetos: [] },
  banar:     { fondoDefault: "fondo-bano",       categoria: "bano",       zonasObjetos: [] },
  dormir:    { fondoDefault: "fondo-dormitorio", categoria: "dormitorio", zonasObjetos: [] },
  carino:    { fondoDefault: "fondo-carino",     categoria: "carino",     zonasObjetos: [] },
  curar:     { fondoDefault: "fondo-enfermeria", categoria: "enfermeria", zonasObjetos: [] }
};