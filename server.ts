import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import type {
  AgencyStatus,
  BulletinType,
  EventReviewStatus,
  RegionCategory,
  RegionScope,
  SeismicAgency,
  SeismicEvent,
  SeismicFeedResponse,
  SeverityLevel,
} from './src/types/seismic.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const feedCache = new Map<string, CacheEntry<SeismicFeedResponse>>();
const CACHE_TTL_MS = 45_000;

function classifyRegion(lat: number, lon: number, place: string): RegionCategory {
  const lower = place.toLowerCase();

  if (
    lower.includes('frontera panamá') ||
    lower.includes('panama-costa rica') ||
    lower.includes('panamá-costa rica') ||
    lower.includes('puerto armuelles') ||
    lower.includes('río sereno') ||
    lower.includes('rio sereno') ||
    lower.includes('paso canoas') ||
    (lat >= 7.8 && lat <= 9.6 && lon >= -83.3 && lon <= -82.55)
  ) {
    return 'Frontera Panamá–Costa Rica';
  }

  if (
    lower.includes('panamá') ||
    lower.includes('panama') ||
    lower.includes('tonosí') ||
    lower.includes('tonosi') ||
    lower.includes('coiba') ||
    lower.includes('chiriquí') ||
    lower.includes('chiriqui') ||
    lower.includes('darién') ||
    lower.includes('darien') ||
    lower.includes('azuero') ||
    lower.includes('veraguas') ||
    lower.includes('coclé') ||
    lower.includes('cocle') ||
    lower.includes('bocas del toro') ||
    lower.includes('santiago') ||
    lower.includes('david') ||
    lower.includes('chitré') ||
    lower.includes('pedasí') ||
    lower.includes('jaqué') ||
    lower.includes('la palma') ||
    (lat >= 6.8 && lat <= 9.8 && lon >= -82.9 && lon <= -77.1)
  ) {
    return 'Panamá';
  }

  if (lat >= 6.5 && lat <= 18.6 && lon >= -92.5 && lon <= -76.5) {
    return 'América Central';
  }

  if (lat >= 10.0 && lat <= 24.5 && lon >= -86.0 && lon <= -59.0) {
    return 'Caribe';
  }

  if (lat >= -60.0 && lat <= 15.0 && lon >= -110.0 && lon <= -65.0) {
    return 'Pacífico Este / Sudamérica';
  }

  return 'Global';
}

function classifySeverity(
  magnitude: number,
  depthKm: number,
  tsunamiAlert: boolean,
  pagerAlert: 'green' | 'yellow' | 'orange' | 'red' | null,
  region: RegionCategory
): { severity: SeverityLevel; bulletinType: BulletinType } {
  const isPanamaOrBorder = region === 'Panamá' || region === 'Frontera Panamá–Costa Rica';

  if (
    tsunamiAlert ||
    pagerAlert === 'red' ||
    pagerAlert === 'orange' ||
    magnitude >= 6.0 ||
    (magnitude >= 5.5 && depthKm <= 40)
  ) {
    return { severity: 'CRITICO', bulletinType: 'ALERTA' };
  }

  if (
    pagerAlert === 'yellow' ||
    magnitude >= 5.0 ||
    (isPanamaOrBorder && magnitude >= 4.4 && depthKm <= 35)
  ) {
    return { severity: 'ALTO', bulletinType: 'AVISO' };
  }

  if (magnitude >= 3.5) {
    return { severity: 'MODERADO', bulletinType: 'NOTIFICACION' };
  }

  return { severity: 'BAJO', bulletinType: 'BOLETIN' };
}

function parsePanamaLocalToUtcMs(dateStr: string, timeStr: string): number {
  const dateParts = dateStr.trim().split('-').map(Number);
  if (dateParts.length !== 3 || dateParts.some(Number.isNaN)) {
    return Date.now();
  }
  const [year, month, day] = dateParts;

  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    return Date.UTC(year, month - 1, day, 12, 0, 0);
  }

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const second = parseInt(match[3], 10);
  const meridiem = match[4].toUpperCase();

  if (meridiem === 'AM') {
    if (hour === 12) hour = 0;
  } else if (meridiem === 'PM') {
    if (hour !== 12) hour += 12;
  }

  // Panama is UTC-5 year-round (America/Panama)
  return Date.UTC(year, month - 1, day, hour + 5, minute, second);
}

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
    const linkRegex = /href="(ultimosismo\.html\?[^"]+)"/gi;
    const seenKeys = new Set<string>();
    const events: SeismicEvent[] = [];

    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null) {
      const rawUrl = match[1].replace(/&amp;/g, '&');
      const queryPart = rawUrl.split('?')[1] || '';
      const params = new URLSearchParams(queryPart);

      const lat = parseFloat(params.get('lt') || '');
      const lon = parseFloat(params.get('ln') || '');
      const mag = parseFloat(params.get('m') || '');
      const depthRaw = params.get('p') || '0';
      const depthKm = parseFloat(depthRaw.replace(/[^\d.]/g, '')) || 0;
      const dateStr = (params.get('f') || '').trim();
      const timeStr = (params.get('h') || '').trim();
      const estadoRaw = (params.get('e') || 'REVISADO').trim().toUpperCase();
      const placeRaw = (params.get('r') || 'Panamá').replace(/\s+/g, ' ').trim();

      if (Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(mag)) {
        continue;
      }

      const dedupKey = `${dateStr}|${timeStr}|${lat.toFixed(4)}|${lon.toFixed(4)}|${mag.toFixed(1)}`;
      if (seenKeys.has(dedupKey)) {
        continue;
      }
      seenKeys.add(dedupKey);

      const timestamp = parsePanamaLocalToUtcMs(dateStr, timeStr);
      const status: EventReviewStatus = estadoRaw.includes('AUTO') ? 'AUTOMATICO' : 'REVISADO';
      const regionCategory = classifyRegion(lat, lon, placeRaw);
      const { severity, bulletinType } = classifySeverity(mag, depthKm, false, null, regionCategory);

      const sourceEventId = `igcup-${dateStr}-${timeStr.replace(/[:\s]/g, '')}-${Math.abs(
        Math.round(lat * 100)
      )}`;

      events.push({
        id: `IGC-UP:${sourceEventId}`,
        source: 'IGC-UP',
        sourceEventId,
        magnitude: Number(mag.toFixed(1)),
        magType: 'ML',
        depthKm: Number(depthKm.toFixed(1)),
        lat: Number(lat.toFixed(4)),
        lon: Number(lon.toFixed(4)),
        place: placeRaw,
        regionCategory,
        timestamp,
        status,
        bulletinType,
        severity,
        tsunamiAlert: false,
        pagerAlert: null,
        mmi: null,
        feltReports: null,
        url: `https://sismosgeociencias.up.ac.pa/${rawUrl}`,
      });
    }

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

