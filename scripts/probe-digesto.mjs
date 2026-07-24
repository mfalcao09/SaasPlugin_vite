#!/usr/bin/env node
// ============================================================================
// probe-digesto.mjs — teste de VIABILIDADE da API de Diários Oficiais do
// Digesto (mesmo motor que serve a API de diários do Jusbrasil).
//
// NÃO faz parte da ingestão. É um probe manual, rodado à mão para responder
// duas perguntas de FATO antes de decidir pagar o provedor:
//
//   1. O catálogo de fontes inclui o DJe-STJ ADMINISTRATIVO e o DJe-STF?
//      (STF já aparece como "Nacional - STF" na doc; STJ-admin é a dúvida.)
//   2. Dá pra reconstruir uma EDIÇÃO INTEIRA em TEXTO caminhando as páginas
//      (doc/get + next_page_id/prev_page_id), sem depender de match-all na
//      busca — só de UM hit de entrada?
//
// Uso:
//   node scripts/probe-digesto.mjs fontes
//   node scripts/probe-digesto.mjs edicao <sourceId> <AAAA-MM-DD> [termo]
//
// Auth (doc op.digesto.com.br/doc_api/auth.html): Authorization: Bearer <token>
// O token vem de process.env.DIGESTO_API_KEY ou do .env da raiz do app.
// NUNCA é impresso — só o tamanho, como sanity check (regra de segredos:
// inspeção por presença/tamanho, nunca conteúdo).
//
// Não roda sozinho sem a chave. Com a chave no .env, os dois comandos acima
// entregam a prova (ou a refutação) do provedor.
// ============================================================================

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const BASE = 'https://op.digesto.com.br';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- token: ambiente > .env, nunca impresso -------------------------------
function lerToken() {
  if (process.env.DIGESTO_API_KEY) return process.env.DIGESTO_API_KEY.trim();
  try {
    const env = readFileSync(join(RAIZ, '.env'), 'utf8');
    const m = /^\s*DIGESTO_API_KEY\s*=\s*(.+)\s*$/m.exec(env);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  } catch { /* .env ausente */ }
  return null;
}

const TOKEN = lerToken();
if (!TOKEN) {
  console.error('ERRO: DIGESTO_API_KEY ausente. Ponha a chave trial no .env:');
  console.error('  DIGESTO_API_KEY=<seu-token-do-painel-companyadmin/api>');
  process.exit(2);
}
console.log(`token: presente (${TOKEN.length} chars)`);

// ---- HTTP -----------------------------------------------------------------
async function req(method, path, body) {
  const resp = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* resposta não-JSON */ }
  return { status: resp.status, ok: resp.ok, json, text };
}

// ---- comando: fontes ------------------------------------------------------
async function cmdFontes() {
  const RE_ALVO = /stf|stj|supremo|superior tribunal|justi[cç]a/i;
  for (const ep of ['/api/diario/fontes_termos', '/api/diario/fontes_recortes']) {
    const r = await req('GET', ep);
    console.log(`\n=== ${ep} — HTTP ${r.status} ===`);
    if (!r.ok) { console.log('  resp:', (r.text || '').slice(0, 500)); continue; }
    const lista = Array.isArray(r.json)
      ? r.json
      : (r.json?.fontes ?? r.json?.items ?? r.json?.results ?? r.json?.sources ?? []);
    console.log(`total de fontes: ${lista.length}`);
    if (lista.length && !Array.isArray(r.json)) {
      console.log(`(chaves do envelope: ${Object.keys(r.json).join(', ')})`);
    }
    const alvo = lista.filter((f) => RE_ALVO.test(JSON.stringify(f)));
    console.log(`--- candidatas STF/STJ (${alvo.length}) — objeto cru p/ achar o id ---`);
    for (const f of alvo) console.log('  ' + JSON.stringify(f));
    if (!alvo.length && lista.length) {
      console.log('  (nenhuma casou STF/STJ; amostra das 3 primeiras fontes:)');
      for (const f of lista.slice(0, 3)) console.log('  ' + JSON.stringify(f));
    }
  }
}

