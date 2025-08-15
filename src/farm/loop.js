import { getTurnstileToken } from "../core/turnstile.js";
import { postPixel } from "../core/wplace-api.js";
import { generateMultipleCoords, generateMultipleColors } from "./coords.js";
import { sleep, sleepWithCountdown } from "../core/timing.js";
import { log } from "../core/logger.js";

// Update canvas pixel function
export async function updateCanvasPixel(localX, localY, color) {
  try {
    // Buscar el canvas activo
    const canvases = document.querySelectorAll('canvas');
    for (const canvas of canvases) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Convertir color (número) a hex
        const colorHex = typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color;
        
        ctx.fillStyle = colorHex;
        ctx.fillRect(localX, localY, 1, 1);
        
        // Trigger redraw event si existe
        if (typeof window !== 'undefined' && window.Event) {
          canvas.dispatchEvent(new window.Event('pixel-updated'));
        }
      }
    }
  } catch (error) {
    log('Error actualizando canvas:', error);
  }
}

// Función para refrescar el tile específico (solo actualización visual, sin GET)
export async function refreshTile(tileX, tileY) {
  try {
    // Solo actualizar visualmente el DOM sin hacer GET
    // El GET a /s0/tile no funciona y no es necesario para el funcionamiento
    const tileSelector = `[data-tile="${tileX}-${tileY}"], .tile-${tileX}-${tileY}, [data-tile-x="${tileX}"][data-tile-y="${tileY}"]`;
    const tileElement = document.querySelector(tileSelector);
    
    if (tileElement) {
      // Añadir una clase temporal para indicar actualización
      tileElement.classList.add('tile-updating');
      setTimeout(() => {
        tileElement.classList.remove('tile-updating');
        tileElement.classList.add('tile-updated');
        setTimeout(() => tileElement.classList.remove('tile-updated'), 1000);
      }, 100);
      log(`Tile (${tileX},${tileY}) actualizado visualmente`);
    } else {
      // Intentar forzar una actualización del canvas general
      const canvasElements = document.querySelectorAll('canvas');
      canvasElements.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Trigger redraw sin hacer cambios
          const imageData = ctx.getImageData(0, 0, 1, 1);
          ctx.putImageData(imageData, 0, 0);
        }
      });
      log(`Actualización visual genérica realizada para tile (${tileX},${tileY})`);
    }
  } catch (error) {
    log('Error en actualización visual del tile:', error);
  }
}

