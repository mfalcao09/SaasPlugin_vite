// ============================================================================
// Servidor de PRODUÇÃO — mesmo cérebro do dev, transporte real
//
// O api-dev.mjs foi desenhado como "middleware que um dia vira servidor de
// verdade; muda o transporte, não a lógica". Este arquivo é esse dia: um
// http.Server puro que (1) delega /api/* ao MESMO middleware e (2) serve o
// build estático do Vite com fallback SPA. Zero framework, zero dependência.
// ============================================================================

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import apiDev from './api-dev.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIST = join(AQUI, '../../dist');
const PORTA = Number(process.env.PORT || 3000);

// Extrai o middleware do plugin sem tocar na sua implementação.
let api;
apiDev().configureServer({ middlewares: { use: (fn) => { api = fn; } } });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.json': 'application/json', '.map': 'application/json',
};

async function estatico(req, res) {
  const url = new URL(req.url, 'http://x');
  // normalize + prefixo conferido: nada de ../ escapando do dist.
  const alvo = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!alvo.startsWith(DIST)) { res.statusCode = 403; return res.end(); }
  try {
    const arquivo = alvo === DIST || alvo === `${DIST}/` ? join(DIST, 'index.html') : alvo;
    const corpo = await readFile(arquivo);
    res.setHeader('Content-Type', MIME[extname(arquivo)] ?? 'application/octet-stream');
    return res.end(corpo);
  } catch {
    // SPA: rota desconhecida cai no index (o React roteia).
    const corpo = await readFile(join(DIST, 'index.html'));
    res.setHeader('Content-Type', MIME['.html']);
    return res.end(corpo);
  }
}

http.createServer((req, res) => {
  if (req.url?.startsWith('/api/')) return api(req, res, () => estatico(req, res));
  return estatico(req, res);
}).listen(PORTA, () => {
  console.log(`[tribunais] servidor de produção na porta ${PORTA} · dist=${DIST}`);
});
