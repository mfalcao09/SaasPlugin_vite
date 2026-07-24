#!/usr/bin/env node
// ============================================================================
// Runner da extração por IA — roda o orquestrador sobre uma fixture
//
//   node scripts/extrair-ia.mjs --edicao 12230 --paginas 12,50
//   node scripts/extrair-ia.mjs --edicao 5913 --paginas 4
//
// Salva fixtures/edicoes/<base>.ia.json (paralelo ao .expected.json da
// heurística — os dois convivem até o eval decidir quem extrai melhor).
// Loop de desenvolvimento roda sobre fixture, nunca contra o portal.
// ============================================================================

import { readdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extrairPaginas } from '../src/services/extracao/orquestrador.mjs';

const execFileP = promisify(execFile);
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const FIXTURES = join(RAIZ, 'fixtures/edicoes');

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : null;
};

async function main() {
  const edicao = arg('edicao');
  if (!edicao) throw new Error('uso: --edicao <numero> --paginas 12,50');

  const pdfs = (await readdir(FIXTURES)).filter((f) => f.endsWith('.pdf') && f.includes(`-${edicao}`));
  if (!pdfs.length) throw new Error(`nenhuma fixture para edição ${edicao}`);
  const nome = pdfs[0];
  const base = basename(nome, '.pdf');
  const [sigla, ano, mes, dia] = base.split('-');

  const { stdout: texto } = await execFileP(
    'pdftotext', ['-layout', join(FIXTURES, nome), '-'], { maxBuffer: 64 * 1024 * 1024 });
  const totalPaginas = texto.split('\f').length - 1;

  const paginas = arg('paginas')
    ? arg('paginas').split(',').map(Number)
    : Array.from({ length: totalPaginas }, (_, i) => i + 1);

  console.error(`[ia] ${base} · ${totalPaginas} páginas no PDF · extraindo: ${paginas.join(', ')}`);

  const resultados = await extrairPaginas({ fonte: sigla, textoCompleto: texto, paginas });

  let totAtos = 0, totFlags = 0;
  for (const r of resultados) {
    const porClasse = {};
    for (const c of r.candidatos ?? []) porClasse[c.classe] = (porClasse[c.classe] ?? 0) + 1;
    const flags = (r.atos ?? []).reduce((s, a) => s + (a.auditoria?.flags.length ?? 0), 0);
    totAtos += r.atos?.length ?? 0; totFlags += flags;
    console.error(
      `  pág ${String(r.pagina).padStart(3)} · candidatos: ${JSON.stringify(porClasse)} · ` +
      `atos: ${r.atos?.length ?? 0} · flags auditor: ${flags} · ` +
      `LLM: ${r.telemetria?.chamadas ?? 0} chamada(s), ${r.telemetria?.cache ?? 0} cache`);
    for (const a of r.atos ?? []) {
      console.error(`      ${a.tipo} ${a.numero}/${a.ano} pág.${a.pagina}` +
        (a.auditoria.aprovado ? ' ✓auditado' : ` ⚠ ${a.auditoria.flags.join(',')}`));
    }
  }

  const destino = join(FIXTURES, `${base}.ia.json`);
  await writeFile(destino, JSON.stringify({
    $schema: 'extracao-ia-v1',
    fonte: sigla,
    edicao: base.split('-')[4] ?? edicao,
    data_publicacao: `${ano}-${mes}-${dia}`,
    arquivo: nome,
    modelo: resultados.find((r) => r.modelo)?.modelo ?? null,
    gerado_em: new Date().toISOString(),
    paginas: resultados,
  }, null, 2) + '\n');

  console.error(`[ia] total: ${totAtos} ato(s), ${totFlags} flag(s) · salvo em ${basename(destino)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`[ia] FALHA: ${e.message}`); process.exit(1); });
}
