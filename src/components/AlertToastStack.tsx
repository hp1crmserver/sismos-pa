import { Volume2, X } from 'lucide-react';
import type { SeismicEvent } from '../types/seismic';
import {
  BULLETIN_LABEL,
  SEVERITY_META,
  formatPanamaDateTime,
} from '../utils/seismicFormat';

export interface VisualAlertItem {
  alertId: string;
  event: SeismicEvent;
  isTest?: boolean;
}

interface AlertToastStackProps {
  alerts: VisualAlertItem[];
  onDismiss: (alertId: string) => void;
  onSelectEvent: (event: SeismicEvent) => void;
}

export default function AlertToastStack({
  alerts,
  onDismiss,
  onSelectEvent,
}: AlertToastStackProps) {
  if (alerts.length === 0) return null;

  return (
    <div
      aria-live="assertive"
      className="fixed bottom-4 right-4 z-[900] flex flex-col gap-2.5 w-[calc(100vw-2rem)] max-w-sm"
    >
      {alerts.map(({ alertId, event, isTest }) => {
        const sev = SEVERITY_META[event.severity];
        return (
          <div
            key={alertId}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3.5 flex items-start gap-3"
          >
            <div
              className="shrink-0 w-11 h-11 rounded-md flex items-center justify-center font-mono font-extrabold text-base text-white"
              style={{ backgroundColor: sev.hex }}
            >
              {event.magnitude.toFixed(1)}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] font-mono font-bold ${sev.badgeTextClass}`}>
                  {sev.glyph} {BULLETIN_LABEL[event.bulletinType].toUpperCase()} · {event.source}
                  {isTest ? ' (PRUEBA)' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => onDismiss(alertId)}
                  aria-label="Cerrar notificación"
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5 line-clamp-2">
                {event.place}
              </p>

              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <Volume2 className="w-3 h-3" />
                  {formatPanamaDateTime(event.timestamp)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onSelectEvent(event);
                    onDismiss(alertId);
                  }}
                  className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap"
                >
                  Ver en mapa
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
