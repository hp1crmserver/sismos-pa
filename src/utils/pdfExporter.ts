import { jsPDF } from 'jspdf';
import type { SeismicEvent } from '../types/seismic';
import {
  AGENCY_FULL_NAME,
  BULLETIN_LABEL,
  SEVERITY_META,
  formatCoordinates,
  formatPanamaDateTime,
  formatUtcDateTime,
} from './seismicFormat';

export function exportSingleEventPdf(event: SeismicEvent, previewDataUrl?: string): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const sev = SEVERITY_META[event.severity];

  // Top accent bar
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('GEOALERT-PA · FICHA TÉCNICA DE EVENTO SÍSMICO', 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `Fuente: ${AGENCY_FULL_NAME[event.source]}  |  Emitido: ${formatPanamaDateTime(Date.now())}`,
    14,
    18
  );

  // Title & Classification
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  const titleLines = doc.splitTextToSize(event.place, pageW - 28);
  doc.text(titleLines, 14, 36);

  let y = 36 + titleLines.length * 7 + 4;

  // Classification Strip
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, y, pageW - 28, 14, 2, 2, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `${BULLETIN_LABEL[event.bulletinType].toUpperCase()}  ·  NIVEL DE RIESGO: ${sev.label.toUpperCase()}  ·  ESTADO: ${
      event.status
    }`,
    18,
    y + 9
  );
  y += 22;

  // Key Parameters Grid
  const rows: Array<[string, string]> = [
    ['Magnitud', `${event.magnitude.toFixed(1)} ${event.magType}`],
    ['Profundidad Focal', `${event.depthKm.toFixed(1)} km`],
    ['Coordenadas Epicentrales', formatCoordinates(event.lat, event.lon)],
    ['Región Geográfica', event.regionCategory],
    ['Fecha y Hora Local (Panamá)', formatPanamaDateTime(event.timestamp)],
    ['Fecha y Hora Universal (UTC)', formatUtcDateTime(event.timestamp)],
    ['Alerta de Tsunami', event.tsunamiAlert ? 'ACTIVA — Verificar boletín PTWC' : 'No emitida'],
    ['Identificador del Evento', event.sourceEventId],
    ['Enlace Oficial', event.url],
  ];

  doc.setFontSize(9.5);
  rows.forEach(([label, value], idx) => {
    const rowY = y + idx * 8.5;
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, rowY - 5, pageW - 28, 8.5, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(label, 17, rowY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    const valLines = doc.splitTextToSize(value, pageW - 90);
    doc.text(valLines[0] || value, 74, rowY);
  });

  y += rows.length * 8.5 + 8;

  // Embed 4:5 card graphic if rendered
  if (previewDataUrl && previewDataUrl.startsWith('data:image/')) {
    const imgW = 92;
    const imgH = (imgW * 5) / 4; // 4:5 exact ratio
    if (y + imgH < 280) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('Visualización Cartográfica Esri (Formato 4:5)', 14, y);
      doc.addImage(previewDataUrl, 'PNG', 14, y + 4, imgW, imgH);
    }
  }

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Documento generado automáticamente por GeoAlert-pa con datos oficiales de IGC-UP, USGS y EMSC.',
    14,
    287
  );

  doc.save(`boletin-sismo-${event.source.toLowerCase()}-${event.magnitude.toFixed(1)}.pdf`);
}

export function exportHistoryReportPdf(
  events: SeismicEvent[],
  filterDescription: string
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const drawHeader = (pageNum: number) => {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('GEOALERT-PA · REPORTE HISTÓRICO DE MONITOREO SÍSMICO', 12, 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      `Agencias: IGC-UP · USGS · EMSC   |   Generado: ${formatPanamaDateTime(
        Date.now()
      )}   |   Página ${pageNum}`,
      12,
      15.5
    );
  };

  drawHeader(1);

  // Filter Summary & KPIs
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(9);
  doc.text(`Criterios de filtro: ${filterDescription}`, 12, 28);

  const maxMag = events.length ? Math.max(...events.map((e) => e.magnitude)) : 0;
  const avgDepth = events.length
    ? events.reduce((acc, e) => acc + e.depthKm, 0) / events.length
    : 0;
  const countByAgency = {
    'IGC-UP': events.filter((e) => e.source === 'IGC-UP').length,
    USGS: events.filter((e) => e.source === 'USGS').length,
    EMSC: events.filter((e) => e.source === 'EMSC').length,
  };

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(12, 32, pageW - 24, 14, 2, 2, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    `Total: ${events.length} eventos   |   Magnitud máxima: ${
      events.length ? maxMag.toFixed(1) : '—'
    }   |   Prof. media: ${events.length ? avgDepth.toFixed(1) : '—'} km   |   IGC-UP: ${
      countByAgency['IGC-UP']
    } · USGS: ${countByAgency.USGS} · EMSC: ${countByAgency.EMSC}`,
    16,
    41
  );

  // Table Headers
  let y = 54;
  const drawTableHeader = () => {
    doc.setFillColor(30, 41, 59);
    doc.rect(12, y, pageW - 24, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('AGENCIA', 14, y + 5.5);
    doc.text('MAG', 36, y + 5.5);
    doc.text('RIESGO', 52, y + 5.5);
    doc.text('AVISO', 76, y + 5.5);
    doc.text('PROF.', 102, y + 5.5);
    doc.text('COORDENADAS', 120, y + 5.5);
    doc.text('UBICACIÓN / REGIÓN', 165, y + 5.5);
    doc.text('FECHA LOCAL (PANAMÁ)', 242, y + 5.5);
    y += 8;
  };

  drawTableHeader();

  let pageNum = 1;
  events.slice(0, 250).forEach((ev, idx) => {
    if (y > pageH - 18) {
      doc.addPage();
      pageNum += 1;
      drawHeader(pageNum);
      y = 28;
      drawTableHeader();
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(12, y, pageW - 24, 7.5, 'F');
    }

    const sev = SEVERITY_META[ev.severity];
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(ev.source, 14, y + 5);
    doc.text(ev.magnitude.toFixed(1), 36, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.text(sev.label, 52, y + 5);
    doc.text(BULLETIN_LABEL[ev.bulletinType], 76, y + 5);
    doc.text(`${ev.depthKm.toFixed(1)} km`, 102, y + 5);
    doc.text(formatCoordinates(ev.lat, ev.lon), 120, y + 5);

    const placeTrunc =
      ev.place.length > 44 ? `${ev.place.slice(0, 41)}...` : ev.place;
    doc.text(placeTrunc, 165, y + 5);
    doc.text(formatPanamaDateTime(ev.timestamp), 242, y + 5);

    y += 7.5;
  });

  doc.save(`reporte-sismico-historial-${new Date().toISOString().slice(0, 10)}.pdf`);
}
