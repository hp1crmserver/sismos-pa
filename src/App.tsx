import {
  Bell,
  BellRing,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AlertToastStack, { type VisualAlertItem } from './components/AlertToastStack';
import CardGenerator4x5 from './components/CardGenerator4x5';
import EventFeedSidebar from './components/EventFeedSidebar';
import HistoryView from './components/HistoryView';
import ReportsView from './components/ReportsView';
import SeismicMap from './components/SeismicMap';
import SelectedEventPanel from './components/SelectedEventPanel';
import type {
  AgencyStatus,
  AudioAlertSettings,
  EsriLayerId,
  RegionScope,
  SeismicAgency,
  SeismicEvent,
  SeismicFeedResponse,
  ThemeMode,
  WorkspaceTab,
} from './types/seismic';
import { triggerEventAlertAudio } from './utils/audioAlerts';
import { exportSingleEventPdf } from './utils/pdfExporter';
import { BULLETIN_LABEL, SEVERITY_META, formatPanamaDateTime } from './utils/seismicFormat';

const ALL_AGENCIES: SeismicAgency[] = ['IGC-UP', 'USGS', 'EMSC'];

function getDefaultDates(daysBack: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(Date.now() - daysBack * 86_400_000);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function App() {
  // Theme state (Claro / Oscuro / Sistema)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('sismo_theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch {
      // ignore
    }
    return 'system';
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isDarkTheme =
    themeMode === 'dark' || (themeMode === 'system' && systemPrefersDark);

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkTheme) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('sismo_theme', themeMode);
    } catch {
      // ignore
    }
  }, [isDarkTheme, themeMode]);

  // Workspace navigation & query state
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('monitor');
  const [activeAgencies, setActiveAgencies] = useState<SeismicAgency[]>(ALL_AGENCIES);
  const [scope, setScope] = useState<RegionScope>('panama');
  const [esriLayer, setEsriLayer] = useState<EsriLayerId>('World_Imagery');

  const initialDates = useMemo(() => getDefaultDates(7), []);
  const [startDate, setStartDate] = useState<string>(initialDates.start);
  const [endDate, setEndDate] = useState<string>(initialDates.end);

  // Seismic data state
  const [events, setEvents] = useState<SeismicEvent[]>([]);
  const [agencyStatuses, setAgencyStatuses] = useState<AgencyStatus[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SeismicEvent | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [dismissedBannerId, setDismissedBannerId] = useState<string | null>(null);

  // Audio & visual notification state
  const [audioSettings, setAudioSettings] = useState<AudioAlertSettings>({
    enabled: true,
    voiceEnabled: false,
    minMagnitude: 3.5,
    volume: 0.5,
  });
  const [visualAlerts, setVisualAlerts] = useState<VisualAlertItem[]>([]);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef<boolean>(false);

  const pushVisualAlert = useCallback(
    (event: SeismicEvent, isTest = false) => {
      const alertId = `${event.id}-${Date.now()}`;
      setVisualAlerts((prev) => [{ alertId, event, isTest }, ...prev].slice(0, 4));
      setTimeout(() => {
        setVisualAlerts((prev) => prev.filter((item) => item.alertId !== alertId));
      }, 9500);

      if (
        !isTest &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(
            `${BULLETIN_LABEL[event.bulletinType]} · M ${event.magnitude.toFixed(1)} (${
              event.source
            })`,
            { body: event.place }
          );
        } catch {
          // ignore
        }
      }
    },
    []
  );

  const fetchSeismicFeed = useCallback(
    async (forceRefresh = false) => {
      if (activeAgencies.length === 0) {
        setEvents([]);
        setAgencyStatuses([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg(null);

      try {
        const params = new URLSearchParams({
          sources: activeAgencies.join(','),
          scope,
          startDate,
          endDate,
          minMag: '0',
        });
        if (forceRefresh) params.set('refresh', '1');

        const res = await fetch(`/api/seismic/events?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Error del servidor (${res.status})`);
        }
        const data = (await res.json()) as SeismicFeedResponse;

        setEvents(data.events);
        setAgencyStatuses(data.agencyStatuses);
        setLastSyncAt(data.fetchedAt);

        setSelectedEvent((prev) => {
          if (prev && data.events.some((e) => e.id === prev.id)) {
            return data.events.find((e) => e.id === prev.id) ?? prev;
          }
          return data.events[0] ?? null;
        });

        // Detect newly arrived events after initial load
        if (initialLoadDoneRef.current) {
          const newEvents = data.events.filter(
            (ev) => !knownIdsRef.current.has(ev.id)
          );
          if (newEvents.length > 0) {
            const topNew = newEvents.sort((a, b) => b.magnitude - a.magnitude)[0];
            if (topNew.magnitude >= audioSettings.minMagnitude || topNew.tsunamiAlert) {
              pushVisualAlert(topNew, false);
              triggerEventAlertAudio(topNew, audioSettings);
            }
          }
        } else {
          initialLoadDoneRef.current = true;
        }

        for (const ev of data.events) {
          knownIdsRef.current.add(ev.id);
        }
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'No se pudieron sincronizar los datos sísmicos.'
        );
      } finally {
        setLoading(false);
      }
    },
    [activeAgencies, scope, startDate, endDate, audioSettings, pushVisualAlert]
  );

  // Initial & reactive fetch
  useEffect(() => {
    fetchSeismicFeed(false);
  }, [fetchSeismicFeed]);

  // Real-time polling every 45 seconds
  useEffect(() => {
    const id = setInterval(() => {
      fetchSeismicFeed(true);
    }, 45_000);
    return () => clearInterval(id);
  }, [fetchSeismicFeed]);

  const toggleAgency = (agency: SeismicAgency) => {
    setActiveAgencies((prev) => {
      if (prev.includes(agency)) {
        if (prev.length === 1) return prev; // Keep at least one active
        return prev.filter((a) => a !== agency);
      }
      return [...prev, agency];
    });
  };

  const handleTestAlert = () => {
    const sampleEvent: SeismicEvent = selectedEvent ??
      events[0] ?? {
        id: 'TEST:igcup-sample',
        source: 'IGC-UP',
        sourceEventId: 'prueba-alerta',
        magnitude: 4.8,
        magType: 'ML',
        depthKm: 12.0,
        lat: 7.5012,
        lon: -80.7675,
        place: 'Localizado en Panamá a 37 km al oeste de Tonosí (Prueba de Alerta)',
        regionCategory: 'Panamá',
        timestamp: Date.now(),
        status: 'REVISADO',
        bulletinType: 'AVISO',
        severity: 'ALTO',
        tsunamiAlert: false,
        pagerAlert: null,
        mmi: null,
        feltReports: null,
        url: 'https://sismosgeociencias.up.ac.pa/',
      };

    pushVisualAlert(sampleEvent, true);
    triggerEventAlertAudio(sampleEvent, { ...audioSettings, enabled: true, minMagnitude: 0 });
  };

  const handleRequestBrowserNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  // Highlight recent significant alert (< 12h, ALTO or CRITICO)
  const activePriorityBanner = useMemo(() => {
    const cutoff = Date.now() - 12 * 3600_000;
    const candidate = events.find(
      (ev) =>
        ev.timestamp >= cutoff &&
        (ev.severity === 'CRITICO' || ev.severity === 'ALTO' || ev.tsunamiAlert)
    );
    if (!candidate || candidate.id === dismissedBannerId) return null;
    return candidate;
  }, [events, dismissedBannerId]);

  const handleOpenGeneratorForEvent = (ev: SeismicEvent) => {
    setSelectedEvent(ev);
    setActiveTab('generator');
  };

  const handleViewOnMap = (ev: SeismicEvent) => {
    setSelectedEvent(ev);
    setActiveTab('monitor');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-[#070B12] dark:text-slate-100">
      {/* Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (4 single-line nav links) — Zone 3 (1 primary CTA) */}
      <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B111D]/95 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sm:gap-8">
          <a
            href="#monitor"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('monitor');
            }}
            className="inline-flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 28 28"
              className="w-7 h-7 shrink-0 text-sky-600 dark:text-sky-400"
              fill="none"
            >
              <rect
                x="1.5"
                y="1.5"
                width="25"
                height="25"
                rx="6"
                className="fill-sky-500/10 stroke-current"
                strokeWidth="1.6"
              />
              <path
                d="M4.5 14.5h4.2l2.1-6.2 3.1 11.4 2.7-8.4 1.9 3.2h5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>GeoAlert-pa</span>
          </a>

          <nav
            aria-label="Navegación principal"
            className="flex items-center gap-4 sm:gap-7 overflow-x-auto"
          >
            {(
              [
                { id: 'monitor', label: 'Monitor en Vivo' },
                { id: 'history', label: 'Historial' },
                { id: 'generator', label: 'Tarjeta 4:5' },
                { id: 'reports', label: 'Reportes' },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-1 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-400'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => fetchSeismicFeed(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 hover:opacity-90 disabled:opacity-60 transition-opacity whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sincronizar</span>
          </button>
        </div>
      </header>

      {/* Workspace Control Bar (Agencies, Scope, Audio Alerts, Theme Claro/Oscuro/Sistema) */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Agencies & Scope */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 p-0.5 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {ALL_AGENCIES.map((ag) => {
                const active = activeAgencies.includes(ag);
                const status = agencyStatuses.find((s) => s.source === ag);
                return (
                  <button
                    key={ag}
                    type="button"
                    onClick={() => toggleAgency(ag)}
                    title={
                      status && !status.ok
                        ? `Error de conexión: ${status.error}`
                        : `Filtrar fuente ${ag}`
                    }
                    className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {ag}
                    {status && active ? (
                      <span className="ml-1.5 text-[10px] text-slate-400">
                        {status.ok ? status.count : 'err'}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1 p-0.5 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'panama', label: 'Panamá y Región' },
                  { id: 'global', label: 'Global' },
                ] as const
              ).map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => setScope(sc.id)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                    scope === sc.id
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {sc.label}
                </button>
              ))}
            </div>

            {lastSyncAt && (
              <span className="hidden xl:inline text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Actualizado: {formatPanamaDateTime(lastSyncAt)}
              </span>
            )}
          </div>

          {/* Right: Audio/Visual Alerts & Theme Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Audio Controls */}
            <div className="flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-2 py-1">
              <button
                type="button"
                onClick={() =>
                  setAudioSettings((s) => ({ ...s, enabled: !s.enabled }))
                }
                title={audioSettings.enabled ? 'Silenciar alertas sonoras' : 'Activar alertas sonoras'}
                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded transition-colors whitespace-nowrap ${
                  audioSettings.enabled
                    ? 'text-sky-700 dark:text-sky-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {audioSettings.enabled ? (
                  <Volume2 className="w-3.5 h-3.5" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
                Audio {audioSettings.enabled ? 'ON' : 'OFF'}
              </button>

              <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

              <button
                type="button"
                onClick={() =>
                  setAudioSettings((s) => ({ ...s, voiceEnabled: !s.voiceEnabled }))
                }
                title="Lectura por voz en español"
                className={`text-[11px] font-medium px-1.5 py-0.5 rounded transition-colors whitespace-nowrap ${
                  audioSettings.voiceEnabled
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Voz
              </button>

              <select
                aria-label="Umbral mínimo de alerta sonora"
                value={audioSettings.minMagnitude}
                onChange={(e) =>
                  setAudioSettings((s) => ({ ...s, minMagnitude: Number(e.target.value) }))
                }
                className="bg-transparent text-[11px] font-mono text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
              >
                <option value={2.5}>M≥2.5</option>
                <option value={3.5}>M≥3.5</option>
                <option value={4.5}>M≥4.5</option>
                <option value={5.5}>M≥5.5</option>
              </select>

              <button
                type="button"
                onClick={handleTestAlert}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 transition-colors whitespace-nowrap"
              >
                <BellRing className="w-3 h-3" />
                Probar Alerta
              </button>

              {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
                <button
                  type="button"
                  onClick={handleRequestBrowserNotifications}
                  title="Permitir notificaciones de escritorio"
                  className="p-1 text-slate-500 hover:text-sky-600 dark:hover:text-sky-400"
                >
                  <Bell className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Theme Mode Switcher: Claro / Oscuro / Sistema */}
            <div
              role="group"
              aria-label="Modo de color"
              className="flex items-center gap-0.5 p-0.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900"
            >
              {(
                [
                  { id: 'light', label: 'Claro', Icon: Sun },
                  { id: 'dark', label: 'Oscuro', Icon: Moon },
                  { id: 'system', label: 'Sistema', Icon: Monitor },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = themeMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setThemeMode(id)}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4">
        {/* Error Notice if any */}
        {errorMsg && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
            <span>Error de sincronización: {errorMsg}</span>
            <button
              type="button"
              onClick={() => fetchSeismicFeed(true)}
              className="font-semibold underline ml-3"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Active Priority Seismic Banner (only for recent High/Critical events) */}
        {activePriorityBanner && activeTab === 'monitor' && (
          <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              <span
                className="font-mono font-bold"
                style={{ color: SEVERITY_META[activePriorityBanner.severity].hex }}
              >
                {SEVERITY_META[activePriorityBanner.severity].glyph}{' '}
                {BULLETIN_LABEL[activePriorityBanner.bulletinType].toUpperCase()} · M{' '}
                {activePriorityBanner.magnitude.toFixed(1)}
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {activePriorityBanner.place}
              </span>
              <span className="font-mono text-slate-500 dark:text-slate-400">
                ({activePriorityBanner.source} · {formatPanamaDateTime(activePriorityBanner.timestamp)})
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => setSelectedEvent(activePriorityBanner)}
                className="font-semibold text-sky-700 dark:text-sky-400 hover:underline"
              >
                Inspeccionar
              </button>
              <button
                type="button"
                onClick={() => setDismissedBannerId(activePriorityBanner.id)}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Ocultar
              </button>
            </div>
          </div>
        )}

        {/* Workspace Views */}
        {activeTab === 'monitor' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              <div className="lg:col-span-8 h-[520px] lg:h-[600px]">
                <SeismicMap
                  events={events}
                  selectedEvent={selectedEvent}
                  onSelectEvent={setSelectedEvent}
                  onOpenGenerator={handleOpenGeneratorForEvent}
                  esriLayer={esriLayer}
                  onChangeEsriLayer={setEsriLayer}
                  isDarkTheme={isDarkTheme}
                />
              </div>

              <div className="lg:col-span-4 h-[460px] lg:h-[600px]">
                <EventFeedSidebar
                  events={events}
                  selectedEvent={selectedEvent}
                  onSelectEvent={setSelectedEvent}
                  onOpenGenerator={handleOpenGeneratorForEvent}
                  loading={loading}
                />
              </div>
            </div>

            <SelectedEventPanel
              event={selectedEvent}
              onOpenGenerator={handleOpenGeneratorForEvent}
              onExportEventPdf={(ev) => exportSingleEventPdf(ev)}
              onPlayAlertSound={(ev) =>
                triggerEventAlertAudio(ev, { ...audioSettings, enabled: true, minMagnitude: 0 })
              }
            />
          </div>
        )}

        {activeTab === 'history' && (
          <HistoryView
            events={events}
            loading={loading}
            startDate={startDate}
            endDate={endDate}
            onChangeDateRange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
            onViewOnMap={handleViewOnMap}
            onOpenGenerator={handleOpenGeneratorForEvent}
          />
        )}

        {activeTab === 'generator' && (
          <CardGenerator4x5
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            defaultEsriLayer={esriLayer}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView
            events={events}
            selectedEvent={selectedEvent}
            esriLayer={esriLayer}
            startDate={startDate}
            endDate={endDate}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B111D] py-4 mt-6">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Fuentes sismológicas: Instituto de Geociencias (IGC-UP) · USGS · EMSC · Cartografía base Esri
          </span>
          <span className="font-mono">
            GeoAlert-pa · Hora oficial de referencia: América/Panamá (UTC-5)
          </span>
        </div>
      </footer>

      {/* Real-time Visual Alert Toast Stack */}
      <AlertToastStack
        alerts={visualAlerts}
        onDismiss={(id) =>
          setVisualAlerts((prev) => prev.filter((item) => item.alertId !== id))
        }
        onSelectEvent={handleViewOnMap}
      />
    </div>
  );
}
