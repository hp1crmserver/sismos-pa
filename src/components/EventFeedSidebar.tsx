import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { BulletinType, SeismicEvent, SeverityLevel } from '../types/seismic';
import {
  BULLETIN_LABEL,
  SEVERITY_META,
  formatRelativeTimeEs,
} from '../utils/seismicFormat';
import ShareMenuButton from './ShareMenuButton';

interface EventFeedSidebarProps {
  events: SeismicEvent[];
  selectedEvent: SeismicEvent | null;
  onSelectEvent: (event: SeismicEvent) => void;
  onOpenGenerator?: (event: SeismicEvent) => void;
  loading: boolean;
}

export default function EventFeedSidebar({
  events,
  selectedEvent,
  onSelectEvent,
  onOpenGenerator,
  loading,
}: EventFeedSidebarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [bulletinFilter, setBulletinFilter] = useState<BulletinType | 'ALL'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<SeverityLevel | 'ALL'>('ALL');

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return events.filter((ev) => {
      if (bulletinFilter !== 'ALL' && ev.bulletinType !== bulletinFilter) return false;
      if (severityFilter !== 'ALL' && ev.severity !== severityFilter) return false;
      if (q) {
        const matchPlace = ev.place.toLowerCase().includes(q);
        const matchSource = ev.source.toLowerCase().includes(q);
        const matchRegion = ev.regionCategory.toLowerCase().includes(q);
        if (!matchPlace && !matchSource && !matchRegion) return false;
      }
      return true;
    });
  }, [events, searchTerm, bulletinFilter, severityFilter]);

  return (
    <aside className="flex flex-col h-full min-h-[460px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] overflow-hidden">
      {/* Sidebar Header & Filters */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Flujo de Eventos y Boletines
          </h2>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {filtered.length} registros
          </span>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar región, ciudad o agencia..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Bulletin Type Segmented Filter */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {(['ALL', 'ALERTA', 'AVISO', 'NOTIFICACION', 'BOLETIN'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setBulletinFilter(type)}
              className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                bulletinFilter === type
                  ? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {type === 'ALL' ? 'Todos' : BULLETIN_LABEL[type]}
            </button>
          ))}
        </div>

        {/* Severity Filter */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {(['ALL', 'CRITICO', 'ALTO', 'MODERADO', 'BAJO'] as const).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setSeverityFilter(lvl)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                severityFilter === lvl
                  ? 'border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {lvl === 'ALL'
                ? 'Todo riesgo'
                : `${SEVERITY_META[lvl].glyph} ${SEVERITY_META[lvl].label}`}
            </button>
          ))}
        </div>
      </div>

      {/* Feed List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
        {loading && events.length === 0 ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-2 py-2">
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-5/6" />
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No hay eventos sísmicos con estos filtros
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ajusta el alcance geográfico, la magnitud mínima o las agencias activas.
            </p>
          </div>
        ) : (
          filtered.slice(0, 120).map((ev) => {
            const sev = SEVERITY_META[ev.severity];
            const isSelected = selectedEvent?.id === ev.id;
            return (
              <div
                key={ev.id}
                className={`flex items-start gap-2 px-3.5 py-3 transition-colors ${
                  isSelected
                    ? 'bg-sky-50/90 dark:bg-sky-950/35'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/45'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectEvent(ev)}
                  className="flex-1 min-w-0 text-left flex items-start gap-3"
                >
                  {/* Magnitude Block */}
                  <div className="shrink-0 w-12 pt-0.5 text-center">
                    <div
                      className="text-xl font-extrabold font-mono tabular-nums leading-none"
                      style={{ color: sev.hex }}
                    >
                      {ev.magnitude.toFixed(1)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                      {ev.depthKm.toFixed(0)} km
                    </div>
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      <span className={`font-semibold ${sev.badgeTextClass}`}>
                        {sev.glyph} {sev.label}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {ev.source}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{BULLETIN_LABEL[ev.bulletinType]}</span>
                    </div>

                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5 line-clamp-2 leading-snug">
                      {ev.place}
                    </p>

                    <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
                      <span>{formatRelativeTimeEs(ev.timestamp)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ev.status}</span>
                      {ev.tsunamiAlert && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-bold text-rose-600 dark:text-rose-400">
                            TSUNAMI
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>

                <div className="shrink-0 pt-0.5">
                  <ShareMenuButton event={ev} onOpenGenerator={onOpenGenerator} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
