import type {
  BulletinType,
  EventReviewStatus,
  RegionCategory,
  SeismicEvent,
  SeverityLevel,
} from '../types/seismic';

export function classifyRegion(lat: number, lon: number, place: string): RegionCategory {
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

export function classifySeverity(
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

export function parsePanamaLocalToUtcMs(dateStr: string, timeStr: string): number {
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

export function parseIgcUpHtml(html: string): SeismicEvent[] {
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
    const status: EventReviewStatus = estadoRaw.includes('AUTO')
      ? 'AUTOMATICO'
      : estadoRaw.includes('PRELIM')
      ? 'PRELIMINAR'
      : 'REVISADO';
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

  return events;
}

export interface UsgsFeature {
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

export function parseUsgsFeatures(features: UsgsFeature[]): SeismicEvent[] {
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
  return events;
}

export interface EmscFeature {
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

export function parseEmscFeatures(features: EmscFeature[]): SeismicEvent[] {
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
  return events;
}
