import { ArrowUpDown, Download, FileDown, Image as ImageIcon, MapPin, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type {
  RegionCategory,
  SeismicAgency,
  SeismicEvent,
  SeverityLevel,
} from '../types/seismic';
import { renderHistorySummaryImage } from '../utils/canvasGenerator';
import { exportHistoryReportPdf, exportSingleEventPdf } from '../utils/pdfExporter';
import {
  BULLETIN_LABEL,
  SEVERITY_META,
  formatCoordinates,
  formatPanamaDateTime,
} from '../utils/seismicFormat';
import ShareMenuButton from './ShareMenuButton';

interface HistoryViewProps {
  events: SeismicEvent[];
  loading: boolean;
  startDate: string;
  endDate: string;
  onChangeDateRange: (start: string, end: string) => void;
  onViewOnMap: (event: SeismicEvent) => void;
  onOpenGenerator: (event: SeismicEvent) => void;
}

type SortField = 'timestamp' | 'magnitude' | 'depthKm' | 'source';

export default function HistoryView({
  events,
  loading,
  startDate,
  endDate,
  onChangeDateRange,
  onViewOnMap,
  onOpenGenerator,
}: HistoryViewProps) {
  const [regionFilter, setRegionFilter] = useState<RegionCategory | 'ALL'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<SeverityLevel | 'ALL'>('ALL');
  const [agencyFilter, setAgencyFilter] = useState<SeismicAgency | 'ALL'>('ALL');
  const [minMag, setMinMag] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const pageSize = 25;

  const applyDatePreset = (days: number) => {
    const end = new Date();
    const start = new Date(Date.now() - days * 86_400_000);
    onChangeDateRange(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
    setPage(1);
  };

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const startMs = startDate ? Date.parse(`${startDate}T00:00:00.000Z`) : 0;
    const endMs = endDate ? Date.parse(`${endDate}T23:59:59.999Z`) : Infinity;

    const list = events.filter((ev) => {
      if (ev.timestamp < startMs || ev.timestamp > endMs) return false;
      if (regionFilter !== 'ALL' && ev.regionCategory !== regionFilter) return false;
      if (severityFilter !== 'ALL' && ev.severity !== severityFilter) return false;
      if (agencyFilter !== 'ALL' && ev.source !== agencyFilter) return false;
      if (ev.magnitude < minMag) return false;
      if (q) {
        const hit =
          ev.place.toLowerCase().includes(q) ||
          ev.regionCategory.toLowerCase().includes(q) ||
          ev.source.toLowerCase().includes(q) ||
          ev.sourceEventId.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'timestamp') cmp = a.timestamp - b.timestamp;
      else if (sortField === 'magnitude') cmp = a.magnitude - b.magnitude;
      else if (sortField === 'depthKm') cmp = a.depthKm - b.depthKm;
      else cmp = a.source.localeCompare(b.source);
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [
    events,
    startDate,
    endDate,
    regionFilter,
    severityFilter,
    agencyFilter,
    minMag,
    searchQuery,
    sortField,
    sortAsc,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedEvents = filteredEvents.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const filterSummaryText = `${startDate || 'Inicio'} a ${endDate || 'Hoy'} · Región: ${
    regionFilter === 'ALL' ? 'Todas' : regionFilter
  } · Riesgo: ${
    severityFilter === 'ALL' ? 'Todos' : SEVERITY_META[severityFilter].label
  } · Agencia: ${agencyFilter === 'ALL' ? 'Todas' : agencyFilter} · M >= ${minMag.toFixed(1)}`;

  const handleExportImage = () => {
    const dataUrl = renderHistorySummaryImage(filteredEvents, filterSummaryText);
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `reporte-historial-sismico-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
  };

  const stats = useMemo(() => {
    const maxMag = filteredEvents.length
      ? Math.max(...filteredEvents.map((e) => e.magnitude))
      : 0;
    const avgDepth = filteredEvents.length
      ? filteredEvents.reduce((acc, e) => acc + e.depthKm, 0) / filteredEvents.length
      : 0;
    const highCritical = filteredEvents.filter(
      (e) => e.severity === 'ALTO' || e.severity === 'CRITICO'
    ).length;
    return { maxMag, avgDepth, highCritical };
  }, [filteredEvents]);

  return (
    <div className="space-y-4">
      {/* Filter & Export Toolbar */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Historial Detallado de Sismos, Alertas y Boletines
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Filtra registros de IGC-UP, USGS y EMSC por fecha, región geográfica y nivel de severidad.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => exportHistoryReportPdf(filteredEvents, filterSummaryText)}
              disabled={filteredEvents.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 hover:opacity-90 disabled:opacity-40 transition-opacity whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5" />
              Exportar PDF
            </button>
            <button
              type="button"
              onClick={handleExportImage}
              disabled={filteredEvents.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar Imagen PNG
            </button>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          {/* Date From */}
          <div>
            <label
              htmlFor="hist-start"
              className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1"
            >
              Fecha desde
            </label>
            <input
              id="hist-start"
              type="date"
              value={startDate}
              onChange={(e) => {
                onChangeDateRange(e.target.value, endDate);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Date To */}
          <div>
            <label
              htmlFor="hist-end"
              className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1"
            >
              Fecha hasta
            </label>
            <input
              id="hist-end"
              type="date"
              value={endDate}
              onChange={(e) => {
                onChangeDateRange(startDate, e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Region */}
          <div>
            <label
              htmlFor="hist-region"
              className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1"
            >
              Región geográfica
            </label>
            <select
              id="hist-region"
              value={regionFilter}
              onChange={(e) => {
                setRegionFilter(e.target.value as RegionCategory | 'ALL');
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              <option value="ALL">Todas las regiones</option>
              <option value="Panamá">Panamá</option>
              <option value="Frontera Panamá–Costa Rica">Frontera Panamá–Costa Rica</option>
              <option value="América Central">América Central</option>
              <option value="Caribe">Caribe</option>
              <option value="Pacífico Este / Sudamérica">Pacífico Este / Sudamérica</option>
              <option value="Global">Global</option>
            </select>
          </div>

          {/* Severity */}
          <div>
            <label
              htmlFor="hist-severity"
              className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1"
            >
              Severidad de riesgo
            </label>
            <select
              id="hist-severity"
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value as SeverityLevel | 'ALL');
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              <option value="ALL">Todos los niveles</option>
              <option value="CRITICO">■ Crítico (M ≥ 6.0 / Tsunami)</option>
              <option value="ALTO">◆ Alto (M ≥ 5.0 / Aviso)</option>
              <option value="MODERADO">▲ Moderado (M 3.5 – 4.9)</option>
              <option value="BAJO">● Bajo (M &lt; 3.5)</option>
            </select>
          </div>

          {/* Agency */}
          <div>
            <label
              htmlFor="hist-agency"
              className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1"
            >
              Agencia emisora
            </label>
            <select
              id="hist-agency"
              value={agencyFilter}
              onChange={(e) => {
                setAgencyFilter(e.target.value as SeismicAgency | 'ALL');
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              <option value="ALL">IGC-UP + USGS + EMSC</option>
              <option value="IGC-UP">IGC-UP (Panamá)</option>
              <option value="USGS">USGS (EE. UU.)</option>
              <option value="EMSC">EMSC (Europa/Global)</option>
            </select>
          </div>

          {/* Min Mag & Search */}
          <div>
            <label
              htmlFor="hist-search"
              className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1"
            >
              Buscar lugar / Mín. Mag ({minMag.toFixed(1)})
            </label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  id="hist-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Tonosí, Coiba..."
                  className="w-full pl-6 pr-2 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
              <select
                aria-label="Magnitud mínima"
                value={minMag}
                onChange={(e) => {
                  setMinMag(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                {[0, 2.5, 3.5, 4.5, 5.5, 6.0].map((m) => (
                  <option key={m} value={m}>
                    ≥{m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Date Presets & Summary Metrics */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mr-1">
              Rango rápido:
            </span>
            {[
              { label: '24 horas', days: 1 },
              { label: '7 días', days: 7 },
              { label: '30 días', days: 30 },
              { label: '90 días', days: 90 },
            ].map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => applyDatePreset(p.days)}
                className="px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
            <span>
              Total: <strong className="text-slate-900 dark:text-white">{filteredEvents.length}</strong>
            </span>
            <span>
              Máx: <strong className="text-slate-900 dark:text-white">{filteredEvents.length ? `M ${stats.maxMag.toFixed(1)}` : '—'}</strong>
            </span>
            <span>
              Prof. media: <strong className="text-slate-900 dark:text-white">{filteredEvents.length ? `${stats.avgDepth.toFixed(1)} km` : '—'}</strong>
            </span>
            <span>
              Alto/Crítico: <strong className="text-rose-600 dark:text-rose-400">{stats.highCritical}</strong>
            </span>
          </div>
        </div>
      </section>

      {/* Data Table */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3.5">
                  <button
                    type="button"
                    onClick={() => toggleSort('source')}
                    className="inline-flex items-center gap-1 font-semibold hover:text-slate-900 dark:hover:text-white"
                  >
                    Agencia <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3">
                  <button
                    type="button"
                    onClick={() => toggleSort('magnitude')}
                    className="inline-flex items-center gap-1 font-semibold hover:text-slate-900 dark:hover:text-white"
                  >
                    Magnitud <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3">Riesgo / Aviso</th>
                <th className="py-2.5 px-3">
                  <button
                    type="button"
                    onClick={() => toggleSort('depthKm')}
                    className="inline-flex items-center gap-1 font-semibold hover:text-slate-900 dark:hover:text-white"
                  >
                    Prof. <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3">Ubicación y Región</th>
                <th className="py-2.5 px-3">Coordenadas</th>
                <th className="py-2.5 px-3">
                  <button
                    type="button"
                    onClick={() => toggleSort('timestamp')}
                    className="inline-flex items-center gap-1 font-semibold hover:text-slate-900 dark:hover:text-white"
                  >
                    Fecha Local (Panamá) <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {loading && pagedEvents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    Consultando catálogos históricos de IGC-UP, USGS y EMSC...
                  </td>
                </tr>
              ) : pagedEvents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    No se encontraron registros sísmicos para los criterios seleccionados.
                  </td>
                </tr>
              ) : (
                pagedEvents.map((ev) => {
                  const sev = SEVERITY_META[ev.severity];
                  return (
                    <tr
                      key={ev.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-3.5 font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {ev.source}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        <span className="text-sm font-extrabold" style={{ color: sev.hex }}>
                          {ev.magnitude.toFixed(1)}
                        </span>{' '}
                        <span className="text-[10px] text-slate-400">{ev.magType}</span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`font-semibold ${sev.badgeTextClass}`}>
                          {sev.glyph} {sev.label}
                        </span>
                        <span className="text-slate-400 mx-1.5" aria-hidden="true">·</span>
                        <span className="text-slate-600 dark:text-slate-300">
                          {BULLETIN_LABEL[ev.bulletinType]}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {ev.depthKm.toFixed(1)} km
                      </td>
                      <td className="py-2.5 px-3 max-w-xs">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {ev.place}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {ev.regionCategory} · {ev.status}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatCoordinates(ev.lat, ev.lon)}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {formatPanamaDateTime(ev.timestamp)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onViewOnMap(ev)}
                            title="Ubicar en mapa Esri"
                            className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenGenerator(ev)}
                            title="Generar tarjeta 4:5"
                            className="p-1.5 rounded text-sky-600 dark:text-sky-400 hover:bg-sky-500/15 transition-colors"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => exportSingleEventPdf(ev)}
                            title="Descargar ficha PDF"
                            className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                          </button>
                          <ShareMenuButton event={ev} onOpenGenerator={onOpenGenerator} />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {filteredEvents.length > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              Página {currentPage} de {totalPages} ({filteredEvents.length} registros)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
