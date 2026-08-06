// assertions.ts — motor binário de asserções do braço EVALS-V1 (5.6).
//
// Puro e determinístico: recebe o texto da resposta e uma Assertion, devolve
// pass/fail + detalhe. Não toca banco nem rede — é a régua que decide se a
// resposta do brain (Duda/Bia) cumpriu a regra do playbook.
//
// Consumido por: ./index.ts (runner: scoreGolden por golden após coletar as bolhas).

import { type Assertion, SPLICE_INJECTIONS, SPLICE_TAIL } from './goldens.ts';

/** Detecta URL http(s) — o "link de pagamento" que a Duda manda ao decidido. */
const URL_RE = /https?:\/\/[^\s)]+/i;

export interface AssertionResult {
  pass: boolean;
  kind: string;
  scope: string;
  reason: string;
  /** Evidência do que a régua viu (trecho casado, contagem etc.). */
  detail: string;
}

/**
 * Avalia UMA assertion contra o texto do escopo correto.
 * @param a         a assertion
 * @param lastTurn  texto concatenado das bolhas geradas pela ÚLTIMA chamada do brain
 * @param allTurns  texto concatenado de TODAS as bolhas outbound do bot na conversa
 */
export function evalAssertion(
  a: Assertion,
  lastTurn: string,
  allTurns: string,
): AssertionResult {
  const scope = a.scope ?? 'lastTurn';
  const text = scope === 'all' ? allTurns : lastTurn;
  const base = { kind: a.kind, scope, reason: a.reason };

  switch (a.kind) {
    case 'must_contain': {
      const re = new RegExp(a.pattern ?? '', 'i');
      const m = text.match(re);
      return {
        ...base,
        pass: !!m,
        detail: m ? `casou "${m[0]}"` : `padrão /${a.pattern}/i não encontrado`,
      };
    }
    case 'must_not_contain': {
      const re = new RegExp(a.pattern ?? '', 'i');
      const m = text.match(re);
      if (m && a.unlessNegated) {
        // JANELA DE NEGAÇÃO (E2b 06/08). Olha a FRASE INTEIRA que contém o
        // match — os DOIS lados. O guard do sanitizeReply que a sessão BDR
        // acabou de consertar falhava por olhar só à esquerda, enquanto a
        // negação vinha à direita ("Desconto a gente NÃO trabalha").
        const idx = m.index ?? text.indexOf(m[0]);
        const ini = Math.max(0, text.lastIndexOf('\n', idx) + 1);
        const fim = ((): number => {
          const p = text.slice(idx).search(/[.!?…\n]/);
          return p === -1 ? text.length : idx + p;
        })();
        const frase = text.slice(ini, fim);
        if (/\b(n[ãa]o|nunca|jamais|sem)\b/i.test(frase)) {
          return {
            ...base,
            pass: true,
            detail: `"${m[0]}" aparece em NEGAÇÃO (permitido): "${frase.trim().slice(0, 110)}"`,
          };
        }
      }
      return {
        ...base,
        pass: !m,
        detail: m ? `PROIBIDO encontrado: "${m[0]}"` : 'ausente (ok)',
      };
    }
    case 'max_questions': {
      const count = (text.match(/\?/g) || []).length;
      const max = a.value ?? 1;
      return {
        ...base,
        pass: count <= max,
        detail: `${count} '?' (máx ${max})`,
      };
    }
    case 'must_link': {
      const m = text.match(URL_RE);
      return {
        ...base,
        pass: !!m,
        detail: m ? `link presente: ${m[0]}` : 'nenhum link http(s)',
      };
    }
    case 'no_link': {
      const m = text.match(URL_RE);
      return {
        ...base,
        pass: !m,
        detail: m ? `link INDEVIDO: ${m[0]}` : 'sem link (ok)',
      };
    }
    // no_splice — E2b 06/08. Detector de ASSINATURA do splice do sanitizeReply
    // (não é detector de incoerência em geral; ver comentário em goldens.ts).
    // Procura: injeção conhecida + cauda com sujeito novo/negação impessoal na
    // MESMA oração (até o próximo . ! ? …). Se casar, a frase foi quebrada.
    case 'no_splice': {
      for (const inj of SPLICE_INJECTIONS) {
        // v2: a cauda tem que vir IMEDIATAMENTE após a injeção (só espaço ou
        // vírgula no meio). Injeção bem colocada é seguida de preposição,
        // conjunção ou pontuação — nunca de um sujeito abrindo outra oração.
        const re = new RegExp(`${inj}[\\s,;:—-]*\\b${SPLICE_TAIL}\\b`, 'i');
        const m = text.match(re);
        if (m) {
          return {
            ...base,
            pass: false,
            detail: `FRASE QUEBRADA (splice do sanitizeReply): "${m[0].slice(0, 140)}"`,
          };
        }
      }
      return { ...base, pass: true, detail: 'sem splice detectado (ok)' };
    }
    default:
      return { ...base, pass: false, detail: `assertion kind desconhecida: ${a.kind}` };
  }
}

