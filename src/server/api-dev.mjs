// ============================================================================
// API de desenvolvimento — middleware do Vite
//
// POR QUE ISTO EXISTE: o app precisa de backend para listar fontes, disparar
// ingestão e gravar validação. Em PRODUÇÃO isso será Edge Function do Supabase
// (PRD §7.2). Aqui roda como middleware do dev server, para que a aplicação
// seja OPERÁVEL POR UM HUMANO desde já — sem terminal, sem script.
//
// A regra que mantém isso honesto: este arquivo NÃO tem regra de negócio.
// Ele expõe por HTTP o que já existe em src/services/. Ao virar Edge Function,
// muda o transporte, não a lógica.
//
// Rotas:
//   GET  /api/fontes                 fontes cadastradas + o que já foi ingerido
//   GET  /api/edicoes                edições em disco
//   POST /api/ingest {parserKey}     descobre e baixa edições novas
//   GET  /api/atos?q=&fonte=&de=&ate= atos extraídos, com busca e filtros
//   GET  /api/revisao                edições pendentes de validação humana
//   POST /api/revisao/julgar         registra ✓/✗ de um ato
//   POST /api/revisao/concluir       fecha a edição (validado=true)
// ============================================================================

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '../..');
const FIXTURES = join(RAIZ, 'fixtures/edicoes');
// URL montada em runtime — ver comentário no `ingerir()`: string literal aqui
// faria o esbuild bundlar o script (que tem shebang) dentro do vite.config.
const CAMINHO_PRE_ANOTAR = new URL('../../scripts/pre-anotar.mjs', import.meta.url).href;

const existe = async (p) => { try { await stat(p); return true; } catch { return false; } };

/** Catálogo de fontes — espelha o seed de `fontes_diarios` na migration. */
const FONTES = [
  { sigla: 'DOMS', nome: 'Diário Oficial do Estado de MS', parser_key: 'doms-pdf',
    modo: 'scrape', esfera: 'executivo', uf: 'MS', operacional: true },
  { sigla: 'DJMS', nome: 'Diário da Justiça de MS — Caderno 1', parser_key: 'djms-esaj',
    modo: 'scrape', esfera: 'judiciario', uf: 'MS', operacional: true },
  { sigla: 'DOU', nome: 'Diário Oficial da União', parser_key: 'dou-inlabs',
    modo: 'xml', esfera: 'executivo', uf: null, operacional: false,
    bloqueio: 'Aguarda credencial do INLABS (cadastro gratuito)' },
  { sigla: 'CNJ', nome: 'Atos Normativos do CNJ', parser_key: 'cnj-atos',
    modo: 'api', esfera: 'judiciario', uf: null, operacional: false,
    bloqueio: 'Parser ainda não implementado' },
  { sigla: 'STF', nome: 'Atos Normativos do STF', parser_key: 'stf-atos',
    modo: 'scrape', esfera: 'judiciario', uf: null, operacional: false,
    bloqueio: 'Sem API; lista curada desatualizada' },
  { sigla: 'STJ', nome: 'Atos Normativos do STJ', parser_key: 'stj-atos',
    modo: 'scrape', esfera: 'judiciario', uf: null, operacional: false,
    bloqueio: 'BDJur atrás de Cloudflare' },
];

async function carregarGabaritos() {
  if (!(await existe(FIXTURES))) return [];
  const arquivos = (await readdir(FIXTURES)).filter((f) => f.endsWith('.expected.json')).sort();
  const saida = [];
  for (const nome of arquivos) saida.push(JSON.parse(await readFile(join(FIXTURES, nome), 'utf8')));
  return saida;
}

const idDoAto = (g, i) => `${g.fonte}-${g.edicao}-${i}`;

async function listarFontes() {
  const gabs = await carregarGabaritos();
  return FONTES.map((f) => {
    const meus = gabs.filter((g) => g.fonte === f.sigla);
    return {
      ...f,
      edicoes_ingeridas: meus.length,
      atos_extraidos: meus.reduce((s, g) => s + g.atos.length, 0),
      ultima_edicao: meus.map((g) => g.data_publicacao).sort().pop() ?? null,
      validadas: meus.filter((g) => g.validado).length,
    };
  });
}

