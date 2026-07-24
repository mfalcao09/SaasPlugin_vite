// ============================================================================
// ORQUESTRADOR — o agente central da extração por IA
//
// Fluxo por página:
//   1. A1 TRIADOR (LLM)      → candidatos com classe e âncoras verbatim
//   2. recorte (CÓDIGO)      → localiza âncoras no texto e extrai o span real
//   3. A2 EXTRATOR (LLM)     → campos dos candidatos ato_publicado
//   4. A3 RELACIONADOR (LLM) → relações normativas com evidência
//   5. AUDITOR (CÓDIGO)      → grounding: cada campo existe verbatim no span?
//                              âncora não achada? número divergente? → flag
//
// O passo 5 é deliberadamente NÃO-LLM: anti-alucinação de verdade é conferência
// mecânica contra a fonte. Ato com qualquer flag nasce status='revisao' e a
// confiança cai — a IA propõe, o humano decide (PRD §4.3), e o sistema nunca
// afirma o que não consegue provar no texto.
// ============================================================================

import { triarPagina, extrairCampos, relacionarAtos } from './agentes.mjs';
import { modeloAtual } from './gemini.mjs';

const norm = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Localiza `ancora` em `texto`, por janela de tokens ALFANUMÉRICOS.
 *
 * Tokenizar por runs alfanuméricos (e não por \S+) é essencial: "065/2026,"
 * como token único vira "065 2026" na normalização e nunca casa com "065" —
 * foi exatamente o bug que fez as Portarias 065/066 sumirem do recorte no
 * primeiro teste real, com as âncoras da IA perfeitas.
 */
function acharAncora(texto, ancora) {
  const alvoTokens = norm(ancora).split(' ').filter(Boolean);
  if (!alvoTokens.length) return -1;
  const tokens = [];
  for (const m of texto.matchAll(/[A-Za-zÀ-ÿ0-9]+/g)) {
    const t = norm(m[0]);
    if (t) tokens.push({ t, i: m.index });
  }
  const K = Math.min(alvoTokens.length, 6);
  for (let i = 0; i + K <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < K; j++) if (tokens[i + j].t !== alvoTokens[j]) { ok = false; break; }
    if (ok) return tokens[i].i;
  }
  return -1;
}

/**
 * Recorta o span [ancora_inicio … ancora_fim] do texto da página.
 * NUNCA descarta silenciosamente: falhou a âncora → tenta o cabeçalho →
 * em último caso usa a página inteira, sempre com flag. Ato sumir sem
 * aviso é o pior erro possível num sistema de acervo.
 */
function recortarSpan(textoPagina, cand) {
  let ini = acharAncora(textoPagina, cand.ancora_inicio);
  let flagIni = null;
  if (ini < 0 && cand.cabecalho) {
    ini = acharAncora(textoPagina, cand.cabecalho);
    if (ini >= 0) flagIni = 'ancora_inicio_via_cabecalho';
  }
  if (ini < 0) {
    return {
      texto: textoPagina.replace(/\s+/g, ' ').trim().slice(0, 2400),
      flag: 'ancora_inicio_nao_encontrada_span_pagina_inteira',
    };
  }
  const idxFim = acharAncora(textoPagina.slice(ini), cand.ancora_fim);
  const fim = idxFim < 0
    ? Math.min(ini + 2400, textoPagina.length)
    : ini + idxFim + String(cand.ancora_fim).length + 80;
  return {
    texto: textoPagina.slice(ini, fim).replace(/\s+/g, ' ').trim().slice(0, 2400),
    flag: flagIni ?? (idxFim < 0 ? 'ancora_fim_nao_encontrada' : null),
  };
}

/** AUDITOR mecânico: campo a campo, o valor existe no span? */
function auditar(ato, span) {
  const flags = [];
  const alvo = norm(span);
  if (ato.numero && !alvo.includes(norm(ato.numero))) flags.push('numero_fora_do_texto');
  if (ato.ano && !alvo.includes(String(ato.ano))) flags.push('ano_fora_do_texto');
  if (ato.tipo && !alvo.includes(norm(ato.tipo))) flags.push('tipo_fora_do_texto');
  if (ato.data_ato && !/^\d{4}-\d{2}-\d{2}$/.test(ato.data_ato)) flags.push('data_ato_formato_invalido');
  if (ato.ementa) {
    // ementa deve ser recorte do span (tolerância: 70% dos tokens presentes)
    const t = norm(ato.ementa).split(' ').filter(Boolean);
    const presentes = t.filter((x) => alvo.includes(x)).length;
    if (t.length && presentes / t.length < 0.7) flags.push('ementa_nao_ancorada_no_texto');
  }
  return flags;
}

