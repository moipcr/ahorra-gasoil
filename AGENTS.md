# AGENTS.md

## ⚠️ Prerrequisitos

- **Node.js 18+** es obligatorio. Sin él, no funciona nada.
- `npm install` antes de cualquier operación (server + tests)

## 🏗️ Arquitectura

```
index.html (portal completo: HTML + CSS + JS vanilla)
    │
    fetch → localhost:3000/api/precios
    │
server.js (Express proxy) ──▶ API MINETUR (datos.gob.es)
    │       Caché 12h en memoria
    │
    ◀── localStorage (caché navegador 12h)
```

**Flujo crítico:**
1. `server.js` hace proxy CORS a la API de MINETUR (no se puede llamar desde el navegador directamente)
2. Datos se cachéan 12h en memoria del servidor + localStorage del navegador
3. Auto-refresh programado cada 6h + refresh a medianoche
4. `index.html` es el único archivo público — todo embebido (sin build)

## 📁 Estructura

```
server.js          → Servidor Express + caché + proxy
index.html         → Portal completo (Leaflet CDN, CSS embebido, JS embebido)
package.json       → dependencias: express, jest
tests/
  cache.test.js    → Tests del módulo de caché
  data-processing.test.js → Tests de lógica de datos (procesamiento, colores)
jest.config.js     → Configuración Jest
README.md          → Documentación de uso
```

## 🔑 Comandos clave

```bash
npm start          # Iniciar servidor (localhost:3000)
npm test           # Ejecutar suite de pruebas
npm run test:coverage  # Tests con cobertura
npm run test:watch   # Watch mode
```

## 🗺️ Mapa y UI

- **Leaflet** (CDN) con capa CartoDB Dark Matter
- Marcadores de provincia: círculos coloreados (verde=barato, rojo=caro)
- Marcadores de estación: circleMarkers al seleccionar provincia
- Sidebar con tabla de provincias ordenada por precio promedio
- Top 3 destacado con 🥇 dorado, 🥈 plateado, 🥉 bronce
- **No hay build step** — todo es HTML/CSS/JS vanilla

## ⚡ Quirks y gotchas

1. **API MINETUR no tiene CORS** → obligatorio usar `server.js` como proxy
2. **Datos por estación, no por provincia** → el código calcula promedios
3. **Precios en formato CSV con coma decimal** → `parseFloat()` maneja `1,450` → `1.450`
4. **Provicia con acentos** → `PROVINCIA` en mayúsculas sin acentos en la API
5. **Ceuta y Melilla** → autónomas, no provincias; tienen coordenadas propias
6. **Caché dual** → servidor (12h) + navegador (12h). Si ambas expiran, se llama a MINETUR
7. **Auto-refresh** → se programa a medianoche local del usuario

## 🧪 Tests

- Jest con `testEnvironment: 'node'`
- `cache.test.js` → prueba el módulo de caché (requiere mock de `https.get`)
- `data-processing.test.js` → prueba lógica de cliente (agregación, colores, ordenación)
- **No requiere servicios externos** — todo mockeado

## 📦 Dependencias

| Dependencia | Uso |
|-------------|-----|
| express | Servidor HTTP + middleware CORS |
| jest | Tests unitarios |

**Sin frameworks frontend** — Leaflet se carga por CDN en `index.html`.

## 🌐 Datos

- **Fuente:** MINETUR — Estaciones Terrestres
- **URL:** `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/`
- **Campos clave:** `Precio Gasolina 95 E5`, `Precio Gasoleo A`, `Provincia`, `Latitud`, `Longitud (WGS84)`
- **Frecuencia:** Datos del día actual exclusivamente (sin historial)
- **Actualización:** Automática cada 12h en servidor, medianoche en cliente