async function listarEdicoes() {
  const gabs = await carregarGabaritos();
  const saida = [];
  for (const g of gabs) {
    const pdf = join(FIXTURES, g.arquivo);
    let bytes = 0, hash = null;
    if (await existe(pdf)) {
      const buf = await readFile(pdf);
      bytes = buf.byteLength;
      hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    }
    saida.push({
      fonte: g.fonte, edicao: g.edicao, data_publicacao: g.data_publicacao,
      arquivo: g.arquivo, bytes, hash,
      total_atos: g.atos.length,
      validado: g.validado === true,
      julgados: g.atos.filter((a) => a.julgamento).length,
    });
  }
  return saida.sort((a, b) => b.data_publicacao.localeCompare(a.data_publicacao));
}

async function listarAtos(query) {
  const termo = (query.get('q') ?? '').trim().toLowerCase();
  const fonte = query.get('fonte') ?? '';
  const de = query.get('de') ?? '';
  const ate = query.get('ate') ?? '';
  const pagina = Number(query.get('pagina') ?? 1);
  const porPagina = Number(query.get('porPagina') ?? 25);

  const gabs = await carregarGabaritos();
  let itens = [];
  for (const g of gabs) {
    g.atos.forEach((a, i) => {
      itens.push({
        id: idDoAto(g, i),
        fonte: g.fonte, edicao: g.edicao, data_publicacao: g.data_publicacao,
        arquivo: g.arquivo,
        tipo: a.tipo_completo || a.tipo, numero: a.numero, ano: a.ano,
        data_ato: a.data_ato ?? null, ementa: a.ementa ?? null,
        trecho_original: a.trecho_original ?? null,
        confianca: a.confianca_heuristica ?? 'media',
        julgamento: a.julgamento ?? null,
        // Enquanto o gabarito não foi validado por humano, o ato é PROPOSTA,
        // não fato. Mesma regra do trigger do banco (§6.2).
        status: g.validado ? 'ok' : 'revisao',
      });
    });
  }

  if (fonte) itens = itens.filter((x) => x.fonte === fonte);
  if (de) itens = itens.filter((x) => x.data_publicacao >= de);
  if (ate) itens = itens.filter((x) => x.data_publicacao <= ate);
  if (termo) {
    itens = itens.filter((x) =>
      `${x.tipo} ${x.numero} ${x.ementa ?? ''} ${x.trecho_original ?? ''}`
        .toLowerCase().includes(termo));
  }

  itens.sort((a, b) =>
    b.data_publicacao.localeCompare(a.data_publicacao) || Number(b.numero) - Number(a.numero));

  const total = itens.length;
  const ini = (pagina - 1) * porPagina;
  return { itens: itens.slice(ini, ini + porPagina), total, pagina, porPagina };
}

async function pendentesDeRevisao() {
  const gabs = await carregarGabaritos();
  return gabs
    .filter((g) => !g.validado)
    .map((g) => ({
      fonte: g.fonte, edicao: g.edicao, data_publicacao: g.data_publicacao,
      arquivo: g.arquivo, total: g.atos.length,
      julgados: g.atos.filter((a) => a.julgamento).length,
      atos: g.atos.map((a, i) => ({ id: idDoAto(g, i), indice: i, ...a })),
    }))
    .sort((a, b) => b.data_publicacao.localeCompare(a.data_publicacao));
}

/** Registra o julgamento humano de UM ato, persistindo no gabarito. */
async function julgar({ arquivo, indice, decisao, campos }) {
  const alvo = join(FIXTURES, arquivo.replace(/\.pdf$/, '.expected.json'));
  const g = JSON.parse(await readFile(alvo, 'utf8'));
  const a = g.atos[indice];
  if (!a) throw new Error(`ato ${indice} não existe em ${arquivo}`);

  a.julgamento = decisao;                     // 'ok' | 'descartado'
  if (campos && typeof campos === 'object') {
    for (const [k, v] of Object.entries(campos)) {
      if (v !== undefined && v !== null && v !== '') {
        a[k] = k === 'ano' ? Number(v) : v;
        a.editado_por_humano = true;
      }
    }
  }
  await writeFile(alvo, `${JSON.stringify(g, null, 2)}\n`);
  return { ok: true, julgados: g.atos.filter((x) => x.julgamento).length, total: g.atos.length };
}

