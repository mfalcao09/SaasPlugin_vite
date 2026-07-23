#!/usr/bin/env node
// ============================================================================
// Runner de ingestão GENÉRICO — serve qualquer fonte (PRD v2.1 §5.1)
//
//   node scripts/ingest.mjs --fonte doms-pdf  [--datas 5] [--pausa 1500]
//   node scripts/ingest.mjs --fonte djms-esaj --datas 10
//
// Resolve o parser pela `parser_key` via registry (convenção de arquivo).
// Adicionar uma fonte nova NÃO exige editar este arquivo — é o contrato C0.5.
//
// Baixa cada edição UMA VEZ e versiona como fixture; o loop de desenvolvimento
// roda sobre a fixture, nunca contra o portal (trava nº 1).
// Emite o SQL de INSERT em stdout — sem depender de driver Postgres.
// ============================================================================

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolverParser } from '../src/services/ingest/registry.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
};

const PARSER_KEY = arg('fonte', null);
const DATAS_ALVO = Number(arg('datas', 5));
const DIR_SAIDA = join(RAIZ, arg('saida', 'fixtures/edicoes'));
const PAUSA_MS = Number(arg('pausa', 1500));   // rate limit com portal público

const log = (...a) => console.error(...a);     // stderr; stdout carrega só o SQL
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const existe = async (p) => { try { await stat(p); return true; } catch { return false; } };

if (!PARSER_KEY) {
  log('uso: node scripts/ingest.mjs --fonte <parser_key> [--datas N] [--pausa MS]');
  process.exit(2);
}

async function main() {
  const P = await resolverParser(PARSER_KEY);
  log(`[ingest] fonte ${P.SIGLA} (${PARSER_KEY}) — descobrindo edições…`);

  const todas = await P.descobrir({ limite: Math.max(DATAS_ALVO * 4, 20) });
  if (todas.length === 0) throw new Error('a fonte não retornou nenhuma edição');

  // O critério é por DATA ÚTIL, não por arquivo: uma data pode ter várias
  // edições e suplementos — todos entram, mas contam como 1 data.
  const datas = [...new Set(todas.map((e) => e.data_publicacao))]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, DATAS_ALVO);

  const alvo = todas.filter((e) => datas.includes(e.data_publicacao));
  log(`[ingest] ${datas.length} data(s) útil(eis) · ${alvo.length} arquivo(s)`);
  log(`[ingest] datas: ${datas.join(', ')}`);

  await mkdir(DIR_SAIDA, { recursive: true });

  const registros = [];
  for (const [i, ed] of alvo.entries()) {
    const id = P.identificador(ed);
    const destino = join(DIR_SAIDA, `${id}.pdf`);

    if (await existe(destino)) {
      const buf = await readFile(destino);
      log(`  [${i + 1}/${alvo.length}] ${id} — já em fixture (${(buf.byteLength / 1024).toFixed(0)} KB)`);
      registros.push({
        ...ed,
        arquivo_path: relative(RAIZ, destino),
        hash: createHash('sha256').update(buf).digest('hex'),
        bytes: buf.byteLength,
      });
      continue;
    }

    if (i > 0) await dormir(PAUSA_MS);   // educado com o portal público
    log(`  [${i + 1}/${alvo.length}] baixando ${id}…`);

    const { buffer, bytes } = await P.baixar(ed);
    await writeFile(destino, buffer);    // arquivo CRU antes de qualquer parsing
    const hash = createHash('sha256').update(buffer).digest('hex');

    log(`      ${(bytes / 1024).toFixed(0)} KB · sha256 ${hash.slice(0, 16)}…`);
    registros.push({ ...ed, arquivo_path: relative(RAIZ, destino), hash, bytes });
  }

  // ---- SQL para stdout -----------------------------------------------------
  const esc = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
  const linhas = registros.map((r) => {
    const num = r.suplemento ? `${r.numero}-SUP${r.suplemento}` : r.numero;
    return `  ((select id from public.fontes_diarios where sigla=${esc(P.SIGLA)}), ` +
           `${esc(num)}, ${esc(r.data_publicacao)}::date, ${esc(r.url_original)}, ` +
           `${esc(r.arquivo_path)}, ${esc(r.hash)}, 'baixada')`;
  });

  console.log(`-- Gerado por scripts/ingest.mjs --fonte ${PARSER_KEY}`);
  console.log('insert into public.edicoes');
  console.log('  (fonte_id, numero, data_publicacao, url_original, arquivo_path, hash_sha256, status)');
  console.log('values');
  console.log(linhas.join(',\n'));
  console.log('on conflict (fonte_id, data_publicacao, numero) do update set');
  console.log('  arquivo_path = excluded.arquivo_path,');
  console.log('  hash_sha256  = excluded.hash_sha256,');
  console.log("  status       = 'baixada';");

  log(`[ingest] ${registros.length} arquivo(s) · ${datas.length} data(s) útil(eis) · SQL emitido`);
}

main().catch((e) => { log(`[ingest] FALHA: ${e.message}`); process.exit(1); });
