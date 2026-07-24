// ============================================================================
// API de desenvolvimento — middleware do Vite
//
// POR QUE ISTO EXISTE: o app precisa de backend para listar fontes, disparar
// ingestão e gravar validação. Em PRODUÇÃO isso será Edge Function do Supabase
// (PRD §7.2). Aqui roda como middleware do dev server, para que a aplicação
// seja OPERÁVEL POR UM HUMANO desde já — sem terminal, sem script.
//
// ── DOIS CLIENTES, DE PROPÓSITO ────────────────────────────────────────────
// Espelha a separação do Supabase entre `service_role` e `anon + JWT`:
//
//   poolApp     conecta como role `authenticated` e define request.jwt.claims
//               por requisição. TUDO que o usuário faz passa por aqui, então
//               a RLS decide o que ele enxerga. Nunca superusuário: superuser
//               faz BYPASS de policy, e a RLS viraria enfeite.
//
//   poolServico conecta como dono do banco. Usado SÓ pela ingestão, que é
//               processo de sistema (o cron diário), não ação de usuário —
//               não há tenant a quem atribuir a captura de um diário público.
//
// A regra que mantém isto honesto: sem regra de negócio aqui. O arquivo expõe
// por HTTP o que já existe em src/services/ e scripts/. Ao virar Edge
// Function, muda o transporte, não a lógica.
//
// Rotas:
//   GET  /api/sessao                 quem está logado (401 se ninguém)
//   GET  /api/sessao/identidades     quem pode entrar (só em dev)
//   POST /api/sessao/entrar {email}  abre sessão
//   POST /api/sessao/sair            encerra
//   GET  /api/fontes                 fontes + o que já foi capturado
//   GET  /api/edicoes                edições no acervo
//   GET  /api/atos?q=&fonte=&de=&ate= busca full-text no acervo
//   GET  /api/revisao                edições pendentes de validação humana
//   POST /api/ingest {parserKey}     descobre, baixa, extrai e grava
//   POST /api/revisao/julgar         registra ✓/✗ de um ato
//   POST /api/revisao/concluir       fecha a edição
// ============================================================================

import { writeFile, readFile, stat, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import pg from 'pg';

const execFileP = promisify(execFile);

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '../..');
const FIXTURES = join(RAIZ, 'fixtures/edicoes');

// Especificadores COMPUTADOS: o esbuild bundla o vite.config e tudo que ele
// alcança por string literal — arrastaria estes scripts (que têm shebang) para
// dentro do bundle e quebraria. Variável = import opaco ao bundler.
const CAMINHO_PRE_ANOTAR = new URL('../../scripts/pre-anotar.mjs', import.meta.url).href;
const CAMINHO_CARREGADOR = new URL('../../scripts/carregar-gabarito.mjs', import.meta.url).href;
const CAMINHO_ORQUESTRADOR = new URL('../services/extracao/orquestrador.mjs', import.meta.url).href;

const existe = async (p) => { try { await stat(p); return true; } catch { return false; } };

// Socket Unix local (scripts/db-dev.sh). Nada trafega pela rede, nada aqui é
// segredo — o servidor sobe com listen_addresses=''.
const BASE = { host: '/tmp/pgdm-dev', port: 55432, database: 'diariomonitor' };
const poolApp     = new pg.Pool({ ...BASE, user: 'authenticated', max: 6 });
const poolServico = new pg.Pool({ ...BASE, user: 'postgres', max: 2 });

/**
 * Roda `fn` dentro de uma transação com a identidade do usuário aplicada.
 *
 * `set local` amarra o claim à transação: ao terminar, a conexão volta ao pool
 * sem identidade grudada. Sem o `local`, a próxima requisição herdaria o
 * usuário da anterior — vazamento entre tenants pela porta dos fundos.
 */
async function comIdentidade(sessao, fn) {
  const c = await poolApp.connect();
  try {
    await c.query('begin');
    await c.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: sessao.auth_id, role: 'authenticated' }),
    ]);
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// ---------------------------------------------------------------------------
// Sessões — em memória, morrem com o dev server. Em produção é o JWT do
// Supabase que carrega isto, e este Map desaparece.
// ---------------------------------------------------------------------------
const SESSOES = new Map();
const COOKIE = 'dm_sessao';

