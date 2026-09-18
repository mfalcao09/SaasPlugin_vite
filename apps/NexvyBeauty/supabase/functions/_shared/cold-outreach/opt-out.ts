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

const HARD_OPT_OUT_PATTERNS: RegExp[] = [
  /\bsair\b/,
  /\bpare\b/,
  /\bparar\b/,
  /\bpara\s+de\s+(me\s+)?(mandar|enviar|chamar)/,
  /\bnao\s+(quero|desejo)\s+(mais\s+)?(receber|mensagens?|contato)/,
  /\bnao\s+me\s+(mande|manda|chame|chama|perturbe|perturba)/,
  /\bme\s+(tire|tira|remova|remove)\b/,
  /\bdescadastr/,
  /^(cancelar|cancela|remover|remove)$/,
  /\b(quero|desejo|favor|por\s+favor)\s+(cancelar|remover)\b/,
  /\b(cancelar|remover)\s+(meu\s+)?(contato|numero|cadastro|mensagens?|inscricao)\b/,
  /\bstop\b/,
  /\bunsubscribe\b/,
  /\bnao\s+perturbe\b/,
  /\bbloquear\b/,
  /\bdenunciar\b/,
];

const SOFT_OPT_OUT_PATTERNS: RegExp[] = [
  /\bnao\s+tenho\s+interesse\b/,
  /\bsem\s+interesse\b/,
  /\btalvez\s+(em\s+)?outra\s+oportunidade\b/,
  // Recusa de interesse conjugada / circunstancial (caso Victória).
  /\bnao\s+me\s+interess[oa]\b/,
  /\bnao\s+estou\s+interessad[ao]s?\b/,
  /\bno\s+momento\s+nao\s+(quero|preciso|rola)\b/,
  /\bnao\s+quero\s+(agora|no\s+momento)\b/,
  /\bnao\s+e\s+pra\s+mim\b/,
  /\bfica\s+pra\s+proxima\b/,
];

// Frases/tokens de opt-out. Hard primeiro; soft depois.
const OPT_OUT_PATTERNS: RegExp[] = [
  ...HARD_OPT_OUT_PATTERNS,
  ...SOFT_OPT_OUT_PATTERNS,
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
export type OptOutKind = "hard" | "soft";

export interface IntentResult {
  intent: ReplyIntent;
  matched: string | null;
  /** Present when intent === opt_out. Hard never gets R2. */
  optOutKind?: OptOutKind;
}

/** Soft vs hard (Path A / R2). Hard wins if both could match. */
export function classifyOptOutKind(text: string): OptOutKind | null {
  const n = normalize(text);
  for (const re of HARD_OPT_OUT_PATTERNS) {
    if (re.test(n)) return "hard";
  }
  for (const re of SOFT_OPT_OUT_PATTERNS) {
    if (re.test(n)) return "soft";
  }
  return null;
}

/** É opt-out? (prioritário) */
export function isOptOut(text: string): boolean {
  return classifyOptOutKind(text) !== null;
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
  for (const re of HARD_OPT_OUT_PATTERNS) {
    if (re.test(n)) {
      return { intent: "opt_out", matched: re.source, optOutKind: "hard" };
    }
  }
  for (const re of SOFT_OPT_OUT_PATTERNS) {
    if (re.test(n)) {
      return { intent: "opt_out", matched: re.source, optOutKind: "soft" };
    }
  }
  for (const re of WANT_PATTERNS) {
    if (re.test(n)) return { intent: "want", matched: re.source };
  }
  return { intent: "neutral", matched: null };
}
