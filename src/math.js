import {
  AREA_FRACTIONS,
  GOAL_LINE_Y,
  GOAL_MOUTH,
  PIXELS_PER_METER,
  REAL_GOAL,
} from './config.js';

/**
 * Convierte coordenadas normalizadas de portería [0..1] a píxeles en el canvas 1600x900.
 * x: 0 (poste izq) -> 1 (poste der)
 * y: 0 (línea de gol) -> 1 (larguero)
 */
export function normalizedToPixel(x, y) {
  const px = GOAL_MOUTH.x + x * GOAL_MOUTH.width;
  const py = GOAL_LINE_Y - y * GOAL_MOUTH.height;
  return { px, py };
}

/**
 * Convierte píxeles del canvas a coordenadas normalizadas de portería.
 */
export function pixelToNormalized(px, py) {
  const x = (px - GOAL_MOUTH.x) / GOAL_MOUTH.width;
  const y = (GOAL_LINE_Y - py) / GOAL_MOUTH.height;
  return { x, y };
}

/**
 * Clampea coordenadas al interior exacto de la portería [0..1].
 */
export function clampToGoal(x, y) {
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  };
}

/**
 * Calcula la fracción del área de la portería que cubre el portero según la potencia [0..1].
 */
export function getKeeperAreaFraction(power) {
  const clampedPower = Math.max(0, Math.min(1, power));
  if (clampedPower <= 0.5) {
    const t = clampedPower / 0.5;
    return AREA_FRACTIONS.power0 + t * (AREA_FRACTIONS.power50 - AREA_FRACTIONS.power0);
  } else {
    const t = (clampedPower - 0.5) / 0.5;
    return AREA_FRACTIONS.power50 + t * (AREA_FRACTIONS.power100 - AREA_FRACTIONS.power50);
  }
}

/**
 * Radio del círculo del portero en metros: r = sqrt(fracción × 7,32 × 2,44 / π)
 */
export function getKeeperRadiusMeters(power) {
  const fraction = getKeeperAreaFraction(power);
  const areaM2 = fraction * REAL_GOAL.area_m2;
  return Math.sqrt(areaM2 / Math.PI);
}

/**
 * Convierte radio en metros a píxeles en la línea de gol (82 px/m).
 */
export function metersToPixels(meters) {
  return meters * PIXELS_PER_METER;
}

/**
 * Distancia euclídea en metros entre dos puntos normalizados sobre la portería.
 */
export function distanceInMeters(p1, p2) {
  const dx_m = (p1.x - p2.x) * REAL_GOAL.width_m;
  const dy_m = (p1.y - p2.y) * REAL_GOAL.height_m;
  return Math.sqrt(dx_m * dx_m + dy_m * dy_m);
}

/**
 * Resuelve el resultado de un penalti: GOL, PARADA o FUERA.
 */
export function resolveShot(shot, keeper) {
  const radius_m = getKeeperRadiusMeters(shot.power);
  const radius_px = metersToPixels(radius_m);

  if (shot.x < 0 || shot.x > 1 || shot.y < 0 || shot.y > 1) {
    return {
      result: 'FUERA',
      radius_m,
      radius_px,
      distance_m: distanceInMeters(shot, keeper),
    };
  }

  const dist_m = distanceInMeters(shot, keeper);
  if (dist_m <= radius_m) {
    return {
      result: 'PARADA',
      radius_m,
      radius_px,
      distance_m: dist_m,
    };
  } else {
    return {
      result: 'GOL',
      radius_m,
      radius_px,
      distance_m: dist_m,
    };
  }
}
