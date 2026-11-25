import type {
  BulletinType,
  EsriLayerId,
  SeismicAgency,
  SeismicEvent,
  SeverityLevel,
} from '../types/seismic';

export interface SeverityMeta {
  level: SeverityLevel;
  label: string;
  glyph: string;
  hex: string;
  badgeTextClass: string;
  borderClass: string;
  dotColorClass: string;
  surfaceTintClass: string;
}

export const SEVERITY_META: Record<SeverityLevel, SeverityMeta> = {
  BAJO: {
    level: 'BAJO',
    label: 'Bajo',
    glyph: '●',
    hex: '#10B981',
    badgeTextClass: 'text-emerald-700 dark:text-emerald-400',
    borderClass: 'border-emerald-500/30',
    dotColorClass: 'bg-emerald-500',
    surfaceTintClass: 'bg-emerald-500/10',
  },
  MODERADO: {
    level: 'MODERADO',
    label: 'Moderado',
    glyph: '▲',
    hex: '#F59E0B',
    badgeTextClass: 'text-amber-700 dark:text-amber-400',
    borderClass: 'border-amber-500/30',
    dotColorClass: 'bg-amber-500',
    surfaceTintClass: 'bg-amber-500/10',
  },
  ALTO: {
    level: 'ALTO',
    label: 'Alto',
    glyph: '◆',
    hex: '#F97316',
    badgeTextClass: 'text-orange-700 dark:text-orange-400',
    borderClass: 'border-orange-500/35',
    dotColorClass: 'bg-orange-500',
    surfaceTintClass: 'bg-orange-500/10',
  },
  CRITICO: {
    level: 'CRITICO',
    label: 'Crítico',
    glyph: '■',
    hex: '#EF4444',
    badgeTextClass: 'text-rose-700 dark:text-rose-400',
    borderClass: 'border-rose-500/40',
    dotColorClass: 'bg-rose-500',
    surfaceTintClass: 'bg-rose-500/12',
  },
};

export const BULLETIN_LABEL: Record<BulletinType, string> = {
  BOLETIN: 'Boletín',
  NOTIFICACION: 'Notificación',
  AVISO: 'Aviso',
  ALERTA: 'Alerta',
};

export const AGENCY_FULL_NAME: Record<SeismicAgency, string> = {
  'IGC-UP': 'Instituto de Geociencias · Univ. de Panamá',
  USGS: 'Servicio Geológico de EE. UU. (USGS)',
  EMSC: 'Centro Sismológico Euromediterráneo (EMSC)',
};

export const AGENCY_SHORT_COLOR: Record<SeismicAgency, string> = {
  'IGC-UP': '#0284C7',
  USGS: '#0D9488',
  EMSC: '#6366F1',
};

export interface EsriLayerOption {
  id: EsriLayerId;
  name: string;
  url: string;
  attribution: string;
  needsLabelsOverlay: boolean;
}

export const ESRI_LAYERS: EsriLayerOption[] = [
  {
    id: 'World_Imagery',
    name: 'Esri Satélite (World Imagery)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
    needsLabelsOverlay: true,
  },
  {
    id: 'World_Topo_Map',
    name: 'Esri Topográfico',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Esri, HERE, Garmin, Intermap, USGS',
    needsLabelsOverlay: false,
  },
  {
    id: 'World_Dark_Gray_Base',
    name: 'Esri Gris Oscuro',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Esri, HERE, Garmin, FAO, NOAA',
    needsLabelsOverlay: true,
  },
  {
    id: 'World_Light_Gray_Base',
    name: 'Esri Gris Claro',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Esri, HERE, Garmin, FAO, NOAA',
    needsLabelsOverlay: true,
  },
  {
    id: 'World_Ocean_Base',
    name: 'Esri Batimetría y Océanos',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — GEBCO, NOAA, National Geographic',
    needsLabelsOverlay: true,
  },
  {
    id: 'World_Street_Map',
    name: 'Esri Calles y Relieve',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Source: Esri, DeLorme, NAVTEQ',
    needsLabelsOverlay: false,
  },
];

export const ESRI_LABELS_OVERLAY_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

export function formatPanamaDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('es-PA', {
    timeZone: 'America/Panama',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date(timestamp));
}

export function formatUtcDateTime(timestamp: number): string {
  const iso = new Date(timestamp).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

export function formatRelativeTimeEs(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return `Hace ${diffSec} s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `Hace ${diffHrs} h`;
  const diffDays = Math.floor(diffHrs / 24);
  return `Hace ${diffDays} d`;
}

export function formatCoordinates(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'O';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
}

export function getMarkerRadius(magnitude: number): number {
  if (magnitude < 2.5) return 5;
  if (magnitude < 3.5) return 7;
  if (magnitude < 4.5) return 10;
  if (magnitude < 5.5) return 14;
  if (magnitude < 6.5) return 18;
  return 24;
}

export function describeEventSummary(event: SeismicEvent): string {
  const sev = SEVERITY_META[event.severity].label;
  const bul = BULLETIN_LABEL[event.bulletinType];
  return `${bul} (${sev}) de magnitud ${event.magnitude.toFixed(1)} ${event.magType} a ${event.depthKm.toFixed(
    1
  )} km de profundidad en ${event.place}, reportado por ${event.source}.`;
}
