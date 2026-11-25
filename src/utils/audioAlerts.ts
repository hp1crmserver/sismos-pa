import type { AudioAlertSettings, SeismicEvent, SeverityLevel } from '../types/seismic';
import { BULLETIN_LABEL } from './seismicFormat';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function playToneSequence(
  notes: Array<{ freq: number; duration: number; delay: number; type?: OscillatorType }>,
  volume: number
): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const gainLevel = Math.max(0.02, Math.min(0.8, volume));
  const now = ctx.currentTime;

  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type || 'sine';
    osc.frequency.setValueAtTime(n.freq, now + n.delay);

    gain.gain.setValueAtTime(0.0001, now + n.delay);
    gain.gain.exponentialRampToValueAtTime(gainLevel, now + n.delay + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.delay + n.duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + n.delay);
    osc.stop(now + n.delay + n.duration + 0.02);
  }
}

export function playSeverityChime(severity: SeverityLevel, volume = 0.45): void {
  switch (severity) {
    case 'CRITICO':
      playToneSequence(
        [
          { freq: 960, duration: 0.22, delay: 0, type: 'sawtooth' },
          { freq: 720, duration: 0.22, delay: 0.24, type: 'sawtooth' },
          { freq: 960, duration: 0.22, delay: 0.48, type: 'sawtooth' },
          { freq: 720, duration: 0.28, delay: 0.72, type: 'sawtooth' },
        ],
        volume * 0.65
      );
      break;
    case 'ALTO':
      playToneSequence(
        [
          { freq: 880, duration: 0.16, delay: 0, type: 'triangle' },
          { freq: 660, duration: 0.16, delay: 0.2, type: 'triangle' },
          { freq: 880, duration: 0.24, delay: 0.4, type: 'triangle' },
        ],
        volume * 0.85
      );
      break;
    case 'MODERADO':
      playToneSequence(
        [
          { freq: 784, duration: 0.14, delay: 0, type: 'sine' },
          { freq: 1046.5, duration: 0.22, delay: 0.16, type: 'sine' },
        ],
        volume * 0.8
      );
      break;
    case 'BAJO':
    default:
      playToneSequence(
        [
          { freq: 659.25, duration: 0.12, delay: 0, type: 'sine' },
          { freq: 880, duration: 0.18, delay: 0.13, type: 'sine' },
        ],
        volume * 0.65
      );
      break;
  }
}

export function speakSeismicAlert(event: SeismicEvent): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const bulletin = BULLETIN_LABEL[event.bulletinType];
    const msg = new SpeechSynthesisUtterance(
      `${bulletin} sísmico de ${event.source}. Magnitud ${event.magnitude.toFixed(1)}, localizado en ${event.place}, a ${Math.round(
        event.depthKm
      )} kilómetros de profundidad.`
    );
    msg.lang = 'es-PA';
    msg.rate = 1.03;
    msg.pitch = 1.0;
    window.speechSynthesis.speak(msg);
  } catch {
    // Ignore speech synthesis failures on restricted sandboxes
  }
}

export function triggerEventAlertAudio(
  event: SeismicEvent,
  settings: AudioAlertSettings
): void {
  if (!settings.enabled) return;
  if (event.magnitude < settings.minMagnitude && !event.tsunamiAlert) return;

  playSeverityChime(event.severity, settings.volume);

  if (settings.voiceEnabled) {
    setTimeout(() => speakSeismicAlert(event), 550);
  }
}
