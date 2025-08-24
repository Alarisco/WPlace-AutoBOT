import { log } from "../core/logger.js";
import { COLOR_MAP } from "./palette.js";

/**
 * Utilidades avanzadas para manejo de colores
 * Basado en el algoritmo LAB de Auto-Image_exples.js para mejor precisión
 */
export class ColorUtils {
  
  /**
   * Normaliza un objeto color para asegurar estructura consistente
   * @param {Object} colorObj - Objeto color en cualquier formato
   * @returns {Object} Color normalizado con estructura {id, r, g, b, name}
   */
  static normalizeColor(colorObj) {
    if (!colorObj) return null;
    
    // Si el color ya tiene la estructura correcta
    if (colorObj.id !== undefined && colorObj.r !== undefined && 
        colorObj.g !== undefined && colorObj.b !== undefined) {
      return {
        id: colorObj.id,
        r: colorObj.r,
        g: colorObj.g,
        b: colorObj.b,
        name: colorObj.name || ColorUtils.getColorNameById(colorObj.id)
      };
    }
    
    // Si tiene estructura anidada {rgb: {r, g, b}, id: x}
    if (colorObj.rgb && colorObj.id !== undefined) {
      return {
        id: colorObj.id,
        r: colorObj.rgb.r,
        g: colorObj.rgb.g,
        b: colorObj.rgb.b,
        name: colorObj.name || ColorUtils.getColorNameById(colorObj.id)
      };
    }
    
    // Si solo tiene RGB sin ID, intentar encontrar el ID por RGB
    if (colorObj.r !== undefined && colorObj.g !== undefined && colorObj.b !== undefined) {
      const foundColor = ColorUtils.findColorByRGB(colorObj.r, colorObj.g, colorObj.b);
      if (foundColor) {
        return {
          id: foundColor.id,
          r: colorObj.r,
          g: colorObj.g,
          b: colorObj.b,
          name: foundColor.name
        };
      }
      // Si no se encuentra, crear estructura sin ID
      return {
        id: null,
        r: colorObj.r,
        g: colorObj.g,
        b: colorObj.b,
        name: `RGB(${colorObj.r},${colorObj.g},${colorObj.b})`
      };
    }
    
    log('⚠️ Color con estructura desconocida:', colorObj);
    return null;
  }
  
  /**
   * Encuentra un color de la paleta oficial por sus valores RGB
   * @param {number} r - Componente rojo
   * @param {number} g - Componente verde
   * @param {number} b - Componente azul
   * @returns {Object|null} Color de la paleta o null
   */
  static findColorByRGB(r, g, b) {
    for (const color of Object.values(COLOR_MAP)) {
      if (color.rgb && color.rgb.r === r && color.rgb.g === g && color.rgb.b === b) {
        return {
          id: color.id,
          r: color.rgb.r,
          g: color.rgb.g,
          b: color.rgb.b,
          name: color.name
        };
      }
    }
    return null;
  }
  
  /**
   * Obtiene el nombre de un color por su ID
   * @param {number} id - ID del color
   * @returns {string} Nombre del color
   */
  static getColorNameById(id) {
    for (const color of Object.values(COLOR_MAP)) {
      if (color.id === id) {
        return color.name;
      }
    }
    return `Color ${id}`;
  }
  
  /**
   * Convierte un color normalizado a la paleta oficial de WPlace
   * SOLO usando colores disponibles para el usuario
   * @param {number} r - Componente rojo
   * @param {number} g - Componente verde
   * @param {number} b - Componente azul
   * @param {Array} availableColors - Colores disponibles (filtrados por usuario)
   * @returns {Object|null} Color más cercano de la paleta DISPONIBLE
   */
  static mapToPaletteColor(r, g, b, availableColors = []) {
    // CRÍTICO: Solo trabajar con colores disponibles si están definidos
    if (availableColors.length === 0) {
      log('⚠️ No hay colores disponibles definidos para mapear');
      return null;
    }
    
    // Primero, intentar encontrar coincidencia exacta en colores disponibles
    const exactMatch = availableColors.find(color => {
      const normalized = ColorUtils.normalizeColor(color);
      return normalized && normalized.r === r && normalized.g === g && normalized.b === b;
    });
    
    if (exactMatch) {
      const normalized = ColorUtils.normalizeColor(exactMatch);
      log(`🎯 Coincidencia exacta encontrada: ${normalized.name} (ID: ${normalized.id})`);
      return normalized;
    }
    
    // Si no hay coincidencia exacta, encontrar el más cercano SOLO entre disponibles
    const normalizedAvailable = availableColors
      .map(c => ColorUtils.normalizeColor(c))
      .filter(c => c && c.id !== null);
    
    if (normalizedAvailable.length === 0) {
      log('⚠️ No hay colores disponibles válidos para mapear');
      return null;
    }
    
    const closestColor = ColorUtils.findClosestPaletteColor(r, g, b, normalizedAvailable);
    if (closestColor) {
      log(`🎨 Color más cercano (disponible): RGB(${r},${g},${b}) → ${closestColor.name} (ID: ${closestColor.id})`);
    } else {
      log(`❌ No se pudo mapear RGB(${r},${g},${b}) a ningún color disponible`);
    }
    
    return closestColor;
  }
  
