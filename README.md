# ⛽ Top Ahorro Gasolinera

Portal de precios de combustible en España por provincia. Muestra gasolina 95 E5 y gasóleo A con mapa interactivo y tabla de precios.

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

El servidor se ejecutará en `http://localhost:3000`

### Acceder al portal

Abre en tu navegador: **http://localhost:3000/index.html**

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
├── server.js          # Servidor proxy con caché
├── index.html         # Portal principal (HTML + CSS + JS)
├── package.json       # Dependencias y scripts
├── jest.config.js     # Configuración de tests
├── tests/
│   ├── cache.test.js      # Tests del caché
│   └── data-processing.test.js  # Tests de procesamiento
└── README.md
```

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

## 📝 Notas

- Los datos se actualizan automáticamente cada 12 horas
- Auto-refresh a medianoche para datos del nuevo día
- Los datos se almacenan en caché para minimizar llamadas a la API
- El portal funciona con datos del día actual exclusivamente