function auditarRelacao(rel, span) {
  const alvo = norm(span);
  const flags = [];
  if (!alvo.includes(norm(rel.evidencia).slice(0, 40))) flags.push('evidencia_fora_do_texto');
  if (rel.destino_numero && !alvo.includes(norm(rel.destino_numero))) flags.push('destino_fora_do_texto');
  return flags;
}

/**
 * Extrai UMA página. Devolve todos os candidatos (com classe) e os atos
 * estruturados — auditados, com proveniência completa.
 */
export async function extrairPagina({ fonte, numeroPagina, textoPagina }) {
  const tel = { chamadas: 0, tokens_entrada: 0, tokens_saida: 0, cache: 0 };
  const conta = (r) => {
    tel.chamadas++; tel.tokens_entrada += r.uso?.entrada ?? 0;
    tel.tokens_saida += r.uso?.saida ?? 0; if (r.cache) tel.cache++;
  };

  // 1. triagem
  const tri = await triarPagina({ fonte, numeroPagina, textoPagina });
  conta(tri);
  const candidatos = (tri.dados.candidatos ?? []).map((c) => {
    const { texto, flag } = recortarSpan(textoPagina, c);
    return { ...c, texto, flag_recorte: flag };
  });

  const publicados = candidatos
    .map((c, i) => ({ ...c, indice: i }))
    .filter((c) => c.classe === 'ato_publicado' && c.texto);

  let atos = [];
  if (publicados.length) {
    // 2. campos + 3. relações (em paralelo — mesmos insumos)
    const [campos, rels] = await Promise.all([
      extrairCampos({ fonte, numeroPagina, candidatos: publicados }),
      relacionarAtos({ fonte, numeroPagina, candidatos: publicados }),
    ]);
    conta(campos); conta(rels);

    const relPorCand = new Map();
    for (const r of rels.dados.relacoes ?? []) {
      const lista = relPorCand.get(r.indice_candidato) ?? [];
      lista.push(r);
      relPorCand.set(r.indice_candidato, lista);
    }

    atos = (campos.dados.atos ?? []).map((a) => {
      const cand = publicados[a.indice_candidato];
      if (!cand) return null;
      const flags = [
        ...(cand.flag_recorte ? [cand.flag_recorte] : []),
        ...auditar(a, cand.texto),
      ];
      const relacoes = (relPorCand.get(a.indice_candidato) ?? []).map((r) => {
        const fr = auditarRelacao(r, cand.texto);
        return {
          tipo: r.verbo,
          destino: { tipo: r.destino_tipo, numero: r.destino_numero, ano: r.destino_ano ?? null },
          evidencia: r.evidencia,
          flags: fr,
        };
      });
      return {
        // formato compatível com gabarito-v1
        tipo: a.tipo,
        tipo_completo: a.tipo_completo ?? a.tipo,
        numero: a.numero,
        ano: a.ano,
        data_ato: a.data_ato ?? null,
        orgao_emissor: a.orgao_emissor ?? null,
        ementa: a.ementa ?? null,
        trecho_original: cand.texto,
        pagina: numeroPagina,
        // proveniência IA
        origem: 'ia',
        classe_ia: cand.classe,
        justificativa: a.justificativa,
        auditoria: { aprovado: flags.length === 0, flags },
        confianca_heuristica: flags.length === 0 ? 'media' : 'baixa',
        relacoes_sugeridas: relacoes,
      };
    }).filter(Boolean);
  }

  return {
    fonte, pagina: numeroPagina,
    modelo: await modeloAtual(),
    candidatos: candidatos.map(({ texto, ...c }) => ({ ...c, texto_chars: texto?.length ?? 0 })),
    atos,
    telemetria: tel,
  };
}

/** Divide o texto do pdftotext em páginas (form-feed) e extrai as pedidas. */
export async function extrairPaginas({ fonte, textoCompleto, paginas }) {
  const blocos = textoCompleto.split('\f');
  const resultado = [];
  for (const n of paginas) {
    const textoPagina = blocos[n - 1];
    if (!textoPagina?.trim()) { resultado.push({ fonte, pagina: n, vazia: true, atos: [] }); continue; }
    resultado.push(await extrairPagina({ fonte, numeroPagina: n, textoPagina }));
  }
  return resultado;
}
