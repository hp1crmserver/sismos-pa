export type SeismicAgency = 'IGC-UP' | 'USGS' | 'EMSC';

export type SeverityLevel = 'BAJO' | 'MODERADO' | 'ALTO' | 'CRITICO';

export type BulletinType = 'BOLETIN' | 'NOTIFICACION' | 'AVISO' | 'ALERTA';

export type EventReviewStatus = 'REVISADO' | 'AUTOMATICO' | 'PRELIMINAR';

export type RegionScope = 'panama' | 'global';

export type RegionCategory =
  | 'Panamá'
  | 'Frontera Panamá–Costa Rica'
  | 'América Central'
  | 'Caribe'
  | 'Pacífico Este / Sudamérica'
  | 'Global';

export type EsriLayerId =
  | 'World_Imagery'
  | 'World_Topo_Map'
  | 'World_Dark_Gray_Base'
  | 'World_Light_Gray_Base'
  | 'World_Ocean_Base'
  | 'World_Street_Map';

export interface SeismicEvent {
  id: string;
  source: SeismicAgency;
  sourceEventId: string;
  magnitude: number;
  magType: string;
  depthKm: number;
  lat: number;
  lon: number;
  place: string;
  regionCategory: RegionCategory;
  timestamp: number;
  status: EventReviewStatus;
  bulletinType: BulletinType;
  severity: SeverityLevel;
  tsunamiAlert: boolean;
  pagerAlert: 'green' | 'yellow' | 'orange' | 'red' | null;
  mmi: number | null;
  feltReports: number | null;
  url: string;
}

export interface AgencyStatus {
  source: SeismicAgency;
  ok: boolean;
  count: number;
  lastUpdated: number;
  error?: string;
}

export interface SeismicFeedResponse {
  events: SeismicEvent[];
  agencyStatuses: AgencyStatus[];
  fetchedAt: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export type WorkspaceTab = 'monitor' | 'history' | 'generator' | 'reports';

export interface AudioAlertSettings {
  enabled: boolean;
  voiceEnabled: boolean;
  minMagnitude: number;
  volume: number;
}
