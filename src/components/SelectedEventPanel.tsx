import { ExternalLink, FileDown, Image as ImageIcon, LocateFixed, Volume2 } from 'lucide-react';
import type { SeismicEvent } from '../types/seismic';
import {
  AGENCY_FULL_NAME,
  BULLETIN_LABEL,
  SEVERITY_META,
  formatCoordinates,
  formatPanamaDateTime,
  formatUtcDateTime,
} from '../utils/seismicFormat';
import ShareMenuButton from './ShareMenuButton';

interface SelectedEventPanelProps {
  event: SeismicEvent | null;
  onOpenGenerator: (event: SeismicEvent) => void;
  onExportEventPdf: (event: SeismicEvent) => void;
  onPlayAlertSound: (event: SeismicEvent) => void;
}

export default function SelectedEventPanel({
  event,
  onOpenGenerator,
  onExportEventPdf,
  onPlayAlertSound,
}: SelectedEventPanelProps) {
  if (!event) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-6 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Selecciona un evento sísmico en el mapa o en el flujo lateral para inspeccionar su boletín técnico.
        </p>
      </div>
    );
  }

  const sev = SEVERITY_META[event.severity];

  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-4 sm:p-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span className={`font-bold ${sev.badgeTextClass}`}>
              {sev.glyph} Riesgo {sev.label}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {BULLETIN_LABEL[event.bulletinType]}
            </span>
            <span aria-hidden="true">·</span>
            <span>{AGENCY_FULL_NAME[event.source]}</span>
            <span aria-hidden="true">·</span>
            <span>{event.status}</span>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
            {event.place}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onPlayAlertSound(event)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Volume2 className="w-3.5 h-3.5" />
            Sonar Aviso
          </button>

          <ShareMenuButton event={event} onOpenGenerator={onOpenGenerator} variant="button" />

          <button
            type="button"
            onClick={() => onOpenGenerator(event)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors whitespace-nowrap"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            Generar Tarjeta 4:5
          </button>

          <button
            type="button"
            onClick={() => onExportEventPdf(event)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <FileDown className="w-3.5 h-3.5" />
            Ficha PDF
          </button>
        </div>
      </div>

      {/* Precision Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-4">
        <div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Magnitud ({event.magType})
          </div>
          <div
            className="text-2xl font-extrabold font-mono tabular-nums mt-0.5"
            style={{ color: sev.hex }}
          >
            {event.magnitude.toFixed(1)}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Profundidad
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {event.depthKm.toFixed(1)} <span className="text-xs font-normal text-slate-500">km</span>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Coordenadas
          </div>
          <div className="text-xs font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1.5 inline-flex items-center gap-1">
            <LocateFixed className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            {formatCoordinates(event.lat, event.lon)}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Hora Panamá (UTC-5)
          </div>
          <div className="text-xs font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1.5">
            {formatPanamaDateTime(event.timestamp)}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Hora Universal
          </div>
          <div className="text-xs font-medium font-mono tabular-nums text-slate-700 dark:text-slate-300 mt-1.5">
            {formatUtcDateTime(event.timestamp)}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Tsunami / Boletín
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span
              className={`text-xs font-semibold ${
                event.tsunamiAlert
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {event.tsunamiAlert ? 'Alerta Tsunami' : 'Sin alerta tsunami'}
            </span>
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap"
            >
              Oficial
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {(event.mmi != null || event.feltReports != null || event.pagerAlert) && (
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-4 text-xs font-mono text-slate-600 dark:text-slate-300">
          {event.mmi != null && (
            <span>Intensidad Instrumental (MMI): {event.mmi.toFixed(1)}</span>
          )}
          {event.feltReports != null && (
            <span>Reportes ciudadanos sentidos: {event.feltReports}</span>
          )}
          {event.pagerAlert && (
            <span>Nivel PAGER USGS: {event.pagerAlert.toUpperCase()}</span>
          )}
        </div>
      )}
    </section>
  );
}