/**
 * Fecha a edição. Só marca validado=true se TODOS os atos foram julgados —
 * não existe gabarito parcial. Atos descartados saem (eram falso positivo).
 */
async function concluir({ arquivo, validadoPor }) {
  if (!validadoPor) throw new Error('validado_por é obrigatório: gabarito precisa de autoria');
  const alvo = join(FIXTURES, arquivo.replace(/\.pdf$/, '.expected.json'));
  const g = JSON.parse(await readFile(alvo, 'utf8'));

  const semJulgar = g.atos.filter((a) => !a.julgamento).length;
  if (semJulgar > 0) return { ok: false, motivo: `${semJulgar} ato(s) ainda sem julgamento`, semJulgar };

  const mantidos = g.atos.filter((a) => a.julgamento === 'ok');
  g.descartados_na_validacao = g.atos.length - mantidos.length;
  g.atos = mantidos;
  g.total_atos = mantidos.length;
  g.validado = true;
  g.validado_por = validadoPor;
  g.validado_em = new Date().toISOString();
  g.origem_anotacao = 'heuristica-c1.1a + validacao-humana-c1.1b';

  await writeFile(alvo, `${JSON.stringify(g, null, 2)}\n`);
  return { ok: true, validado: true, mantidos: mantidos.length, descartados: g.descartados_na_validacao };
}

/** Dispara a ingestão real da fonte — o mesmo caminho que o cron usará. */
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

    // Captura sem extração não entrega nada: a tela de Publicações continuaria
    // vazia. Pré-anota já aqui para o operador ver o resultado no mesmo clique.
    //
    // O especificador é COMPUTADO de propósito: o esbuild bundla o vite.config
    // e tudo que ele importa; com string literal ele arrastaria o script pra
    // dentro do bundle e quebraria no shebang. Variável = import opaco.
    const { preAnotarArquivo } = await import(CAMINHO_PRE_ANOTAR);
    const anotacao = await preAnotarArquivo(`${id}.pdf`);
    resultado.atosExtraidos += anotacao.atos;

    resultado.edicoes.push({
      id, status: 'baixada', data: ed.data_publicacao, bytes,
      hash: createHash('sha256').update(buffer).digest('hex').slice(0, 16),
      atos: anotacao.atos,
    });
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
        const responder = (status, corpo) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(corpo));
        };
        const corpoDaRequisicao = () => new Promise((resolve, reject) => {
          let dados = '';
          req.on('data', (c) => { dados += c; });
          req.on('end', () => { try { resolve(dados ? JSON.parse(dados) : {}); } catch (e) { reject(e); } });
          req.on('error', reject);
        });

        try {
          if (req.method === 'GET'  && rota === '/api/fontes')  return responder(200, await listarFontes());
          if (req.method === 'GET'  && rota === '/api/edicoes') return responder(200, await listarEdicoes());
          if (req.method === 'GET'  && rota === '/api/atos')    return responder(200, await listarAtos(url.searchParams));
          if (req.method === 'GET'  && rota === '/api/revisao') return responder(200, await pendentesDeRevisao());
          if (req.method === 'POST' && rota === '/api/ingest')           return responder(200, await ingerir(await corpoDaRequisicao()));
          if (req.method === 'POST' && rota === '/api/revisao/julgar')   return responder(200, await julgar(await corpoDaRequisicao()));
          if (req.method === 'POST' && rota === '/api/revisao/concluir') return responder(200, await concluir(await corpoDaRequisicao()));
          return responder(404, { erro: `rota ${req.method} ${rota} não existe` });
        } catch (e) {
          // Falha explícita: o app mostra o erro real, não engole.
          return responder(500, { erro: e.message });
        }
      });
    },
  };
}