function sessaoDe(req) {
  const bruto = req.headers.cookie ?? '';
  const par = bruto.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
  return par ? SESSOES.get(par.slice(COOKIE.length + 1)) ?? null : null;
}

async function entrar({ email }) {
  if (!email) throw new Error('informe o e-mail');
  const { rows } = await poolServico.query(
    'select * from public.resolver_identidade_dev($1)', [email],
  );
  if (!rows.length) throw new Error(`nenhum usuário com o e-mail ${email}`);
  const token = randomUUID();
  SESSOES.set(token, rows[0]);
  return { token, identidade: rows[0] };
}

const identidadesDisponiveis = async () =>
  (await poolServico.query('select * from public.identidades_disponiveis_dev()')).rows;

// ---------------------------------------------------------------------------
// Leituras — todas sob RLS
// ---------------------------------------------------------------------------
async function listarFontes(sessao) {
  return comIdentidade(sessao, async (c) => (await c.query(`
    select f.sigla, f.nome, f.parser_key, f.modo_acesso as modo, f.esfera, f.uf,
           f.ativo as operacional, f.config_json->>'bloqueio' as bloqueio,
           count(distinct e.id)::int                            as edicoes_ingeridas,
           count(a.id)::int                                     as atos_extraidos,
           max(e.data_publicacao)::text                         as ultima_edicao,
           count(distinct v.edicao_id)::int                     as validadas
      from public.fontes_diarios f
      left join public.edicoes e on e.fonte_id = f.id
      left join public.atos a    on a.edicao_id = e.id
      left join public.validacao_edicao v on v.edicao_id = e.id
     group by f.id
     order by f.ativo desc, f.sigla`)).rows);
}

async function listarEdicoes(sessao) {
  return comIdentidade(sessao, async (c) => (await c.query(`
    select f.sigla as fonte, e.numero as edicao, e.data_publicacao::text,
           e.numero_suplemento, e.arquivo_path as arquivo,
           left(e.hash_sha256, 16) as hash,
           count(a.id)::int as total_atos,
           (v.id is not null) as validado
      from public.edicoes e
      join public.fontes_diarios f on f.id = e.fonte_id
      left join public.atos a on a.edicao_id = e.id
      left join public.validacao_edicao v on v.edicao_id = e.id
     group by e.id, f.sigla, v.id
     order by e.data_publicacao desc, e.numero_suplemento nulls first`)).rows);
}

async function listarAtos(sessao, query) {
  const termo = (query.get('q') ?? '').trim();
  const fonte = query.get('fonte') ?? '';
  const de = query.get('de') ?? '';
  const ate = query.get('ate') ?? '';
  const pagina = Math.max(1, Number(query.get('pagina') ?? 1));
  const porPagina = Math.min(200, Math.max(1, Number(query.get('porPagina') ?? 25)));

  return comIdentidade(sessao, async (c) => {
    // Busca pelo índice full-text português (conteudo_ts, alimentado pelo
    // trigger): acento e radical resolvidos no banco, não com LIKE na memória.
    const filtros = [];
    const p = [];
    if (fonte) { p.push(fonte); filtros.push(`f.sigla = $${p.length}`); }
    if (de)    { p.push(de);    filtros.push(`e.data_publicacao >= $${p.length}`); }
    if (ate)   { p.push(ate);   filtros.push(`e.data_publicacao <= $${p.length}`); }
    if (termo) { p.push(termo); filtros.push(`a.conteudo_ts @@ plainto_tsquery('portuguese', $${p.length})`); }
    const onde = filtros.length ? `where ${filtros.join(' and ')}` : '';

    const { rows: [{ total }] } = await c.query(
      `select count(*)::int as total from public.atos a
         join public.edicoes e on e.id = a.edicao_id
         join public.fontes_diarios f on f.id = a.fonte_id ${onde}`, p);

    p.push(porPagina, (pagina - 1) * porPagina);
    const { rows: itens } = await c.query(
      `select a.id, f.sigla as fonte, e.numero as edicao,
              a.data_publicacao::text, e.arquivo_path as arquivo,
              a.tipo, a.numero, a.ano, a.data_ato::text, a.orgao_emissor,
              a.ementa, a.texto_bruto as trecho_original, a.pagina,
              a.confianca_extracao::float as confianca, a.status,
              r.decisao as julgamento
         from public.atos a
         join public.edicoes e on e.id = a.edicao_id
         join public.fontes_diarios f on f.id = a.fonte_id
         left join public.revisao_extracao r on r.ato_id = a.id
         ${onde}
        order by a.data_publicacao desc, a.numero desc
        limit $${p.length - 1} offset $${p.length}`, p);

    return { itens, total, pagina, porPagina };
  });
}

