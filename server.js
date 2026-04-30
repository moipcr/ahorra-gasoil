const express = require('express');
const https = require('https');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 8080;
const MINETUR_API = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 horas

// ============================================================
// BASE DE DATOS SQLITE
// ============================================================
const DB_PATH = path.join(__dirname, 'data', 'precios.db');
const fs = require('fs');

// Asegurar que el directorio data existe
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Crear tablas si no existen
db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    fecha_completa TEXT,
    estaciones_count INTEGER,
    creado_en TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS snapshot_precios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL,
    provincia TEXT NOT NULL,
    avg_gasolina95 REAL,
    avg_diesel REAL,
    count INTEGER,
    FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS estaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    provincia TEXT NOT NULL,
    localidad TEXT,
    marca TEXT,
    direccion TEXT,
    lat REAL,
    lng REAL,
    precio_gasolina95 REAL,
    precio_diesel REAL,
    FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_snapshot_precios_provincia ON snapshot_precios(snapshot_id, provincia);
  CREATE INDEX IF NOT EXISTS idx_estaciones_fecha ON estaciones(fecha);
  CREATE INDEX IF NOT EXISTS idx_estaciones_provincia ON estaciones(provincia);
  CREATE INDEX IF NOT EXISTS idx_estaciones_fecha_provincia ON estaciones(fecha, provincia);
  CREATE INDEX IF NOT EXISTS idx_estaciones_snapshot ON estaciones(snapshot_id);
  CREATE INDEX IF NOT EXISTS idx_snapshot_precios_snapshot ON snapshot_precios(snapshot_id);
  CREATE INDEX IF NOT EXISTS idx_snapshots_fecha ON snapshots(fecha);
