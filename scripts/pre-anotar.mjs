#!/usr/bin/env node
// ============================================================================
// Card C1.1a — PRÉ-ANOTAÇÃO do gabarito (PRD v2.1 §8.5, §9)
//
//   node scripts/pre-anotar.mjs [--fonte DJMS|DOMS] [--forcar]
//
// Gera um `.expected.json` por fixture, marcado `validado: false`.
//
// NÃO É O EXTRATOR DE PRODUÇÃO — é andaime heurístico para produzir uma
// PROPOSTA que Marcelo + AGDM validam (C1.1b). O extrator real usa IA e é o
// card C1.2, medido CONTRA este gabarito depois de validado.
// Por isso a heurística mora aqui, e não nos parsers: ela é descartável.
// O que sobrevive é o `.expected.json` confirmado por humano.
//
// Regra de ouro: na dúvida, NÃO inventa. Campo que a heurística não consegue
// determinar sai `null` e entra na lista `revisar`, para o humano decidir.
// ============================================================================

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileP = promisify(execFile);
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const FIXTURES = join(RAIZ, 'fixtures/edicoes');

const arg = (n, p) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : p;
};
const temFlag = (n) => process.argv.includes(`--${n}`);
const FILTRO_FONTE = arg('fonte', null);
const FORCAR = temFlag('forcar');

const log = (...a) => console.error(...a);
const existe = async (p) => { try { await stat(p); return true; } catch { return false; } };