interface UsgsFeature {
  id: string;
  geometry?: { coordinates?: [number, number, number] };
  properties?: {
    mag?: number | null;
    magType?: string | null;
    place?: string | null;
    time?: number | null;
    status?: string | null;
    tsunami?: number | null;
    alert?: 'green' | 'yellow' | 'orange' | 'red' | null;
    mmi?: number | null;
    felt?: number | null;
    url?: string | null;
  };
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
    const features = json.features || [];

    const events: SeismicEvent[] = [];
    for (const f of features) {
      const coords = f.geometry?.coordinates;
      const props = f.properties;
      if (!coords || !props || props.mag == null || props.time == null) continue;

      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      const depthKm = Math.max(0, Number(coords[2] ?? 10));
      const mag = Number(props.mag);
      const place = (props.place || 'Ubicación no especificada').trim();
      const tsunamiAlert = props.tsunami === 1;
      const pagerAlert = props.alert ?? null;
      const status: EventReviewStatus =
        props.status === 'reviewed'
          ? 'REVISADO'
          : props.status === 'automatic'
          ? 'AUTOMATICO'
          : 'PRELIMINAR';

      const regionCategory = classifyRegion(lat, lon, place);
      const { severity, bulletinType } = classifySeverity(
        mag,
        depthKm,
        tsunamiAlert,
        pagerAlert,
        regionCategory
      );

      events.push({
        id: `USGS:${f.id}`,
        source: 'USGS',
        sourceEventId: f.id,
        magnitude: Number(mag.toFixed(1)),
        magType: (props.magType || 'Mw').toUpperCase(),
        depthKm: Number(depthKm.toFixed(1)),
        lat: Number(lat.toFixed(4)),
        lon: Number(lon.toFixed(4)),
        place,
        regionCategory,
        timestamp: props.time,
        status,
        bulletinType,
        severity,
        tsunamiAlert,
        pagerAlert,
        mmi: props.mmi != null ? Number(props.mmi.toFixed(1)) : null,
        feltReports: props.felt ?? null,
        url: props.url || `https://earthquake.usgs.gov/earthquakes/eventpage/${f.id}/executive`,
      });
    }

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

interface EmscFeature {
  id: string;
  geometry?: { coordinates?: [number, number, number] };
  properties?: {
    source_id?: string;
    mag?: number | null;
    magtype?: string | null;
    depth?: number | null;
    lat?: number | null;
    lon?: number | null;
    flynn_region?: string | null;
    time?: string | null;
    auth?: string | null;
    unid?: string | null;
  };
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
    const features = json.features || [];

    const events: SeismicEvent[] = [];
    for (const f of features) {
      const props = f.properties;
      const coords = f.geometry?.coordinates;
      if (!props || props.mag == null || !props.time) continue;

      const lon = Number(coords?.[0] ?? props.lon ?? 0);
      const lat = Number(coords?.[1] ?? props.lat ?? 0);
      const rawDepth = props.depth ?? (coords?.[2] != null ? Math.abs(coords[2]) : 10);
      const depthKm = Math.max(0, Number(rawDepth));
      const mag = Number(props.mag);
      const place = (props.flynn_region || 'Región EMSC').trim();
      const timestamp = Date.parse(props.time);
      if (Number.isNaN(timestamp)) continue;

      const regionCategory = classifyRegion(lat, lon, place);
      const { severity, bulletinType } = classifySeverity(mag, depthKm, false, null, regionCategory);
      const unid = props.unid || f.id;
      const status: EventReviewStatus =
        props.auth && props.auth.toUpperCase().includes('EMSC') ? 'REVISADO' : 'PRELIMINAR';

      events.push({
        id: `EMSC:${unid}`,
        source: 'EMSC',
        sourceEventId: unid,
        magnitude: Number(mag.toFixed(1)),
        magType: (props.magtype || 'M').toUpperCase(),
        depthKm: Number(depthKm.toFixed(1)),
        lat: Number(lat.toFixed(4)),
        lon: Number(lon.toFixed(4)),
        place,
        regionCategory,
        timestamp,
        status,
        bulletinType,
        severity,
        tsunamiAlert: false,
        pagerAlert: null,
        mmi: null,
        feltReports: null,
        url: `https://www.seismicportal.eu/eventdetails.html?unid=${encodeURIComponent(unid)}`,
      });
    }

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
