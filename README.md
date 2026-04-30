# ⛽ Top Ahorro Gasolinera

Portal de precios de combustible en España por provincia. Muestra gasolina 95 E5 y gasóleo A con mapa interactivo y tabla de precios. Aplicación web creada por un servidor Moisés Martínez Mateu

> **Versión desplegada para probar:** [https://ahorra-gasoil.onrender.com/](https://ahorra-gasoil.onrender.com/)

## 🚀 Instalación

### 1. Instalar Node.js (requerido)

Descarga e instala desde: https://nodejs.org/ (versión 18+ recomendada)

Verificar instalación:
```powershell
node --version
npm --version
```

### 2. Instalar dependencias

```powershell
npm install
```

## ▶️ Ejecución

### Iniciar servidor local

```powershell
npm start
```

El servidor se ejecutará en `http://localhost:8080`

### Acceder al portal

Abre en tu navegador: **http://localhost:8080/**

## 🧪 Tests

```powershell
npm test              # Ejecutar tests
npm run test:watch    # Modo watch
npm run test:coverage # Con cobertura de código
```

## 📊 Características

- **Mapa interactivo** con Leaflet y marcadores coloreados por precio
- **Tabla de provincias** ordenadas de menor a mayor precio
- **Top 3** destacado con dorado 🥇, plateado 🥈 y bronce 🥉
- **Caché de 12 horas** en servidor y navegador
- **Auto-refresh** a medianoche
- **Búsqueda** de provincias
- **Diseño responsive** (escritorio y móvil)
- **Tema oscuro** profesional
- **Gráficas de historial** (7 días / 30 días) con Chart.js
- **Tabla de marcas** top 10 por menor precio
- **Almacenamiento persistente** en SQLite (no se pierde con caché del navegador)

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────┐
│              index.html                     │
│  ┌──────────┐  ┌────────────────────────┐  │
│  │  Mapa    │  │   Panel lateral        │  │
│  │ Leaflet  │  │   Tabla de precios     │  │
│  │ Marcadores│  │   Ordenados por precio │  │
│  │ coloreados│  │   Top 3 destacado      │  │
│  └──────────┘  └────────────────────────┘  │
│  ┌────────────────────────────────────────┐ │
│  │  Barra de búsqueda + Info caché        │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
         │
    fetch local
         ▼
┌──────────────────┐     ┌──────────────────────────┐
│  server.js       │────▶│  API MINETUR             │
│  (Node.js)       │     │  precios_combustible     │
│  Proxy CORS      │     └──────────────────────────┘
│  Caché 12h       │
└──────────────────┘
         │
    localStorage
         ▼
┌──────────────────┐
│  Caché navegador │
│  12 horas TTL    │
└──────────────────┘
```

## 📁 Estructura del proyecto

```
top-ahorro-gasolinera/
├── server.js          # Servidor proxy con caché + SQLite
├── index.html         # Portal principal (HTML + CSS + JS)
├── package.json       # Dependencias y scripts
├── jest.config.js     # Configuración de tests
├── data/
│   └── precios.db     # Base de datos SQLite (historial + precios)
├── tests/
│   ├── cache.test.js      # Tests del caché
│   └── data-processing.test.js  # Tests de procesamiento
└── README.md
```

## 🗄️ Base de datos SQLite

La aplicación utiliza **better-sqlite3** para almacenar datos históricos de forma persistente:

- `snapshots`: Registros diarios con fecha y conteo de estaciones
- `snapshot_precios`: Promedios por provincia por día
- `estaciones`: Datos individuales de cada gasolinera

La BD se crea automáticamente en `data/precios.db` al iniciar el servidor. Se mantiene un máximo de 30 días de historial.

## 🔧 Configuración

| Variable | Valor por defecto | Descripción |
|----------|-------------------|-------------|
| PORT | 3000 | Puerto del servidor |
| CACHE_DURATION_MS | 12h | Duración del caché |

## 📡 Fuente de datos

- **API oficial:** MINETUR (Ministerio para la Transición Ecológica)
- **URL:** `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/`
- **Formato:** JSON
- **Frecuencia:** Actualización diaria automática

## 🔌 Endpoints adicionales

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/historico?dias=7&provincia=MADRID` | Datos históricos de 7 días para una provincia |
| `GET /api/historico?dias=30` | Datos históricos nacionales de 30 días |
| `GET /api/historico/provincia?provincia=MADRID` | Historial detallado de una provincia |
| `GET /api/marcas?provincia=MADRID` | Top 10 marcas por menor precio |
| `GET /api/db/info` | Información de la base de datos |

## 📝 Notas

- Los datos se actualizan automáticamente cada 12 horas
- Auto-refresh a medianoche para datos del nuevo día
- Los datos se almacenan en caché para minimizar llamadas a la API
- El portal funciona con datos del día actual exclusivamente
