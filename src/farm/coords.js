import { log } from "../core/logger.js";

const randInt = (n) => Math.floor(Math.random() * n);

export function randomCoordInTile(tileX, tileY, margin = 0.05) {
  const size = 3000;
  const m = Math.floor(size * margin);
  const rx = Math.floor(Math.random() * (size - 2*m)) + m;
  const ry = Math.floor(Math.random() * (size - 2*m)) + m;
  return { x: rx, y: ry, absX: tileX * size + rx, absY: tileY * size + ry };
}

// Farm-specific coordinate generation usando posición base y radio
export function randomCoords(cfg) {
  // Verificar si se ha seleccionado una posición base
  if (!cfg.POSITION_SELECTED || cfg.BASE_X === null || cfg.BASE_Y === null) {
    log('⚠️ No se ha seleccionado una posición base. Usando coordenadas aleatorias fallback.');
    // Fallback a coordenadas aleatorias en el tile (comportamiento anterior)
    const margin = Math.floor(cfg.TILE_SIZE * 0.05);
    const safeSize = cfg.TILE_SIZE - (margin * 2);
    
    if (safeSize <= 0) {
      return [Math.floor(Math.random() * cfg.TILE_SIZE), Math.floor(Math.random() * cfg.TILE_SIZE)];
    }
    
    const localX = margin + Math.floor(Math.random() * safeSize);
    const localY = margin + Math.floor(Math.random() * safeSize);
    return [localX, localY];
  }
  
  // Generar coordenadas dentro del radio especificado desde la posición base
  const radius = cfg.FARM_RADIUS;
  
  // Generar un ángulo aleatorio y una distancia aleatoria dentro del radio
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * radius;
  
  // Calcular offset desde la posición base
  const offsetX = Math.round(distance * Math.cos(angle));
  const offsetY = Math.round(distance * Math.sin(angle));
  
  // Calcular coordenadas finales
  let localX = cfg.BASE_X + offsetX;
  let localY = cfg.BASE_Y + offsetY;
  
  // Asegurar que las coordenadas estén dentro del tile (0 a TILE_SIZE-1)
  localX = Math.max(0, Math.min(cfg.TILE_SIZE - 1, localX));
  localY = Math.max(0, Math.min(cfg.TILE_SIZE - 1, localY));
  
  // Log ocasional para debugging
  if (Math.random() < 0.1) {
    log(`🎯 Coordenadas en radio: base(${cfg.BASE_X},${cfg.BASE_Y}) radio(${radius}) offset(${offsetX},${offsetY}) final(${localX},${localY})`);
  }
  
  return [localX, localY];
}

// Función para verificar si una posición está dentro del radio de farming
export function isWithinFarmRadius(x, y, cfg) {
  if (!cfg.POSITION_SELECTED || cfg.BASE_X === null || cfg.BASE_Y === null) {
    return false;
  }
  
  const deltaX = x - cfg.BASE_X;
  const deltaY = y - cfg.BASE_Y;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  
  return distance <= cfg.FARM_RADIUS;
}

export function generateMultipleCoords(count, cfg) {
  const coords = [];
  for (let i = 0; i < count; i++) {
    const singleCoord = randomCoords(cfg);
    coords.push(...singleCoord); // Flatten the array
  }
  return coords;
}

export function generateMultipleColors(count, cfg) {
  const colors = [];
  for (let i = 0; i < count; i++) {
    colors.push(nextColor(cfg));
  }
  return colors;
}

export function nextColor(cfg) {
  if (cfg.COLOR_MODE === 'fixed') {
    return cfg.COLOR_FIXED;
  } else {
    // Modo random: color entre COLOR_MIN y COLOR_MAX (inclusivo)
    const span = cfg.COLOR_MAX - cfg.COLOR_MIN + 1;
    return cfg.COLOR_MIN + randInt(span);
  }
}

export function nextColorLegacy(palette) {
  return palette[Math.floor(Math.random() * palette.length)];
}
