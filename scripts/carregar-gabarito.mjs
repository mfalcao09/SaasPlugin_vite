#!/usr/bin/env node
// ============================================================================
// Carrega as fixtures pré-anotadas para o Postgres de desenvolvimento.
//
//   node scripts/carregar-gabarito.mjs [--limpar]
//
// Ponte entre o que já existe (arquivos .expected.json) e onde os dados
// precisam viver (o banco com RLS). Diferente de ingest.mjs / ingest-doms.mjs,
// que EMITEM SQL em stdout e só tratam `edicoes`: este conecta de fato e
// carrega edições E atos.
//
// Idempotente: reexecutar não duplica (chave natural fonte+numero+data).
// ============================================================================
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const FIXTURES = join(RAIZ, 'fixtures/edicoes');
const LIMPAR = process.argv.includes('--limpar');

// Socket Unix local (ver scripts/db-dev.sh) — nada trafega pela rede.
const CONEXAO = process.env.DATABASE_URL ?? {
  host: '/tmp/pgdm-dev', port: 55432, database: 'diariomonitor', user: 'postgres',
};

const log = (s) => process.stdout.write(`${s}\n`);

/**
 * Carrega as fixtures num cliente JÁ CONECTADO.
 *
 * Exportada para que a ingestão disparada pela UI (POST /api/ingest) use o
 * MESMO caminho de escrita que o CLI — em vez de reimplementar o mapeamento
 * gabarito→banco num segundo lugar, que divergiria na primeira mudança.
 */
export async function carregarTudo(cliente, { limpar = false } = {}) {
  {
    const LIMPAR = limpar;
    if (LIMPAR) {
      // Só o acervo capturado; instituições, usuários e fontes ficam.
      await cliente.query('delete from public.atos');
      await cliente.query('delete from public.edicoes');
      log('acervo anterior removido (--limpar)');
    }

    const { rows: fontes } = await cliente.query(
      'select id, sigla, url_base from public.fontes_diarios',
    );
    const porSigla = new Map(fontes.map((f) => [f.sigla, f]));

    const arquivos = (await readdir(FIXTURES))
      .filter((f) => f.endsWith('.expected.json')).sort();

    let edicoes = 0, atos = 0, pulados = 0;

    for (const nome of arquivos) {
      const g = JSON.parse(await readFile(join(FIXTURES, nome), 'utf8'));
      const fonte = porSigla.get(g.fonte);
      if (!fonte) { log(`  ${nome} — fonte '${g.fonte}' não cadastrada, pulando`); pulados++; continue; }

      // hash_sha256 do PDF é a âncora de fixidez (RDC-Arq / OAIS): prova de que
      // o que está no acervo é byte a byte o que foi baixado do portal.
      let hash = null;
      try {
        hash = createHash('sha256')
          .update(await readFile(join(FIXTURES, g.arquivo))).digest('hex');
      } catch { /* PDF ausente: registra a edição sem fixidez */ }

      // Identidade da edição é o ARQUIVO, não (fonte, numero, data): no DO/MS
      // os suplementos repetem número e data da edição-pai. Deduplicar pela
      // tripla engolia 3 das 20 fixtures — suplemento é edição, não repetição.
      const caminho = `fixtures/edicoes/${g.arquivo}`;
      // "DOMS-2026-07-21-12228-SUP2.pdf" -> suplemento 2; sem sufixo -> pai.
      const sup = g.arquivo.match(/-SUP(\d+)\.pdf$/i);
      const suplemento = sup ? Number(sup[1]) : null;

      const { rows: [ed] } = await cliente.query(
        `insert into public.edicoes
           (fonte_id, numero, data_publicacao, url_original, arquivo_path,
            hash_sha256, numero_suplemento, status)
         select $1,$2,$3,$4,$5,$6,$7,'baixada'
          where not exists (select 1 from public.edicoes where arquivo_path = $5)
         returning id`,
        [fonte.id, g.edicao, g.data_publicacao, `${fonte.url_base}#${g.arquivo}`,
         caminho, hash, suplemento],
      );

      const edicaoId = ed?.id ?? (await cliente.query(
        'select id from public.edicoes where arquivo_path = $1 limit 1', [caminho],
      )).rows[0]?.id;

      if (!edicaoId) { log(`  ${nome} — não consegui resolver a edição`); pulados++; continue; }
      if (ed) edicoes++;

      for (const a of g.atos ?? []) {
        const { rowCount } = await cliente.query(
          `insert into public.atos
             (edicao_id, fonte_id, data_publicacao, tipo, numero, ano, orgao_emissor,
              ementa, texto_bruto, data_ato, pagina, origem_extracao, confianca_extracao)
           select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'heuristica',$12
            where not exists (
              select 1 from public.atos
               where edicao_id = $1 and tipo = $4 and numero = $5 and ano = $6)`,
          [edicaoId, fonte.id, g.data_publicacao, a.tipo, a.numero, a.ano,
           a.orgao_emissor ?? null, a.ementa ?? null, a.trecho_original ?? null,
           a.data_ato ?? null, a.pagina != null ? String(a.pagina) : null,
           a.confianca_heuristica === 'baixa' ? 0.4 : 0.7],
        );
        atos += rowCount;
      }
    }

    return { edicoes, atos, pulados };
  }
}

async function main() {
  const cliente = new pg.Client(CONEXAO);
  await cliente.connect();
  try {
    const r = await carregarTudo(cliente, { limpar: LIMPAR });
    log(`\n${r.edicoes} edição(ões) e ${r.atos} ato(s) carregados · ${r.pulados} pulado(s)`);

    const { rows: [t] } = await cliente.query(
      `select (select count(*) from public.edicoes) as edicoes,
              (select count(*) from public.atos)    as atos,
              (select count(*) from public.atos where status = 'revisao') as revisao`,
    );
    log(`no banco: ${t.edicoes} edições · ${t.atos} atos · ${t.revisao} aguardando revisão`);
  } finally {
    await cliente.end();
  }
}

// Só roda o CLI quando ESTE arquivo é o entrypoint — a API importa a função.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { log(`FALHA: ${e.message}`); process.exit(1); });
}