async function pendentesDeRevisao(sessao) {
  return comIdentidade(sessao, async (c) => {
    const { rows: edicoes } = await c.query(`
      select e.id, f.sigla as fonte, e.numero as edicao, e.data_publicacao::text,
             e.numero_suplemento, e.arquivo_path as arquivo,
             count(a.id)::int                                  as total,
             count(r.id)::int                                  as julgados
        from public.edicoes e
        join public.fontes_diarios f on f.id = e.fonte_id
        left join public.atos a on a.edicao_id = e.id
        left join public.revisao_extracao r on r.ato_id = a.id
       where not exists (select 1 from public.validacao_edicao v where v.edicao_id = e.id)
       group by e.id, f.sigla
      having count(a.id) > 0
       order by e.data_publicacao desc, e.numero_suplemento nulls first`);

    for (const ed of edicoes) {
      ed.atos = (await c.query(
        `select a.id, a.tipo, a.numero, a.ano, a.data_ato::text, a.orgao_emissor,
                a.ementa, a.texto_bruto as trecho_original, a.pagina,
                a.confianca_extracao::float as confianca, r.decisao as julgamento
           from public.atos a
           left join public.revisao_extracao r on r.ato_id = a.id
          where a.edicao_id = $1
          order by a.pagina::int nulls last, a.numero`, [ed.id])).rows;
    }
    return edicoes;
  });
}

/**
 * Caminho absoluto do PDF de uma edição, para servir na revisão lado a lado.
 *
 * Duas travas:
 *  - a leitura de `edicoes` passa pela RLS (poolApp + identidade), então só
 *    devolve o que a instituição da sessão pode ver;
 *  - o caminho vem do banco, mas é resolvido e CONFERIDO contra FIXTURES antes
 *    de abrir o arquivo — um arquivo_path com "../" não escapa da pasta.
 *
 * Em produção isto vira uma URL assinada do Supabase Storage (expira em min);
 * a tela não muda, só a origem do PDF.
 */
async function caminhoPdfDaEdicao(sessao, id) {
  const rows = await comIdentidade(sessao, async (c) =>
    (await c.query('select arquivo_path from public.edicoes where id = $1', [id])).rows);
  if (!rows.length || !rows[0].arquivo_path) return null;

  const abs = resolve(RAIZ, rows[0].arquivo_path);
  if (abs !== FIXTURES && !abs.startsWith(`${FIXTURES}/`)) {
    throw new Error('caminho do PDF fora de fixtures/');
  }
  return (await existe(abs)) ? abs : null;
}

/**
 * Renderiza UMA página do diário como PNG (Poppler/pdftoppm, já usado na
 * extração — zero dependência nova). É o que permite a visualização LIMPA:
 * sem toolbar nem painel lateral do visualizador nativo, e com a camada de
 * destaque desenhada por cima (impossível sobre o <iframe> nativo, que é
 * caixa-preta). O pdftoppm não escreve em stdout: arquivo temporário + unlink.
 */
async function renderizarPaginaPng(abs, n) {
  const raiz = join(tmpdir(), `dm-pg-${randomUUID()}`);
  await execFileP('pdftoppm', [
    '-png', '-singlefile', '-f', String(n), '-l', String(n), '-r', '130', abs, raiz,
  ], { maxBuffer: 64 * 1024 * 1024 });
  const png = await readFile(`${raiz}.png`);
  await unlink(`${raiz}.png`).catch(() => {});
  return png;
}

