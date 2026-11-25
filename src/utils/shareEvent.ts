import type { SeismicEvent } from '../types/seismic';
import {
  BULLETIN_LABEL,
  SEVERITY_META,
  formatCoordinates,
  formatPanamaDateTime,
} from './seismicFormat';

export function buildEventShareText(event: SeismicEvent): string {
  const sev = SEVERITY_META[event.severity];
  const bulletin = BULLETIN_LABEL[event.bulletinType].toUpperCase();
  const lines = [
    `GeoAlert-pa | ${bulletin} SÍSMICO (${event.source})`,
    `Magnitud: ${event.magnitude.toFixed(1)} ${event.magType} · Riesgo ${sev.label}`,
    `Ubicación: ${event.place}`,
    `Profundidad: ${event.depthKm.toFixed(1)} km`,
    `Coordenadas: ${formatCoordinates(event.lat, event.lon)}`,
    `Hora Panamá: ${formatPanamaDateTime(event.timestamp)}`,
    event.tsunamiAlert ? 'Alerta de Tsunami: ACTIVA' : '',
    `Fuente oficial: ${event.url}`,
  ].filter(Boolean);

  return lines.join('\n');
}

export async function copyEventToClipboard(event: SeismicEvent): Promise<boolean> {
  const text = buildEventShareText(event);
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export async function nativeShareEvent(event: SeismicEvent): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false;
  }
  try {
    await navigator.share({
      title: `GeoAlert-pa · Sismo M ${event.magnitude.toFixed(1)} (${event.source})`,
      text: buildEventShareText(event),
      url: event.url,
    });
    return true;
  } catch {
    return false;
  }
}

export function getShareChannelUrls(event: SeismicEvent): {
  whatsapp: string;
  xTwitter: string;
  telegram: string;
} {
  const text = buildEventShareText(event);
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(event.url);
  const shortTitle = encodeURIComponent(
    `GeoAlert-pa · ${BULLETIN_LABEL[event.bulletinType]} M ${event.magnitude.toFixed(1)} en ${
      event.place
    } (${event.source})`
  );

  return {
    whatsapp: `https://wa.me/?text=${encodedText}`,
    xTwitter: `https://twitter.com/intent/tweet?text=${encodedText}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${shortTitle}`,
  };
}