`);

console.log('[DB] SQLite inicializado:', DB_PATH);

// ============================================================
// ESTADO DEL CACHÉ
// ============================================================
let cache = {
  data: null,
  timestamp: null,
  error: null,
  lastDataHash: null  // Hash para detectar cambios en los datos
};

/**
 * Genera un hash simple del data para detectar cambios
 */
function generateDataHash(data) {
  if (!data || !data.ListaEESSPrecio) return null;
  // Usar Fecha + longitud + suma de precios como hash
  const estaciones = data.ListaEESSPrecio;
  let sum = 0;
  for (const est of estaciones) {
    const gas = est['Precio Gasolina 95 E5'] || '0';
    const diesel = est['Precio Gasoleo A'] || '0';
    sum += gas.replace(',', '.') * 1000 + diesel.replace(',', '.') * 1000;
  }
  return `${data.Fecha}|${estaciones.length}|${Math.round(sum)}`;
}

// ============================================================
// FUNCIONES DE BASE DE DATOS
// ============================================================

/**
 * Guarda un snapshot de precios en la BD
 */
let lastCleanup = 0;

function guardarSnapshot(data) {
  // Validar estructura del response
  if (!data) {
    console.error('[BD] guardarSnapshot: data es null/undefined');
    return;
  }
  
  if (!data.Fecha) {
    console.error('[BD] guardarSnapshot: data.Fecha no existe en el response de MINETUR. Campos disponibles:', Object.keys(data));
    return;
  }
  
  if (!Array.isArray(data.ListaEESSPrecio) || data.ListaEESSPrecio.length === 0) {
    console.error('[BD] guardarSnapshot: ListaEESSPrecio no es un array válido o está vacío:', data.ListaEESSPrecio);
    return;
  }

  try {
    let fecha = data.Fecha;
    // Separar fecha y hora (formato: DD/MM/YYYY HH:MM:SS)
    let fechaStr = fecha;
    let horaStr = '00:00:00';
    if (fecha && fecha.includes(' ')) {
      const parts = fecha.split(' ');
      fechaStr = parts[0];
      horaStr = parts[1] || '00:00:00';
    }
    
    // Normalizar formato DD/MM/YYYY → YYYY-MM-DD
    if (fechaStr && fechaStr.includes('/')) {
      const [day, month, year] = fechaStr.split('/');
      fecha = `${year}-${month}-${day}`;
    }
    
    // Construir fecha_completa válida ISO 8601
    let fechaCompleta = new Date().toISOString();
    if (fechaStr && fechaStr.includes('/')) {
      const [day, month, year] = fechaStr.split('/');
      fechaCompleta = `${year}-${month}-${day}T${horaStr}Z`;
    }

    // Verificar si ya existe un snapshot para esta fecha
    const existingSnapshot = db.prepare('SELECT id FROM snapshots WHERE fecha = ?').get(fecha);
    if (existingSnapshot) {
      // Verificar si los datos son idénticos (comparar hash)
      const newHash = generateDataHash(data);
      if (newHash === cache.lastDataHash) {
        console.log('[BD] Snapshot sin cambios para', fecha, '- omitiendo guardado');
        return;
      }
      
      // Datos han cambiado: eliminar snapshot anterior
      console.log('[BD] Datos actualizados para', fecha, '- actualizando snapshot existente');
      db.prepare('DELETE FROM snapshot_precios WHERE snapshot_id = ?').run(existingSnapshot.id);
      db.prepare('DELETE FROM estaciones WHERE snapshot_id = ?').run(existingSnapshot.id);
      db.prepare('DELETE FROM snapshots WHERE fecha = ?').run(fecha);
    }

    // Insertar nuevo snapshot
    const result = db.prepare('INSERT INTO snapshots (fecha, fecha_completa, estaciones_count) VALUES (?, ?, ?)').run(fecha, fechaCompleta, data.ListaEESSPrecio?.length || 0);
    const snapshotId = result.lastInsertRowid;

    // Agrupar precios por provincia
    const provinceMap = new Map();
    const estaciones = data.ListaEESSPrecio;

    estaciones.forEach(est => {
      const prov = est.Provincia?.trim();
      if (!prov) return;

      if (!provinceMap.has(prov)) {
        provinceMap.set(prov, { gas95: [], diesel: [] });
      }

      const gas95 = parseFloat((est['Precio Gasolina 95 E5'] || '').replace(',', '.'));
      const diesel = parseFloat((est['Precio Gasoleo A'] || '').replace(',', '.'));

      if (!isNaN(gas95)) provinceMap.get(prov).gas95.push(gas95);
      if (!isNaN(diesel)) provinceMap.get(prov).diesel.push(diesel);
    });

    // Guardar promedios por provincia (batch con transaction)
    const insertPrecio = db.prepare(`
      INSERT INTO snapshot_precios (snapshot_id, provincia, avg_gasolina95, avg_diesel, count)
      VALUES (?, ?, ?, ?, ?)
    `);

    const precioRows = [];
    provinceMap.forEach((val, prov) => {
      const avgGas = val.gas95.length > 0 ? val.gas95.reduce((a, b) => a + b, 0) / val.gas95.length : null;
      const avgDiesel = val.diesel.length > 0 ? val.diesel.reduce((a, b) => a + b, 0) / val.diesel.length : null;
      precioRows.push([snapshotId, prov, avgGas, avgDiesel, val.gas95.length + val.diesel.length]);
    });

    // Ejecutar en batch dentro de una transacción
    const insertPrecioBatch = db.transaction((rows) => {
      for (const row of rows) {
        insertPrecio.run(row);
      }
    });
    insertPrecioBatch(precioRows);

    // Guardar estaciones individuales (batch con transaction)
    const insertEstacion = db.prepare(`
      INSERT INTO estaciones (snapshot_id, fecha, provincia, localidad, marca, direccion, lat, lng, precio_gasolina95, precio_diesel)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const estacionRows = estaciones.map(est => {
      const prov = est.Provincia?.trim();
      if (!prov) return null;

      const gas95 = parseFloat((est['Precio Gasolina 95 E5'] || '').replace(',', '.'));
      const diesel = parseFloat((est['Precio Gasoleo A'] || '').replace(',', '.'));

      return [
        snapshotId,
        fecha,
        prov,
        est.Localidad || '',
        est['Rótulo'] || 'Sin marca',
        est.Direccion || '',
        parseFloat(est.Latitud) || 0,
        parseFloat(est['Longitud (WGS84)']) || 0,
        isNaN(gas95) ? null : gas95,
        isNaN(diesel) ? null : diesel
      ];
    }).filter(Boolean);

    // Ejecutar en batch dentro de una transacción
    const insertEstacionBatch = db.transaction((rows) => {
      for (const row of rows) {
        insertEstacion.run(row);
      }
    });
    insertEstacionBatch(estacionRows);

    console.log(`[DB] Snapshot guardado: ${fecha} - ${estaciones.length} estaciones`);

    // Limpiar snapshots antiguos (mantener últimos 30 días) - throttle cada 5 min
    const now = Date.now();
    if (now - lastCleanup > 5 * 60 * 1000) {
      lastCleanup = now;
      const cleanup = db.prepare("DELETE FROM snapshots WHERE fecha < date('now', '-30 days')");
      const result = cleanup.run();
      if (result.changes > 0) {
        console.log(`[DB] Limpieza: eliminados ${result.changes} snapshots antiguos`);
      }
    }

    // Guardar hash para detección de cambios
    cache.lastDataHash = generateDataHash(data);
    console.log(`[DB] Snapshot guardado: ${fecha} - ${estaciones.length} estaciones`);

  } catch (err) {
    console.error('[BD] Error guardando snapshot:', err.message);
  }
}

