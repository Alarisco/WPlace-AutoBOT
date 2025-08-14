(async () => {
  const CONFIG = {
    SITEKEY: '0x4AAAAAABpqJe8FO0N84q0F', // Turnstile sitekey
    COOLDOWN_DEFAULT: 31000,
    TRANSPARENCY_THRESHOLD: 100,
    WHITE_THRESHOLD: 250,
    LOG_INTERVAL: 10,
    TILE_SIZE: 3000, // Tiles son de ~3000x3000 según investigación
    PIXELS_PER_BATCH: 20, // Píxeles por lote por defecto
    CHARGE_REGEN_MS: 30000, // 30 segundos por carga
    THEME: {
      primary: '#000000',
      secondary: '#111111',
      accent: '#222222',
      text: '#ffffff',
      highlight: '#775ce3',
      success: '#00ff00',
      error: '#ff0000',
      warning: '#ffaa00'
    }
  };

  const TEXTS = {
    es: {
      title: "WPlace Auto-Image",
      initBot: "Iniciar Auto-BOT",
      uploadImage: "Subir Imagen",
      resizeImage: "Redimensionar Imagen",
      selectPosition: "Seleccionar Posición",
      startPainting: "Iniciar Pintura",
      stopPainting: "Detener Pintura",
      checkingColors: "🔍 Verificando colores disponibles...",
      noColorsFound: "❌ ¡Abre la paleta de colores en el sitio e inténtalo de nuevo!",
      colorsFound: "✅ {count} colores disponibles encontrados",
      loadingImage: "🖼️ Cargando imagen...",
      imageLoaded: "✅ Imagen cargada con {count} píxeles válidos",
      imageError: "❌ Error al cargar la imagen",
      selectPositionAlert: "¡Pinta el primer píxel en la ubicación donde quieres que comience el arte!",
      waitingPosition: "👆 Esperando que pintes el píxel de referencia...",
      positionSet: "✅ ¡Posición establecida con éxito!",
      positionTimeout: "❌ Tiempo agotado para seleccionar posición",
      startPaintingMsg: "🎨 Iniciando pintura...",
      paintingProgress: "🧱 Progreso: {painted}/{total} píxeles...",
      noCharges: "⌛ Sin cargas. Esperando {time}...",
      paintingStopped: "⏹️ Pintura detenida por el usuario",
      paintingComplete: "✅ ¡Pintura completada! {count} píxeles pintados.",
      paintingError: "❌ Error durante la pintura",
      missingRequirements: "❌ Carga una imagen y selecciona una posición primero",
      progress: "Progreso",
      pixels: "Píxeles",
      charges: "Cargas",
      estimatedTime: "Tiempo estimado",
      initMessage: "Haz clic en 'Iniciar Auto-BOT' para comenzar",
      waitingInit: "Esperando inicialización...",
      resizeSuccess: "✅ Imagen redimensionada a {width}x{height}",
      paintingPaused: "⏸️ Pintura pausada en la posición X: {x}, Y: {y}",
      pixelsPerBatch: "Píxeles por lote",
      cooldownWaiting: "⏳ Esperando {time} para continuar..."
    }
  };

  const state = {
    running: false,
    imageLoaded: false,
    processing: false,
    totalPixels: 0,
    paintedPixels: 0,
    availableColors: [],
    currentCharges: 0,
    cooldown: CONFIG.COOLDOWN_DEFAULT,
    imageData: null,
    stopFlag: false,
    colorsChecked: false,
    startPosition: null,
    selectingPosition: false,
    region: null,
    minimized: false,
    lastPosition: { x: 0, y: 0 },
    estimatedTime: 0,
    language: 'es',
    tileX: null, // Coordenada X del tile
    tileY: null, // Coordenada Y del tile
    pixelsPerBatch: CONFIG.PIXELS_PER_BATCH, // Píxeles por lote (configurable)
    inCooldown: false, // Si está en cooldown
    cooldownEndTime: 0, // Timestamp del final del cooldown
    remainingPixels: [], // Lista de píxeles pendientes para pintar
    lastChargeUpdate: 0, // Timestamp de la última actualización de cargas
    chargeDecimalPart: 0 // Parte decimal para calcular el cooldown restante
  };

  function detectLanguage() {
    // Bot configurado solo en español
    state.language = 'es';
  }

  const Utils = {
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    
    colorDistance: (a, b) => Math.sqrt(
      Math.pow(a[0] - b[0], 2) + 
      Math.pow(a[1] - b[1], 2) + 
      Math.pow(a[2] - b[2], 2)
    ),
    
    createImageUploader: () => new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg';
      input.onchange = () => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.readAsDataURL(input.files[0]);
      };
      input.click();
    }),
    
    extractAvailableColors: () => {
      const colorElements = document.querySelectorAll('[id^="color-"]');
      return Array.from(colorElements)
        .filter(el => !el.querySelector('svg'))
        .filter(el => {
          const id = parseInt(el.id.replace('color-', ''));
          return id !== 0 && id !== 5;
        })
        .map(el => {
          const id = parseInt(el.id.replace('color-', ''));
          const rgbStr = el.style.backgroundColor.match(/\d+/g);
          const rgb = rgbStr ? rgbStr.map(Number) : [0, 0, 0];
          return { id, rgb };
        });
    },
    
    formatTime: ms => {
      const seconds = Math.floor((ms / 1000) % 60);
      const minutes = Math.floor((ms / (1000 * 60)) % 60);
      const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
      const days = Math.floor(ms / (1000 * 60 * 60 * 24));
      
      let result = '';
      if (days > 0) result += `${days}d `;
      if (hours > 0 || days > 0) result += `${hours}h `;
      if (minutes > 0 || hours > 0 || days > 0) result += `${minutes}m `;
      result += `${seconds}s`;
      
      return result;
    },
    
    showAlert: (message, type = 'info') => {
      const alert = document.createElement('div');
      alert.style.position = 'fixed';
      alert.style.top = '20px';
      alert.style.left = '50%';
      alert.style.transform = 'translateX(-50%)';
      alert.style.padding = '15px 20px';
      alert.style.background = CONFIG.THEME[type] || CONFIG.THEME.accent;
      alert.style.color = CONFIG.THEME.text;
      alert.style.borderRadius = '5px';
      alert.style.zIndex = '10000';
      alert.style.boxShadow = '0 3px 10px rgba(0,0,0,0.3)';
      alert.style.display = 'flex';
      alert.style.alignItems = 'center';
      alert.style.gap = '10px';
      
      const icons = {
        error: 'exclamation-circle',
        success: 'check-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
      };
      
      alert.innerHTML = `
        <i class="fas fa-${icons[type] || 'info-circle'}"></i>
        <span>${message}</span>
      `;
      
      document.body.appendChild(alert);
      
      setTimeout(() => {
        alert.style.opacity = '0';
        alert.style.transition = 'opacity 0.5s';
        setTimeout(() => alert.remove(), 500);
      }, 3000);
    },
    
    calculateEstimatedTime: (remainingPixels, currentCharges, cooldown) => {
      const pixelsPerCharge = currentCharges > 0 ? currentCharges : 0;
      const fullCycles = Math.ceil((remainingPixels - pixelsPerCharge) / Math.max(currentCharges, 1));
      return (fullCycles * cooldown) + ((remainingPixels - 1) * 100);
    },
    
    isWhitePixel: (r, g, b) => {
      return r >= CONFIG.WHITE_THRESHOLD && 
             g >= CONFIG.WHITE_THRESHOLD && 
             b >= CONFIG.WHITE_THRESHOLD;
    },
    
    t: (key, params = {}) => {
      let text = TEXTS.es[key] || key;
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, v);
      }
      return text;
    },

    // Funciones de Turnstile
    loadTurnstile: () => {
      return new Promise((resolve, reject) => {
        if (window.turnstile) return resolve();
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true; s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('No se pudo cargar Turnstile'));
        document.head.appendChild(s);
      });
    },

    getTurnstileToken: async () => {
      await Utils.loadTurnstile();
      if (typeof window.turnstile?.execute === 'function') {
        try {
          const token = await window.turnstile.execute(CONFIG.SITEKEY, { action: 'paint' });
          if (token && token.length > 20) return token;
        } catch (e) { /* fallback abajo */ }
      }
      // Fallback: render oculto
      return await new Promise((resolve) => {
        const host = document.createElement('div');
        host.style.position = 'fixed'; host.style.left = '-9999px';
        document.body.appendChild(host);
        window.turnstile.render(host, { sitekey: CONFIG.SITEKEY, callback: (t) => resolve(t) });
      });
    }
  };

  const WPlaceService = {
    async paintPixelBatch(pixels) {
      if (!pixels || pixels.length === 0) return { success: false, painted: 0 };
      
      try {
        // Obtener token de Turnstile
        const t = await Utils.getTurnstileToken();
        
        // Agrupar píxeles por tile
        const tileGroups = {};
        pixels.forEach(pixel => {
          const tileKey = `${pixel.tileX},${pixel.tileY}`;
          if (!tileGroups[tileKey]) {
            tileGroups[tileKey] = {
              tileX: pixel.tileX,
              tileY: pixel.tileY,
              coords: [],
              colors: []
            };
          }
          tileGroups[tileKey].coords.push(pixel.localX, pixel.localY);
          tileGroups[tileKey].colors.push(pixel.color);
        });
        
        let totalPainted = 0;
        let allSuccess = true;
        
        // Pintar cada grupo de tile
        for (const group of Object.values(tileGroups)) {
          const body = JSON.stringify({ 
            colors: group.colors, 
            coords: group.coords, 
            t 
          });
          
          const res = await fetch(`https://backend.wplace.live/s0/pixel/${group.tileX}/${group.tileY}`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body
          });
          
          let json = null; 
          try { 
            json = await res.json(); 
          } catch {}
          
          const painted = json?.painted || 0;
          totalPainted += painted;
          
          console.log(`Lote pintado en tile(${group.tileX},${group.tileY}): ${painted}/${group.colors.length} píxeles`);
          
          if (res.status !== 200 || painted === 0) {
            allSuccess = false;
          }
        }
        
        return { success: allSuccess, painted: totalPainted };
      } catch (error) {
        console.error('Error pintando lote:', error);
        return { success: false, painted: 0 };
      }
    },

    async paintPixelInRegion(tileX, tileY, localX, localY, color) {
      // Usar el método de lote para un solo píxel
      const result = await this.paintPixelBatch([{
        tileX,
        tileY,
        localX,
        localY,
        color
      }]);
      return result.success && result.painted > 0;
    },
    
    async getCharges() {
      try {
        const res = await fetch('https://backend.wplace.live/me', { 
          credentials: 'include' 
        });
        const data = await res.json();
        const charges = data.charges?.count || 0;
        const cooldown = data.charges?.cooldownMs || CONFIG.COOLDOWN_DEFAULT;
        
        // Actualizar el timestamp de la última consulta
        state.lastChargeUpdate = Date.now();
        state.chargeDecimalPart = charges - Math.floor(charges);
        
        console.log(`Cargas actualizadas: ${charges.toFixed(3)} (entero: ${Math.floor(charges)}, decimal: ${state.chargeDecimalPart.toFixed(3)})`);
        
        return { 
          charges, 
          cooldown,
          pixels: data.pixels || 0
        };
      } catch {
        return { charges: 0, cooldown: CONFIG.COOLDOWN_DEFAULT, pixels: 0 };
      }
    },

    // Función para calcular cargas estimadas sin hacer consulta a /me
    getEstimatedCharges() {
      if (state.lastChargeUpdate === 0) return Math.floor(state.currentCharges);
      
      const timeSinceUpdate = Date.now() - state.lastChargeUpdate;
      const chargesGenerated = timeSinceUpdate / CONFIG.CHARGE_REGEN_MS;
      const estimatedCharges = state.currentCharges + chargesGenerated;
      
      return Math.floor(estimatedCharges);
    },

    // Función para calcular tiempo restante para la próxima carga
    getTimeToNextCharge() {
      if (state.lastChargeUpdate === 0 || state.chargeDecimalPart === 0) return 0;
      
      const timeSinceUpdate = Date.now() - state.lastChargeUpdate;
      
      // Calcular el progreso actual desde la última actualización
      const progressSinceUpdate = timeSinceUpdate / CONFIG.CHARGE_REGEN_MS;
      const currentDecimalPart = state.chargeDecimalPart + progressSinceUpdate;
      
      // Si ya pasó el 100%, no hay tiempo restante
      if (currentDecimalPart >= 1.0) return 0;
      
      // Calcular tiempo restante: (1.0 - progreso_actual) × 30 segundos
      const remainingProgress = 1.0 - currentDecimalPart;
      const remainingTime = remainingProgress * CONFIG.CHARGE_REGEN_MS;
      
      return Math.max(0, remainingTime);
    }
  };

  class ImageProcessor {
    constructor(imageSrc) {
      this.imageSrc = imageSrc;
      this.img = new Image();
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
  }

  function findClosestColor(rgb, palette) {
    return palette.reduce((closest, current) => {
      const currentDistance = Utils.colorDistance(rgb, current.rgb);
      return currentDistance < closest.distance 
        ? { color: current, distance: currentDistance } 
        : closest;
    }, { color: palette[0], distance: Utils.colorDistance(rgb, palette[0].rgb) }).color.id;
  }

  async function createUI() {
    detectLanguage();

    const fontAwesome = document.createElement('link');
    fontAwesome.rel = 'stylesheet';
    fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(fontAwesome);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(0, 255, 0, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(0, 255, 0, 0); }
        100% { box-shadow: 0 0 0 0 rgba(0, 255, 0, 0); }
      }
      @keyframes slideIn {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      #wplace-image-bot-container {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 300px;
        background: ${CONFIG.THEME.primary};
        border: 1px solid ${CONFIG.THEME.accent};
        border-radius: 8px;
        padding: 0;
        box-shadow: 0 5px 15px rgba(0,0,0,0.5);
        z-index: 9998;
        font-family: 'Segoe UI', Roboto, sans-serif;
        color: ${CONFIG.THEME.text};
        animation: slideIn 0.4s ease-out;
        overflow: hidden;
      }
      .wplace-header {
        padding: 12px 15px;
        background: ${CONFIG.THEME.secondary};
        color: ${CONFIG.THEME.highlight};
        font-size: 16px;
        font-weight: 600;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        user-select: none;
      }
      .wplace-header-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .wplace-header-controls {
        display: flex;
        gap: 10px;
      }
      .wplace-header-btn {
        background: none;
        border: none;
        color: ${CONFIG.THEME.text};
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.2s;
      }
      .wplace-header-btn:hover {
        opacity: 1;
      }
      .wplace-content {
        padding: 15px;
        display: block;
      }
      .wplace-controls {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 15px;
      }
      .wplace-config {
        display: none;
        background: ${CONFIG.THEME.secondary};
        padding: 10px;
        border-radius: 6px;
        margin-bottom: 10px;
      }
      .wplace-config.visible {
        display: block;
      }
      .wplace-config-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-size: 14px;
      }
      .wplace-config-input {
        width: 60px;
        padding: 4px;
        border: 1px solid ${CONFIG.THEME.accent};
        border-radius: 4px;
        background: ${CONFIG.THEME.primary};
        color: ${CONFIG.THEME.text};
        text-align: center;
      }
      .wplace-btn {
        padding: 10px;
        border: none;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.2s;
      }
      .wplace-btn:hover {
        transform: translateY(-2px);
      }
      .wplace-btn-primary {
        background: ${CONFIG.THEME.accent};
        color: white;
      }
      .wplace-btn-upload {
        background: ${CONFIG.THEME.secondary};
        color: white;
        border: 1px dashed ${CONFIG.THEME.text};
      }
      .wplace-btn-start {
        background: ${CONFIG.THEME.success};
        color: white;
      }
      .wplace-btn-stop {
        background: ${CONFIG.THEME.error};
        color: white;
      }
      .wplace-btn-select {
        background: ${CONFIG.THEME.highlight};
        color: black;
      }
      .wplace-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none !important;
      }
      .wplace-stats {
        background: ${CONFIG.THEME.secondary};
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 15px;
      }
      .wplace-stat-item {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        font-size: 14px;
      }
      .wplace-stat-label {
        display: flex;
        align-items: center;
        gap: 6px;
        opacity: 0.8;
      }
      .wplace-progress {
        width: 100%;
        background: ${CONFIG.THEME.secondary};
        border-radius: 4px;
        margin: 10px 0;
        overflow: hidden;
      }
      .wplace-progress-bar {
        height: 10px;
        background: ${CONFIG.THEME.highlight};
        transition: width 0.3s;
      }
      .wplace-status {
        padding: 8px;
        border-radius: 4px;
        text-align: center;
        font-size: 13px;
      }
      .status-default {
        background: rgba(255,255,255,0.1);
      }
      .status-success {
        background: rgba(0, 255, 0, 0.1);
        color: ${CONFIG.THEME.success};
      }
      .status-error {
        background: rgba(255, 0, 0, 0.1);
        color: ${CONFIG.THEME.error};
      }
      .status-warning {
        background: rgba(255, 165, 0, 0.1);
        color: orange;
      }
      #paintEffect {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        border-radius: 8px;
      }
      .position-info {
        font-size: 13px;
        margin-top: 5px;
        padding: 5px;
        background: ${CONFIG.THEME.secondary};
        border-radius: 4px;
        text-align: center;
      }
      .wplace-minimized .wplace-content {
        display: none;
      }
      .resize-container {
        display: none;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${CONFIG.THEME.primary};
        padding: 20px;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 0 20px rgba(0,0,0,0.5);
        max-width: 90%;
        max-height: 90%;
        overflow: auto;
      }
      .resize-preview {
        max-width: 100%;
        max-height: 300px;
        margin: 10px 0;
        border: 1px solid ${CONFIG.THEME.accent};
      }
      .resize-controls {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 15px;
      }
      .resize-slider {
        width: 100%;
      }
      .resize-buttons {
        display: flex;
        gap: 10px;
      }
      .resize-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        z-index: 9999;
        display: none;
      }
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.id = 'wplace-image-bot-container';
    container.innerHTML = `
      <div class="wplace-header">
        <div class="wplace-header-title">
          <i class="fas fa-image"></i>
          <span>${Utils.t('title')}</span>
        </div>
        <div class="wplace-header-controls">
          <button id="configBtn" class="wplace-header-btn" title="Configuración">
            <i class="fas fa-cog"></i>
          </button>
          <button id="minimizeBtn" class="wplace-header-btn" title="${Utils.t('minimize')}">
            <i class="fas fa-minus"></i>
          </button>
        </div>
      </div>
      <div class="wplace-content">
        <div id="configPanel" class="wplace-config">
          <div class="wplace-config-item">
            <label>${Utils.t('pixelsPerBatch')}:</label>
            <input id="pixelsPerBatchInput" type="number" class="wplace-config-input" min="1" max="50" value="${state.pixelsPerBatch}">
          </div>
        </div>
        
        <div class="wplace-controls">
          <button id="initBotBtn" class="wplace-btn wplace-btn-primary">
            <i class="fas fa-robot"></i>
            <span>${Utils.t('initBot')}</span>
          </button>
          <button id="uploadBtn" class="wplace-btn wplace-btn-upload" disabled>
            <i class="fas fa-upload"></i>
            <span>${Utils.t('uploadImage')}</span>
          </button>
          <button id="resizeBtn" class="wplace-btn wplace-btn-primary" disabled>
            <i class="fas fa-expand"></i>
            <span>${Utils.t('resizeImage')}</span>
          </button>
          <button id="selectPosBtn" class="wplace-btn wplace-btn-select" disabled>
            <i class="fas fa-crosshairs"></i>
            <span>${Utils.t('selectPosition')}</span>
          </button>
          <button id="startBtn" class="wplace-btn wplace-btn-start" disabled>
            <i class="fas fa-play"></i>
            <span>${Utils.t('startPainting')}</span>
          </button>
          <button id="stopBtn" class="wplace-btn wplace-btn-stop" disabled>
            <i class="fas fa-stop"></i>
            <span>${Utils.t('stopPainting')}</span>
          </button>
        </div>
        
        <div class="wplace-progress">
          <div id="progressBar" class="wplace-progress-bar" style="width: 0%"></div>
        </div>
        
        <div class="wplace-stats">
          <div id="statsArea">
            <div class="wplace-stat-item">
              <div class="wplace-stat-label"><i class="fas fa-info-circle"></i> ${Utils.t('initMessage')}</div>
            </div>
          </div>
        </div>
        
        <div id="statusText" class="wplace-status status-default">
          ${Utils.t('waitingInit')}
        </div>
      </div>
    `;
    
    const resizeContainer = document.createElement('div');
    resizeContainer.className = 'resize-container';
    resizeContainer.innerHTML = `
      <h3 style="margin-top: 0; color: ${CONFIG.THEME.text}">${Utils.t('resizeImage')}</h3>
      <div class="resize-controls">
        <label style="color: ${CONFIG.THEME.text}">
          ${Utils.t('width')}: <span id="widthValue">0</span>px
          <input type="range" id="widthSlider" class="resize-slider" min="10" max="500" value="100">
        </label>
        <label style="color: ${CONFIG.THEME.text}">
          ${Utils.t('height')}: <span id="heightValue">0</span>px
          <input type="range" id="heightSlider" class="resize-slider" min="10" max="500" value="100">
        </label>
        <label style="color: ${CONFIG.THEME.text}">
          <input type="checkbox" id="keepAspect" checked>
          ${Utils.t('keepAspect')}
        </label>
        <img id="resizePreview" class="resize-preview" src="">
        <div class="resize-buttons">
          <button id="confirmResize" class="wplace-btn wplace-btn-primary">
            <i class="fas fa-check"></i>
            <span>${Utils.t('apply')}</span>
          </button>
          <button id="cancelResize" class="wplace-btn wplace-btn-stop">
            <i class="fas fa-times"></i>
            <span>${Utils.t('cancel')}</span>
          </button>
        </div>
      </div>
    `;
    
    const resizeOverlay = document.createElement('div');
    resizeOverlay.className = 'resize-overlay';
    
    document.body.appendChild(container);
    document.body.appendChild(resizeOverlay);
    document.body.appendChild(resizeContainer);
    
    const header = container.querySelector('.wplace-header');
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    header.onmousedown = dragMouseDown;
    
    function dragMouseDown(e) {
      if (e.target.closest('.wplace-header-btn')) return;
      
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }
    
    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      container.style.top = (container.offsetTop - pos2) + "px";
      container.style.left = (container.offsetLeft - pos1) + "px";
    }
    
    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
    
    const resizeBtn = container.querySelector('#resizeBtn');
    const selectPosBtn = container.querySelector('#selectPosBtn');
    const startBtn = container.querySelector('#startBtn');
    const stopBtn = container.querySelector('#stopBtn');
    const minimizeBtn = container.querySelector('#minimizeBtn');
    const configBtn = container.querySelector('#configBtn');
    const statusText = container.querySelector('#statusText');
    const progressBar = container.querySelector('#progressBar');
    const statsArea = container.querySelector('#statsArea');
    const content = container.querySelector('.wplace-content');
    const configPanel = container.querySelector('#configPanel');
    const pixelsPerBatchInput = container.querySelector('#pixelsPerBatchInput');
    
    const widthSlider = resizeContainer.querySelector('#widthSlider');
    const heightSlider = resizeContainer.querySelector('#heightSlider');
    const widthValue = resizeContainer.querySelector('#widthValue');
    const heightValue = resizeContainer.querySelector('#heightValue');
    const keepAspect = resizeContainer.querySelector('#keepAspect');
    const resizePreview = resizeContainer.querySelector('#resizePreview');
    const confirmResize = resizeContainer.querySelector('#confirmResize');
    const cancelResize = resizeContainer.querySelector('#cancelResize');
    
    minimizeBtn.addEventListener('click', () => {
      state.minimized = !state.minimized;
      if (state.minimized) {
        container.classList.add('wplace-minimized');
        minimizeBtn.innerHTML = '<i class="fas fa-expand"></i>';
      } else {
        container.classList.remove('wplace-minimized');
        minimizeBtn.innerHTML = '<i class="fas fa-minus"></i>';
      }
    });

    configBtn.addEventListener('click', () => {
      const isVisible = configPanel.classList.contains('visible');
      if (isVisible) {
        configPanel.classList.remove('visible');
        configBtn.innerHTML = '<i class="fas fa-cog"></i>';
      } else {
        configPanel.classList.add('visible');
        configBtn.innerHTML = '<i class="fas fa-times"></i>';
      }
    });

    pixelsPerBatchInput.addEventListener('change', () => {
      const value = Math.max(1, Math.min(50, parseInt(pixelsPerBatchInput.value) || CONFIG.PIXELS_PER_BATCH));
      state.pixelsPerBatch = value;
      pixelsPerBatchInput.value = value;
    });
    
    window.updateUI = (messageKey, type = 'default', params = {}) => {
      const message = Utils.t(messageKey, params);
      statusText.textContent = message;
      statusText.className = `wplace-status status-${type}`;
      statusText.style.animation = 'none';
      void statusText.offsetWidth;
      statusText.style.animation = 'slideIn 0.3s ease-out';
    };

      window.updateStats = async (forceUpdate = false) => {
        if (!state.colorsChecked || !state.imageLoaded) return;
        
        let charges, cooldown, pixels;
        
        // Solo hacer consulta a /me si es forzada (inicio o después de pintar)
        if (forceUpdate || state.lastChargeUpdate === 0) {
          const chargeData = await WPlaceService.getCharges();
          charges = chargeData.charges;
          cooldown = chargeData.cooldown;
          pixels = chargeData.pixels;
          
          state.currentCharges = charges;
          state.cooldown = cooldown;
        } else {
          // Usar valores estimados sin consultar el servidor
          charges = state.currentCharges;
          cooldown = state.cooldown;
          pixels = 0; // No actualizar píxeles sin consulta real
        }
        
        const progress = state.totalPixels > 0 ? 
          Math.round((state.paintedPixels / state.totalPixels) * 100) : 0;
        const remainingPixels = state.totalPixels - state.paintedPixels;
        
        // Calcular tiempo estimado considerando el sistema de lotes
        const pixelsPerBatch = state.pixelsPerBatch;
        const remainingBatches = Math.ceil(remainingPixels / pixelsPerBatch);
        const chargesNeeded = remainingBatches * pixelsPerBatch;
        const currentAvailableCharges = WPlaceService.getEstimatedCharges();
        
        let estimatedTime = 0;
        if (chargesNeeded > currentAvailableCharges) {
          const chargesToWait = chargesNeeded - currentAvailableCharges;
          estimatedTime = chargesToWait * CONFIG.CHARGE_REGEN_MS;
        }
        state.estimatedTime = estimatedTime;
        
        progressBar.style.width = `${progress}%`;
        
        // Mostrar información de cooldown si está activo
        let cooldownInfo = '';
        if (state.inCooldown && state.cooldownEndTime > Date.now()) {
          const remainingMs = state.cooldownEndTime - Date.now();
          const remainingSec = Math.ceil(remainingMs / 1000);
          const remainingMin = Math.floor(remainingSec / 60);
          const remainingSecOnly = remainingSec % 60;
          
          if (remainingMin > 0) {
            cooldownInfo = `⏳ Cooldown: ${remainingMin}m ${remainingSecOnly}s`;
          } else {
            cooldownInfo = `⏳ Cooldown: ${remainingSec}s`;
          }
        } else {
          // Mostrar tiempo para la próxima carga si no estamos en cooldown forzado
          const timeToNext = WPlaceService.getTimeToNextCharge();
          if (timeToNext > 1000) {
            const remainingSec = Math.ceil(timeToNext / 1000);
            cooldownInfo = `⏳ Próxima carga: ${remainingSec}s`;
            
            // Debug: mostrar información detallada del cálculo
            if (Math.random() < 0.1) { // Solo 10% de las veces para no spam
              const currentDecimal = state.chargeDecimalPart + ((Date.now() - state.lastChargeUpdate) / CONFIG.CHARGE_REGEN_MS);
              console.log(`Debug cooldown: decimal inicial: ${state.chargeDecimalPart.toFixed(3)}, actual: ${currentDecimal.toFixed(3)}, restantes: ${remainingSec}s`);
            }
          }
        }
        
        // Mostrar cargas como número entero
        const integerCharges = Math.floor(charges);
        
        statsArea.innerHTML = `
          <div class="wplace-stat-item">
            <div class="wplace-stat-label"><i class="fas fa-image"></i> ${Utils.t('progress')}</div>
            <div>${progress}%</div>
          </div>
          ${forceUpdate && pixels > 0 ? `
          <div class="wplace-stat-item">
            <div class="wplace-stat-label"><i class="fas fa-paint-brush"></i> ${Utils.t('pixels')}</div>
            <div>${pixels}</div>
          </div>
          ` : ''}
          <div class="wplace-stat-item">
            <div class="wplace-stat-label"><i class="fas fa-bolt"></i> ${Utils.t('charges')}</div>
            <div>${integerCharges}</div>
          </div>
          <div class="wplace-stat-item">
            <div class="wplace-stat-label"><i class="fas fa-layer-group"></i> ${Utils.t('pixelsPerBatch')}</div>
            <div>${state.pixelsPerBatch}</div>
          </div>
          ${state.imageLoaded && estimatedTime > 0 ? `
          <div class="wplace-stat-item">
            <div class="wplace-stat-label"><i class="fas fa-clock"></i> ${Utils.t('estimatedTime')}</div>
            <div>${Utils.formatTime(estimatedTime)}</div>
          </div>
          ` : ''}
          ${cooldownInfo ? `
          <div class="wplace-stat-item">
            <div class="wplace-stat-label" style="color: ${CONFIG.THEME.warning};">${cooldownInfo}</div>
            <div></div>
          </div>
          ` : ''}
          ${state.tileX && state.tileY ? `
          <div class="wplace-stat-item">
            <div class="wplace-stat-label"><i class="fas fa-crosshairs"></i> Tile</div>
            <div>(${state.tileX}, ${state.tileY})</div>
          </div>
          ` : ''}
        `;
      };    function showResizeDialog(processor) {
      const { width, height } = processor.getDimensions();
      const aspectRatio = width / height;
      
      widthSlider.value = width;
      heightSlider.value = height;
      widthValue.textContent = width;
      heightValue.textContent = height;
      resizePreview.src = processor.img.src;
      
      resizeOverlay.style.display = 'block';
      resizeContainer.style.display = 'block';
      
      const updatePreview = () => {
        const newWidth = parseInt(widthSlider.value);
        const newHeight = parseInt(heightSlider.value);
        
        widthValue.textContent = newWidth;
        heightValue.textContent = newHeight;
        
        resizePreview.src = processor.generatePreview(newWidth, newHeight);
      };
      
      widthSlider.addEventListener('input', () => {
        if (keepAspect.checked) {
          const newWidth = parseInt(widthSlider.value);
          const newHeight = Math.round(newWidth / aspectRatio);
          heightSlider.value = newHeight;
        }
        updatePreview();
      });
      
      heightSlider.addEventListener('input', () => {
        if (keepAspect.checked) {
          const newHeight = parseInt(heightSlider.value);
          const newWidth = Math.round(newHeight * aspectRatio);
          widthSlider.value = newWidth;
        }
        updatePreview();
      });
      
      confirmResize.onclick = () => {
        const newWidth = parseInt(widthSlider.value);
        const newHeight = parseInt(heightSlider.value);
        
        const newPixels = processor.resize(newWidth, newHeight);
        
        let totalValidPixels = 0;
        for (let y = 0; y < newHeight; y++) {
          for (let x = 0; x < newWidth; x++) {
            const idx = (y * newWidth + x) * 4;
            const r = newPixels[idx];
            const g = newPixels[idx + 1];
            const b = newPixels[idx + 2];
            const alpha = newPixels[idx + 3];
            
            if (alpha < CONFIG.TRANSPARENCY_THRESHOLD) continue;
            if (Utils.isWhitePixel(r, g, b)) continue;
            
            totalValidPixels++;
          }
        }
        
        state.imageData.pixels = newPixels;
        state.imageData.width = newWidth;
        state.imageData.height = newHeight;
        state.imageData.totalPixels = totalValidPixels;
        state.totalPixels = totalValidPixels;
        state.paintedPixels = 0;
        state.remainingPixels = []; // Resetear cola al redimensionar
        
        updateStats(); // Sin forzar, solo actualizar UI
        updateUI('resizeSuccess', 'success', { width: newWidth, height: newHeight });
        
        closeResizeDialog();
      };
      
      cancelResize.onclick = closeResizeDialog;
    }
    
    function closeResizeDialog() {
      resizeOverlay.style.display = 'none';
      resizeContainer.style.display = 'none';
    }
    
    initBotBtn.addEventListener('click', async () => {
      try {
        updateUI('checkingColors', 'default');
        
        state.availableColors = Utils.extractAvailableColors();
        
        if (state.availableColors.length === 0) {
          Utils.showAlert(Utils.t('noColorsFound'), 'error');
          updateUI('noColorsFound', 'error');
          return;
        }
        
        state.colorsChecked = true;
        uploadBtn.disabled = false;
        selectPosBtn.disabled = false;
        initBotBtn.style.display = 'none';
        
        updateUI('colorsFound', 'success', { count: state.availableColors.length });
        updateStats(true); // Forzar consulta inicial
        
      } catch {
        updateUI('imageError', 'error');
      }
    });
    
    uploadBtn.addEventListener('click', async () => {
      try {
        updateUI('loadingImage', 'default');
        const imageSrc = await Utils.createImageUploader();
        
        const processor = new ImageProcessor(imageSrc);
        await processor.load();
        
        const { width, height } = processor.getDimensions();
        const pixels = processor.getPixelData();
        
        let totalValidPixels = 0;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            const alpha = pixels[idx + 3];
            
            if (alpha < CONFIG.TRANSPARENCY_THRESHOLD) continue;
            if (Utils.isWhitePixel(r, g, b)) continue;
            
            totalValidPixels++;
          }
        }
        
        state.imageData = {
          width,
          height,
          pixels,
          totalPixels: totalValidPixels,
          processor
        };
        
        state.totalPixels = totalValidPixels;
        state.paintedPixels = 0;
        state.imageLoaded = true;
        state.lastPosition = { x: 0, y: 0 };
        state.remainingPixels = []; // Resetear cola de píxeles
        
        resizeBtn.disabled = false;
        
        if (state.startPosition) {
          startBtn.disabled = false;
        }
        
        updateStats(); // Sin forzar, solo actualizar UI
        updateUI('imageLoaded', 'success', { count: totalValidPixels });
      } catch {
        updateUI('imageError', 'error');
      }
    });
    
    resizeBtn.addEventListener('click', () => {
      if (state.imageLoaded && state.imageData.processor) {
        showResizeDialog(state.imageData.processor);
      }
    });
    
      selectPosBtn.addEventListener('click', async () => {
        if (state.selectingPosition) return;
        
        state.selectingPosition = true;
        state.startPosition = null;
        state.region = null;
        state.tileX = null;
        state.tileY = null;
        startBtn.disabled = true;
        
        Utils.showAlert(Utils.t('selectPositionAlert'), 'info');
        updateUI('waitingPosition', 'default');
        
        const originalFetch = window.fetch;
        
        window.fetch = async (url, options) => {
          if (typeof url === 'string' && 
              url.includes('https://backend.wplace.live/s0/pixel/') && 
              options?.method?.toUpperCase() === 'POST') {
            
            try {
              const response = await originalFetch(url, options);
              const clonedResponse = response.clone();
              const data = await clonedResponse.json();
              
              if (data?.painted === 1 || (data?.painted > 0)) {
                // Extraer coordenadas del tile de la URL
                const regionMatch = url.match(/\/pixel\/(\d+)\/(\d+)/);
                if (regionMatch && regionMatch.length >= 3) {
                  const tileX = parseInt(regionMatch[1]);
                  const tileY = parseInt(regionMatch[2]);
                  
                  // Extraer coordenadas del payload
                  const payload = JSON.parse(options.body);
                  if (payload?.coords && Array.isArray(payload.coords)) {
                    const coordX = payload.coords[0];
                    const coordY = payload.coords[1];
                    
                    console.log(`Pixel interceptado: tile(${tileX},${tileY}) coords[${coordX},${coordY}]`);
                    
                    // IMPORTANTE: Las coordenadas interceptadas son donde se pintó el píxel
                    // Estas coordenadas serán la esquina superior izquierda de la imagen
                    const startLocalX = coordX;
                    const startLocalY = coordY;
                    
                    state.tileX = tileX;
                    state.tileY = tileY;
                    
                    console.log(`Posición seleccionada: tile(${tileX},${tileY}) local(${startLocalX},${startLocalY})`);
                    console.log(`Esta será la esquina superior izquierda de la imagen`);
                    
                    // Verificar que las coordenadas locales estén en rango válido
                    if (startLocalX < 0 || startLocalX >= CONFIG.TILE_SIZE || 
                        startLocalY < 0 || startLocalY >= CONFIG.TILE_SIZE) {
                      console.error(`Error: coordenadas fuera de rango: (${startLocalX},${startLocalY})`);
                      return response;
                    }
                    
                    state.region = {
                      x: state.tileX,
                      y: state.tileY
                    };
                    
                    // Guardar la posición donde debe empezar la imagen (esquina superior izquierda)
                    state.startPosition = {
                      x: startLocalX,  // Esquina superior izquierda de la imagen
                      y: startLocalY   // Esquina superior izquierda de la imagen
                    };
                    state.lastPosition = { x: 0, y: 0 };
                    
                    console.log(`Posición capturada exitosamente:`);
                    console.log(`  Tile: (${state.tileX}, ${state.tileY})`);
                    console.log(`  Inicio de imagen (esquina superior izquierda): (${startLocalX}, ${startLocalY})`);
                    
                    // Mostrar información sobre dónde terminará la imagen si está cargada
                    if (state.imageLoaded && state.imageData) {
                      const endX = startLocalX + state.imageData.width - 1;
                      const endY = startLocalY + state.imageData.height - 1;
                      console.log(`  Final estimado de imagen: (${endX}, ${endY})`);
                      console.log(`  Tamaño imagen: ${state.imageData.width}x${state.imageData.height}`);
                    }
                    
                    if (state.imageLoaded) {
                      startBtn.disabled = false;
                    }
                    
                    window.fetch = originalFetch;
                    state.selectingPosition = false;
                    updateStats(); // Sin forzar, solo actualizar UI para mostrar tile
                    updateUI('positionSet', 'success');
                  }
                }
              }
              
              return response;
            } catch (error) {
              console.error('Error interceptando pixel:', error);
              return originalFetch(url, options);
            }
          }
          return originalFetch(url, options);
        };
        
        setTimeout(() => {
          if (state.selectingPosition) {
            window.fetch = originalFetch;
            state.selectingPosition = false;
            updateUI('positionTimeout', 'error');
            Utils.showAlert(Utils.t('positionTimeout'), 'error');
          }
        }, 120000);
      });
      
      startBtn.addEventListener('click', async () => {
        if (!state.imageLoaded || !state.startPosition || !state.region) {
          updateUI('missingRequirements', 'error');
          return;
        }
        
        // Verificar zona segura - simplificado para tiles de gran tamaño
        const { x: localStartX, y: localStartY } = state.startPosition; // LOCALES
        const { width, height } = state.imageData;
        
        // Verificar que la imagen no sea excesivamente grande para una tile
        if (width > CONFIG.TILE_SIZE || height > CONFIG.TILE_SIZE) {
          Utils.showAlert(`⚠️ Imagen demasiado grande (${width}x${height}). Máximo recomendado: ${CONFIG.TILE_SIZE}x${CONFIG.TILE_SIZE}`, 'warning');
        }
        
        console.log(`Imagen ${width}x${height} iniciando en tile(${state.tileX},${state.tileY}) local(${localStartX},${localStartY})`);
        
        // Verificar que tenemos cargas suficientes para empezar
        if (Math.floor(state.currentCharges) < 1) {
          Utils.showAlert('⚠️ No tienes cargas suficientes para empezar a pintar.', 'warning');
          updateUI('noCharges', 'warning', { time: Utils.formatTime(state.cooldown) });
          return;
        }
        
        state.running = true;
        state.stopFlag = false;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        uploadBtn.disabled = true;
        selectPosBtn.disabled = true;
        resizeBtn.disabled = true;
        
        updateUI('startPaintingMsg', 'success');
        
        try {
          await processImage();
        } catch (error) {
          console.error('Error en proceso de pintado:', error);
          updateUI('paintingError', 'error');
        } finally {
          state.running = false;
          state.inCooldown = false;
          stopBtn.disabled = true;
          
          if (!state.stopFlag) {
            // Si terminó completamente, habilitar nuevos procesos
            startBtn.disabled = true;
            uploadBtn.disabled = false;
            selectPosBtn.disabled = false;
            resizeBtn.disabled = false;
          } else {
            // Si se pausó, permitir continuar
            if (state.remainingPixels && state.remainingPixels.length > 0) {
              startBtn.disabled = false;
            } else {
              startBtn.disabled = true;
              uploadBtn.disabled = false;
              selectPosBtn.disabled = false;
              resizeBtn.disabled = false;
            }
          }
        }
      });
      
      stopBtn.addEventListener('click', () => {
        state.stopFlag = true;
        state.running = false;
        state.inCooldown = false;
        stopBtn.disabled = true;
        
        // Permitir reanudar desde donde se pausó si hay píxeles pendientes
        if (state.remainingPixels && state.remainingPixels.length > 0) {
          startBtn.disabled = false;
          updateUI('paintingStopped', 'warning');
        } else {
          startBtn.disabled = true;
          uploadBtn.disabled = false;
          selectPosBtn.disabled = false;
          resizeBtn.disabled = false;
        }
      });
    }

  async function processImage() {
    const { width, height } = state.imageData;
    const { x: localStartX, y: localStartY } = state.startPosition;
    
    console.log(`Iniciando pintado: imagen(${width}x${height}) inicio LOCAL(${localStartX},${localStartY}) tile(${state.tileX},${state.tileY})`);
    
    // Generar cola de píxeles si no existe o si estamos empezando desde el principio
    if (!state.remainingPixels || state.remainingPixels.length === 0 || (state.lastPosition.x === 0 && state.lastPosition.y === 0)) {
      console.log('Generando cola de píxeles...');
      state.remainingPixels = generatePixelQueue(state.imageData, state.startPosition, state.tileX, state.tileY);
      
      // Si hay una posición de continuación, filtrar píxeles ya pintados
      if (state.lastPosition.x > 0 || state.lastPosition.y > 0) {
        state.remainingPixels = state.remainingPixels.filter(pixel => {
          const pixelIndex = pixel.imageY * width + pixel.imageX;
          const lastIndex = state.lastPosition.y * width + state.lastPosition.x;
          return pixelIndex >= lastIndex;
        });
      }
      
      console.log(`Cola generada: ${state.remainingPixels.length} píxeles pendientes`);
    }
    
    while (state.remainingPixels.length > 0 && !state.stopFlag) {
      // Usar cargas estimadas para evitar consultas constantes a /me
      const availableCharges = WPlaceService.getEstimatedCharges();
      const pixelsPerBatch = Math.min(state.pixelsPerBatch, state.remainingPixels.length);
      
      if (availableCharges < pixelsPerBatch) {
        console.log(`Cargas insuficientes: ${availableCharges}/${pixelsPerBatch} necesarias`);
        await waitForCooldown(pixelsPerBatch - availableCharges);
        continue;
      }
      
      // Tomar el siguiente lote de píxeles
      const batch = state.remainingPixels.splice(0, pixelsPerBatch);
      
      console.log(`Pintando lote de ${batch.length} píxeles...`);
      
      // Pintar el lote
      const result = await WPlaceService.paintPixelBatch(batch);
      
      if (result.success && result.painted > 0) {
        state.paintedPixels += result.painted;
        
        // Actualizar cargas reales después de pintar (única consulta a /me)
        const chargeUpdate = await WPlaceService.getCharges();
        state.currentCharges = chargeUpdate.charges;
        
        // Actualizar posición para continuar desde aquí si se interrumpe
        if (batch.length > 0) {
          const lastPixel = batch[batch.length - 1];
          state.lastPosition = { x: lastPixel.imageX, y: lastPixel.imageY };
        }
        
        console.log(`Lote exitoso: ${result.painted}/${batch.length} píxeles pintados. Total: ${state.paintedPixels}/${state.totalPixels}`);
        
        // Actualizar UI cada ciertos píxeles con datos reales
        if (state.paintedPixels % CONFIG.LOG_INTERVAL === 0 || state.remainingPixels.length === 0) {
          updateStats(true); // Forzar actualización con datos reales
          updateUI('paintingProgress', 'default', { 
            painted: state.paintedPixels, 
            total: state.totalPixels 
          });
        }
      } else {
        // En caso de fallo, devolver el lote a la cola
        state.remainingPixels.unshift(...batch);
        console.warn(`Lote falló: reintentando en 5 segundos...`);
        await Utils.sleep(5000);
      }
      
      // Pausa breve entre lotes
      await Utils.sleep(500);
    }
    
    if (state.stopFlag) {
      updateUI('paintingStopped', 'warning');
      console.log(`Pintado pausado en píxel imagen(${state.lastPosition.x},${state.lastPosition.y})`);
    } else {
      updateUI('paintingComplete', 'success', { count: state.paintedPixels });
      state.lastPosition = { x: 0, y: 0 };
      state.remainingPixels = [];
      console.log(`Pintado completado: ${state.paintedPixels} píxeles pintados`);
    }
    
    updateStats(); // Sin forzar, solo actualizar UI final
  }

  function generatePixelQueue(imageData, startPosition, tileX, tileY) {
    const { width, height, pixels } = imageData;
    const { x: localStartX, y: localStartY } = startPosition;
    const queue = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const alpha = pixels[idx + 3];
        
        if (alpha < CONFIG.TRANSPARENCY_THRESHOLD) continue;
        if (Utils.isWhitePixel(r, g, b)) continue;
        
        const rgb = [r, g, b];
        const colorId = findClosestColor(rgb, state.availableColors);
        
        // Calcular posición del pixel en el mundo
        const imageLocalX = localStartX + x;
        const imageLocalY = localStartY + y;
        
        // Determinar tile y coordenadas locales
        let targetTileX = tileX;
        let targetTileY = tileY;
        let targetLocalX = imageLocalX;
        let targetLocalY = imageLocalY;
        
        // Manejar píxeles que se extienden a otros tiles
        if (imageLocalX >= CONFIG.TILE_SIZE) {
          const extraTilesX = Math.floor(imageLocalX / CONFIG.TILE_SIZE);
          targetTileX = tileX + extraTilesX;
          targetLocalX = imageLocalX % CONFIG.TILE_SIZE;
        } else if (imageLocalX < 0) {
          const extraTilesX = Math.ceil(-imageLocalX / CONFIG.TILE_SIZE);
          targetTileX = tileX - extraTilesX;
          targetLocalX = CONFIG.TILE_SIZE + (imageLocalX % CONFIG.TILE_SIZE);
        }
        
        if (imageLocalY >= CONFIG.TILE_SIZE) {
          const extraTilesY = Math.floor(imageLocalY / CONFIG.TILE_SIZE);
          targetTileY = tileY + extraTilesY;
          targetLocalY = imageLocalY % CONFIG.TILE_SIZE;
        } else if (imageLocalY < 0) {
          const extraTilesY = Math.ceil(-imageLocalY / CONFIG.TILE_SIZE);
          targetTileY = tileY - extraTilesY;
          targetLocalY = CONFIG.TILE_SIZE + (imageLocalY % CONFIG.TILE_SIZE);
        }
        
        queue.push({
          imageX: x,
          imageY: y,
          tileX: targetTileX,
          tileY: targetTileY,
          localX: targetLocalX,
          localY: targetLocalY,
          color: colorId
        });
      }
    }
    
    return queue;
  }

  async function waitForCooldown(targetCharges) {
    const cooldownTime = targetCharges * CONFIG.CHARGE_REGEN_MS;
    state.inCooldown = true;
    state.cooldownEndTime = Date.now() + cooldownTime;
    
    console.log(`Esperando ${targetCharges} cargas (${Utils.formatTime(cooldownTime)}) para continuar...`);
    
    while (state.cooldownEndTime > Date.now() && !state.stopFlag) {
      const remainingMs = state.cooldownEndTime - Date.now();
      updateUI('cooldownWaiting', 'warning', { time: Utils.formatTime(remainingMs) });
      updateStats(); // Sin forzar, usar estimaciones durante cooldown
      await Utils.sleep(1000);
    }
    
    state.inCooldown = false;
    console.log('Cooldown completado, continuando pintado...');
  }

  createUI();
  
  // Timer para actualizar UI sin consultar /me (solo estimaciones)
  setInterval(() => {
    if (state.colorsChecked && state.imageLoaded && !state.processing) {
      updateStats(); // Sin forzar, solo estimaciones
    }
  }, 5000); // Cada 5 segundos
  
  // Función de debugging para verificar coordenadas
  window.debugCoords = () => {
    console.log('=== DEBUG COORDENADAS ===');
    console.log('Estado actual:');
    console.log(`  Tile: (${state.tileX}, ${state.tileY})`);
    console.log(`  Start Position (local): (${state.startPosition?.x}, ${state.startPosition?.y})`);
    console.log(`  Imagen cargada: ${state.imageLoaded}`);
    console.log(`  Píxeles por lote: ${state.pixelsPerBatch}`);
    console.log(`  Píxeles pendientes: ${state.remainingPixels?.length || 0}`);
    console.log(`  En cooldown: ${state.inCooldown}`);
    if (state.imageData) {
      console.log(`  Tamaño imagen: ${state.imageData.width}x${state.imageData.height}`);
      console.log(`  Tamaño tile: ${CONFIG.TILE_SIZE}x${CONFIG.TILE_SIZE}`);
      
      if (state.startPosition && state.tileX !== null && state.tileY !== null) {
        const endLocalX = state.startPosition.x + state.imageData.width - 1;
        const endLocalY = state.startPosition.y + state.imageData.height - 1;
        
        console.log(`  Inicio local: (${state.startPosition.x}, ${state.startPosition.y})`);
        console.log(`  Final local: (${endLocalX}, ${endLocalY})`);
        console.log(`  ¿Cabe en el tile?: ${endLocalX < CONFIG.TILE_SIZE && endLocalY < CONFIG.TILE_SIZE}`);
        
        if (endLocalX >= CONFIG.TILE_SIZE || endLocalY >= CONFIG.TILE_SIZE) {
          console.log(`  ⚠️ La imagen se extiende a múltiples tiles`);
        }
      }
    }
    console.log('========================');
  };

  // Función para configurar píxeles por lote desde consola
  window.setPixelsPerBatch = (count) => {
    const value = Math.max(1, Math.min(50, parseInt(count) || CONFIG.PIXELS_PER_BATCH));
    state.pixelsPerBatch = value;
    document.querySelector('#pixelsPerBatchInput').value = value;
    console.log(`Píxeles por lote establecido a: ${value}`);
    updateStats();
  };

  // Función de debugging para verificar cálculos de cargas
  window.debugCharges = () => {
    console.log('=== DEBUG CARGAS ===');
    console.log(`Cargas actuales: ${state.currentCharges.toFixed(3)}`);
    console.log(`Cargas enteras: ${Math.floor(state.currentCharges)}`);
    console.log(`Parte decimal: ${state.chargeDecimalPart.toFixed(3)} (${(state.chargeDecimalPart * 100).toFixed(1)}%)`);
    console.log(`Última actualización: ${new Date(state.lastChargeUpdate).toLocaleTimeString()}`);
    
    if (state.lastChargeUpdate > 0) {
      const timeSinceUpdate = Date.now() - state.lastChargeUpdate;
      const progressSinceUpdate = timeSinceUpdate / CONFIG.CHARGE_REGEN_MS;
      const currentDecimalPart = state.chargeDecimalPart + progressSinceUpdate;
      const timeToNext = WPlaceService.getTimeToNextCharge();
      
      console.log(`Tiempo desde actualización: ${(timeSinceUpdate / 1000).toFixed(1)}s`);
      console.log(`Progreso desde actualización: ${(progressSinceUpdate * 100).toFixed(1)}%`);
      console.log(`Decimal actual estimado: ${currentDecimalPart.toFixed(3)} (${(currentDecimalPart * 100).toFixed(1)}%)`);
      console.log(`Tiempo a próxima carga: ${Math.ceil(timeToNext / 1000)}s`);
      console.log(`Cargas estimadas: ${WPlaceService.getEstimatedCharges()}`);
      
      // Ejemplo del cálculo correcto
      const remainingProgress = Math.max(0, 1.0 - currentDecimalPart);
      console.log(`\n📊 CÁLCULO DETALLADO:`);
      console.log(`  Progreso hacia próxima carga: ${(currentDecimalPart * 100).toFixed(1)}%`);
      console.log(`  Progreso restante: ${(remainingProgress * 100).toFixed(1)}%`);
      console.log(`  Tiempo restante: ${(remainingProgress * 30).toFixed(1)}s`);
    }
    console.log('==================');
  };
})();
