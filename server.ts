import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import type {
  AgencyStatus,
  RegionScope,
  SeismicAgency,
  SeismicEvent,
  SeismicFeedResponse,
} from './src/types/seismic.ts';
import {
  type EmscFeature,
  type UsgsFeature,
  parseEmscFeatures,
  parseIgcUpHtml,
  parseUsgsFeatures,
} from './src/utils/seismicClassifier.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const feedCache = new Map<string, CacheEntry<SeismicFeedResponse>>();
const CACHE_TTL_MS = 45_000;

async function fetchIgcUpEvents(): Promise<{ events: SeismicEvent[]; status: AgencyStatus }> {
  const fetchedAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8500);
    const res = await fetch('https://sismosgeociencias.up.ac.pa/', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SismoAlerta-Monitor/1.0 (+https://geociencias.up.ac.pa/)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = await res.text();
    const events = parseIgcUpHtml(html);

    return {
      events,
      status: {
        source: 'IGC-UP',
        ok: true,
        count: events.length,
        lastUpdated: fetchedAt,
      },
    };
  } catch (err) {
    return {
      events: [],
      status: {
        source: 'IGC-UP',
        ok: false,
        count: 0,
        lastUpdated: fetchedAt,
        error: err instanceof Error ? err.message : 'Error de conexión con IGC-UP',
      },
    };
  }
}

async function fetchUsgsEvents(
  startIso: string,
  endIso: string,
  minMag: number,
  scope: RegionScope
): Promise<{ events: SeismicEvent[]; status: AgencyStatus }> {
  const fetchedAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    const params = new URLSearchParams({
      format: 'geojson',
      starttime: startIso,
      endtime: endIso,
      orderby: 'time',
      limit: '250',
    });

    if (scope === 'panama') {
      params.set('minlatitude', '4.0');
      params.set('maxlatitude', '14.5');
      params.set('minlongitude', '-87.5');
      params.set('maxlongitude', '-74.5');
      if (minMag > 0) params.set('minmagnitude', String(minMag));
    } else {
      params.set('minmagnitude', String(Math.max(minMag, 2.5)));
    }

    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?${params.toString()}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SismoAlerta-Monitor/1.0' },
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const json = (await res.json()) as { features?: UsgsFeature[] };
    const events = parseUsgsFeatures(json.features || []);

    return {
      events,
      status: {
        source: 'USGS',
        ok: true,
        count: events.length,
        lastUpdated: fetchedAt,
      },
    };
  } catch (err) {
    return {
      events: [],
      status: {
        source: 'USGS',
        ok: false,
        count: 0,
        lastUpdated: fetchedAt,
        error: err instanceof Error ? err.message : 'Error de conexión con USGS',
      },
    };
  }
}

