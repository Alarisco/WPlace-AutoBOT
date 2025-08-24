import { log } from "../core/logger.js";
import { ColorUtils } from "./color-utils.js";

export class ImageProcessor {
  constructor(imageSrc) {
    this.imageSrc = imageSrc;
    this.img = new window.Image();
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.previewCanvas = document.createElement('canvas');
    this.previewCtx = this.previewCanvas.getContext('2d');
  }
  
  async load() {
    return new Promise((resolve, reject) => {
      this.img.onload = () => {
        this.canvas.width = this.img.width;
        this.canvas.height = this.img.height;
        this.ctx.drawImage(this.img, 0, 0);
        resolve();
      };
      this.img.onerror = reject;
      this.img.src = this.imageSrc;
    });
  }
  
  getPixelData() {
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
  }
  
  getDimensions() {
    return { width: this.canvas.width, height: this.canvas.height };
  }
  
  resize(newWidth, newHeight) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = newWidth;
    tempCanvas.height = newHeight;
    const tempCtx = tempCanvas.getContext('2d');
    
    tempCtx.drawImage(this.img, 0, 0, newWidth, newHeight);
    
    this.canvas.width = newWidth;
    this.canvas.height = newHeight;
    this.ctx.drawImage(tempCanvas, 0, 0);
    
    return this.getPixelData();
  }
  
  generatePreview(newWidth, newHeight) {
    this.previewCanvas.width = newWidth;
    this.previewCanvas.height = newHeight;
    this.previewCtx.imageSmoothingEnabled = false;
    this.previewCtx.drawImage(this.img, 0, 0, newWidth, newHeight);
    
    return this.previewCanvas.toDataURL();
  }
  
  getImageData() {
    const { width, height } = this.getDimensions();
    const pixels = this.getPixelData();
    
    return {
      width,
      height,
      pixels,
      originalName: this.originalName || 'image.png'
    };
  }
  
  processImage(availableColors, config) {
    const { width, height } = this.getDimensions();
    const pixels = this.getPixelData();
    const processedPixels = [];
    let validPixelCount = 0;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const alpha = pixels[idx + 3];
        
        // Filtrar píxeles transparentes
        if (alpha < config.TRANSPARENCY_THRESHOLD) {
          continue;
        }
        
        // Nota: Removido el filtro automático de píxeles blancos
        // para permitir el uso del color blanco (ID 5) en las imágenes
        
        // Encontrar el color más cercano usando algoritmo LAB avanzado
        // SOLO entre colores disponibles para el usuario
        const closestColor = ColorUtils.mapToPaletteColor(r, g, b, availableColors);
        
        if (closestColor) {
          // Verificar que el color está realmente disponible
          if (!ColorUtils.isColorAvailable(closestColor, availableColors)) {
            log(`⚠️ Color ${closestColor.name} (ID: ${closestColor.id}) no está disponible, saltando píxel`);
            continue;
          }
          
          // Normalizar el color antes de agregarlo
          const normalizedColor = ColorUtils.normalizeColor(closestColor);
          
          processedPixels.push({
            x,
            y,
            originalColor: { r, g, b, alpha },
            targetColor: normalizedColor || closestColor
          });
          validPixelCount++;
          
          // Log para debugging crítico
          if (config.debugColors) {
            log(`🎨 Píxel (${x},${y}): RGB(${r},${g},${b}) → ${normalizedColor.name} (ID: ${normalizedColor.id})`);
          }
        } else {
          if (config.debugColors) {
            log(`❌ No se pudo mapear píxel (${x},${y}) RGB(${r},${g},${b}) a ningún color disponible`);
          }
        }
      }
    }
    
    return {
      width,
      height,
      pixels: processedPixels,
      validPixelCount,
      originalName: this.originalName || 'image.png'
    };
  }
  
  findClosestColor(rgb, palette, options = {}) {
    // Usar las nuevas utilidades de color avanzadas
    return ColorUtils.findClosestColor(rgb, palette, {
      useLegacyRgb: false, // Usar algoritmo LAB por defecto
      whiteThreshold: 240,
      ...options
    });
  }
}

export function findClosestColor(rgb, palette, options = {}) {
  // Usar las nuevas utilidades de color avanzadas
  return ColorUtils.findClosestColor(rgb, palette, {
    useLegacyRgb: false, // Usar algoritmo LAB por defecto
    whiteThreshold: 240,
    ...options
  });
}

export function generatePixelQueue(imageData, startPosition, tileX, tileY) {
  const { width, height, pixels } = imageData;
  const { x: localStartX, y: localStartY } = startPosition;
  const queue = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelData = pixels.find(p => p.x === x && p.y === y);
      if (!pixelData) continue;
      
      const globalX = localStartX + x;
      const globalY = localStartY + y;
      
      queue.push({
        imageX: x,
        imageY: y,
        localX: globalX,
        localY: globalY,
        tileX: tileX,
        tileY: tileY,
        color: ColorUtils.normalizeColor(pixelData.targetColor) || pixelData.targetColor,
        originalColor: pixelData.originalColor
      });
    }
  }

  log(`Cola de píxeles generada: ${queue.length} píxeles para pintar`);
  return queue;
}

export function detectAvailableColors() {
  log('🎨 Detectando colores disponibles...');
  
  // Buscar elementos de color usando el selector del original
  const colorElements = document.querySelectorAll('[id^="color-"]');
  const colors = [];
  const unavailableColors = [];
  
  for (const element of colorElements) {
    const idStr = element.id.replace('color-', '');
    const id = parseInt(idStr);
    
    // Filtrar solo el color 0 (transparente)
    if (id === 0) {
      continue;
    }
    
    // Verificar si el color está bloqueado (tiene SVG de candado)
    const hasSvg = element.querySelector('svg');
    const isLocked = hasSvg !== null;
    
    // Obtener color RGB del style
    const backgroundStyle = element.style.backgroundColor;
    if (backgroundStyle) {
      const rgbMatch = backgroundStyle.match(/\d+/g);
      if (rgbMatch && rgbMatch.length >= 3) {
        const rgb = {
          r: parseInt(rgbMatch[0]),
          g: parseInt(rgbMatch[1]),
          b: parseInt(rgbMatch[2])
        };
        
        // Obtener información de la paleta oficial
        const paletteColor = ColorUtils.findColorByRGB(rgb.r, rgb.g, rgb.b);
        const colorName = paletteColor ? paletteColor.name : ColorUtils.getColorNameById(id);
        
        const colorInfo = {
          id,
          element,
          r: rgb.r,
          g: rgb.g,
          b: rgb.b,
          name: colorName,
          isLocked
        };
        
        if (isLocked) {
          unavailableColors.push(colorInfo);
          log(`❌ Color bloqueado: id=${id}, ${colorName}, rgb(${rgb.r},${rgb.g},${rgb.b})`);
        } else {
          colors.push(colorInfo);
          log(`✅ Color disponible: id=${id}, ${colorName}, rgb(${rgb.r},${rgb.g},${rgb.b})`);
        }
      }
    }
  }
  
  log(`🎨 Detección completa: ${colors.length} colores disponibles, ${unavailableColors.length} bloqueados`);
  log(`📋 Colores disponibles: ${colors.map(c => c.name).join(', ')}`);
  
  if (unavailableColors.length > 0) {
    log(`🔒 Colores bloqueados: ${unavailableColors.map(c => c.name).join(', ')}`);
  }
  
  return colors;
}
