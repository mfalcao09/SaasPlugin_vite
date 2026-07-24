// ============================================================================
// Cliente Gemini — único ponto do app que fala com um LLM
//
// Decisões que importam:
// - temperature 0 + responseSchema JSON: extração é tarefa de precisão, não
//   de criatividade; o schema força a forma e elimina parsing frágil.
// - CACHE por hash(model+system+user): mesma página + mesmo prompt = mesma
//   resposta, sem custo. É também o modo mockado: MOCK_IA=1 usa SÓ o cache
//   (erro em miss) — testes determinísticos, sem chave, sem rede.
// - A chave NUNCA é logada. Erros reportam status, nunca a URL com key.
// ============================================================================

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '../../..');
const CACHE_DIR = join(RAIZ, 'fixtures/.ia-cache');

// .env do app, parse manual — sem dependência, sem vazar para o client
// (import.meta.env do Vite exporia com prefixo VITE_; aqui é só servidor).
let ENV = null;
async function env() {
  if (ENV) return ENV;
  ENV = {};
  try {
    const bruto = await readFile(join(RAIZ, '.env'), 'utf8');
    for (const l of bruto.split('\n')) {
      const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) ENV[m[1]] = m[2].trim();
    }
  } catch { /* sem .env: só MOCK_IA funciona */ }
  // Container/produção: variáveis de ambiente do processo têm precedência.
  for (const k of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'MOCK_IA']) {
    if (process.env[k]) ENV[k] = process.env[k];
  }
  return ENV;
}

export async function modeloAtual() {
  const e = await env();
  return e.GEMINI_MODEL || 'gemini-3.5-flash';
}

const hashDe = (...partes) =>
  createHash('sha256').update(partes.join(' ')).digest('hex').slice(0, 24);

/**
 * Chamada JSON-estruturada ao Gemini.
 * @param {object} p
 * @param {string} p.system    - contrato (Camada A) + papel do agente
 * @param {string} p.user      - conteúdo da tarefa (página, candidatos…)
 * @param {object} p.schema    - responseSchema (formato Gemini/OpenAPI)
 * @param {string} p.rotulo    - nome do agente (telemetria)
 * @returns {{dados:any, uso:{entrada:number,saida:number}, cache:boolean, modelo:string}}
 */
export async function chamarJson({ system, user, schema, rotulo = 'agente' }) {
  const e = await env();
  const modelo = e.GEMINI_MODEL || 'gemini-3.5-flash';
  const chaveCache = hashDe(modelo, system, user, JSON.stringify(schema));
  const arqCache = join(CACHE_DIR, `${chaveCache}.json`);

  try {
    const c = JSON.parse(await readFile(arqCache, 'utf8'));
    return { dados: c.dados, uso: c.uso, cache: true, modelo: c.modelo };
  } catch { /* miss */ }

  if (e.MOCK_IA === '1') {
    throw new Error(`MOCK_IA=1 e cache ausente para ${rotulo} (${chaveCache}) — rode uma vez com a chave para gravar o cache`);
  }
  if (!e.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY ausente no .env do app');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
  const corpo = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

  let ultimoErro;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': e.GEMINI_API_KEY },
      body: JSON.stringify(corpo),
    });
    if (r.status === 429 || r.status >= 500) {
      ultimoErro = new Error(`${rotulo}: HTTP ${r.status} do Gemini (tentativa ${tentativa})`);
      await new Promise((ok) => setTimeout(ok, 1200 * tentativa));
      continue;
    }
    const j = await r.json();
    if (!r.ok) throw new Error(`${rotulo}: ${j.error?.status ?? r.status} — ${String(j.error?.message ?? '').slice(0, 140)}`);

    const texto = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
    let dados;
    try { dados = JSON.parse(texto); }
    catch { throw new Error(`${rotulo}: resposta não é JSON válido (${texto.slice(0, 80)}…)`); }

    const uso = {
      entrada: j.usageMetadata?.promptTokenCount ?? 0,
      saida: j.usageMetadata?.candidatesTokenCount ?? 0,
    };
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(arqCache, JSON.stringify({ dados, uso, modelo, rotulo, em: new Date().toISOString() }));
    return { dados, uso, cache: false, modelo };
  }
  throw ultimoErro;
}