/**
 * Obtiene datos históricos (optimizado: una sola query con JOIN)
 */
function getHistorico(provincia = null, dias = 7) {
  const recent = db.prepare(`
    SELECT s.fecha, s.fecha_completa, s.estaciones_count
    FROM snapshots s
    WHERE s.fecha >= date('now', '-'+?||' days')
    ORDER BY s.fecha DESC
  `).all(dias);

  let promedios = [];

  if (provincia) {
    // Una sola query con JOIN para todos los días
    promedios = db.prepare(`
      SELECT s.fecha, sp.avg_gasolina95, sp.avg_diesel
      FROM snapshot_precios sp
      JOIN snapshots s ON sp.snapshot_id = s.id
      WHERE sp.provincia = ?
        AND s.fecha >= date('now', '-'+?||' days')
      ORDER BY s.fecha DESC
    `).all(provincia, dias);
  } else {
    // Una sola query con JOIN y GROUP BY para promedio nacional
    promedios = db.prepare(`
      SELECT s.fecha,
             AVG(sp.avg_gasolina95) as avg_gas,
             AVG(sp.avg_diesel) as avg_diesel
      FROM snapshot_precios sp
      JOIN snapshots s ON sp.snapshot_id = s.id
      WHERE s.fecha >= date('now', '-'+?||' days')
      GROUP BY s.fecha
      ORDER BY s.fecha DESC
    `).all(dias);
  }

  const totalDias = promedios.length;

  return {
    historico: recent,
    recent: recent,
    promedios: promedios,
    totalDias: totalDias
  };
}

/**
 * Obtiene top 10 marcas por provincia
 */
function getTopMarcasPorProvincia(provincia = null) {
  let marcas;

  if (provincia) {
    marcas = db.prepare(`
      SELECT marca,
             AVG(precio_gasolina95) as avg_gasolina95,
             AVG(precio_diesel) as avg_diesel,
             COUNT(*) as count
      FROM estaciones
      WHERE provincia = ?
        AND precio_gasolina95 IS NOT NULL
      GROUP BY marca
      ORDER BY avg_gasolina95 ASC
      LIMIT 10
    `).all(provincia);
  } else {
    // Top 10 marcas nacional (último día) - single query with subquery
    marcas = db.prepare(`
      SELECT marca,
             AVG(precio_gasolina95) as avg_gasolina95,
             AVG(precio_diesel) as avg_diesel,
             COUNT(*) as count
      FROM estaciones
      WHERE snapshot_id = (SELECT id FROM snapshots ORDER BY fecha DESC LIMIT 1)
        AND precio_gasolina95 IS NOT NULL
      GROUP BY marca
      ORDER BY avg_gasolina95 ASC
      LIMIT 10
    `).all();
  }

  return marcas.map(m => ({
    nombre: m.marca,
    avgGasolina95: m.avg_gasolina95,
    avgDieselA: m.avg_diesel,
    count: m.count
  }));
}

/**
 * Obtiene historial de una provincia concreta
 */
function getHistoricoPorProvincia(provincia) {
  return db.prepare(`
    SELECT s.fecha, sp.avg_gasolina95, sp.avg_diesel
    FROM snapshot_precios sp
    JOIN snapshots s ON sp.snapshot_id = s.id
    WHERE sp.provincia = ?
      AND s.fecha >= date('now', '-30 days')
    ORDER BY s.fecha DESC
  `).all(provincia);
}

