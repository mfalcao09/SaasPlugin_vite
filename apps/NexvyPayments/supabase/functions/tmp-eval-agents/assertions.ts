// assertions.ts — motor binário de asserções do braço EVALS-V1 (5.6).
//
// Puro e determinístico: recebe o texto da resposta e uma Assertion, devolve
// pass/fail + detalhe. Não toca banco nem rede — é a régua que decide se a
// resposta do brain (Duda/Bia) cumpriu a regra do playbook.
//
// Consumido por: ./index.ts (runner: scoreGolden por golden após coletar as bolhas).

import type { Assertion } from './goldens.ts';

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