// ̀-ͯ = diacríticos combinantes (á->a+́). Escapes explícitos: a faixa
// com caracteres combinantes literais dentro do regex quebra em qualquer
// editor/merge que renormalize o arquivo.
const normalizarToken = (t) => t
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Onde, na página N, está o texto deste ato? Usa `pdftotext -bbox-layout`
 * (coordenadas de cada palavra, em pontos) e casa a sequência de tokens do
 * texto extraído contra as palavras da página. Devolve caixas POR LINHA em
 * frações 0–1 — o front escala para o tamanho renderizado da imagem.
 *
 * Determinístico e honesto: se a âncora não casar (OCR, hifenização), devolve
 * caixas vazias e a tela simplesmente não destaca — nunca destaca errado.
 */
async function mapaDeDestaque(abs, n, textoAlvo) {
  const { stdout } = await execFileP('pdftotext', [
    '-f', String(n), '-l', String(n), '-bbox-layout', abs, '-',
  ], { maxBuffer: 64 * 1024 * 1024 });

  const pg = stdout.match(/<page width="([\d.]+)" height="([\d.]+)"/);
  if (!pg) return { caixas: [] };
  const W = Number(pg[1]), H = Number(pg[2]);

  // Palavras na ordem do layout, anotadas com o índice da LINHA a que pertencem.
  const palavras = [];
  let linha = -1;
  for (const m of stdout.matchAll(
    /<line [^>]*>|<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g,
  )) {
    if (m[0].startsWith('<line')) { linha++; continue; }
    const t = normalizarToken(m[5]);
    if (t) palavras.push({ t, x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], linha });
  }

  const alvo = String(textoAlvo ?? '').split(/\s+/).map(normalizarToken).filter(Boolean).slice(0, 400);
  if (alvo.length < 4 || !palavras.length) return { caixas: [] };

  // Âncora: primeira janela de K tokens do alvo encontrada na página
  // (tolera começo sujo do trecho tentando alguns deslocamentos).
  let ini = -1, sIni = 0;
  busca:
  for (const K of [8, 6, 4]) {
    for (let s = 0; s + K <= Math.min(alvo.length, 12 + K); s++) {
      for (let i = 0; i + K <= palavras.length; i++) {
        let ok = true;
        for (let j = 0; j < K; j++) if (palavras[i + j].t !== alvo[s + j]) { ok = false; break; }
        if (ok) { ini = i; sIni = s; break busca; }
      }
    }
  }
  if (ini < 0) return { caixas: [] };

  // Estende o casamento token a token; até 3 divergências seguidas (hífens,
  // números colados) antes de considerar que o ato terminou.
  let i = ini, s = sIni, ruins = 0;
  const casadas = [];
  while (i < palavras.length && s < alvo.length && ruins < 3) {
    if (palavras[i].t === alvo[s]) { casadas.push(palavras[i]); i++; s++; ruins = 0; }
    else { i++; s++; ruins++; }
  }

  // Uma caixa por linha (união das palavras casadas da linha).
  const porLinha = new Map();
  for (const p of casadas) {
    const c = porLinha.get(p.linha);
    if (!c) porLinha.set(p.linha, { x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1 });
    else {
      c.x0 = Math.min(c.x0, p.x0); c.y0 = Math.min(c.y0, p.y0);
      c.x1 = Math.max(c.x1, p.x1); c.y1 = Math.max(c.y1, p.y1);
    }
  }
  const caixas = [...porLinha.values()].map((c) => ({
    x: c.x0 / W, y: c.y0 / H, w: (c.x1 - c.x0) / W, h: (c.y1 - c.y0) / H,
  }));
  return { caixas };
}

