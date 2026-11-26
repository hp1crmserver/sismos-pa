import fs from 'fs';
import path from 'path';
import { parseIgcUpHtml } from '../src/utils/seismicClassifier.ts';

const TARGET_URL = 'https://sismosgeociencias.up.ac.pa/';
const OUT_DIR = path.resolve(import.meta.dirname, '..', 'public', 'data');
const OUT_FILE = path.join(OUT_DIR, 'igcup-snapshot.json');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(TARGET_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GeoAlert-pa/1.2 (+https://sismosgeociencias.up.ac.pa/)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = await res.text();
    const events = parseIgcUpHtml(html);

    if (events.length === 0) {
      throw new Error('No se encontraron eventos en el HTML de IGC-UP');
    }

    const payload = {
      source: 'IGC-UP',
      fetchedAt: Date.now(),
      events,
    };

    fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`IGC-UP snapshot actualizado: ${events.length} eventos guardados.`);
  } catch (err) {
    console.warn(
      'Advertencia: no se pudo actualizar igcup-snapshot.json:',
      err instanceof Error ? err.message : err
    );
    if (!fs.existsSync(OUT_FILE)) {
      fs.writeFileSync(
        OUT_FILE,
        JSON.stringify({ source: 'IGC-UP', fetchedAt: 0, events: [] }, null, 2),
        'utf8'
      );
    }
  }
}

main();
