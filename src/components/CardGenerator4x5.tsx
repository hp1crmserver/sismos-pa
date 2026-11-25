import { Check, Copy, Download, FileDown, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EsriLayerId, SeismicEvent } from '../types/seismic';
import {
  type CardTemplateStyle,
  renderEventCard4x5,
} from '../utils/canvasGenerator';
import { exportSingleEventPdf } from '../utils/pdfExporter';
import { ESRI_LAYERS, SEVERITY_META, formatPanamaDateTime } from '../utils/seismicFormat';

interface CardGenerator4x5Props {
  events: SeismicEvent[];
  selectedEvent: SeismicEvent | null;
  onSelectEvent: (event: SeismicEvent) => void;
  defaultEsriLayer: EsriLayerId;
}

export default function CardGenerator4x5({
  events,
  selectedEvent,
  onSelectEvent,
  defaultEsriLayer,
}: CardGenerator4x5Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [template, setTemplate] = useState<CardTemplateStyle>('official-dark');
  const [esriLayer, setEsriLayer] = useState<EsriLayerId>(defaultEsriLayer);
  const [zoom, setZoom] = useState<number>(8);
  const [customNote, setCustomNote] = useState<string>(
    'Mantenga la calma y verifique las rutas de evacuación. Fuente oficial de monitoreo.'
  );
  const [rendering, setRendering] = useState(false);
  const [dataUrl, setDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const activeEvent = selectedEvent ?? events[0] ?? null;

  const generateGraphic = useCallback(async () => {
    if (!activeEvent || !canvasRef.current) return;
    setRendering(true);
    try {
      const url = await renderEventCard4x5(canvasRef.current, activeEvent, {
        template,
        esriLayer,
        customNote,
        zoom,
      });
      setDataUrl(url);
    } finally {
      setRendering(false);
    }
  }, [activeEvent, template, esriLayer, customNote, zoom]);

  useEffect(() => {
    generateGraphic();
  }, [generateGraphic]);

  const handleDownloadPng = () => {
    if (!dataUrl || !activeEvent) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `sismo-${activeEvent.source.toLowerCase()}-M${activeEvent.magnitude.toFixed(
      1
    )}-4x5.png`;
    link.click();
  };

  const handleCopyImage = async () => {
    if (!canvasRef.current) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvasRef.current?.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob || !navigator.clipboard?.write) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback silent if clipboard image permissions are blocked in iframe
    }
  };

  if (!activeEvent) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-10 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No hay eventos disponibles para generar una tarjeta gráfica 4:5.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Configuration Column */}
      <div className="lg:col-span-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-5 space-y-5">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Generador de Imagen Informativa 4:5
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Composición vertical 1080 × 1350 px con mapa Esri centrado en el epicentro y ficha sísmica oficial.
          </p>
        </div>

        {/* Select Event */}
        <div className="space-y-1.5">
          <label
            htmlFor="gen-event-select"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Evento sísmico seleccionado
          </label>
          <select
            id="gen-event-select"
            value={activeEvent.id}
            onChange={(e) => {
              const found = events.find((ev) => ev.id === e.target.value);
              if (found) onSelectEvent(found);
            }}
            className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
          >
            {events.slice(0, 80).map((ev) => (
              <option key={ev.id} value={ev.id}>
                [{ev.source}] M {ev.magnitude.toFixed(1)} · {ev.place} (
                {formatPanamaDateTime(ev.timestamp)})
              </option>
            ))}
          </select>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Riesgo: {SEVERITY_META[activeEvent.severity].glyph}{' '}
            {SEVERITY_META[activeEvent.severity].label} · Prof. {activeEvent.depthKm.toFixed(1)} km
          </div>
        </div>

        {/* Visual Template */}
        <div className="space-y-1.5">
          <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Estilo de plantilla
          </span>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'official-dark', label: 'Oficial Oscuro' },
                { id: 'scientific-light', label: 'Científico Claro' },
                { id: 'emergency-contrast', label: 'Alerta Crítica' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTemplate(opt.id)}
                className={`px-2.5 py-2 text-xs font-semibold rounded-md border transition-colors ${
                  template === opt.id
                    ? 'border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Esri Layer & Zoom */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 space-y-1.5">
            <label
              htmlFor="gen-esri-layer"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Capa Esri del mapa
            </label>
            <select
              id="gen-esri-layer"
              value={esriLayer}
              onChange={(e) => setEsriLayer(e.target.value as EsriLayerId)}
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
            >
              {ESRI_LAYERS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="gen-zoom"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Escala (Zoom)
            </label>
            <select
              id="gen-zoom"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
            >
              {[5, 6, 7, 8, 9, 10].map((z) => (
                <option key={z} value={z}>
                  Z{z}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom Note */}
        <div className="space-y-1.5">
          <label
            htmlFor="gen-note"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Nota de aviso / recomendación (opcional)
          </label>
          <textarea
            id="gen-note"
            rows={2}
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            maxLength={140}
            className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Actions */}
        <div className="pt-2 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={rendering || !dataUrl}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Descargar PNG (4:5)
          </button>

          <button
            type="button"
            onClick={handleCopyImage}
            disabled={rendering || !dataUrl}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado' : 'Copiar Imagen'}
          </button>

          <button
            type="button"
            onClick={() => exportSingleEventPdf(activeEvent, dataUrl)}
            disabled={rendering || !dataUrl}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <FileDown className="w-4 h-4" />
            Exportar PDF
          </button>

          <button
            type="button"
            onClick={generateGraphic}
            disabled={rendering}
            title="Regenerar vista previa"
            className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rendering ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Right Live 4:5 Canvas Preview */}
      <div className="lg:col-span-7 flex flex-col items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#090D16] p-4 sm:p-6">
        <div className="w-full max-w-[460px] flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400 mb-3">
          <span>Vista previa 4:5 (1080 × 1350 px)</span>
          <span>{rendering ? 'Renderizando capas Esri...' : 'Listo para exportar'}</span>
        </div>

        <div className="w-full max-w-[460px] aspect-[4/5] rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shadow-lg bg-slate-950">
          <canvas
            ref={canvasRef}
            className="w-full h-full block object-contain"
          />
        </div>
      </div>
    </div>
  );
}
