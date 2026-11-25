# GeoAlert-pa — Monitor Sísmico (IGC-UP · USGS · EMSC)

Aplicación web full-stack en tiempo real para el monitoreo de alertas, avisos, notificaciones y boletines sísmicos emitidos por el **Instituto de Geociencias de la Universidad de Panamá (IGC-UP)**, el **USGS** y el **EMSC**.

## Características principales

- **Fuentes en tiempo real**: Sincronización directa vía backend proxy (`/api/seismic/events`) con IGC-UP, USGS y EMSC.
- **Mapa interactivo con capas Esri**: Satélite (*World Imagery*), Topográfico, Gris Oscuro, Gris Claro, Batimetría/Océanos y Calles, además de etiquetas de referencia y límites de placas tectónicas.
- **Notificaciones visuales y auditivas**: Tonos calibrados por nivel de severidad mediante Web Audio API, lectura opcional por voz en español y notificaciones visuales emergentes.
- **Generador de Tarjeta 4:5 (1080 × 1350 px)**: Composición gráfica descargable en PNG con mapa Esri centrado en el epicentro.
- **Modos de tema**: Claro, Oscuro y Sistema.
- **Historial detallado y exportación**: Filtros por fecha, región, agencia, magnitud y severidad de riesgo, con exportación en **PDF** e **imagen PNG**.
- **Opciones para compartir**: En listados, panel de detalle y popups del mapa (copiar resumen, compartir nativo, WhatsApp, Telegram, X y Tarjeta 4:5).

---

## Requisitos previos

- **Node.js `>= 22.0.0`** (recomendado `v22 LTS`, requerido para ejecutar `node server.ts` de forma nativa sin pasos adicionales)
- **npm** (`>= 10`) o **Docker**

---

## Ejecución local

```bash
# 1. Instalar dependencias
npm install

# 2. Modo desarrollo (Express + Vite HMR middlewares en puerto 3000)
npm run dev

# 3. Compilar para producción y ejecutar
npm run build
npm start
```

La aplicación quedará disponible en `http://localhost:3000` (o el puerto definido en la variable de entorno `PORT`).

---

## Despliegue desde GitHub

### 1. Subir el proyecto a GitHub

```bash
git init
git add .
git commit -m "GeoAlert-pa: versión lista para producción"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/geoalert-pa.git
git push -u origin main
```

---

### Opción A — Despliegue en GitHub Pages (`https://TU_USUARIO.github.io/sismos-pa/` o dominio propio)

El proyecto incluye el workflow `.github/workflows/deploy-pages.yml` y configuración de rutas relativas (`base: './'` en `vite.config.ts`) para subdirectorios como `/sismos-pa/`:

1. En tu repositorio de GitHub ve a **Settings → Pages**.
2. En **Build and deployment → Source**, selecciona **GitHub Actions** (no selecciones *Deploy from a branch*, ya que serviría el `index.html` sin compilar y mostraría la página en blanco).
3. Al hacer `push` a `main`, el workflow ejecutará `npm run build` y publicará la carpeta `dist/`.
4. En modo estático (GitHub Pages), USGS, EMSC y las capas/tarjetas de Esri funcionan directamente desde el navegador. La fuente IGC-UP requiere el backend proxy Node/Express (Opciones B–D).

---

### Opción B — Despliegue en Render (1 clic con `render.yaml`)

1. Inicia sesión en [Render](https://render.com) y elige **New → Blueprint** (o **New → Web Service**).
2. Conecta tu repositorio de GitHub `geoalert-pa`.
3. Render detectará automáticamente `render.yaml` con:
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
   - **Node Version**: `22.23.5`
4. Haz clic en **Apply** / **Deploy**. No requiere claves API privadas para los feeds públicos de IGC-UP, USGS, EMSC ni capas base de Esri.

---

### Opción C — Despliegue en Railway

1. En [Railway](https://railway.app), selecciona **New Project → Deploy from GitHub repo**.
2. Selecciona el repositorio `geoalert-pa`.
3. Railway detectará el `Dockerfile` automáticamente (o puedes usar Railpack/Nixpacks con Node 22):
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm start`
4. En **Settings → Networking**, genera el dominio público (`Generate Domain`). Railway inyectará automáticamente la variable `PORT`.

---

### Opción D — Despliegue con Docker (Google Cloud Run, Fly.io, VPS, Coolify, Dokploy)

El repositorio incluye un `Dockerfile` multi-arquitectura basado en `node:22-alpine`:

```bash
# Construir imagen
docker build -t geoalert-pa .

# Ejecutar contenedor
docker run -d -p 3000:3000 --name geoalert-pa geoalert-pa
```

#### Google Cloud Run directo desde código fuente / GitHub:
```bash
gcloud run deploy geoalert-pa \
  --source . \
  --platform managed \
  --region us-east1 \
  --allow-unauthenticated \
  --port 3000
```

---

## Variables de entorno

| Variable | Requerida | Valor por defecto | Descripción |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `3000` | Puerto HTTP en el que escucha Express (inyectado automáticamente por Render/Railway/Cloud Run). |
| `NODE_ENV` | No | `production` (en `npm start`) | Define si Express sirve los archivos compilados de `dist/` o el middleware de desarrollo de Vite. |

---

## Verificación rápida post-despliegue

Una vez desplegada la aplicación, comprueba el endpoint de salud:

```bash
curl https://TU-DOMINIO/api/health
# Respuesta esperada: {"status":"ok","timestamp":...}
```
