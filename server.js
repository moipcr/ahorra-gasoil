const express = require('express');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const MINETUR_API = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 horas

// Estado del caché
let cache = {
  data: null,
  timestamp: null,
  error: null
};

/**
 * Obtiene datos de la API de MINETUR
 * @returns {Promise<Object>} Datos parseados o error
 */
function fetchMineturData() {
  return new Promise((resolve, reject) => {
    https.get(MINETUR_API, { timeout: 30000 }, (res) => {
      let rawData = '';
      
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Error parseando JSON: ${e.message}`));
        }
      });
    }).on('error', (err) => {
      reject(new Error(`Error conectando a MINETUR: ${err.message}`));
    }).on('timeout', () => {
      reject(new Error('Timeout conectando a MINETUR'));
    });
  });
}

/**
 * Actualiza el caché con datos frescos
 * @returns {Promise<void>}
 */
async function refreshCache() {
  try {
    console.log('[Cache] Actualizando datos desde MINETUR...');
    const data = await fetchMineturData();
    cache.data = data;
    cache.timestamp = Date.now();
    cache.error = null;
    console.log(`[Cache] Datos actualizados: ${data.ListaEESSPrecio?.length || 0} estaciones`);
  } catch (err) {
    console.error('[Cache] Error actualizando:', err.message);
    cache.error = err.message;
  }
}

/**
 * Obtiene datos del caché o los actualiza si es necesario
 * @returns {Promise<Object>} Datos o error
 */
async function getCachedData(forceRefresh = false) {
  const now = Date.now();
  const elapsed = now - (cache.timestamp || 0);
  
  // Forzar actualización
  if (forceRefresh) {
    await refreshCache();
    return { data: cache.data, timestamp: cache.timestamp, error: cache.error, fromCache: false };
  }
  
  // Caché válido (< 12h)
  if (cache.data && elapsed < CACHE_DURATION_MS) {
    return { data: cache.data, timestamp: cache.timestamp, error: cache.error, fromCache: true };
  }
  
  // Actualizar si está vacío o expirado
  if (!cache.data || elapsed >= CACHE_DURATION_MS) {
    await refreshCache();
    return { data: cache.data, timestamp: cache.timestamp, error: cache.error, fromCache: false };
  }
  
  return { data: cache.data, timestamp: cache.timestamp, error: cache.error, fromCache: true };
}

// Middleware CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Endpoint principal
app.get('/api/precios', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const result = await getCachedData(forceRefresh);
    
    if (result.error) {
      return res.status(502).json({
        error: result.error,
        timestamp: result.timestamp,
        fromCache: result.fromCache
      });
    }
    
    res.json({
      data: result.data,
      timestamp: result.timestamp,
      fromCache: result.fromCache,
      cacheExpiry: new Date(Date.now() + CACHE_DURATION_MS).toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint de estado del caché
app.get('/api/status', (req, res) => {
  res.json({
    cacheValid: !!cache.data,
    lastUpdate: cache.timestamp ? new Date(cache.timestamp).toISOString() : null,
    cacheAge: cache.timestamp ? Math.round((Date.now() - cache.timestamp) / 1000) : null,
    cacheExpiry: cache.timestamp ? new Date(cache.timestamp + CACHE_DURATION_MS).toISOString() : null,
    error: cache.error
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📊 Portal: http://localhost:${PORT}/index.html`);
  console.log(`🔄 Actualizando datos de MINETUR...\n`);
  refreshCache();
  
  // Actualizar automáticamente cada 6 horas
  setInterval(async () => {
    await refreshCache();
  }, 6 * 60 * 60 * 1000);
});

module.exports = { app, getCachedData, refreshCache, fetchMineturData, CACHE_DURATION_MS };
