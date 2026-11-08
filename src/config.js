/**
 * Configuración física, geométrica y constantes del juego (Vanilla JS / ES modules)
 */

export const CANVAS_WIDTH = 1600;
export const CANVAS_HEIGHT = 900;

// Boca de portería (interior de postes hasta el larguero):
// rect con id="goal-mouth" en fondo.svg: x=499.9, y=379.5, ancho=600.2, alto=200.1
export const GOAL_MOUTH = {
  x: 500,
  y: 379.5,
  width: 600,
  height: 200.1,
};

// Línea de gol y escala en línea de gol (82 px/m)
export const GOAL_LINE_Y = 579.6;
export const PIXELS_PER_METER = 82.0;

// Punto de penalti
export const PENALTY_SPOT = {
  x: 800.0,
  y: 811.5,
};

// Medidas reales de portería reglamentaria (metros)
export const REAL_GOAL = {
  width_m: 7.32,
  height_m: 2.44,
  area_m2: 7.32 * 2.44, // 17.8608 m²
};

// Fracciones de área del portero según potencia
export const AREA_FRACTIONS = {
  power0: 2 / 3,   // 66.67% del área
  power50: 1 / 6,  // 16.67% del área (6 zonas)
  power100: 1 / 9, // 11.11% del área
};

// Rango normalizado para barras de dirección del delantero (permite fallar fuera)
export const DIRECTION_RANGE = {
  min: -0.15,
  max: 1.15,
};

// Temporizador por turno: 10 segundos
export const TIME_LIMIT_SEC = 10;

// Número de penaltis reglamentarios
export const DEFAULT_TOTAL_PENALTIES = 5;

// Escalas y centros de cada sprite (anclaje geométrico en el centro exacto)
export const SPRITES = {
  portero: {
    url: '/assets/aistudio/portero_cbf1b36c.svg',
    viewBoxWidth: 180,
    viewBoxHeight: 320,
    // Centro del sprite en su viewBox: (90, 160)
    centerX: 90,
    centerY: 160,
    scale: 0.516875, // 93.0 px ancho, 165.4 px alto
    width: 93.0,
    height: 165.4,
    // Centro inicial en canvas: x=800.0, y=502.1 (pies sobre la línea de gol y=579.6)
    initialCenterX: 800.0,
    initialCenterY: 502.1,
  },
  delantero: {
    url: '/assets/aistudio/delantero_cac9904a.svg',
    viewBoxWidth: 190,
    viewBoxHeight: 420,
    // Centro del sprite en su viewBox: (95, 210)
    centerX: 95,
    centerY: 210,
    scale: 1.03619, // 196.9 px ancho, 435.2 px alto
    width: 196.9,
    height: 435.2,
    // Centro inicial en canvas: x=330.0, y=696.0 (pies en y=895.0)
    initialCenterX: 330.0,
    initialCenterY: 696.0,
  },
  pelota: {
    url: '/assets/aistudio/pelota_c2791116.svg',
    viewBoxWidth: 100,
    viewBoxHeight: 100,
    // Centro del sprite en su viewBox: (50, 50)
    centerX: 50,
    centerY: 50,
    radiusInSvg: 46,
    initialDiameter: 46, // diámetro 46 px (caja 50x50 px)
    finalDiameter: 18,   // encoge a ~18 px al llegar a portería
    // Centro inicial en canvas: (800.0, 789.5), apoyada en la sombra en (800.0, 812.5)
    initialCenterX: 800.0,
    initialCenterY: 789.5,
    shadowX: 800.0,
    shadowY: 812.5,
    shadowRx: 22,
    shadowRy: 5,
  },
  fondo: {
    url: '/assets/aistudio/fondo_6a2c3e64.svg',
    width: 1600,
    height: 900,
  },
};

// Duraciones de animación (ms)
export const ANIMATION = {
  strikerSlideMs: 200,      // Delantero corre 40px hacia la pelota
  shotDuration0Ms: 900,     // Duración de tiro al 0% de potencia
  shotDuration100Ms: 350,   // Duración de tiro al 100% de potencia
  resultDisplayMs: 3000,    // 3 segundos mostrando resultado, círculo e impacto
};

// Velocidad de las barras oscilantes (segundos por ciclo completo)
export const BAR_CYCLE_SECONDS = {
  directionX: 1.6,
  directionY: 1.4,
  power: 1.3,
};

// Caracteres para generar códigos sin ambigüedad (sin 0, O, 1, I, L)
export const CODE_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
