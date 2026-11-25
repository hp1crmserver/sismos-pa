import type {
  AgencyStatus,
  RegionScope,
  SeismicAgency,
  SeismicEvent,
  SeismicFeedResponse,
} from '../types/seismic';
import {
  type EmscFeature,
  type UsgsFeature,
  parseEmscFeatures,
  parseIgcUpHtml,
  parseUsgsFeatures,
} from './seismicClassifier';

let backendApiAvailable: boolean | null = null;

export function isBackendProxyAvailable(): boolean {
  return backendApiAvailable !== false;
}

async function fetchUsgsDirect(
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

    const res = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?${params.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { features?: UsgsFeature[] };
    const events = parseUsgsFeatures(json.features || []);

    return {
      events,
      status: { source: 'USGS', ok: true, count: events.length, lastUpdated: fetchedAt },
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

async function fetchEmscDirect(
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

    const res = await fetch(`https://www.seismicportal.eu/fdsnws/event/1/query?${params.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.status === 204) {
      return {
        events: [],
        status: { source: 'EMSC', ok: true, count: 0, lastUpdated: fetchedAt },
      };
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { features?: EmscFeature[] };
    const events = parseEmscFeatures(json.features || []);

    return {
      events,
      status: { source: 'EMSC', ok: true, count: events.length, lastUpdated: fetchedAt },
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

async function fetchIgcUpDirect(): Promise<{ events: SeismicEvent[]; status: AgencyStatus }> {
  const fetchedAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    const res = await fetch('https://sismosgeociencias.up.ac.pa/', {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const events = parseIgcUpHtml(html);

    return {
      events,
      status: { source: 'IGC-UP', ok: true, count: events.length, lastUpdated: fetchedAt },
    };
  } catch {
    return {
      events: [],
      status: {
        source: 'IGC-UP',
        ok: false,
        count: 0,
        lastUpdated: fetchedAt,
        error: 'Requiere servidor Node/Express (bloqueo CORS en hosting estático)',
      },
    };
  }
}

export async function fetchSeismicFeedClient(options: {
  sources: SeismicAgency[];
  scope: RegionScope;
  startDate: string;
  endDate: string;
  minMag?: number;
  forceRefresh?: boolean;
}): Promise<SeismicFeedResponse> {
  const { sources, scope, startDate, endDate, minMag = 0, forceRefresh = false } = options;

  const params = new URLSearchParams({
    sources: sources.join(','),
    scope,
    startDate,
    endDate,
    minMag: String(minMag),
  });
  if (forceRefresh) params.set('refresh', '1');

  // Try backend Express proxy first unless already confirmed static hosting
  if (backendApiAvailable !== false) {
    try {
      const res = await fetch(`./api/seismic/events?${params.toString()}`);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        backendApiAvailable = true;
        return (await res.json()) as SeismicFeedResponse;
      }
      if (res.status === 404 || !contentType.includes('application/json')) {
        backendApiAvailable = false;
      } else {
        throw new Error(`Error del servidor (${res.status})`);
      }
    } catch {
      // Fall back to direct browser calls if backend endpoint is unreachable (e.g. GitHub Pages)
      backendApiAvailable = false;
    }
  }

  // Static hosting fallback (GitHub Pages): fetch directly from CORS-enabled public APIs
  let startDateMs = Date.now() - 7 * 86_400_000;
  let endDateMs = Date.now();
  if (startDate) {
    const parsed = Date.parse(`${startDate}T00:00:00.000Z`);
    if (!Number.isNaN(parsed)) startDateMs = parsed;
  }
  if (endDate) {
    const parsed = Date.parse(`${endDate}T23:59:59.999Z`);
    if (!Number.isNaN(parsed)) endDateMs = parsed;
  }
  if (endDateMs < startDateMs) {
    [startDateMs, endDateMs] = [endDateMs, startDateMs];
  }

  const startIso = new Date(startDateMs).toISOString();
  const endIso = new Date(endDateMs).toISOString();

  const tasks: Array<Promise<{ events: SeismicEvent[]; status: AgencyStatus }>> = [];
  if (sources.includes('IGC-UP')) {
    tasks.push(fetchIgcUpDirect());
  }
  if (sources.includes('USGS')) {
    tasks.push(fetchUsgsDirect(startIso, endIso, minMag, scope));
  }
  if (sources.includes('EMSC')) {
    tasks.push(fetchEmscDirect(startIso, endIso, minMag, scope));
  }

  const results = await Promise.all(tasks);
  const agencyStatuses = results.map((r) => r.status);
  const allEvents = results
    .flatMap((r) => r.events)
    .filter(
      (ev) =>
        ev.magnitude >= minMag &&
        ev.timestamp >= startDateMs &&
        ev.timestamp <= endDateMs + 86_400_000
    )
    .sort((a, b) => b.timestamp - a.timestamp);

  return {
    events: allEvents,
    agencyStatuses,
    fetchedAt: Date.now(),
  };
}