// ============================================================
// FUNCIONES DE API MINETUR
// ============================================================

/**
 * Obtiene datos de la API de MINETUR
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
 */
async function refreshCache() {
  try {
    console.log('[Cache] Actualizando datos desde MINETUR...');
    const data = await fetchMineturData();
    cache.data = data;
    cache.timestamp = Date.now();
    cache.error = null;
    console.log(`[Cache] Datos actualizados: ${data.ListaEESSPrecio?.length || 0} estaciones`);

    // Guardar en BD solo si los datos han cambiado
    guardarSnapshot(data);
    return { data, timestamp: cache.timestamp, error: null };
  } catch (err) {
    console.error('[Cache] Error actualizando:', err.message);
    cache.error = err.message;
    return { data: null, timestamp: cache.timestamp, error: err.message };
  }
}

/**
 * Obtiene datos del caché o los actualiza si es necesario
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

// ============================================================
// MIDDLEWARE Y RUTAS
// ============================================================

// Middleware CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname)));

// Ruta raíz → servir index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Endpoint principal - precios actuales
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

// Endpoint - estado del caché
app.get('/api/status', (req, res) => {
  res.json({
    cacheValid: !!cache.data,
    lastUpdate: cache.timestamp ? new Date(cache.timestamp).toISOString() : null,
    cacheAge: cache.timestamp ? Math.round((Date.now() - cache.timestamp) / 1000) : null,
    cacheExpiry: cache.timestamp ? new Date(cache.timestamp + CACHE_DURATION_MS).toISOString() : null,
    error: cache.error
  });
});

// Endpoint - datos históricos
app.get('/api/historico', (req, res) => {
  try {
    const provincia = req.query.provincia || null;
    const dias = parseInt(req.query.dias) || 7;

    const result = getHistorico(provincia, dias);
    
    // Verificar si hay datos en la BD
    const snapshotCount = db.prepare('SELECT COUNT(*) as count FROM snapshots').get();
    if (snapshotCount.count === 0) {
      return res.status(503).json({ 
        error: 'Base de datos vacía. No hay datos históricos disponibles.',
        message: 'Los datos se guardarán automáticamente cuando se actualicen los precios.',
        totalDias: 0,
        promedios: [],
        historico: []
      });
    }
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint - historial detallado por provincia
app.get('/api/historico/provincia', (req, res) => {
  try {
    const provincia = req.query.provincia;
    if (!provincia) {
      return res.status(400).json({ error: 'Falta parámetro provincia' });
    }

    const historico = getHistoricoPorProvincia(provincia);
    res.json({ provincia, historico });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint - top marcas por provincia
app.get('/api/marcas', (req, res) => {
  try {
    const provincia = req.query.provincia || null;
    const marcas = getTopMarcasPorProvincia(provincia);
    res.json({ marcas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint - info de la BD
app.get('/api/db/info', (req, res) => {
  try {
    const totalDias = db.prepare('SELECT COUNT(*) as count FROM snapshots').get().count;
    const totalEstaciones = db.prepare('SELECT COUNT(*) as count FROM estaciones').get().count;
    const ultimaFecha = db.prepare("SELECT fecha FROM snapshots ORDER BY fecha DESC LIMIT 1").get();

    res.json({
      totalDias,
      totalEstaciones,
      ultimaFecha: ultimaFecha?.fecha || null,
      dbPath: DB_PATH
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = { app, getCachedData, refreshCache, fetchMineturData, CACHE_DURATION_MS, db, guardarSnapshot, getHistorico, getTopMarcasPorProvincia, getHistoricoPorProvincia };

// ============================================================
// INICIAR SERVIDOR (solo si se ejecuta directamente)
// ============================================================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📊 Portal: http://localhost:${PORT}/`);
    console.log(`🔄 Actualizando datos de MINETUR...\n`);
    
    // Actualización de datos asíncrona (no bloquea el servidor)
    refreshCache().catch(err => {
      console.error('[Cache] Error en refresh inicial:', err.message);
    });

    // Actualizar automáticamente cada 6 horas
    setInterval(async () => {
      await refreshCache();
    }, 6 * 60 * 60 * 1000);
  });
}
