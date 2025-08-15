import { log } from "../core/logger.js";
import { imageState, IMAGE_DEFAULTS, TEXTS } from "./config.js";
import { ImageProcessor, detectAvailableColors } from "./processor.js";
import { processImage, stopPainting } from "./painter.js";
import { saveProgress, loadProgress, clearProgress, getProgressInfo } from "./save-load.js";
import { createImageUI, showConfirmDialog } from "./ui.js";

export async function runImage() {
  log('🚀 Iniciando WPlace Auto-Image (versión modular)');
  
  // Verificar si ya está ejecutándose
  if (window.__wplaceBot?.imageRunning) {
    alert("Auto-Image ya está ejecutándose.");
    return;
  }
  
  window.__wplaceBot = { ...window.__wplaceBot, imageRunning: true };

  try {
    // Inicializar configuración
    const config = { ...IMAGE_DEFAULTS };
    
    // Detectar idioma
    const language = detectLanguage();
    imageState.language = language;
    
    // Verificar sitekey
    if (!config.SITEKEY) {
      const siteKeyElement = document.querySelector('*[data-sitekey]');
      if (siteKeyElement) {
        config.SITEKEY = siteKeyElement.getAttribute('data-sitekey');
        log(`📝 Sitekey encontrada automáticamente: ${config.SITEKEY.substring(0, 20)}...`);
      } else {
        log('⚠️ No se pudo encontrar la sitekey automáticamente');
      }
    }

    // Crear interfaz de usuario
    const ui = await createImageUI({
      texts: TEXTS[language],
      onInitBot: async () => {
        log('🤖 Inicializando Auto-Image...');
        
        // Verificar colores disponibles
        ui.setStatus(TEXTS[language].checkingColors, 'info');
        const colors = detectAvailableColors();
        
        if (colors.length === 0) {
          ui.setStatus(TEXTS[language].noColorsFound, 'error');
          return false;
        }
        
        imageState.availableColors = colors;
        imageState.colorsChecked = true;
        
        ui.setStatus(TEXTS[language].colorsFound.replace('{count}', colors.length), 'success');
        log(`✅ ${colors.length} colores disponibles detectados`);
        
        return true;
      },
      
      onUploadImage: async (file) => {
        try {
          ui.setStatus(TEXTS[language].loadingImage, 'info');
          
          const imageUrl = window.URL.createObjectURL(file);
          const processor = new ImageProcessor(imageUrl);
          processor.originalName = file.name;
          
          await processor.load();
          
          // Procesar imagen con colores disponibles
          const processedData = processor.processImage(imageState.availableColors, config);
          
          imageState.imageData = processedData;
          imageState.totalPixels = processedData.validPixelCount;
          imageState.paintedPixels = 0;
          imageState.originalImageName = file.name;
          imageState.imageLoaded = true;
          
          ui.setStatus(TEXTS[language].imageLoaded.replace('{count}', processedData.validPixelCount), 'success');
          ui.updateProgress(0, processedData.validPixelCount);
          
          log(`✅ Imagen cargada: ${processedData.width}x${processedData.height}, ${processedData.validPixelCount} píxeles válidos`);
          
          // Limpiar URL temporal
          window.URL.revokeObjectURL(imageUrl);
          
          return true;
        } catch (error) {
          ui.setStatus(TEXTS[language].imageError, 'error');
          log('❌ Error cargando imagen:', error);
          return false;
        }
      },
      
      onSelectPosition: async () => {
        return new Promise((resolve) => {
          ui.setStatus(TEXTS[language].selectPositionAlert, 'info');
          ui.setStatus(TEXTS[language].waitingPosition, 'info');
          
          imageState.selectingPosition = true;
          
          // Interceptar requests para capturar posición
          const originalFetch = window.fetch;
          window.fetch = async (url, options) => {
            if (imageState.selectingPosition && url.includes('/s0/paint')) {
              try {
                const response = await originalFetch(url, options);
                
                if (response.ok && options.body) {
                  const bodyData = JSON.parse(options.body);
                  if (bodyData.coords && bodyData.coords.length >= 2) {
                    const localX = bodyData.coords[0];
                    const localY = bodyData.coords[1];
                    
                    // Extraer tile de la URL
                    const tileMatch = url.match(/\/s0\/pixel\/(-?\d+)\/(-?\d+)/);
                    if (tileMatch) {
                      imageState.tileX = parseInt(tileMatch[1]);
                      imageState.tileY = parseInt(tileMatch[2]);
                    }
                    
                    imageState.startPosition = { x: localX, y: localY };
                    imageState.selectingPosition = false;
                    
                    window.fetch = originalFetch;
                    
                    ui.setStatus(TEXTS[language].positionSet, 'success');
                    log(`✅ Posición establecida: tile(${imageState.tileX},${imageState.tileY}) local(${localX},${localY})`);
                    
                    resolve(true);
                  }
                }
                
                return response;
              } catch (error) {
                log('Error interceptando pixel:', error);
                return originalFetch(url, options);
              }
            }
            return originalFetch(url, options);
          };
          
          // Timeout para selección de posición
          setTimeout(() => {
            if (imageState.selectingPosition) {
              window.fetch = originalFetch;
              imageState.selectingPosition = false;
              ui.setStatus(TEXTS[language].positionTimeout, 'error');
              resolve(false);
            }
          }, 120000); // 2 minutos
        });
      },
      
      onStartPainting: async () => {
        if (!imageState.imageLoaded || !imageState.startPosition) {
          ui.setStatus(TEXTS[language].missingRequirements, 'error');
          return false;
        }
        
        imageState.running = true;
        imageState.stopFlag = false;
        
        ui.setStatus(TEXTS[language].startPaintingMsg, 'success');
        
        try {
          await processImage(
            imageState.imageData,
            imageState.startPosition,
            // onProgress
            (painted, total, message) => {
              ui.updateProgress(painted, total);
              if (message) {
                ui.setStatus(message, 'info');
              } else {
                ui.setStatus(TEXTS[language].paintingProgress.replace('{painted}', painted).replace('{total}', total), 'info');
              }
            },
            // onComplete
            (completed, pixelsPainted) => {
              if (completed) {
                ui.setStatus(TEXTS[language].paintingComplete.replace('{count}', pixelsPainted), 'success');
                clearProgress();
              } else {
                ui.setStatus(TEXTS[language].paintingStopped, 'warning');
              }
              imageState.running = false;
            },
            // onError
            (error) => {
              ui.setStatus(TEXTS[language].paintingError, 'error');
              log('❌ Error en proceso de pintado:', error);
              imageState.running = false;
            }
          );
          
          return true;
        } catch (error) {
          ui.setStatus(TEXTS[language].paintingError, 'error');
          log('❌ Error iniciando pintado:', error);
          imageState.running = false;
          return false;
        }
      },
      
      onStopPainting: async () => {
        const progressInfo = getProgressInfo();
        
        if (progressInfo.hasProgress) {
          const shouldSave = await showConfirmDialog(
            TEXTS[language].confirmSaveProgress,
            TEXTS[language].saveProgressTitle,
            {
              save: TEXTS[language].saveProgress,
              discard: TEXTS[language].discardProgress,
              cancel: TEXTS[language].cancel
            }
          );
          
          if (shouldSave === 'save') {
            const result = saveProgress();
            if (result.success) {
              ui.setStatus(TEXTS[language].progressSaved.replace('{filename}', result.filename), 'success');
            } else {
              ui.setStatus(TEXTS[language].progressSaveError.replace('{error}', result.error), 'error');
            }
          } else if (shouldSave === 'cancel') {
            return false; // No detener
          }
        }
        
        stopPainting();
        ui.setStatus(TEXTS[language].paintingStopped, 'warning');
        return true;
      },
      
      onSaveProgress: async () => {
        const result = saveProgress();
        if (result.success) {
          ui.setStatus(TEXTS[language].progressSaved.replace('{filename}', result.filename), 'success');
        } else {
          ui.setStatus(TEXTS[language].progressSaveError.replace('{error}', result.error), 'error');
        }
        return result.success;
      },
      
      onLoadProgress: async (file) => {
        try {
          const result = await loadProgress(file);
          if (result.success) {
            ui.setStatus(TEXTS[language].progressLoaded.replace('{painted}', result.painted).replace('{total}', result.total), 'success');
            ui.updateProgress(result.painted, result.total);
            return true;
          } else {
            ui.setStatus(TEXTS[language].progressLoadError.replace('{error}', result.error), 'error');
            return false;
          }
        } catch (error) {
          ui.setStatus(TEXTS[language].progressLoadError.replace('{error}', error.message), 'error');
          return false;
        }
      }
    });

    // Cleanup al cerrar la página
    window.addEventListener('beforeunload', () => {
      stopPainting();
      ui.destroy();
      window.__wplaceBot.imageRunning = false;
    });

    log('✅ Auto-Image inicializado correctamente');
    
  } catch (error) {
    log('❌ Error inicializando Auto-Image:', error);
    window.__wplaceBot.imageRunning = false;
    throw error;
  }
}

function detectLanguage() {
  const lang = navigator.language || navigator.userLanguage || 'es';
  return lang.startsWith('es') ? 'es' : 'es'; // Por ahora solo español
}
