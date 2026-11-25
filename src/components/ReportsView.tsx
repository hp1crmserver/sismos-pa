import { Download, FileDown, Image as ImageIcon } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { EsriLayerId, SeismicEvent, SeverityLevel } from '../types/seismic';
import { renderEventCard4x5, renderHistorySummaryImage } from '../utils/canvasGenerator';
import { exportHistoryReportPdf, exportSingleEventPdf } from '../utils/pdfExporter';
import { SEVERITY_META, formatPanamaDateTime } from '../utils/seismicFormat';

interface ReportsViewProps {
  events: SeismicEvent[];
  selectedEvent: SeismicEvent | null;
  esriLayer: EsriLayerId;
  startDate: string;
  endDate: string;
}

export default function ReportsView({
  events,
  selectedEvent,
  esriLayer,
  startDate,
  endDate,
}: ReportsViewProps) {
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [busySingle, setBusySingle] = useState(false);

  const activeEvent = selectedEvent ?? events[0] ?? null;

  const agencyBreakdown = useMemo(() => {
    const counts = { 'IGC-UP': 0, USGS: 0, EMSC: 0 };
    for (const ev of events) {
      counts[ev.source] += 1;
    }
    return counts;
  }, [events]);

  const severityBreakdown = useMemo(() => {
    const counts: Record<SeverityLevel, number> = {
      BAJO: 0,
      MODERADO: 0,
      ALTO: 0,
      CRITICO: 0,
    };
    for (const ev of events) {
      counts[ev.severity] += 1;
    }
    return counts;
  }, [events]);

  const filterSummary = `${startDate} a ${endDate} · Agencias activas: IGC-UP (${agencyBreakdown['IGC-UP']}), USGS (${agencyBreakdown.USGS}), EMSC (${agencyBreakdown.EMSC})`;

  const handleExportSingleWithGraphic = async () => {
    if (!activeEvent) return;
    setBusySingle(true);
    try {
      let dataUrl = '';
      if (hiddenCanvasRef.current) {
        dataUrl = await renderEventCard4x5(hiddenCanvasRef.current, activeEvent, {
          template: 'scientific-light',
          esriLayer,
          customNote: 'Ficha técnica oficial de monitoreo sísmico.',
          zoom: 8,
        });
      }
      exportSingleEventPdf(activeEvent, dataUrl);
    } finally {
      setBusySingle(false);
    }
  };

  const handleExportSinglePng = async () => {
    if (!activeEvent || !hiddenCanvasRef.current) return;
    setBusySingle(true);
    try {
      const dataUrl = await renderEventCard4x5(hiddenCanvasRef.current, activeEvent, {
        template: 'official-dark',
        esriLayer,
        customNote: 'Boletín técnico generado por GeoAlert-pa.',
        zoom: 8,
      });
      if (dataUrl) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `boletin-${activeEvent.source.toLowerCase()}-M${activeEvent.magnitude.toFixed(
          1
        )}.png`;
        a.click();
      }
    } finally {
      setBusySingle(false);
    }
  };

  const handleExportConsolidatedPng = () => {
    const dataUrl = renderHistorySummaryImage(events, filterSummary);
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `reporte-consolidado-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  };

  const maxSevCount = Math.max(1, ...Object.values(severityBreakdown));
  const maxAgencyCount = Math.max(1, ...Object.values(agencyBreakdown));

  return (
    <div className="space-y-6">
      <canvas ref={hiddenCanvasRef} className="hidden" />

      {/* Top Export Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Consolidated Report Card */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-2">
            <div className="text-xs font-mono text-sky-600 dark:text-sky-400 font-semibold">
              REPORTE CONSOLIDADO MULTIFUENTE
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Informe Estadístico y Catálogo de Eventos
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Incluye resumen cuantitativo, desglose por agencia (IGC-UP, USGS, EMSC), distribución de severidad y tabla cronológica completa de los {events.length} sismos activos en tu consulta.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 py-3 border-y border-slate-100 dark:border-slate-800 font-mono tabular-nums">
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Eventos</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{events.length}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Mag. Máx</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                {events.length ? Math.max(...events.map((e) => e.magnitude)).toFixed(1) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Alto/Crítico</div>
              <div className="text-xl font-bold text-rose-600 dark:text-rose-400">
                {severityBreakdown.ALTO + severityBreakdown.CRITICO}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={events.length === 0}
              onClick={() => exportHistoryReportPdf(events, filterSummary)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-md bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              <FileDown className="w-4 h-4" />
              Descargar Reporte PDF
            </button>
            <button
              type="button"
              disabled={events.length === 0}
              onClick={handleExportConsolidatedPng}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte Imagen (PNG)
            </button>
          </div>
        </section>

        {/* Single Event Bulletin Card */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-2">
            <div className="text-xs font-mono text-sky-600 dark:text-sky-400 font-semibold">
              BOLETÍN INDIVIDUAL DE EVENTO
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Ficha Técnica con Mapa Esri
            </h2>
            {activeEvent ? (
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  M {activeEvent.magnitude.toFixed(1)} · {activeEvent.place}
                </p>
                <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {activeEvent.source} · {formatPanamaDateTime(activeEvent.timestamp)} · Prof.{' '}
                  {activeEvent.depthKm.toFixed(1)} km
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Selecciona un sismo para generar su boletín individual.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              disabled={!activeEvent || busySingle}
              onClick={handleExportSingleWithGraphic}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 transition-colors"
            >
              <FileDown className="w-4 h-4" />
              {busySingle ? 'Generando PDF...' : 'Exportar Ficha PDF (con Mapa)'}
            </button>
            <button
              type="button"
              disabled={!activeEvent || busySingle}
              onClick={handleExportSinglePng}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ImageIcon className="w-4 h-4" />
              Exportar Imagen 4:5 (PNG)
            </button>
          </div>
        </section>
      </div>

      {/* Distribution Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Distribución por Nivel de Severidad
          </h3>
          <div className="space-y-3">
            {(['CRITICO', 'ALTO', 'MODERADO', 'BAJO'] as const).map((lvl) => {
              const meta = SEVERITY_META[lvl];
              const count = severityBreakdown[lvl];
              const pct = Math.round((count / maxSevCount) * 100);
              return (
                <div key={lvl} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className={`font-semibold ${meta.badgeTextClass}`}>
                      {meta.glyph} {meta.label}
                    </span>
                    <span className="tabular-nums text-slate-700 dark:text-slate-300">
                      {count} eventos
                    </span>
                  </div>
                  <div className="h-2 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-300"
                      style={{ width: `${pct}%`, backgroundColor: meta.hex }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Cobertura por Agencia Sismológica
          </h3>
          <div className="space-y-3">
            {(
              [
                { id: 'IGC-UP', label: 'IGC-UP (Universidad de Panamá)', color: '#0284C7' },
                { id: 'USGS', label: 'USGS (United States Geological Survey)', color: '#0D9488' },
                { id: 'EMSC', label: 'EMSC (European-Mediterranean)', color: '#6366F1' },
              ] as const
            ).map((ag) => {
              const count = agencyBreakdown[ag.id];
              const pct = Math.round((count / maxAgencyCount) * 100);
              return (
                <div key={ag.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {ag.label}
                    </span>
                    <span className="tabular-nums text-slate-700 dark:text-slate-300">
                      {count} eventos
                    </span>
                  </div>
                  <div className="h-2 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-300"
                      style={{ width: `${pct}%`, backgroundColor: ag.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