  /**
   * Valida que un color esté disponible en la lista de colores del usuario
   * @param {Object} color - Color a validar
   * @param {Array} availableColors - Lista de colores disponibles para el usuario
   * @returns {boolean} True si el color está disponible
   */
  static isColorAvailable(color, availableColors) {
    if (!color || !availableColors || availableColors.length === 0) {
      return false;
    }
    
    const normalizedColor = ColorUtils.normalizeColor(color);
    if (!normalizedColor || normalizedColor.id === null) {
      return false;
    }
    
    return availableColors.some(availableColor => {
      const normalizedAvailable = ColorUtils.normalizeColor(availableColor);
      return normalizedAvailable && normalizedAvailable.id === normalizedColor.id;
    });
  }
  
  /**
   * Filtra una lista de colores para incluir solo los disponibles
   * @param {Array} colors - Lista de colores a filtrar
   * @param {Array} availableColors - Lista de colores disponibles para el usuario
   * @returns {Array} Lista filtrada de colores disponibles
   * @returns {Array} Lista filtrada de colores disponibles
   */
  static filterAvailableColors(colors, availableColors) {
    if (!colors || !availableColors) {
      return [];
    }
    
    return colors.filter(color => ColorUtils.isColorAvailable(color, availableColors));
  }
  
  /**
   * Obtiene información detallada de un color para debugging
   * @param {Object} color - Color a analizar
   * @returns {Object} Información detallada del color
   */
  static getColorDebugInfo(color) {
    const normalized = ColorUtils.normalizeColor(color);
    const paletteInfo = normalized ? ColorUtils.findColorByRGB(normalized.r, normalized.g, normalized.b) : null;
    
    return {
      original: color,
      normalized: normalized,
      paletteMatch: paletteInfo,
      isValid: normalized !== null,
      hasValidId: normalized && normalized.id !== null,
      inOfficialPalette: paletteInfo !== null
    };
  }
  
  /**
   * Crea un conjunto de colores permitidos en formato Blue Marble (r,g,b como string)
   * @param {Array} availableColors - Lista de colores disponibles
   * @returns {Set} Conjunto de colores permitidos como strings "r,g,b"
   */
  static createAllowedColorsSet(availableColors) {
    const allowedSet = new Set();
    
    if (!availableColors || availableColors.length === 0) {
      return allowedSet;
    }
    
    for (const color of availableColors) {
      const normalized = ColorUtils.normalizeColor(color);
      if (normalized && normalized.r !== undefined && normalized.g !== undefined && normalized.b !== undefined) {
        const colorKey = `${normalized.r},${normalized.g},${normalized.b}`;
        allowedSet.add(colorKey);
      }
    }
    
    log(`🎨 Conjunto de colores permitidos creado: ${allowedSet.size} colores`);
    return allowedSet;
  }
  