export interface GoldenScore {
  total: number;
  passed: number;
  failed: number;
  passRate: number; // 0..1
  results: AssertionResult[];
  /** true se TODAS as assertions passaram (o golden "passou"). */
  goldenPass: boolean;
}

// ── GATE DE PRÉ-COMPILAÇÃO (06/08) ─────────────────────────────────────────
// Origem: a sessão BDR entregou 8 goldens com 51 asserções em sintaxe PCRE
// (`(?i)`, `(?s)`, `(?m)`), inválida no motor JS. Medi o que acontece hoje:
// evalAssertion NÃO engole a exceção (bom), mas ela estoura no scoreGolden —
// que roda DEPOIS de todas as chamadas ao cérebro. Dois danos:
//   1. a medição do golden é queimada por inteiro (turnos reais já gastos);
//   2. o catch do runner devolve total:0/passed:0, então "instrumento
//      quebrado" fica com a MESMA cara de "o cérebro se comportou mal".
// O segundo é o caro: manda caçar comportamento quando o defeito era sintaxe.
//
// Daí este gate: compila TODO padrão ANTES do primeiro turno e recusa o run
// listando os culpados. Vale para qualquer golden futuro, não só os 8 da BDR.

/** Um padrão que não serve, com o golden e a asserção que o carregam. */
export interface PatternDefect {
  goldenId: string;
  kind: string;
  pattern: string;
  message: string;
}

/** Kinds cujo veredito depende de `pattern`; nos outros o campo é ignorado. */
const KINDS_QUE_USAM_PATTERN = new Set(['must_contain', 'must_not_contain']);

/**
 * Compila os padrões de todos os goldens selecionados + as globais.
 * Devolve a lista de defeitos (vazia = pode rodar).
 *
 * Pega DUAS famílias, não uma:
 *  - padrão que não compila (sintaxe PCRE, grupo inválido, escape solto);
 *  - padrão AUSENTE ou vazio em kind que depende dele. Esse é o pior: hoje
 *    `new RegExp('')` compila e casa com tudo, então um `must_contain` sem
 *    pattern passaria SEMPRE — verde oco que nenhum erro denuncia.
 */
export function validatePatterns(
  goldens: Array<{ id: string; assertions: Assertion[] }>,
  globals: Assertion[] = [],
): PatternDefect[] {
  const defeitos: PatternDefect[] = [];

  const checar = (goldenId: string, a: Assertion) => {
    if (!KINDS_QUE_USAM_PATTERN.has(a.kind)) return;
    if (a.pattern === undefined || a.pattern === '') {
      defeitos.push({
        goldenId,
        kind: a.kind,
        pattern: String(a.pattern),
        message: `pattern ausente/vazio em '${a.kind}' — casaria com tudo e passaria sempre`,
      });
      return;
    }
    try {
      new RegExp(a.pattern, 'i');
    } catch (e) {
      defeitos.push({ goldenId, kind: a.kind, pattern: a.pattern, message: String((e as Error).message) });
    }
  };

  // As globais entram uma vez, sob id sintético: se elas quebrarem, TODO
  // golden quebra, e reportar isso 15 vezes esconderia a causa única.
  for (const a of globals) checar('__GLOBAL__', a);
  for (const g of goldens) for (const a of g.assertions) checar(g.id, a);

  // As injeções do no_splice são montadas em RegExp em runtime (ver o case
  // 'no_splice'): se uma delas não compilar, o detector fica CEGO e o golden
  // passa. Elas não vivem em nenhum `pattern`, então precisam de checagem
  // própria — senão este gate teria ponto cego exatamente onde mais dói.
  for (const inj of SPLICE_INJECTIONS) {
    try {
      new RegExp(`${inj}[\\s,;:—-]*\\b${SPLICE_TAIL}\\b`, 'i');
    } catch (e) {
      defeitos.push({
        goldenId: '__SPLICE_INJECTIONS__',
        kind: 'no_splice',
        pattern: inj,
        message: String((e as Error).message),
      });
    }
  }

  return defeitos;
}

/** Roda todas as assertions de um golden e agrega o placar. */
export function scoreGolden(
  assertions: Assertion[],
  lastTurn: string,
  allTurns: string,
): GoldenScore {
  const results = assertions.map((a) => evalAssertion(a, lastTurn, allTurns));
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  return {
    total,
    passed,
    failed: total - passed,
    passRate: total ? passed / total : 1,
    results,
    goldenPass: passed === total,
  };
}
