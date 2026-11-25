import L from 'leaflet';
import { Crosshair, Globe2, Layers, LocateFixed, Maximize2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { EsriLayerId, SeismicEvent } from '../types/seismic';
import {
  BULLETIN_LABEL,
  ESRI_LABELS_OVERLAY_URL,
  ESRI_LAYERS,
  SEVERITY_META,
  formatCoordinates,
  formatPanamaDateTime,
  getMarkerRadius,
} from '../utils/seismicFormat';
import {
  copyEventToClipboard,
  getShareChannelUrls,
  nativeShareEvent,
} from '../utils/shareEvent';

interface SeismicMapProps {
  events: SeismicEvent[];
  selectedEvent: SeismicEvent | null;
  onSelectEvent: (event: SeismicEvent) => void;
  onOpenGenerator?: (event: SeismicEvent) => void;
  esriLayer: EsriLayerId;
  onChangeEsriLayer: (layer: EsriLayerId) => void;
  isDarkTheme: boolean;
}

// Major tectonic boundaries around Central America, Caribbean, Cocos, Nazca & South America
const TECTONIC_LINES: Array<[number, number][]> = [
  // Middle America Trench (Cocos subduction under Panama/Costa Rica/Central America)
  [
    [15.2, -94.0],
    [13.4, -91.2],
    [11.4, -87.8],
    [9.4, -85.2],
    [8.0, -83.4],
    [6.8, -82.4],
  ],
  // Panama Fracture Zone (Cocos - Nazca boundary)
  [
    [8.2, -82.8],
    [6.5, -82.7],
    [4.2, -82.6],
    [1.8, -82.5],
  ],
  // North Panama Deformed Belt (Caribbean - Panama Microplate)
  [
    [9.8, -83.2],
    [9.6, -81.0],
    [9.8, -79.2],
    [9.4, -77.4],
    [10.2, -75.8],
  ],
  // South Panama / Darien - Colombia convergence
  [
    [7.2, -78.2],
    [6.4, -77.6],
    [4.8, -77.5],
  ],
  // Cayman Trough / Caribbean northern boundary
  [
    [15.8, -88.5],
    [17.4, -85.0],
    [18.8, -81.0],
    [19.6, -76.5],
    [19.9, -72.0],
  ],
];

export default function SeismicMap({
  events,
  selectedEvent,
  onSelectEvent,
  onOpenGenerator,
  esriLayer,
  onChangeEsriLayer,
  isDarkTheme,
}: SeismicMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const labelsLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const tectonicLayerRef = useRef<L.LayerGroup | null>(null);
  const pulseLayerRef = useRef<L.LayerGroup | null>(null);

  const [showLabels, setShowLabels] = useState(true);
  const [showTectonic, setShowTectonic] = useState(true);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(7);

  const activeLayerMeta = useMemo(
    () => ESRI_LAYERS.find((l) => l.id === esriLayer) ?? ESRI_LAYERS[0],
    [esriLayer]
  );

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [8.45, -80.25],
      zoom: 7,
      minZoom: 2,
      maxZoom: 16,
      zoomControl: false,
      worldCopyJump: true,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    tectonicLayerRef.current = L.layerGroup().addTo(map);
    pulseLayerRef.current = L.layerGroup().addTo(map);

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({ lat: e.latlng.lat, lon: e.latlng.lng });
    });

    map.on('zoomend', () => {
      setZoomLevel(map.getZoom());
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Esri tile layer & reference labels overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (baseLayerRef.current) {
      map.removeLayer(baseLayerRef.current);
      baseLayerRef.current = null;
    }
    if (labelsLayerRef.current) {
      map.removeLayer(labelsLayerRef.current);
      labelsLayerRef.current = null;
    }

    const base = L.tileLayer(activeLayerMeta.url, {
      attribution: activeLayerMeta.attribution,
      maxZoom: 18,
    }).addTo(map);
    baseLayerRef.current = base;

    if (showLabels && activeLayerMeta.needsLabelsOverlay) {
      const labels = L.tileLayer(ESRI_LABELS_OVERLAY_URL, {
        maxZoom: 18,
        pane: 'overlayPane',
      }).addTo(map);
      labelsLayerRef.current = labels;
    }
  }, [activeLayerMeta, showLabels]);

  // Toggle tectonic boundaries overlay
  useEffect(() => {
    const group = tectonicLayerRef.current;
    if (!group) return;
    group.clearLayers();

    if (!showTectonic) return;

    for (const line of TECTONIC_LINES) {
      L.polyline(line, {
        color: isDarkTheme ? '#38BDF8' : '#0284C7',
        weight: 1.5,
        dashArray: '6 5',
        opacity: 0.65,
      })
        .bindTooltip('Límite de placa tectónica', { sticky: true })
        .addTo(group);
    }
  }, [showTectonic, isDarkTheme]);

  // Render earthquake markers
  useEffect(() => {
    const group = markersLayerRef.current;
    if (!group) return;
    group.clearLayers();

    // Draw smallest first so higher magnitude sits on top
    const ordered = [...events].sort((a, b) => a.magnitude - b.magnitude);

    for (const ev of ordered) {
      const sev = SEVERITY_META[ev.severity];
      const isSelected = selectedEvent?.id === ev.id;
      const radius = getMarkerRadius(ev.magnitude);

      const marker = L.circleMarker([ev.lat, ev.lon], {
        radius: isSelected ? radius + 3 : radius,
        fillColor: sev.hex,
        color: isSelected ? '#FFFFFF' : '#0F172A',
        weight: isSelected ? 2.5 : 1.2,
        opacity: 1,
        fillOpacity: isSelected ? 0.95 : 0.78,
      });

      const shareUrls = getShareChannelUrls(ev);
      const canNative =
        typeof navigator !== 'undefined' && typeof navigator.share === 'function';

      const popupHtml = `
        <div style="padding:11px 12px; min-width:250px; max-width:290px; font-family:'Plus Jakarta Sans',sans-serif;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
            <span style="font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:11px; color:${sev.hex};">
              ${sev.glyph} ${sev.label.toUpperCase()} · ${BULLETIN_LABEL[ev.bulletinType].toUpperCase()}
            </span>
            <span style="font-family:'IBM Plex Mono',monospace; font-size:11px; opacity:0.75;">${ev.source}</span>
          </div>
          <div style="font-size:18px; font-weight:800; font-family:'IBM Plex Mono',monospace; margin-bottom:4px;">
            M ${ev.magnitude.toFixed(1)} <span style="font-size:11px; font-weight:500; opacity:0.7;">· Prof. ${ev.depthKm.toFixed(1)} km</span>
          </div>
          <div style="font-size:12px; font-weight:600; line-height:1.35; margin-bottom:6px;">
            ${ev.place}
          </div>
          <div style="font-family:'IBM Plex Mono',monospace; font-size:10.5px; opacity:0.75; margin-bottom:9px;">
            ${formatPanamaDateTime(ev.timestamp)}
          </div>
          <div style="border-top:1px solid rgba(148,163,184,0.25); padding-top:8px; display:flex; flex-wrap:wrap; gap:5px; align-items:center;">
            <button type="button" data-action="copy" style="font-size:11px; font-weight:600; padding:4px 8px; border-radius:4px; border:1px solid rgba(148,163,184,0.35); background:transparent; cursor:pointer; color:inherit;">
              Copiar
            </button>
            ${
              canNative
                ? `<button type="button" data-action="native" style="font-size:11px; font-weight:600; padding:4px 8px; border-radius:4px; border:1px solid rgba(148,163,184,0.35); background:transparent; cursor:pointer; color:inherit;">Compartir</button>`
                : ''
            }
            <a href="${shareUrls.whatsapp}" target="_blank" rel="noopener noreferrer" style="font-size:11px; font-weight:600; padding:4px 8px; border-radius:4px; border:1px solid rgba(148,163,184,0.35); text-decoration:none; color:inherit;">
              WhatsApp
            </a>
            <a href="${shareUrls.xTwitter}" target="_blank" rel="noopener noreferrer" style="font-size:11px; font-weight:600; padding:4px 8px; border-radius:4px; border:1px solid rgba(148,163,184,0.35); text-decoration:none; color:inherit;">
              X
            </a>
            <button type="button" data-action="card45" style="font-size:11px; font-weight:600; padding:4px 8px; border-radius:4px; border:none; background:#0284C7; color:#FFFFFF; cursor:pointer;">
              Tarjeta 4:5
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('popupopen', (popupEv) => {
        const el = popupEv.popup.getElement();
        if (!el) return;
        const copyBtn = el.querySelector<HTMLButtonElement>('[data-action="copy"]');
        const nativeBtn = el.querySelector<HTMLButtonElement>('[data-action="native"]');
        const cardBtn = el.querySelector<HTMLButtonElement>('[data-action="card45"]');

        if (copyBtn) {
          copyBtn.onclick = async () => {
            const ok = await copyEventToClipboard(ev);
            if (ok) {
              copyBtn.textContent = '¡Copiado!';
              setTimeout(() => {
                copyBtn.textContent = 'Copiar';
              }, 1400);
            }
          };
        }
        if (nativeBtn) {
          nativeBtn.onclick = () => {
            nativeShareEvent(ev);
          };
        }
        if (cardBtn) {
          cardBtn.onclick = () => {
            if (onOpenGenerator) {
              onOpenGenerator(ev);
            } else {
              onSelectEvent(ev);
            }
          };
        }
      });

      marker.on('click', () => onSelectEvent(ev));
      marker.addTo(group);
    }
  }, [events, selectedEvent, onSelectEvent, onOpenGenerator]);

  // Pulse indicator and flyTo when selectedEvent changes
  useEffect(() => {
    const map = mapRef.current;
    const pulseGroup = pulseLayerRef.current;
    if (!map || !pulseGroup) return;

    pulseGroup.clearLayers();
    if (!selectedEvent) return;

    const sev = SEVERITY_META[selectedEvent.severity];
    const pulseIcon = L.divIcon({
      className: '',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      html: `<div class="w-11 h-11 rounded-full border-2 seismic-pulse-ring" style="border-color:${sev.hex}; background:${sev.hex}22;"></div>`,
    });

    L.marker([selectedEvent.lat, selectedEvent.lon], {
      icon: pulseIcon,
      interactive: false,
    }).addTo(pulseGroup);

    const targetZoom = Math.max(map.getZoom(), selectedEvent.regionCategory === 'Global' ? 5 : 8);
    map.flyTo([selectedEvent.lat, selectedEvent.lon], targetZoom, {
      duration: 0.7,
    });
  }, [selectedEvent]);

  const handleFocusPanama = () => {
    mapRef.current?.flyTo([8.45, -80.25], 7, { duration: 0.6 });
  };

  const handleFocusCentralAmerica = () => {
    mapRef.current?.flyTo([10.5, -84.0], 5, { duration: 0.6 });
  };

  const handleFocusGlobal = () => {
    mapRef.current?.flyTo([12.0, -40.0], 2, { duration: 0.6 });
  };

  const handleFocusSelected = () => {
    if (!selectedEvent) return;
    mapRef.current?.flyTo([selectedEvent.lat, selectedEvent.lon], 9, { duration: 0.6 });
  };

  return (
    <div className="relative h-full w-full min-h-[460px] overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-900">
      <div ref={mapContainerRef} className="h-full w-full cursor-crosshair" />

      {/* Top-Left Esri Layer & Overlay Controls */}
      <div className="pointer-events-none absolute top-3 left-3 right-3 z-[400] flex flex-wrap items-center justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-md border border-slate-200/90 dark:border-slate-700/90 bg-white/92 dark:bg-slate-900/92 px-2.5 py-1.5 backdrop-blur-md shadow-sm">
          <Layers className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
          <label htmlFor="esri-layer-select" className="sr-only">
            Capa cartográfica de Esri
          </label>
          <select
            id="esri-layer-select"
            value={esriLayer}
            onChange={(e) => onChangeEsriLayer(e.target.value as EsriLayerId)}
            className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer pr-1"
          >
            {ESRI_LAYERS.map((layer) => (
              <option
                key={layer.id}
                value={layer.id}
                className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
              >
                {layer.name}
              </option>
            ))}
          </select>

          <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-700 mx-1" aria-hidden="true" />

          <button
            type="button"
            onClick={() => setShowLabels((v) => !v)}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
              showLabels
                ? 'bg-sky-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Etiquetas
          </button>

          <button
            type="button"
            onClick={() => setShowTectonic((v) => !v)}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
              showTectonic
                ? 'bg-sky-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Placas Tectónicas
          </button>
        </div>

        {/* Top-Right Quick Viewport Focus */}
        <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-slate-200/90 dark:border-slate-700/90 bg-white/92 dark:bg-slate-900/92 p-1 backdrop-blur-md shadow-sm">
          <button
            type="button"
            onClick={handleFocusPanama}
            className="px-2.5 py-1 text-[11px] font-semibold rounded text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            Panamá
          </button>
          <button
            type="button"
            onClick={handleFocusCentralAmerica}
            className="px-2.5 py-1 text-[11px] font-semibold rounded text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            Centroamérica
          </button>
          <button
            type="button"
            onClick={handleFocusGlobal}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Globe2 className="w-3 h-3" />
            Global
          </button>
          {selectedEvent && (
            <button
              type="button"
              onClick={handleFocusSelected}
              title="Centrar en evento seleccionado"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              <LocateFixed className="w-3 h-3" />
              Epicentro
            </button>
          )}
        </div>
      </div>

      {/* Bottom-Left Live Coordinate HUD & Severity Legend */}
      <div className="pointer-events-none absolute bottom-9 left-3 z-[400] flex flex-col gap-1.5">
        <div className="pointer-events-auto inline-flex items-center gap-3 rounded-md border border-slate-200/80 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/90 px-2.5 py-1 text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300 backdrop-blur-md">
          <span className="inline-flex items-center gap-1">
            <Crosshair className="w-3 h-3 text-sky-600 dark:text-sky-400" />
            {cursorCoords ? formatCoordinates(cursorCoords.lat, cursorCoords.lon) : '8.4500° N, 80.2500° O'}
          </span>
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">|</span>
          <span className="inline-flex items-center gap-1">
            <Maximize2 className="w-3 h-3 text-slate-400" />
            Z{zoomLevel}
          </span>
        </div>

        <div className="pointer-events-auto hidden sm:inline-flex items-center gap-3 rounded-md border border-slate-200/80 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/90 px-2.5 py-1 text-[11px] text-slate-700 dark:text-slate-300 backdrop-blur-md">
          {(['BAJO', 'MODERADO', 'ALTO', 'CRITICO'] as const).map((lvl) => {
            const meta = SEVERITY_META[lvl];
            return (
              <span key={lvl} className="inline-flex items-center gap-1 font-medium whitespace-nowrap">
                <span style={{ color: meta.hex }}>{meta.glyph}</span>
                {meta.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