// ---------------------------------------------------------------------------
// Escritas do usuário — o julgamento NÃO altera o ato (append-only); vive em
// revisao_extracao, por tenant. Ver migration 0005.
// ---------------------------------------------------------------------------
async function julgar(sessao, { atoId, decisao, observacao }) {
  if (!['ok', 'descartado'].includes(decisao)) throw new Error(`decisão inválida: ${decisao}`);
  return comIdentidade(sessao, async (c) => {
    const { rows: [u] } = await c.query(
      'select id from public.usuarios where auth_id = $1', [sessao.auth_id]);
    if (!u) throw new Error('usuário da sessão não existe mais');

    await c.query(
      `insert into public.revisao_extracao
         (ato_id, instituicao_id, decisao, observacao, decidido_por)
       values ($1,$2,$3,$4,$5)
       on conflict (ato_id, instituicao_id)
       do update set decisao = excluded.decisao,
                     observacao = excluded.observacao,
                     decidido_por = excluded.decidido_por,
                     decidido_em = now()`,
      [atoId, sessao.instituicao_id, decisao, observacao ?? null, u.id]);

    const { rows: [t] } = await c.query(`
      select count(a.id)::int as total, count(r.id)::int as julgados
        from public.atos a
        left join public.revisao_extracao r on r.ato_id = a.id
       where a.edicao_id = (select edicao_id from public.atos where id = $1)`, [atoId]);
    return { ok: true, ...t };
  });
}

/** Fecha a edição. Não existe gabarito parcial: ou todos julgados, ou nada. */
async function concluir(sessao, { edicaoId }) {
  return comIdentidade(sessao, async (c) => {
    const { rows: [u] } = await c.query(
      'select id from public.usuarios where auth_id = $1', [sessao.auth_id]);

    const { rows: [t] } = await c.query(`
      select count(a.id)::int                                              as total,
             count(r.id)::int                                              as julgados,
             count(*) filter (where r.decisao = 'ok')::int                 as mantidos,
             count(*) filter (where r.decisao = 'descartado')::int         as descartados
        from public.atos a
        left join public.revisao_extracao r on r.ato_id = a.id
       where a.edicao_id = $1`, [edicaoId]);

    if (t.julgados < t.total) {
      return { ok: false, motivo: `${t.total - t.julgados} ato(s) ainda sem julgamento` };
    }

    await c.query(
      `insert into public.validacao_edicao
         (edicao_id, instituicao_id, total_atos, mantidos, descartados, validado_por)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (edicao_id, instituicao_id) do update
         set total_atos = excluded.total_atos, mantidos = excluded.mantidos,
             descartados = excluded.descartados, validado_por = excluded.validado_por,
             validado_em = now()`,
      [edicaoId, sessao.instituicao_id, t.total, t.mantidos, t.descartados, u.id]);

    return { ok: true, ...t };
  });
}