async function fetchEmscEvents(
  startIso: string,
  endIso: string,
  minMag: number,
  scope: RegionScope
): Promise<{ events: SeismicEvent[]; status: AgencyStatus }> {
  const fetchedAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    const params = new URLSearchParams({
      format: 'json',
      start: startIso,
      end: endIso,
      limit: '200',
    });

    if (scope === 'panama') {
      params.set('minlat', '4.0');
      params.set('maxlat', '14.5');
      params.set('minlon', '-87.5');
      params.set('maxlon', '-74.5');
      if (minMag > 0) params.set('minmag', String(minMag));
    } else {
      params.set('minmag', String(Math.max(minMag, 3.0)));
    }

    const url = `https://www.seismicportal.eu/fdsnws/event/1/query?${params.toString()}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SismoAlerta-Monitor/1.0' },
    });
    clearTimeout(timer);

    if (res.status === 204) {
      return {
        events: [],
        status: {
          source: 'EMSC',
          ok: true,
          count: 0,
          lastUpdated: fetchedAt,
        },
      };
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const json = (await res.json()) as { features?: EmscFeature[] };
    const events = parseEmscFeatures(json.features || []);

    return {
      events,
      status: {
        source: 'EMSC',
        ok: true,
        count: events.length,
        lastUpdated: fetchedAt,
      },
    };
  } catch (err) {
    return {
      events: [],
      status: {
        source: 'EMSC',
        ok: false,
        count: 0,
        lastUpdated: fetchedAt,
        error: err instanceof Error ? err.message : 'Error de conexión con EMSC',
      },
    };
  }
}

const ALLOWED_ESRI_LAYERS: Record<string, string> = {
  World_Imagery: 'World_Imagery',
  World_Topo_Map: 'World_Topo_Map',
  World_Dark_Gray_Base: 'Canvas/World_Dark_Gray_Base',
  World_Light_Gray_Base: 'Canvas/World_Light_Gray_Base',
  World_Ocean_Base: 'Ocean/World_Ocean_Base',
  World_Street_Map: 'World_Street_Map',
};

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Real-time and historical multi-agency seismic events endpoint
  app.get('/api/seismic/events', async (req: Request, res: Response) => {
    try {
      const scopeParam = req.query.scope === 'global' ? 'global' : 'panama';
      const minMagParam = Math.max(0, Math.min(10, Number(req.query.minMag) || 0));
      const daysParam = Math.max(1, Math.min(365, Number(req.query.days) || 7));

      const sourcesRaw = typeof req.query.sources === 'string' ? req.query.sources : 'IGC-UP,USGS,EMSC';
      const requestedSources = new Set<SeismicAgency>(
        sourcesRaw
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter((s): s is SeismicAgency => s === 'IGC-UP' || s === 'USGS' || s === 'EMSC')
      );

      let startDateMs = Date.now() - daysParam * 24 * 60 * 60 * 1000;
      let endDateMs = Date.now();

      if (typeof req.query.startDate === 'string' && req.query.startDate) {
        const parsed = Date.parse(`${req.query.startDate}T00:00:00.000Z`);
        if (!Number.isNaN(parsed)) startDateMs = parsed;
      }
      if (typeof req.query.endDate === 'string' && req.query.endDate) {
        const parsed = Date.parse(`${req.query.endDate}T23:59:59.999Z`);
        if (!Number.isNaN(parsed)) endDateMs = parsed;
      }

      if (endDateMs < startDateMs) {
        [startDateMs, endDateMs] = [endDateMs, startDateMs];
      }

      const startIso = new Date(startDateMs).toISOString();
      const endIso = new Date(endDateMs).toISOString();

      const cacheKey = `${scopeParam}|${minMagParam}|${startIso.slice(0, 13)}|${endIso.slice(
        0,
        13
      )}|${Array.from(requestedSources).sort().join(',')}`;

      const bypassCache = req.query.refresh === '1';
      const cached = feedCache.get(cacheKey);
      if (!bypassCache && cached && cached.expiresAt > Date.now()) {
        res.json(cached.data);
        return;
      }

      const tasks: Array<Promise<{ events: SeismicEvent[]; status: AgencyStatus }>> = [];
      if (requestedSources.has('IGC-UP')) {
        tasks.push(fetchIgcUpEvents());
      }
      if (requestedSources.has('USGS')) {
        tasks.push(fetchUsgsEvents(startIso, endIso, minMagParam, scopeParam));
      }
      if (requestedSources.has('EMSC')) {
        tasks.push(fetchEmscEvents(startIso, endIso, minMagParam, scopeParam));
      }

      const results = await Promise.all(tasks);
      const agencyStatuses = results.map((r) => r.status);
      let allEvents = results.flatMap((r) => r.events);

      // Apply date/mag filter uniformly (especially for IGC-UP which returns 7 days)
      allEvents = allEvents.filter(
        (ev) =>
          ev.magnitude >= minMagParam &&
          ev.timestamp >= startDateMs &&
          ev.timestamp <= endDateMs + 86_400_000
      );

      // Sort newest first
      allEvents.sort((a, b) => b.timestamp - a.timestamp);

      const payload: SeismicFeedResponse = {
        events: allEvents,
        agencyStatuses,
        fetchedAt: Date.now(),
      };

      feedCache.set(cacheKey, { data: payload, expiresAt: Date.now() + CACHE_TTL_MS });
      res.json(payload);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Error interno consultando sismos',
      });
    }
  });

  // CORS-safe Esri ArcGIS tile proxy for 4:5 canvas and PDF snapshot generation
  app.get('/api/esri-tile/:layer/:z/:y/:x', async (req: Request, res: Response) => {
    const layerKey = String(req.params.layer);
    const servicePath = ALLOWED_ESRI_LAYERS[layerKey];
    const z = Number(req.params.z);
    const y = Number(req.params.y);
    const x = Number(req.params.x);

    if (
      !servicePath ||
      !Number.isInteger(z) ||
      !Number.isInteger(y) ||
      !Number.isInteger(x) ||
      z < 0 ||
      z > 18 ||
      x < 0 ||
      y < 0
    ) {
      res.status(400).send('Parámetros de tile inválidos');
      return;
    }

    try {
      const tileUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/${servicePath}/MapServer/tile/${z}/${y}/${x}`;
      const upstream = await fetch(tileUrl, {
        headers: { 'User-Agent': 'SismoAlerta-Monitor/1.0' },
      });
      if (!upstream.ok) {
        res.status(upstream.status).send('Tile no disponible');
        return;
      }
      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      const arrayBuf = await upstream.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(Buffer.from(arrayBuf));
    } catch {
      res.status(502).send('Error al obtener capa Esri');
    }
  });

  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.npm_lifecycle_event === 'start' ||
    process.argv.includes('--prod');

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      app.get('*', (_req: Request, res: Response) => {
        res.status(503).send('Aplicación no compilada. Ejecute "npm run build" primero.');
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GeoAlert-pa server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
