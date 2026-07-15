// _shared/cold-outreach/opt-out.ts
//
// Detecção PURA de intenção na resposta do lead: opt-out ("SAIR/PARE" → Art.18
// LGPD, grava optout + para cadência) e sinal de "quero" (→ handoff pra Duda).
// COLD-OUTREACH-SCRIPT §5.2/§2⑥; blueprint §3.2 (livre oposição) e §5.2 (handoff).
//
//   deno test --no-check supabase/functions/_shared/cold-outreach/opt-out.test.ts
//
// Só CLASSIFICA texto — quem grava optout / faz handoff é o motor. Conservador:
// opt-out tem prioridade sobre "quero" (se a pessoa disse "quero sair", é opt-out).

/** Normaliza: minúsculas, sem acento, espaços colapsados, pontuação de borda removida. */
export function normalize(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tira acentos
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // pontuação → espaço
    .replace(/\s+/g, " ")
    .trim();
}

// Frases/tokens de opt-out. Palavra isolada OU frase — casadas por regex de borda.
const OPT_OUT_PATTERNS: RegExp[] = [
  /\bsair\b/,
  /\bpare\b/,
  /\bparar\b/,
  /\bpara\s+de\s+(me\s+)?(mandar|enviar|chamar)/,
  /\bnao\s+(quero|desejo)\s+(mais\s+)?(receber|mensagens?|contato)/,
  /\bnao\s+me\s+(mande|manda|chame|chama|perturbe|perturba)/,
  /\bme\s+(tire|tira|remova|remove)\b/,
  /\bdescadastr/,
  /\bcancelar?\b/,
  /\bremover?\b/,
  /\bnao\s+tenho\s+interesse\b/,
  /\bsem\s+interesse\b/,
  /\bstop\b/,
  /\bunsubscribe\b/,
  /\bnao\s+perturbe\b/,
  /\bbloquear\b/,
  /\bdenunciar\b/,
];

// Sinais de "quero" / demo aceita → dispara handoff pra Duda.
const WANT_PATTERNS: RegExp[] = [
  /\bquero\b/,
  /\bquero\s+ver\b/,
  /\bpode\s+(puxar|mostrar|mandar|enviar)\b/,
  /\bpode\s+ser\b/,
  /\bbora\b/,
  /\bvamos\b/,
  /\bme\s+(mostra|manda|envia|puxa)\b/,
  /\btenho\s+interesse\b/,
  /\baceito\b/,
  /\bsim\b/,
];

export type ReplyIntent = "opt_out" | "want" | "neutral";

export interface IntentResult {
  intent: ReplyIntent;
  matched: string | null;
}

/** É opt-out? (prioritário) */
export function isOptOut(text: string): boolean {
  const n = normalize(text);
  return OPT_OUT_PATTERNS.some((re) => re.test(n));
}

/** É sinal de "quero" / demo aceita? */
export function isWantSignal(text: string): boolean {
  const n = normalize(text);
  return WANT_PATTERNS.some((re) => re.test(n));
}

/**
 * Classifica a resposta. Opt-out SEMPRE vence want ("quero, mas me tira daqui" →
 * opt_out). Sem match → neutral (deixa a cadência seguir / humano decidir).
 */
export function classifyReply(text: string): IntentResult {
  const n = normalize(text);
  for (const re of OPT_OUT_PATTERNS) {
    if (re.test(n)) return { intent: "opt_out", matched: re.source };
  }
  for (const re of WANT_PATTERNS) {
    if (re.test(n)) return { intent: "want", matched: re.source };
  }
  return { intent: "neutral", matched: null };
}
