#!/usr/bin/env node
// ============================================================================
// Card C0.4 — ingestão determinística do DO/MS
//
// Critério binário (PRD §9): 5 datas úteis → registros em `edicoes` com
// arquivo_path preenchido, hash_sha256 não-nulo e status='baixada'.
//
//   node scripts/ingest-doms.mjs [--datas 5] [--pausa 1500]
//
// Baixa cada edição UMA VEZ e versiona como fixture. O loop de desenvolvimento
// roda sobre a fixture, nunca contra o portal (trava nº 1 do PRD).
// Emite o SQL de INSERT em stdout — sem depender de driver Postgres.
// ============================================================================

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolverParser } from '../src/services/ingest/registry.mjs';

// Resolvido pela parser_key cadastrada em fontes_diarios — sem import fixo.
const DOMS = await resolverParser('doms-pdf');

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
};

const DATAS_ALVO = Number(arg('datas', 5));
const DIR_SAIDA = join(RAIZ, arg('saida', 'fixtures/edicoes'));
const PAUSA_MS = Number(arg('pausa', 1500));   // rate limit: portal público

const log = (...a) => console.error(...a);     // stderr; stdout carrega só o SQL
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const existe = async (p) => { try { await stat(p); return true; } catch { return false; } };

async function main() {
  log(`[C0.4] descobrindo edições do ${DOMS.SIGLA} no índice público…`);
  const todas = await DOMS.descobrir({ limite: 100 });
  if (todas.length === 0) throw new Error('índice não retornou nenhuma edição');

  // O critério é por DATA ÚTIL, não por arquivo: uma data pode ter várias
  // edições e vários suplementos — todos entram, mas contam como 1 data.
  const datas = [...new Set(todas.map((e) => e.data_publicacao))]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, DATAS_ALVO);

  const alvo = todas.filter((e) => datas.includes(e.data_publicacao));
  log(`[C0.4] ${datas.length} datas úteis · ${alvo.length} arquivos (principais + suplementos)`);
  log(`[C0.4] datas: ${datas.join(', ')}`);

  await mkdir(DIR_SAIDA, { recursive: true });

  const registros = [];
  for (const [i, ed] of alvo.entries()) {
    const id = DOMS.identificador(ed);
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

    const { buffer, bytes } = await DOMS.baixar(ed);
    await writeFile(destino, buffer);    // arquivo CRU antes de qualquer parsing
    const hash = createHash('sha256').update(buffer).digest('hex');

    log(`      ${(bytes / 1024).toFixed(0)} KB · sha256 ${hash.slice(0, 16)}…`);
    registros.push({ ...ed, arquivo_path: relative(RAIZ, destino), hash, bytes });
  }

  // ---- SQL para stdout -----------------------------------------------------
  const esc = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
  const linhas = registros.map((r) => {
    const num = r.suplemento ? `${r.numero}-SUP${r.suplemento}` : r.numero;
    return `  ((select id from public.fontes_diarios where sigla='DOMS'), ` +
           `${esc(num)}, ${esc(r.data_publicacao)}::date, ${esc(r.url_original)}, ` +
           `${esc(r.arquivo_path)}, ${esc(r.hash)}, 'baixada')`;
  });

  console.log('-- Gerado por scripts/ingest-doms.mjs (card C0.4)');
  console.log('insert into public.edicoes');
  console.log('  (fonte_id, numero, data_publicacao, url_original, arquivo_path, hash_sha256, status)');
  console.log('values');
  console.log(linhas.join(',\n'));
  // A identidade da edição passou a incluir `numero_suplemento` na migration
  // 0007 (suplemento do DO/MS repete número e data da edição-pai). Este script
  // ainda embute o suplemento no próprio `numero` ("12228-SUP1"), convenção
  // antiga; as duas convivem porque a constraint é NULLS NOT DISTINCT.
  // PENDÊNCIA: unificar numa só — ver docs/FONTES-endpoints-e-extracao.md.
  console.log('on conflict (fonte_id, data_publicacao, numero, numero_suplemento) do update set');
  console.log('  arquivo_path = excluded.arquivo_path,');
  console.log('  hash_sha256  = excluded.hash_sha256,');
  console.log("  status       = 'baixada';");

  log(`[C0.4] ${registros.length} arquivos · ${datas.length} datas úteis · SQL emitido`);
}

main().catch((e) => { log(`[C0.4] FALHA: ${e.message}`); process.exit(1); });