// ---- comando: edicao ------------------------------------------------------
function proxDia(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function buscarEntrada(sourceId, dia, prox, termo) {
  // A doc diverge: op.digesto usa `numeric_range`, o mirror Jusbrasil cita
  // `range`. Tento os dois e reporto qual respondeu.
  for (const chave of ['numeric_range', 'range']) {
    const payload = {
      query: { query_string: termo || '*' },
      filter: {
        terms: { source: [Number(sourceId)] },
        [chave]: { publish_date: { gte: dia, lt: prox } },
      },
      from: 0,
      size: 1,
    };
    const b = await req('POST', '/api/diarios-oficiais/doc/buscar', payload);
    console.log(`buscar (${chave}, query="${termo || '*'}") → HTTP ${b.status}` +
      `; keys=${b.json ? Object.keys(b.json).join(',') : '—'}`);
    if (!b.ok) { console.log('  resp:', (b.text || '').slice(0, 300)); continue; }
    const hits = b.json?.docs ?? b.json?.hits ?? b.json?.items ??
      b.json?.results ?? (Array.isArray(b.json) ? b.json : []);
    console.log(`  hits: ${hits.length}`);
    if (hits.length) return hits[0].id ?? hits[0]._id ?? hits[0].doc_id ?? null;
  }
  return null;
}

async function getDoc(id) {
  const r = await req('GET', `/api/diarios-oficiais/doc/get/${encodeURIComponent(id)}`);
  if (!r.ok) { console.error(`  doc/get ${id} → HTTP ${r.status}`); return null; }
  return r.json;
}

// Caminha next_page_id pra frente e prev_page_id pra trás a partir de UM doc,
// parando quando a data muda (delimita a edição) ou o ponteiro zera.
async function coletarEdicao(entryId, dia) {
  const paginas = new Map();
  const campoNext = (d) => d.next_page_id ?? d.next_page ?? null;
  const campoPrev = (d) => d.prev_page_id ?? d.prev_page ?? null;
  const daData = (d) => String(d.publish_date ?? '').slice(0, 10) === dia;

  const entrada = await getDoc(entryId);
  if (!entrada) return paginas;
  const add = (id, d) => paginas.set(String(id), {
    body: d.body ?? '', docurl: d.docurl ?? null,
    pd: String(d.publish_date ?? '').slice(0, 10),
  });
  add(entryId, entrada);

  for (const [primeiro, prox] of [
    [campoNext(entrada), campoNext],
    [campoPrev(entrada), campoPrev],
  ]) {
    let cur = primeiro, hops = 0;
    while (cur && hops < 5000) {
      if (paginas.has(String(cur))) break;
      const d = await getDoc(cur);
      if (!d || !daData(d)) break;
      add(cur, d);
      cur = prox(d);
      hops++;
      await sleep(120); // educado com o provedor
    }
  }
  return paginas;
}

async function cmdEdicao(sourceId, dia, termo) {
  if (!sourceId || !/^\d{4}-\d{2}-\d{2}$/.test(dia || '')) {
    console.error('uso: node scripts/probe-digesto.mjs edicao <sourceId> <AAAA-MM-DD> [termo]');
    process.exit(2);
  }
  const prox = proxDia(dia);
  console.log(`\n=== EDIÇÃO: fonte=${sourceId} data=${dia} (janela ${dia}..${prox}) ===`);

  const entryId = await buscarEntrada(sourceId, dia, prox, termo);
  if (!entryId) {
    console.error('SEM doc de entrada. Se a query "*" foi rejeitada, passe um ' +
      'termo real como 4º arg (ex.: "Tribunal"). Se hits=0, a fonte pode não ' +
      'ter edição nesta data ou o sourceId está errado.');
    process.exit(1);
  }
  console.log(`doc de entrada: id=${entryId}`);

  const paginas = await coletarEdicao(entryId, dia);
  const arr = [...paginas.values()];
  const totalChars = arr.reduce((s, p) => s + (p.body?.length ?? 0), 0);

  console.log(`\n=== RESULTADO ===`);
  console.log(`páginas reconstruídas: ${arr.length}`);
  console.log(`texto total: ${totalChars} chars (${(totalChars / 1024).toFixed(0)} KB)`);
  console.log(`docurl de exemplo: ${arr[0]?.docurl ?? '—'}`);
  console.log(`amostra (primeiros 400 chars da 1ª página coletada):`);
  console.log('  ' + (arr[0]?.body ?? '(vazio)').slice(0, 400).replace(/\n/g, '\n  '));
  console.log(`\ncusto desta edição: ${arr.length} chamadas doc/get + 1 busca ` +
    `= ${arr.length + 1} unidades faturáveis. Multiplique por ~250 dias úteis/ano ` +
    `× nº de fontes pra dimensionar o recorrente.`);
  if (arr.length <= 1) {
    console.log('\nATENÇÃO: só 1 página. Ou a edição tem 1 página, ou o ' +
      'prev/next não veio preenchido (campo com outro nome?). Rode um doc/get ' +
      'isolado pra inspecionar os campos crus.');
  }
}

// ---- dispatch -------------------------------------------------------------
const [cmd, ...rest] = process.argv.slice(2);
const main = {
  fontes: () => cmdFontes(),
  edicao: () => cmdEdicao(rest[0], rest[1], rest[2]),
}[cmd];

if (!main) {
  console.error('comandos: fontes | edicao <sourceId> <AAAA-MM-DD> [termo]');
  process.exit(2);
}
main().catch((e) => { console.error('FALHA:', e.message); process.exit(1); });