export async function paintOnce(cfg, state, setStatus, flashEffect, getSession) {
  // Verificar que las coordenadas del tile sean válidas antes de pintar
  if (!Number.isFinite(cfg.TILE_X) || !Number.isFinite(cfg.TILE_Y)) {
    setStatus(`🚫 Coordenadas del tile inválidas (${cfg.TILE_X},${cfg.TILE_Y}). Calibra primero`, 'error');
    log(`Pintado cancelado: coordenadas del tile inválidas`);
    return false;
  }
  
  // Usar cargas actuales (ya consultadas en el loop)
  const availableCharges = Math.floor(state.charges.count); // Cargas completas disponibles
  
  // Si no hay cargas completas disponibles, no pintar
  if (availableCharges < 1) {
    setStatus(`🔋 Sin cargas disponibles. Esperando...`, 'error');
    return false;
  }
  
  // Calcular el número óptimo de píxeles a pintar
  // Usar el mínimo entre: cargas disponibles, configuración del usuario, y límite máximo (50)
  const optimalPixelCount = Math.min(availableCharges, cfg.PIXELS_PER_BATCH, 50);
  const pixelCount = Math.max(1, optimalPixelCount);
  
  // Informar si se ajustó el número de píxeles
  if (pixelCount < cfg.PIXELS_PER_BATCH) {
    log(`Ajustando píxeles por cargas completas disponibles: ${pixelCount}/${cfg.PIXELS_PER_BATCH} (${availableCharges} cargas completas de ${state.charges.count.toFixed(2)} totales)`);
  }
  
  const coords = generateMultipleCoords(pixelCount, cfg);
  const colors = generateMultipleColors(pixelCount, cfg);
  
  // Las coordenadas generadas ya son locales al tile, no necesitamos cálculos adicionales
  const firstLocalX = coords[0];
  const firstLocalY = coords[1];
  
  setStatus(`🎨 Pintando ${pixelCount} píxeles (${availableCharges} cargas completas) en tile(${cfg.TILE_X},${cfg.TILE_Y}) local(${firstLocalX},${firstLocalY})...`, 'status');
  
  const t = await getTurnstileToken(cfg.SITEKEY);
  const r = await postPixel(coords, colors, t);

  state.last = { 
    x: firstLocalX, 
    y: firstLocalY, 
    color: colors[0], 
    pixelCount,
    availableCharges,
    status: r.status, 
    json: r.json 
  };
  
  if (r.status === 200 && r.json && (r.json.painted > 0 || r.json.painted === pixelCount)) {
    const actualPainted = r.json.painted || pixelCount;
    state.painted += actualPainted;
    state.retryCount = 0; // Resetear contador de reintentos al éxito
    
    // Actualizar visualmente el canvas para múltiples píxeles
    for (let i = 0; i < coords.length; i += 2) {
      const localX = coords[i];
      const localY = coords[i + 1];
      const color = colors[Math.floor(i / 2)];
      // Las coordenadas ya son locales al tile
      await updateCanvasPixel(localX, localY, color);
    }
    
    // Refrescar el tile específico
    await refreshTile(cfg.TILE_X, cfg.TILE_Y);
    
    // Actualizar la sesión para obtener las cargas actualizadas (única consulta tras pintar)
    await getSession();
    
    setStatus(`✅ Lote pintado: ${actualPainted}/${pixelCount} píxeles (${availableCharges} cargas usadas)`, 'success');
    flashEffect();
    
    // Emitir evento personalizado para notificar que se pintó un lote
    if (typeof window !== 'undefined' && window.CustomEvent) {
      const event = new window.CustomEvent('wplace-batch-painted', {
        detail: { 
          firstX: firstLocalX, 
          firstY: firstLocalY, 
          pixelCount: actualPainted,
          totalPixels: pixelCount,
          colors: colors,
          coords: coords,
          tileX: cfg.TILE_X,
          tileY: cfg.TILE_Y,
          timestamp: Date.now()
        }
      });
      window.dispatchEvent(event);
    }
    
    return true;
  }
  
  // Manejo de errores mejorado
  if (r.status === 403) {
    setStatus('⚠️ 403 (token expirado o Cloudflare). Reintentará...', 'error');
  } else if (r.status === 401) {
    setStatus('🔒 401 (no autorizado). Verifica tu sesión.', 'error');
  } else if (r.status === 429) {
    setStatus('⏳ 429 (límite de tasa). Esperando...', 'error');
  } else if (r.status === 408) {
    setStatus('⏰ Timeout del servidor. Coordenadas problemáticas o servidor sobrecargado', 'error');
  } else if (r.status === 0) {
    setStatus('🌐 Error de red. Verificando conectividad...', 'error');
  } else if (r.status === 500) {
    setStatus('🔥 500 (error interno del servidor). Reintentará...', 'error');
  } else if (r.status === 502 || r.status === 503 || r.status === 504) {
    setStatus(`🚫 ${r.status} (servidor no disponible). Reintentará...`, 'error');
  } else if (r.status === 404) {
    setStatus(`🗺️ 404 (tile no encontrado). Verificando coordenadas tile(${cfg.TILE_X},${cfg.TILE_Y})`, 'error');
  } else {
    // Para otros errores, verificar el health del backend
    try {
      const health = await checkBackendHealth();
      const healthStatus = health?.up ? '🟢 Online' : '🔴 Offline';
      setStatus(`❌ Error ${r.status}: ${r.json?.message || r.json?.error || 'Fallo al pintar'} (Backend: ${healthStatus})`, 'error');
    } catch {
      setStatus(`❌ Error ${r.status}: ${r.json?.message || r.json?.error || 'Fallo al pintar'} (Health check falló)`, 'error');
    }
  }
  
  // Log detallado para debugging
  log(`Fallo en pintado: status=${r.status}, json=`, r.json, 'coords=', coords, 'colors=', colors);
  
  return false;
}

