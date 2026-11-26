import { Volume2, X } from 'lucide-react';
import type { CSSProperties } from 'react';
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
      className="fixed inset-0 z-[900] flex flex-col items-center justify-center gap-3 p-4 bg-slate-950/45 backdrop-blur-[2px] sm:inset-auto sm:bottom-5 sm:right-5 sm:items-end sm:justify-end sm:p-0 sm:bg-transparent sm:backdrop-blur-none sm:w-[calc(100vw-2rem)] sm:max-w-sm pointer-events-auto sm:pointer-events-none"
      onClick={() => {
        if (alerts.length > 0) {
          onDismiss(alerts[0].alertId);
        }
      }}
    >
      {alerts.map(({ alertId, event, isTest }) => {
        const sev = SEVERITY_META[event.severity];
        const cardStyle = {
          '--alert-color': sev.hex,
          borderColor: sev.hex,
        } as CSSProperties;

        return (
          <div
            key={alertId}
            style={cardStyle}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-xl border-2 bg-white dark:bg-slate-900 shadow-2xl p-4 flex items-start gap-3.5 seismic-alert-card"
          >
            {/* Animated top severity color bar */}
            <div
              className="absolute inset-x-0 top-0 h-1.5 seismic-alert-bar"
              style={{ backgroundColor: sev.hex }}
              aria-hidden="true"
            />

            {/* Subtle severity tint wash */}
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.07]"
              style={{ backgroundColor: sev.hex }}
              aria-hidden="true"
            />

            {/* Magnitude badge with pulsing seismic ring */}
            <div className="relative shrink-0 mt-0.5">
              <span
                className="absolute inset-0 rounded-lg border-2 seismic-pulse-ring pointer-events-none"
                style={{ borderColor: sev.hex }}
                aria-hidden="true"
              />
              <div
                className="relative w-12 h-12 rounded-lg flex items-center justify-center font-mono font-extrabold text-lg text-white shadow-sm"
                style={{ backgroundColor: sev.hex }}
              >
                {event.magnitude.toFixed(1)}
              </div>
            </div>

            <div className="relative min-w-0 flex-1 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] font-mono font-bold ${sev.badgeTextClass}`}>
                  {sev.glyph} {BULLETIN_LABEL[event.bulletinType].toUpperCase()} · {event.source}
                  {isTest ? ' (PRUEBA)' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => onDismiss(alertId)}
                  aria-label="Cerrar notificación"
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 -mr-1 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs sm:text-[13px] font-bold text-slate-900 dark:text-slate-100 mt-1 line-clamp-2 leading-snug">
                {event.place}
              </p>

              <div className="flex items-center justify-between gap-2 mt-2.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <Volume2 className="w-3.5 h-3.5 animate-pulse" style={{ color: sev.hex }} />
                  {formatPanamaDateTime(event.timestamp)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onSelectEvent(event);
                    onDismiss(alertId);
                  }}
                  className="text-xs font-bold hover:underline whitespace-nowrap"
                  style={{ color: sev.hex }}
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