const MESES = {
  janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
const iso = (d, m, a) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const limpar = (s) => s.replace(/\s+/g, ' ').trim();

// O pdftotext separa páginas com form-feed (\f). Contar quantos existem antes
// do offset dá a página (1-based) onde o ato está — é o que permite à Fila de
// Revisão abrir o PDF no ponto exato, em vez de largar o validador na página 1
// de um diário de 178.
function paginaDoOffset(texto, offset) {
  let n = 1;
  for (let i = 0; i < offset; i++) if (texto.charCodeAt(i) === 12) n++;
  return n;
}

// ============================================================================
// HEURÍSTICA · TJMS (DJMS) — Caderno 1 Administrativo
//
// Formato real (verificado nas fixtures): o número do ato vem NO FIM do
// parágrafo, entre parênteses — "(Port. n.º 2262/2026)". NÃO existe cabeçalho
// "PORTARIA Nº X" em linha própria. Um bloco "Portarias assinadas…" contém
// VÁRIOS atos, um por parágrafo.
// ============================================================================
const RE_PORT_TJMS = /\(Port\.?\s*n\.?\s*º?\s*(\d+)\s*\/\s*(\d{4})\)/gi;
// Relação declarada no texto: "Revogar, a Portaria n.º 1896/2026, publicada no D.J. n.º 5893"
const RE_RELACAO_TJMS =
  /(Revogar|Alterar|Tornar sem efeito|Retificar)[,\s][\s\S]{0,80}?Portaria\s*n\.?\s*º?\s*(\d+)\s*\/\s*(\d{4})/gi;

// Âncoras de INÍCIO de ato, da mais específica para a mais genérica.
//
// Recortar por contagem de caracteres (o antigo `corpo.slice(-900)`) errava de
// dois jeitos, os dois vistos na Fila de Revisão: corpo longo -> os 900 caíam no
// meio do acórdão anterior ("fo único, do CPC)"); corpo curto -> devolvia o
// corpo inteiro, que começa na ASSINATURA do ato anterior ("(a) Desembargador
// FULANO Presidente"). O texto tem fronteira explícita — usar ela.
const ANCORAS_DJMS = [
  /Portarias?\s+assinadas?\s+pel[oa]\s+Excelent[íi]ssim[oa]/gi,
  /\bR\s?E\s?S\s?O\s?L\s?V\s?E\s?:/g,
  /(?:Conceder|Designar|Revogar|Exonerar|Nomear|Dispensar|Tornar sem efeito|Retificar|Autorizar|Prorrogar|Instituir|Alterar)\b/g,
];

/** Recorta o corpo a partir da última âncora encontrada (fim do ato anterior). */
function recortarAtoDJMS(corpo) {
  for (const re of ANCORAS_DJMS) {
    const ms = [...corpo.matchAll(re)];
    if (ms.length) return corpo.slice(ms[ms.length - 1].index);
  }
  return corpo.slice(-900);   // nenhuma âncora: mantém o comportamento antigo
}

function anotarDJMS(texto) {
  const atos = [];
  const revisar = [];

  // Cada ocorrência de (Port. n.º N/AAAA) fecha um ato; o corpo é o trecho
  // desde o fim do ato anterior até essa marca.
  let anterior = 0;
  for (const m of texto.matchAll(RE_PORT_TJMS)) {
    const corpo = limpar(texto.slice(anterior, m.index));
    anterior = m.index + m[0].length;

    const disp = corpo.match(
      /(Conceder|Designar|Revogar|Exonerar|Nomear|Dispensar|Tornar sem efeito|Retificar|Autorizar|Prorrogar|Instituir|Alterar)[\s\S]{0,400}$/i,
    );
    // TRECHO ORIGINAL: o humano nao consegue julgar sem ver o texto do diario.
    // Recorta da fronteira do ato (ver ANCORAS_DJMS) + a marca do numero.
    const trecho = limpar(recortarAtoDJMS(corpo)) + ' ' + m[0];

    atos.push({
      tipo: 'Portaria',
      numero: m[1],
      ano: Number(m[2]),
      data_ato: null,            // não aparece por ato; fica para o humano
      orgao_emissor: 'Tribunal de Justiça de Mato Grosso do Sul',
      ementa: disp ? limpar(disp[0]).slice(0, 400) : null,
      trecho_original: trecho,
      // Página onde a marca "(Port. n.º X/AAAA)" aparece no PDF — o fim do
      // ato, que é onde o validador precisa olhar.
      pagina: paginaDoOffset(texto, m.index),
      confianca_heuristica: disp ? 'media' : 'baixa',
    });
    if (!disp) revisar.push(`Portaria ${m[1]}/${m[2]}: não foi possível isolar a ementa`);
  }

  const relacoes = [];
  for (const m of texto.matchAll(RE_RELACAO_TJMS)) {
    relacoes.push({
      tipo: m[1].toLowerCase().startsWith('revog') ? 'revoga' : 'altera',
      destino: { tipo: 'Portaria', numero: m[2], ano: Number(m[3]) },
      trecho: limpar(m[0]).slice(0, 160),
    });
  }
  return { atos, relacoes, revisar };
}

// ============================================================================
// HEURÍSTICA · DO/MS (DOMS)
//
// Formato real: cabeçalho em linha própria —
//   DECRETO "O" Nº 092/2026, DE 21 DE JULHO DE 2026
//   RESOLUÇÃO CONJUNTA SEFAZ/SEMADESC Nº 103, DE 13 DE JULHO DE 2026.
//
// ARMADILHA: o SUMÁRIO da 1ª página casa com o mesmo padrão
// ("DECRETO ORÇAMENTÁRIO......... 2"). Linha com pontilhado é descartada.
// ============================================================================
// SEM flag 'i': o cabeçalho real vem em CAIXA ALTA ("DECRETO Nº 092/2026"),
// enquanto CITAÇÃO a norma antiga vem em caixa mista no corpo do texto
// ("Decreto nº 11.176, de 11 de abril de 2003"). Ignorar a caixa fazia a
// heurística registrar normas de 2003 e 2023 como atos publicados hoje —
// falso positivo que contaminaria o gabarito inteiro.
const RE_CAB_DOMS = new RegExp(
  String.raw`^\s*(DECRETO|RESOLU[ÇC][ÃA]O(?:\s+CONJUNTA)?|PORTARIA|INSTRU[ÇC][ÃA]O NORMATIVA|DELIBERA[ÇC][ÃA]O)` +
  String.raw`([^\n]{0,60}?)\s*N[º°]\s*([\d.]+)\s*(?:\/\s*(\d{4}))?\s*,?\s*DE\s+(\d{1,2})\s+DE\s+([A-Za-zÀ-ÿ]+)\s+DE\s+(\d{4})`,
);

// Citação em caixa mista — não é ato publicado, mas é PISTA DE RELAÇÃO
// normativa. Não entra em `atos`; entra em `relacoes_sugeridas`.
const RE_CITACAO_DOMS =
  /\b(Decreto|Resolu[çc][ãa]o|Portaria|Lei)\s+(?:Estadual\s+)?n[º°.]?\s*([\d.]+)\s*,?\s*de\s+(\d{1,2})\s+de\s+([a-zà-ÿ]+)\s+de\s+(\d{4})/g;

function anotarDOMS(texto) {
  const atos = [];
  const revisar = [];
  const vistos = new Set();

  // Varre o texto COMPLETO (não linha a linha): é preciso saber onde cada
  // cabeçalho começa para recortar o trecho que pertence àquele ato — sem o
  // trecho, o humano não tem como julgar se a extração está correta.
  const linhas = texto.split('\n');
  const marcas = [];   // { idx, ...campos }  idx = posição da linha no array

  // Página (1-based) de cada linha: o \f do pdftotext fica embutido na
  // primeira linha de cada página nova. Cumulativo, uma passada só.
  const paginaPorLinha = new Array(linhas.length);
  for (let i = 0, pg = 1; i < linhas.length; i++) {
    for (let j = 0; j < linhas[i].length; j++) if (linhas[i].charCodeAt(j) === 12) pg++;
    paginaPorLinha[i] = pg;
  }

  linhas.forEach((linha, idx) => {
    if (/\.{6,}/.test(linha)) return;        // linha de sumário
    const m = RE_CAB_DOMS.exec(linha);
    if (!m) return;

    const [, tipoBruto, complemento, numero, anoNum, dia, mesNome, anoData] = m;
    const mes = MESES[mesNome.toLowerCase()];
    if (!mes) {
      revisar.push(`mês não reconhecido: "${mesNome}" em "${limpar(linha).slice(0, 80)}"`);
      return;
    }

    const tipoCompleto = limpar(`${tipoBruto} ${complemento || ''}`)
      .replace(/["“”]/g, '')
      .replace(/[\/\-–,;:]+$/, '')
      .trim();
    const chave = `${tipoCompleto}|${numero}|${anoData}`;
    if (vistos.has(chave)) return;            // mesmo ato citado no corpo
    vistos.add(chave);

    marcas.push({ idx, tipoBruto, tipoCompleto, numero, anoNum, dia, mes, anoData, cabecalho: limpar(linha) });
  });

  marcas.forEach((mk, i) => {
    // O trecho vai deste cabeçalho até o próximo (ou 40 linhas, o que vier
    // antes) — é o corpo do ato como publicado no diário.
    const fimLinha = Math.min(
      i + 1 < marcas.length ? marcas[i + 1].idx : linhas.length,
      mk.idx + 40,
    );
    const bruto = linhas.slice(mk.idx, fimLinha).join(' ');
    const trecho = limpar(bruto).slice(0, 1200);

    // A ementa costuma vir logo após "resolve:" / "RESOLVE:" / "DECRETA:".
    // Se não houver marcador, usa o texto após o cabeçalho como aproximação —
    // sempre sinalizando confiança baixa para o humano conferir.
    const corpo = limpar(bruto.slice(mk.cabecalho.length));
    const apos = corpo.match(/(?:resolve|decreta|resolvem)\s*:\s*([\s\S]{20,400})/i);
    const ementa = apos ? limpar(apos[1]).slice(0, 400)
                        : (corpo ? corpo.slice(0, 400) : null);

    atos.push({
      tipo: limpar(mk.tipoBruto),
      tipo_completo: mk.tipoCompleto,
      numero: mk.numero.replace(/\./g, ''),
      ano: Number(mk.anoNum || mk.anoData),
      data_ato: iso(Number(mk.dia), mk.mes, Number(mk.anoData)),
      orgao_emissor: null,          // não vem no cabeçalho; humano decide
      ementa,
      trecho_original: trecho,
      pagina: paginaPorLinha[mk.idx],   // onde o CABEÇALHO do ato está no PDF
      confianca_heuristica: apos ? 'media' : 'baixa',
    });
    if (!apos) revisar.push(`${mk.tipoCompleto} ${mk.numero}: sem marcador resolve/decreta — ementa aproximada`);
  });

  // Citações a normas anteriores: não são atos publicados, mas indicam
  // relação normativa. Só interessam as que NÃO são o próprio ato da edição.
  const relacoes = [];
  const numerosPublicados = new Set(atos.map((a) => `${a.numero}/${a.ano}`));
  const vistasRel = new Set();
  for (const m of texto.matchAll(RE_CITACAO_DOMS)) {
    const num = m[2].replace(/\./g, '');
    const chave = `${m[1]}|${num}|${m[5]}`;
    if (numerosPublicados.has(`${num}/${Number(m[5])}`) || vistasRel.has(chave)) continue;
    vistasRel.add(chave);
    relacoes.push({
      tipo: 'referencia',            // o vínculo exato é decisão humana/IA
      destino: { tipo: m[1], numero: num, ano: Number(m[5]) },
      trecho: limpar(m[0]).slice(0, 160),
    });
  }

  return { atos, relacoes, revisar };
}

const HEURISTICAS = { DJMS: anotarDJMS, DOMS: anotarDOMS };

/** Extrai texto preservando layout (essencial para cabeçalhos em coluna). */
async function textoDoPdf(caminho) {
  const { stdout } = await execFileP('pdftotext', ['-layout', caminho, '-'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Pré-anota UMA edição já baixada em fixtures/.
 *
 * Extraída do laço do CLI para que a API (`POST /api/ingest`) possa encadear
 * captura → extração: sem isso o botão baixa o PDF e a tela de Publicações
 * continua vazia, porque a extração só existia como passo manual de terminal.
 *
 * @returns {{base:string, status:'anotada'|'preservada'|'sem-heuristica',
 *            atos:number, relacoes:number, revisar:number}}
 */
export async function preAnotarArquivo(nome, { forcar = false } = {}) {
  const base = basename(nome, '.pdf');
  const destino = join(FIXTURES, `${base}.expected.json`);

  // NUNCA sobrescreve gabarito já validado por humano.
  if (!forcar && (await existe(destino))) {
    const atual = JSON.parse(await readFile(destino, 'utf8'));
    if (atual.validado) {
      return { base, status: 'preservada', atos: atual.total_atos ?? 0, relacoes: 0, revisar: 0 };
    }
  }

  const [sigla, ano, mes, dia, numero] = base.split('-');
  const heuristica = HEURISTICAS[sigla];
  if (!heuristica) return { base, status: 'sem-heuristica', atos: 0, relacoes: 0, revisar: 0 };

  const texto = await textoDoPdf(join(FIXTURES, nome));
  const { atos, relacoes, revisar } = heuristica(texto);

  const gabarito = {
    $schema: 'gabarito-v1',
    fonte: sigla,
    edicao: numero,
    data_publicacao: `${ano}-${mes}-${dia}`,
    arquivo: nome,
    // ---- só vira gabarito depois que um humano confirmar (C1.1b) --------
    validado: false,
    validado_por: null,
    validado_em: null,
    // --------------------------------------------------------------------
    origem_anotacao: 'heuristica-c1.1a',
    total_atos: atos.length,
    atos,
    relacoes_sugeridas: relacoes,
    revisar,
  };

  await writeFile(destino, `${JSON.stringify(gabarito, null, 2)}\n`);
  return {
    base, status: 'anotada',
    atos: atos.length, relacoes: relacoes.length, revisar: revisar.length,
  };
}

async function main() {
  const arquivos = (await readdir(FIXTURES))
    .filter((f) => f.endsWith('.pdf'))
    .filter((f) => !FILTRO_FONTE || f.startsWith(`${FILTRO_FONTE}-`))
    .sort();

  if (arquivos.length === 0) throw new Error('nenhuma fixture .pdf encontrada');
  log(`[C1.1a] ${arquivos.length} fixture(s) para pré-anotar\n`);

  let totalAtos = 0, totalRel = 0, pulados = 0;

  for (const nome of arquivos) {
    const r = await preAnotarArquivo(nome, { forcar: FORCAR });

    if (r.status === 'preservada')     { log(`  ${r.base} — JÁ VALIDADO, preservado`); pulados++; continue; }
    if (r.status === 'sem-heuristica') { log(`  ${r.base} — sem heurística, pulando`); pulados++; continue; }

    totalAtos += r.atos;
    totalRel += r.relacoes;
    log(`  ${r.base} → ${String(r.atos).padStart(3)} ato(s) · ${r.relacoes} relação(ões)` +
        (r.revisar ? ` · ⚠ ${r.revisar} a revisar` : ''));
  }

  log(`\n[C1.1a] ${totalAtos} atos · ${totalRel} relações sugeridas · ${pulados} pulado(s)`);
  log('[C1.1a] TODOS marcados validado:false — aguardam C1.1b (Marcelo + AGDM)');
}

// Só roda o CLI quando ESTE arquivo é o entrypoint. Sem a guarda, qualquer
// `import` do módulo (a API faz isso) reprocessaria todas as fixtures.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { log(`[C1.1a] FALHA: ${e.message}`); process.exit(1); });
}