  /**
   * Verifica si un píxel del canvas coincide con un color objetivo usando lógica Blue Marble
   * @param {number} canvasR - Rojo del canvas
   * @param {number} canvasG - Verde del canvas  
   * @param {number} canvasB - Azul del canvas
   * @param {Object} targetColor - Color objetivo normalizado
   * @param {Set} allowedColorsSet - Conjunto de colores permitidos
   * @param {Array} availableColors - Lista de colores disponibles para fallback
   * @returns {Object} Resultado de la verificación
   */
  static verifyPixelMatch(canvasR, canvasG, canvasB, targetColor, allowedColorsSet, availableColors) {
    // Verificar color objetivo válido
    if (!targetColor || targetColor.r === undefined) {
      return { 
        isCorrect: false, 
        reason: 'Color objetivo inválido',
        canvasColor: null,
        targetColor: targetColor 
      };
    }
    
    // 1. Verificación exacta del color del canvas (como Blue Marble)
    const canvasColorKey = `${canvasR},${canvasG},${canvasB}`;
    let canvasColorInPalette = null;
    let isCanvasColorValid = allowedColorsSet.has(canvasColorKey);
    
    if (isCanvasColorValid) {
      // Color del canvas está en la paleta oficial
      canvasColorInPalette = ColorUtils.findColorByRGB(canvasR, canvasG, canvasB);
    } else if (availableColors && availableColors.length > 0) {
      // Fallback: mapear color del canvas a paleta usando LAB (como Blue Marble)
      canvasColorInPalette = ColorUtils.mapToPaletteColor(canvasR, canvasG, canvasB, availableColors);
      isCanvasColorValid = canvasColorInPalette !== null;
    }
    
    // 2. Comparación final
    let isCorrect = false;
    let reason = '';
    
    if (canvasColorInPalette && targetColor.id !== null) {
      // Comparar por ID (más preciso)
      isCorrect = canvasColorInPalette.id === targetColor.id;
      reason = isCorrect ? 
        `ID match: ${canvasColorInPalette.id} (${canvasColorInPalette.name})` :
        `ID mismatch: canvas=${canvasColorInPalette.id} vs target=${targetColor.id}`;
    } else {
      // Fallback a comparación RGB exacta
      isCorrect = canvasR === targetColor.r && canvasG === targetColor.g && canvasB === targetColor.b;
      reason = isCorrect ? 
        `RGB exact match` :
        `RGB mismatch: canvas(${canvasR},${canvasG},${canvasB}) vs target(${targetColor.r},${targetColor.g},${targetColor.b})`;
    }
    
    return {
      isCorrect,
      reason,
      canvasColor: canvasColorInPalette,
      targetColor: targetColor,
      usedIdComparison: canvasColorInPalette && targetColor.id !== null
    };
  }

  /**
   * Convierte RGB a espacio de color LAB
   * @param {number} r - Componente rojo (0-255)
   * @param {number} g - Componente verde (0-255)
   * @param {number} b - Componente azul (0-255)
   * @returns {Array} [L, a, b] valores en espacio LAB
   */
  static _rgbToLab(r, g, b) {
    // sRGB -> linear
    const srgbToLinear = (v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    
    const rl = srgbToLinear(r);
    const gl = srgbToLinear(g);
    const bl = srgbToLinear(b);
    
    // RGB -> XYZ
    let X = rl * 0.4124 + gl * 0.3576 + bl * 0.1805;
    let Y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
    let Z = rl * 0.0193 + gl * 0.1192 + bl * 0.9505;
    
    // Normalizar con iluminante D65
    X /= 0.95047;
    Y /= 1.00000;
    Z /= 1.08883;
    
    // XYZ -> LAB
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116);
    const fX = f(X), fY = f(Y), fZ = f(Z);
    
    const L = 116 * fY - 16;
    const a = 500 * (fX - fY);
    const b2 = 200 * (fY - fZ);
    
    return [L, a, b2];
  }
  
  /**
   * Obtiene valores LAB con caché para mejor rendimiento
   * @param {number} r - Componente rojo (0-255)
   * @param {number} g - Componente verde (0-255)
   * @param {number} b - Componente azul (0-255)
   * @returns {Array} [L, a, b] valores en espacio LAB
   */
  static _lab(r, g, b) {
    // Inicializar caché si no existe
    if (!ColorUtils._labCache) {
      ColorUtils._labCache = new Map();
    }
    
    const key = (r << 16) | (g << 8) | b;
    let v = ColorUtils._labCache.get(key);
    if (!v) {
      v = ColorUtils._rgbToLab(r, g, b);
      ColorUtils._labCache.set(key, v);
    }
    return v;
  }
  
