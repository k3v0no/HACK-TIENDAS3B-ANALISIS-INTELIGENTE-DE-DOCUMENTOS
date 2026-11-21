// Proxy de desarrollo: el navegador llama a /api y este servidor reenvía al back agregando
// la cabecera X-API-Key. Así la clave nunca llega al navegador y no hace falta tocar CORS.
//
// Variables opcionales:
//   BACK_URL      dirección del back (por defecto http://127.0.0.1:8000)
//   BACK_API_KEY  la misma clave que API_KEY en back/.env; si no está, se lee de ese archivo
import { readFileSync } from 'node:fs';

function claveDelBack() {
  if (process.env.BACK_API_KEY) return process.env.BACK_API_KEY;
  try {
    const env = readFileSync(new URL('../back/.env', import.meta.url), 'utf8');
    const linea = env.split(/\r?\n/).find((l) => l.trim().startsWith('API_KEY='));
    return linea ? linea.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

const destino = process.env.BACK_URL || 'http://127.0.0.1:8000';
const clave = claveDelBack();
if (!clave) {
  console.warn('[proxy] Sin BACK_API_KEY ni back/.env: el back rechazará las peticiones.');
}

export default {
  '/api': {
    target: destino,
    changeOrigin: true,
    secure: false,
    pathRewrite: { '^/api': '' },
    headers: { 'X-API-Key': clave },
  },
};
