// Triagem inbound — contrato v1.2. Pure. Reusa opt-out hard/soft.
import { classifyOptOutKind, normalize } from "../cold-outreach/opt-out.ts";

export type TriageClass =
  | "hard"
  | "soft"
  | "goodbye"
  | "noise"
  | "interest"
  | "neutral";

export type TriageResult = {
  class: TriageClass;
  reason: string;
};

const GOODBYE = [
  /^(pode\s+deixar|obrigad[oa]|valeu|combinado|ok|certo)[\s!.]*$/i,
];

const NOISE = [
  /mensagem\s+automatica/,
  /resposta\s+automatica/,
  /fora\s+do\s+(escritorio|escritório|expediente)/,
  /out\s+of\s+office/,
  /estou\s+ausente/,
  /^auto[- ]?reply/,
];

const INTEREST = [
  /\btenho\s+interesse\b/,
  /\bquero\s+(saber|ver|conhecer|sim)\b/,
  /\bme\s+(explica|mostra|manda)\b/,
  /\bcomo\s+funciona\b/,
  /\bquanto\s+custa\b/,
  /\bpode\s+me\s+(chamar|ligar|explicar)\b/,
];

/**
 * @param exitAlreadySent — goodbye noop only after Mensagem de Saída.
 */
export function triageInbound(
  text: string,
  opts?: { exitAlreadySent?: boolean },
): TriageResult {
  const n = normalize(text);
  if (!n) return { class: "neutral", reason: "empty" };

  const kind = classifyOptOutKind(text);
  if (kind === "hard") return { class: "hard", reason: "hard_opt_out" };

  // "obrigada mas nao quero" → soft (not goodbye)
  if (kind === "soft") return { class: "soft", reason: "soft_opt_out" };

  if (opts?.exitAlreadySent) {
    for (const re of GOODBYE) {
      if (re.test(n) || re.test(text.trim())) {
        return { class: "goodbye", reason: "goodbye_ack" };
      }
    }
  }

  for (const re of NOISE) {
    if (re.test(n)) return { class: "noise", reason: "auto_reply_noise" };
  }

  for (const re of INTEREST) {
    if (re.test(n)) return { class: "interest", reason: "interest_signal" };
  }

  // Short polite without exit → not goodbye; treat as neutral/interest-ish
  if (opts?.exitAlreadySent === false || opts?.exitAlreadySent == null) {
    if (/obrigad/.test(n) && /nao\s+quero|sem\s+interesse|nao\s+tenho/.test(n)) {
      return { class: "soft", reason: "thanks_plus_decline" };
    }
  }

  return { class: "neutral", reason: "unclassified" };
}