  /**
   * Encuentra el color más cercano en la paleta usando algoritmo LAB avanzado
   * @param {number} r - Componente rojo del color objetivo (0-255)
   * @param {number} g - Componente verde del color objetivo (0-255)
   * @param {number} b - Componente azul del color objetivo (0-255)
   * @param {Array} palette - Array de colores disponibles
   * @param {Object} options - Opciones adicionales
   * @returns {Object|null} Color más cercano de la paleta
   */
  static findClosestPaletteColor(r, g, b, palette, options = {}) {
    if (!palette || palette.length === 0) return null;
    
    const {
      useLegacyRgb = false,
      chromaPenalty = 0,
      whiteThreshold = 240
    } = options;
    
    // Manejo especial para colores muy blancos
    if (r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold) {
      // Buscar color blanco en la paleta (ID 5 típicamente)
      const whiteColor = palette.find(color => {
        const cr = color.r || color.rgb?.r || 0;
        const cg = color.g || color.rgb?.g || 0;
        const cb = color.b || color.rgb?.b || 0;
        return cr >= whiteThreshold && cg >= whiteThreshold && cb >= whiteThreshold;
      });
      if (whiteColor) return whiteColor;
    }
    
    let closestColor = null;
    let minDistance = Infinity;
    
    if (useLegacyRgb) {
      // Algoritmo RGB tradicional
      for (const color of palette) {
        const cr = color.r || color.rgb?.r || 0;
        const cg = color.g || color.rgb?.g || 0;
        const cb = color.b || color.rgb?.b || 0;
        
        const distance = Math.sqrt(
          Math.pow(r - cr, 2) +
          Math.pow(g - cg, 2) +
          Math.pow(b - cb, 2)
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          closestColor = color;
        }
      }
    } else {
      // Algoritmo LAB avanzado
      const targetLab = ColorUtils._lab(r, g, b);
      
      for (const color of palette) {
        const cr = color.r || color.rgb?.r || 0;
        const cg = color.g || color.rgb?.g || 0;
        const cb = color.b || color.rgb?.b || 0;
        
        const colorLab = ColorUtils._lab(cr, cg, cb);
        
        // Distancia euclidiana en espacio LAB
        let distance = Math.sqrt(
          Math.pow(targetLab[0] - colorLab[0], 2) +
          Math.pow(targetLab[1] - colorLab[1], 2) +
          Math.pow(targetLab[2] - colorLab[2], 2)
        );
        
        // Aplicar penalización por croma si se especifica
        if (chromaPenalty > 0) {
          const targetChroma = Math.sqrt(targetLab[1] * targetLab[1] + targetLab[2] * targetLab[2]);
          const colorChroma = Math.sqrt(colorLab[1] * colorLab[1] + colorLab[2] * colorLab[2]);
          const chromaDiff = Math.abs(targetChroma - colorChroma);
          distance += chromaDiff * chromaPenalty;
        }
        
        if (distance < minDistance) {
          minDistance = distance;
          closestColor = color;
        }
      }
    }
    
    return closestColor;
  }
  
  /**
   * Función de compatibilidad con la interfaz existente
   * @param {Object} rgb - Objeto con propiedades r, g, b
   * @param {Array} palette - Array de colores disponibles
   * @param {Object} options - Opciones adicionales
   * @returns {Object|null} Color más cercano de la paleta
   */
  static findClosestColor(rgb, palette, options = {}) {
    return ColorUtils.findClosestPaletteColor(rgb.r, rgb.g, rgb.b, palette, options);
  }
  
  /**
   * Limpia la caché LAB (útil para liberar memoria)
   */
  static clearCache() {
    if (ColorUtils._labCache) {
      ColorUtils._labCache.clear();
      log('Caché de colores LAB limpiada');
    }
  }
  
  /**
   * Obtiene estadísticas de la caché
   * @returns {Object} Estadísticas de uso de caché
   */
  static getCacheStats() {
    if (!ColorUtils._labCache) {
      return { size: 0, memoryEstimate: 0 };
    }
    return {
      size: ColorUtils._labCache.size,
      memoryEstimate: ColorUtils._labCache.size * 32 // Estimación aproximada en bytes
    };
  }
}

// Exportar funciones individuales para compatibilidad
export const findClosestColor = ColorUtils.findClosestColor.bind(ColorUtils);
export const findClosestPaletteColor = ColorUtils.findClosestPaletteColor.bind(ColorUtils);