// ---------------------------------------------------------------------------
// Ingestão — processo de SISTEMA (poolServico). Mesmo caminho que o cron usará.
// ---------------------------------------------------------------------------
async function ingerir({ parserKey, datas = 3 }) {
  const { resolverParser } = await import('../services/ingest/registry.mjs');
  const P = await resolverParser(parserKey);

  const descobertas = await P.descobrir({ limite: Math.max(datas * 4, 12) });
  const datasAlvo = [...new Set(descobertas.map((e) => e.data_publicacao))]
    .sort((a, b) => b.localeCompare(a)).slice(0, datas);
  const alvo = descobertas.filter((e) => datasAlvo.includes(e.data_publicacao));

  const resultado = {
    fonte: P.SIGLA, encontradas: alvo.length,
    baixadas: 0, jaExistiam: 0, atosExtraidos: 0, edicoes: [],
  };

  for (const ed of alvo) {
    const id = P.identificador(ed);
    const destino = join(FIXTURES, `${id}.pdf`);
    if (await existe(destino)) {
      resultado.jaExistiam++;
      resultado.edicoes.push({ id, status: 'ja_ingerida', data: ed.data_publicacao });
      continue;
    }
    const { buffer, bytes } = await P.baixar(ed);
    await writeFile(destino, buffer);
    resultado.baixadas++;

    // Captura sem extração não entrega nada: Publicações continuaria vazia.
    const { preAnotarArquivo } = await import(CAMINHO_PRE_ANOTAR);
    const anotacao = await preAnotarArquivo(`${id}.pdf`);
    resultado.atosExtraidos += anotacao.atos;

    resultado.edicoes.push({
      id, status: 'baixada', data: ed.data_publicacao, bytes,
      hash: createHash('sha256').update(buffer).digest('hex').slice(0, 16),
      atos: anotacao.atos,
    });
  }

  // Grava no acervo pelo MESMO caminho do CLI (idempotente). Reimplementar o
  // mapeamento gabarito→banco aqui criaria uma segunda verdade que divergiria.
  const { carregarTudo } = await import(CAMINHO_CARREGADOR);
  const c = await poolServico.connect();
  try {
    resultado.gravado = await carregarTudo(c);
  } finally {
    c.release();
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Plugin do Vite
// ---------------------------------------------------------------------------
export default function apiDev() {
  return {
    name: 'diariomonitor-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();

        const url = new URL(req.url, 'http://localhost');
        const rota = url.pathname;
        const responder = (status, corpo, cookie) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          if (cookie) res.setHeader('Set-Cookie', cookie);
          res.end(JSON.stringify(corpo));
        };
        const corpoDaRequisicao = () => new Promise((resolve, reject) => {
          let dados = '';
          req.on('data', (c) => { dados += c; });
          req.on('end', () => { try { resolve(dados ? JSON.parse(dados) : {}); } catch (e) { reject(e); } });
          req.on('error', reject);
        });

        try {
          // --- rotas abertas (é o que se usa ANTES de ter sessão) ----------
          if (req.method === 'GET' && rota === '/api/sessao/identidades') {
            return responder(200, await identidadesDisponiveis());
          }
          if (req.method === 'POST' && rota === '/api/sessao/entrar') {
            const { token, identidade } = await entrar(await corpoDaRequisicao());
            return responder(200, identidade,
              `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`);
          }

          const sessao = sessaoDe(req);

          if (req.method === 'POST' && rota === '/api/sessao/sair') {
            const bruto = req.headers.cookie ?? '';
            const par = bruto.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
            if (par) SESSOES.delete(par.slice(COOKIE.length + 1));
            return responder(200, { ok: true }, `${COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
          }

          // --- daqui pra baixo, exige sessão ------------------------------
          // Não é formalidade: as policies de atos/edicoes/fontes exigem
          // auth.uid() não-nulo. Sem sessão o banco devolveria zero linhas —
          // melhor um 401 claro do que uma tela vazia inexplicável.
          if (!sessao) return responder(401, { erro: 'sem sessão' });

          if (req.method === 'GET' && rota === '/api/sessao')  return responder(200, sessao);
          if (req.method === 'GET' && rota === '/api/fontes')  return responder(200, await listarFontes(sessao));
          if (req.method === 'GET' && rota === '/api/edicoes') return responder(200, await listarEdicoes(sessao));
          if (req.method === 'GET' && rota === '/api/atos')    return responder(200, await listarAtos(sessao, url.searchParams));
          if (req.method === 'GET' && rota === '/api/revisao') return responder(200, await pendentesDeRevisao(sessao));

          // PDF do diário para a revisão lado a lado. `:id` é o uuid da edição.
          const mPdf = rota.match(/^\/api\/edicoes\/([^/]+)\/pdf$/);
          if (req.method === 'GET' && mPdf) {
            const abs = await caminhoPdfDaEdicao(sessao, mPdf[1]);
            if (!abs) return responder(404, { erro: 'PDF da edição não encontrado' });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline'); // exibir, não baixar
            return res.end(await readFile(abs));
          }

          // Página N renderizada como imagem — a visualização LIMPA (sem
          // toolbar/painel do visualizador nativo) sobre a qual dá para
          // desenhar a camada de destaque.
          const mImg = rota.match(/^\/api\/edicoes\/([^/]+)\/pagina\/(\d+)\/imagem$/);
          if (req.method === 'GET' && mImg) {
            const abs = await caminhoPdfDaEdicao(sessao, mImg[1]);
            if (!abs) return responder(404, { erro: 'PDF da edição não encontrado' });
            const png = await renderizarPaginaPng(abs, Number(mImg[2]));
            res.statusCode = 200;
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'private, max-age=300');
            return res.end(png);
          }

          // EXTRAÇÃO POR IA disparada PELO SISTEMA (botão na Fila de Revisão).
          // Roda o orquestrador multi-agente sobre o PDF da edição e insere os
          // atos como origem_extracao='ia' — eles caem na mesma fila de
          // validação humana. O operador não roda nada no terminal, nunca.
          const mIA = rota.match(/^\/api\/edicoes\/([^/]+)\/extrair-ia$/);
          if (req.method === 'POST' && mIA) {
            const abs = await caminhoPdfDaEdicao(sessao, mIA[1]);
            if (!abs) return responder(404, { erro: 'PDF da edição não encontrado' });
            const corpo = await corpoDaRequisicao();

            const { rows: [ed] } = await poolServico.query(
              `select e.id, e.fonte_id, e.data_publicacao::text, f.sigla
                 from public.edicoes e join public.fontes_diarios f on f.id = e.fonte_id
                where e.id = $1`, [mIA[1]]);
            if (!ed) return responder(404, { erro: 'edição não encontrada' });

            const { stdout: texto } = await execFileP(
              'pdftotext', ['-layout', abs, '-'], { maxBuffer: 64 * 1024 * 1024 });
            const total = texto.split('\f').length - 1;
            const paginas = Array.isArray(corpo.paginas) && corpo.paginas.length
              ? corpo.paginas.map(Number)
              : Array.from({ length: total }, (_, i) => i + 1);

            const { extrairPaginas } = await import(CAMINHO_ORQUESTRADOR);
            const resultados = await extrairPaginas({ fonte: ed.sigla, textoCompleto: texto, paginas });

            let inseridos = 0, extraidos = 0, flags = 0;
            for (const r of resultados) {
              for (const a of r.atos ?? []) {
                extraidos++;
                flags += a.auditoria?.flags.length ?? 0;
                if (!a.numero) continue;
                const { rowCount } = await poolServico.query(
                  `insert into public.atos
                     (edicao_id, fonte_id, data_publicacao, tipo, numero, ano, orgao_emissor,
                      ementa, texto_bruto, data_ato, pagina, origem_extracao, confianca_extracao)
                   select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ia',$12
                    where not exists (
                      select 1 from public.atos
                       where edicao_id = $1 and tipo = $4 and numero = $5 and ano = $6)`,
                  [ed.id, ed.fonte_id, ed.data_publicacao, a.tipo, a.numero, a.ano,
                   a.orgao_emissor, a.ementa, a.trecho_original, a.data_ato,
                   String(a.pagina), a.auditoria?.aprovado ? 0.85 : 0.5]);
                inseridos += rowCount;
              }
            }
            return responder(200, {
              paginas_processadas: paginas.length, extraidos, inseridos, flags,
              modelo: resultados.find((r) => r.modelo)?.modelo ?? null,
            });
          }

          // Caixas de destaque do ato na página: onde o texto extraído está.
          const mDst = rota.match(/^\/api\/edicoes\/([^/]+)\/destaque$/);
          if (req.method === 'GET' && mDst) {
            const abs = await caminhoPdfDaEdicao(sessao, mDst[1]);
            if (!abs) return responder(404, { erro: 'PDF da edição não encontrado' });
            const atoId = url.searchParams.get('ato');
            const pagina = Number(url.searchParams.get('pagina') || 0);
            if (!atoId || !pagina) return responder(400, { erro: 'faltam ato e pagina' });
            const rows = await comIdentidade(sessao, async (c) =>
              (await c.query('select texto_bruto from public.atos where id = $1', [atoId])).rows);
            if (!rows.length) return responder(404, { erro: 'ato não encontrado' });
            return responder(200, await mapaDeDestaque(abs, pagina, rows[0].texto_bruto));
          }

          if (req.method === 'POST' && rota === '/api/ingest')           return responder(200, await ingerir(await corpoDaRequisicao()));
          if (req.method === 'POST' && rota === '/api/revisao/julgar')   return responder(200, await julgar(sessao, await corpoDaRequisicao()));
          if (req.method === 'POST' && rota === '/api/revisao/concluir') return responder(200, await concluir(sessao, await corpoDaRequisicao()));

          return responder(404, { erro: `rota ${req.method} ${rota} não existe` });
        } catch (e) {
          // Falha explícita: o app mostra o erro real, não engole.
          return responder(500, { erro: e.message });
        }
      });
    },
  };
}