export async function paintWithRetry(cfg, state, setStatus, flashEffect, getSession, checkBackendHealth) {
  const maxAttempts = 5; // Aumentar a 5 intentos
  const baseDelay = 3000; // Delay base de 3 segundos
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const success = await paintOnce(cfg, state, setStatus, flashEffect, getSession);
      if (success) {
        state.retryCount = 0; // Reset en éxito
        return true;
      }
      
      state.retryCount = attempt;
      
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Backoff exponencial
        setStatus(`🔄 Reintento ${attempt}/${maxAttempts} en ${delay/1000}s...`, 'error');
        await sleep(delay);
      }
      
    } catch (error) {
      log(`Error en intento ${attempt}:`, error);
      state.retryCount = attempt;
      
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        setStatus(`💥 Error en intento ${attempt}/${maxAttempts}, reintentando en ${delay/1000}s...`, 'error');
        await sleep(delay);
      }
    }
  }
  
  state.retryCount = maxAttempts;
  setStatus(`❌ Falló después de ${maxAttempts} intentos. Se requiere intervención manual.`, 'error');
  return false;
}

export async function loop(cfg, state, setStatus, flashEffect, getSession, checkBackendHealth, updateStats) {
  log('🚀 Loop iniciado');
  state.running = true;
  
  while (state.running) {
    try {
      // Actualizar estadísticas antes de cada ciclo
      await updateStats();
      
      // Verificar si hay cargas suficientes para pintar
      if (state.charges.count < cfg.MIN_CHARGES) {
        const waitTime = Math.max(0, (cfg.MIN_CHARGES - state.charges.count) * cfg.CHARGE_REGEN_MS);
        setStatus(`⏳ Esperando cargas: ${state.charges.count.toFixed(1)}/${cfg.MIN_CHARGES} (${Math.round(waitTime/1000)}s)`, 'status');
        
        await sleepWithCountdown(Math.min(waitTime, cfg.DELAY_MS), (remaining) => {
          setStatus(`⏳ Esperando cargas: ${state.charges.count.toFixed(1)}/${cfg.MIN_CHARGES} (~${Math.round(remaining/1000)}s)`, 'status');
        }, state);
        
        continue;
      }
      
      // Intentar pintar
      const success = await paintWithRetry(cfg, state, setStatus, flashEffect, getSession, checkBackendHealth);
      
      if (!success) {
        // Si falló después de todos los reintentos, esperar más tiempo
        setStatus('😴 Esperando antes del siguiente intento...', 'error');
        await sleepWithCountdown(cfg.DELAY_MS * 2, (remaining) => {
          setStatus(`😴 Cooldown extendido: ${Math.round(remaining/1000)}s`, 'error');
        });
        continue;
      }
      
      // Delay normal entre pintadas exitosas
      if (state.running) {
        await sleepWithCountdown(cfg.DELAY_MS, (remaining) => {
          setStatus(`💤 Esperando ${Math.round(remaining/1000)}s hasta siguiente pintada...`, 'status');
        });
      }
      
    } catch (error) {
      log('Error crítico en loop:', error);
      setStatus(`💥 Error crítico: ${error.message}`, 'error');
      
      // Esperar más tiempo antes de continuar tras error crítico
      if (state.running) {
        await sleepWithCountdown(cfg.DELAY_MS * 3, (remaining) => {
          setStatus(`🚨 Recuperándose de error crítico: ${Math.round(remaining/1000)}s`, 'error');
        });
      }
    }
  }
  
  log('⏹️ Loop detenido');
  setStatus('⏹️ Bot detenido', 'status');
}
