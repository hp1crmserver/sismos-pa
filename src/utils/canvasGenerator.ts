import type { EsriLayerId, SeismicEvent } from '../types/seismic';
import {
  AGENCY_FULL_NAME,
  BULLETIN_LABEL,
  SEVERITY_META,
  formatCoordinates,
  formatPanamaDateTime,
  formatUtcDateTime,
} from './seismicFormat';

export type CardTemplateStyle = 'official-dark' | 'scientific-light' | 'emergency-contrast';

export interface EventGraphicOptions {
  template: CardTemplateStyle;
  esriLayer: EsriLayerId;
  customNote: string;
  zoom?: number;
}

function latLonToTileFloat(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

const ESRI_SERVICE_PATHS: Record<EsriLayerId, string> = {
  World_Imagery: 'World_Imagery',
  World_Topo_Map: 'World_Topo_Map',
  World_Dark_Gray_Base: 'Canvas/World_Dark_Gray_Base',
  World_Light_Gray_Base: 'Canvas/World_Light_Gray_Base',
  World_Ocean_Base: 'Ocean/World_Ocean_Base',
  World_Street_Map: 'World_Street_Map',
};

function loadTileImage(url: string, fallbackUrl?: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 5000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      if (fallbackUrl && img.src !== fallbackUrl) {
        loadTileImage(fallbackUrl).then(resolve);
      } else {
        resolve(null);
      }
    };
    img.src = url;
  });
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export async function renderEventCard4x5(
  canvas: HTMLCanvasElement,
  event: SeismicEvent,
  options: EventGraphicOptions
): Promise<string> {
  const W = 1080;
  const H = 1350; // Strict 4:5 aspect ratio
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const sev = SEVERITY_META[event.severity];
  const isLight = options.template === 'scientific-light';
  const isEmergency = options.template === 'emergency-contrast';

  const bgMain = isLight ? '#F8FAFC' : isEmergency ? '#09090B' : '#070B12';
  const cardSurface = isLight ? '#FFFFFF' : isEmergency ? '#141418' : '#0F172A';
  const borderCol = isLight ? '#CBD5E1' : isEmergency ? '#27272A' : '#1E293B';
  const textPrimary = isLight ? '#0F172A' : '#F8FAFC';
  const textMuted = isLight ? '#475569' : '#94A3B8';
  const accentColor = isEmergency ? '#EF4444' : sev.hex;

  // Base background
  ctx.fillStyle = bgMain;
  ctx.fillRect(0, 0, W, H);

  // Top precision color bar
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, W, 12);

  // Header area
  const pad = 56;
  ctx.fillStyle = textMuted;
  ctx.font = '600 22px "IBM Plex Mono", monospace';
  ctx.fillText(
    `${BULLETIN_LABEL[event.bulletinType].toUpperCase()} SÍSMICO  ·  ${event.source}`,
    pad,
    72
  );

  ctx.fillStyle = textPrimary;
  ctx.font = '700 34px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Reporte de Monitoreo', pad, 120);

  // Severity badge on top right
  const sevLabel = `${sev.glyph} RIESGO ${sev.label.toUpperCase()}`;
  ctx.font = '700 22px "IBM Plex Mono", monospace';
  const sevTextW = ctx.measureText(sevLabel).width;
  const pillW = sevTextW + 40;
  const pillX = W - pad - pillW;
  drawRoundedRect(ctx, pillX, 54, pillW, 52, 10);
  ctx.fillStyle = `${accentColor}22`;
  ctx.fill();
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = isLight && event.severity === 'MODERADO' ? '#B45309' : accentColor;
  ctx.fillText(sevLabel, pillX + 20, 88);

  // Map Viewport Box (embedded Esri map centered on epicenter)
  const mapX = pad;
  const mapY = 160;
  const mapW = W - pad * 2;
  const mapH = 480;

  ctx.save();
  drawRoundedRect(ctx, mapX, mapY, mapW, mapH, 16);
  ctx.clip();

  // Fallback bathymetric/grid backdrop inside map box
  ctx.fillStyle = isLight ? '#E2E8F0' : '#0B1324';
  ctx.fillRect(mapX, mapY, mapW, mapH);

  // Fetch 3x3 Esri tile grid centered on epicenter via local proxy
  const zoom = options.zoom ?? (event.regionCategory === 'Global' ? 6 : 8);
  const tilePos = latLonToTileFloat(event.lat, event.lon, zoom);
  const centerTileX = Math.floor(tilePos.x);
  const centerTileY = Math.floor(tilePos.y);
  const maxTileIdx = Math.pow(2, zoom);
  const tileSize = 256;

  const offsetInCenterTileX = (tilePos.x - centerTileX) * tileSize;
  const offsetInCenterTileY = (tilePos.y - centerTileY) * tileSize;
  const mapCenterX = mapX + mapW / 2;
  const mapCenterY = mapY + mapH / 2;

  const tilePromises: Array<Promise<{ dx: number; dy: number; img: HTMLImageElement | null }>> = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const tx = ((centerTileX + dx) % maxTileIdx + maxTileIdx) % maxTileIdx;
      const ty = centerTileY + dy;
      if (ty < 0 || ty >= maxTileIdx) continue;
      const drawX = mapCenterX - offsetInCenterTileX + dx * tileSize;
      const drawY = mapCenterY - offsetInCenterTileY + dy * tileSize;
      if (drawX + tileSize < mapX || drawX > mapX + mapW || drawY + tileSize < mapY || drawY > mapY + mapH) {
        continue;
      }
      const servicePath = ESRI_SERVICE_PATHS[options.esriLayer] || 'World_Imagery';
      const proxyUrl = `./api/esri-tile/${options.esriLayer}/${zoom}/${ty}/${tx}`;
      const directUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/${servicePath}/MapServer/tile/${zoom}/${ty}/${tx}`;
      tilePromises.push(
        loadTileImage(proxyUrl, directUrl).then((img) => ({ dx: drawX, dy: drawY, img }))
      );
    }
  }

  const loadedTiles = await Promise.all(tilePromises);
  for (const t of loadedTiles) {
    if (t.img) {
      ctx.drawImage(t.img, t.dx, t.dy, tileSize, tileSize);
    }
  }

  // Coordinate graticule overlay
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  for (let gx = mapX + 120; gx < mapX + mapW; gx += 120) {
    ctx.beginPath();
    ctx.moveTo(gx, mapY);
    ctx.lineTo(gx, mapY + mapH);
    ctx.stroke();
  }
  for (let gy = mapY + 120; gy < mapY + mapH; gy += 120) {
    ctx.beginPath();
    ctx.moveTo(mapX, gy);
    ctx.lineTo(mapX + mapW, gy);
    ctx.stroke();
  }

  // Concentric seismic wave rings around epicenter
  const radii = [150, 102, 58];
  radii.forEach((r, idx) => {
    ctx.beginPath();
    ctx.arc(mapCenterX, mapCenterY, r, 0, Math.PI * 2);
    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = 0.25 + idx * 0.25;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = accentColor;
    ctx.globalAlpha = 0.08 + idx * 0.04;
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Crosshair lines
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mapCenterX - 28, mapCenterY);
  ctx.lineTo(mapCenterX + 28, mapCenterY);
  ctx.moveTo(mapCenterX, mapCenterY - 28);
  ctx.lineTo(mapCenterX, mapCenterY + 28);
  ctx.stroke();

  // Epicenter core dot
  ctx.beginPath();
  ctx.arc(mapCenterX, mapCenterY, 13, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Bottom scrim inside map for coordinates badge
  const scrimGrad = ctx.createLinearGradient(0, mapY + mapH - 80, 0, mapY + mapH);
  scrimGrad.addColorStop(0, 'rgba(0,0,0,0)');
  scrimGrad.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = scrimGrad;
  ctx.fillRect(mapX, mapY + mapH - 80, mapW, 80);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = '600 20px "IBM Plex Mono", monospace';
  ctx.fillText(`EPICENTRO: ${formatCoordinates(event.lat, event.lon)}`, mapX + 22, mapY + mapH - 22);

  const layerTag = `CAPA ESRI · Z${zoom}`;
  const layerTagW = ctx.measureText(layerTag).width;
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText(layerTag, mapX + mapW - layerTagW - 22, mapY + mapH - 22);

  ctx.restore();

  // Map border
  drawRoundedRect(ctx, mapX, mapY, mapW, mapH, 16);
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Primary Data Panel below map
  const panelY = 674;
  const panelH = 472;
  drawRoundedRect(ctx, pad, panelY, mapW, panelH, 16);
  ctx.fillStyle = cardSurface;
  ctx.fill();
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Magnitude Hero Left Column inside panel
  const magColX = pad + 40;
  ctx.fillStyle = textMuted;
  ctx.font = '600 20px "IBM Plex Mono", monospace';
  ctx.fillText(`MAGNITUD (${event.magType})`, magColX, panelY + 52);

  ctx.fillStyle = isLight && event.severity === 'MODERADO' ? '#B45309' : accentColor;
  ctx.font = '800 108px "IBM Plex Mono", monospace';
  ctx.fillText(event.magnitude.toFixed(1), magColX, panelY + 158);

  // Vertical divider inside top half of panel
  const splitX = pad + 340;
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(splitX, panelY + 28);
  ctx.lineTo(splitX, panelY + 195);
  ctx.stroke();

  // Place & Region Right Column
  const placeX = splitX + 36;
  const placeMaxW = mapW - 340 - 72;
  ctx.fillStyle = textMuted;
  ctx.font = '600 20px "IBM Plex Mono", monospace';
  ctx.fillText(`REGIÓN · ${event.regionCategory.toUpperCase()}`, placeX, panelY + 52);

  ctx.fillStyle = textPrimary;
  ctx.font = '700 32px "Plus Jakarta Sans", sans-serif';
  const placeLines = wrapLines(ctx, event.place, placeMaxW, 3);
  placeLines.forEach((line, idx) => {
    ctx.fillText(line, placeX, panelY + 102 + idx * 42);
  });

  // Horizontal divider
  ctx.strokeStyle = borderCol;
  ctx.beginPath();
  ctx.moveTo(pad + 32, panelY + 216);
  ctx.lineTo(pad + mapW - 32, panelY + 216);
  ctx.stroke();

  // 4-cell telemetry grid inside panel
  const col1X = pad + 40;
  const col2X = pad + mapW / 2 + 20;

  // Row 1
  ctx.fillStyle = textMuted;
  ctx.font = '600 18px "IBM Plex Mono", monospace';
  ctx.fillText('HORA LOCAL PANAMÁ (UTC-5)', col1X, panelY + 258);
  ctx.fillText('PROFUNDIDAD FOCAL', col2X, panelY + 258);

  ctx.fillStyle = textPrimary;
  ctx.font = '700 27px "IBM Plex Mono", monospace';
  ctx.fillText(formatPanamaDateTime(event.timestamp), col1X, panelY + 298);
  ctx.fillText(`${event.depthKm.toFixed(1)} km`, col2X, panelY + 298);

  // Row 2
  ctx.fillStyle = textMuted;
  ctx.font = '600 18px "IBM Plex Mono", monospace';
  ctx.fillText('TIEMPO UNIVERSAL (UTC)', col1X, panelY + 356);
  ctx.fillText('ESTADO / TSUNAMI', col2X, panelY + 356);

  ctx.fillStyle = textPrimary;
  ctx.font = '600 24px "IBM Plex Mono", monospace';
  ctx.fillText(formatUtcDateTime(event.timestamp), col1X, panelY + 394);

  const tsunamiText = event.tsunamiAlert ? 'ALERTA TSUNAMI ACTIVA' : 'Sin alerta de tsunami';
  ctx.fillStyle = event.tsunamiAlert ? '#EF4444' : textPrimary;
  ctx.fillText(`${event.status} · ${tsunamiText}`, col2X, panelY + 394);

  // Custom advisory note if provided
  if (options.customNote.trim()) {
    ctx.fillStyle = textMuted;
    ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
    const noteLines = wrapLines(ctx, `Nota: ${options.customNote.trim()}`, mapW - 80, 1);
    if (noteLines[0]) {
      ctx.fillText(noteLines[0], col1X, panelY + 446);
    }
  }

  // Footer attribution strip
  ctx.fillStyle = textMuted;
  ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`Fuente oficial: ${AGENCY_FULL_NAME[event.source]}`, pad, 1218);

  ctx.font = '500 18px "IBM Plex Mono", monospace';
  ctx.fillText(`ID Evento: ${event.sourceEventId}`, pad, 1254);

  const brandRight = 'GeoAlert-pa · Monitor Sísmico';
  const brandW = ctx.measureText(brandRight).width;
  ctx.fillStyle = textPrimary;
  ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(brandRight, W - pad - brandW, 1222);

  // Bottom precision bar
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, H - 10, W, 10);

  return canvas.toDataURL('image/png');
}

export function renderHistorySummaryImage(
  events: SeismicEvent[],
  filterDescription: string
): string {
  const canvas = document.createElement('canvas');
  const W = 1400;
  const rowCount = Math.min(events.length, 18);
  const H = 480 + rowCount * 58 + 110;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Clean light clinical report background for crisp readability/printing
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, W, 14);

  const pad = 56;
  ctx.fillStyle = '#0284C7';
  ctx.font = '700 18px "IBM Plex Mono", monospace';
  ctx.fillText('GEOALERT-PA · REPORTE SISMOLÓGICO CONSOLIDADO', pad, 62);

  ctx.fillStyle = '#0F172A';
  ctx.font = '800 36px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Historial de Eventos, Alertas y Boletines', pad, 108);

  ctx.fillStyle = '#475569';
  ctx.font = '500 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    `Generado: ${formatPanamaDateTime(Date.now())} (Panamá)  ·  Filtros: ${filterDescription}`,
    pad,
    144
  );

  // KPI strip
  const maxMag = events.length ? Math.max(...events.map((e) => e.magnitude)) : 0;
  const avgDepth = events.length
    ? events.reduce((acc, e) => acc + e.depthKm, 0) / events.length
    : 0;
  const criticalOrHigh = events.filter(
    (e) => e.severity === 'CRITICO' || e.severity === 'ALTO'
  ).length;

  const kpis = [
    { label: 'TOTAL EVENTOS', value: String(events.length) },
    { label: 'MAGNITUD MÁXIMA', value: events.length ? `M ${maxMag.toFixed(1)}` : '—' },
    { label: 'PROFUNDIDAD MEDIA', value: events.length ? `${avgDepth.toFixed(1)} km` : '—' },
    { label: 'RIESGO ALTO / CRÍTICO', value: String(criticalOrHigh) },
  ];

  const boxW = (W - pad * 2 - 48) / 4;
  kpis.forEach((k, idx) => {
    const bx = pad + idx * (boxW + 16);
    drawRoundedRect(ctx, bx, 178, boxW, 102, 10);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = '600 14px "IBM Plex Mono", monospace';
    ctx.fillText(k.label, bx + 20, 212);

    ctx.fillStyle = '#0F172A';
    ctx.font = '800 32px "IBM Plex Mono", monospace';
    ctx.fillText(k.value, bx + 20, 256);
  });

  // Table header
  const tableY = 320;
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(pad, tableY, W - pad * 2, 46);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 15px "IBM Plex Mono", monospace';
  ctx.fillText('AGENCIA', pad + 16, tableY + 29);
  ctx.fillText('MAG', pad + 140, tableY + 29);
  ctx.fillText('SEVERIDAD', pad + 235, tableY + 29);
  ctx.fillText('PROF.', pad + 400, tableY + 29);
  ctx.fillText('UBICACIÓN / REGIÓN', pad + 510, tableY + 29);
  ctx.fillText('FECHA Y HORA (PANAMÁ)', pad + 1020, tableY + 29);

  // Table rows
  events.slice(0, rowCount).forEach((ev, idx) => {
    const ry = tableY + 46 + idx * 58;
    ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    ctx.fillRect(pad, ry, W - pad * 2, 58);

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, ry + 58);
    ctx.lineTo(W - pad, ry + 58);
    ctx.stroke();

    const sev = SEVERITY_META[ev.severity];
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 16px "IBM Plex Mono", monospace';
    ctx.fillText(ev.source, pad + 16, ry + 35);

    ctx.fillStyle = sev.hex;
    ctx.font = '800 20px "IBM Plex Mono", monospace';
    ctx.fillText(ev.magnitude.toFixed(1), pad + 140, ry + 36);

    ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${sev.glyph} ${sev.label}`, pad + 235, ry + 35);

    ctx.fillStyle = '#334155';
    ctx.font = '500 16px "IBM Plex Mono", monospace';
    ctx.fillText(`${ev.depthKm.toFixed(1)} km`, pad + 400, ry + 35);

    ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
    const placeLine = wrapLines(ctx, ev.place, 480, 1)[0] || ev.place;
    ctx.fillText(placeLine, pad + 510, ry + 35);

    ctx.fillStyle = '#475569';
    ctx.font = '500 15px "IBM Plex Mono", monospace';
    ctx.fillText(formatPanamaDateTime(ev.timestamp), pad + 1020, ry + 35);
  });

  // Footer
  ctx.fillStyle = '#64748B';
  ctx.font = '500 15px "Plus Jakarta Sans", sans-serif';
  const note =
    events.length > rowCount
      ? `Mostrando los ${rowCount} eventos más recientes de ${events.length} registros filtrados. Fuentes: IGC-UP, USGS y EMSC.`
      : `Total de ${events.length} registros exportados. Fuentes oficiales: IGC-UP, USGS y EMSC.`;
  ctx.fillText(note, pad, H - 44);

  return canvas.toDataURL('image/png');
}
