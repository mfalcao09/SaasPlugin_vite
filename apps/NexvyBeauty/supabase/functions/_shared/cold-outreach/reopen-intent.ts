// _shared/cold-outreach/reopen-intent.ts
//
// Classificador Path A (pós soft-opt-out closed): farewell_ack | reopen_intent |
// ambiguous | opt_out_again. Determinístico, sem LLM, sem I/O.
//
//   deno test supabase/functions/_shared/cold-outreach/reopen-intent.test.ts
//
// Policy: Q2 farewell window = 48h; negação/opt-out vence; reopen explícito
// vence cortesia (“obrigada, quero ver”).

import { normalize } from "./opt-out.ts";

export const CLASSIFIER_VERSION = "reopen-intent@1.0.0";
export const FAREWELL_WINDOW_HOURS = 48;

export type ReopenClass =
  | "farewell_ack"
  | "reopen_intent"
  | "ambiguous"
  | "opt_out_again"
  | "not_applicable";

export type ReopenIntentInput = {
  text: string;
  /** Hours since R2 delivered (or closed_at fallback). Null = treat as outside window. */
  hoursSinceR2?: number | null;
  /** Only classify when conversation is closed soft-opt-out / R2. */
  applicable?: boolean;
};

export type ReopenIntentResult = {
  class: ReopenClass;
  reason_code: string;
  matched_rules: string[];
  classifier_version: string;
  farewell_window_active: boolean;
};

const HARD_OPT_OUT: RegExp[] = [
  /\bsair\b/,
  /\bpare\b/,
  /\bparar\b/,
  /\bstop\b/,
  /\bunsubscribe\b/,
  /\bdescadastr/,
  /\bpara\s+de\s+(me\s+)?(mandar|enviar|chamar)/,
  /\bnao\s+me\s+(mande|manda|chame|chama)/,
  /\bnao\s+(quero|desejo)\s+(mais\s+)?(receber|mensagens?|contato)/,
  /\bme\s+(tire|tira|remova|remove)\b/,
  /\bbloquear\b/,
  /\bdenunciar\b/,
];

const SOFT_OPT_OUT: RegExp[] = [
  /\bnao\s+tenho\s+interesse\b/,
  /\bsem\s+interesse\b/,
  /\btalvez\s+(em\s+)?outra\s+oportunidade\b/,
];

const REOPEN: RegExp[] = [
  /\bmudei\s+de\s+ideia\b/,
  /\btenho\s+interesse\b/,
  /\bquero\s+ver\b/,
  /\bquero\s+(saber|conhecer|entender|agendar|marcar)\b/,
  /\bcomo\s+funciona\b/,
  /\bquanto\s+custa\b/,
  /\bpode\s+(me\s+)?(explicar|mostrar|contar|mandar|enviar)\b/,
  /\bme\s+(explica|mostra|conta)\b/,
  /\blink\b/,
  /\bsite\b/,
  /\bdemo\b/,
  /\bagenda\b/,
];

const FAREWELL: RegExp[] = [
  /^(pode\s+deixar)$/,
  /^(obrigad[oa])$/,
  /^(ok)$/,
  /^(combinado)$/,
  /^(beleza)$/,
  /^(valeu)$/,
  /^(certo)$/,
  /^(entendi)$/,
  /^(tranquilo)$/,
  /^(show)$/,
  /^(👍|🙏|👌|✅)$/,
];

function matchesAny(n: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    if (p.test(n)) return p.source;
  }
  return null;
}

export function classifyReopenIntent(
  input: ReopenIntentInput,
): ReopenIntentResult {
  const applicable = input.applicable !== false;
  const hours = input.hoursSinceR2;
  const farewellWindowActive =
    typeof hours === "number" && hours >= 0 && hours <= FAREWELL_WINDOW_HOURS;

  const base = {
    classifier_version: CLASSIFIER_VERSION,
    farewell_window_active: farewellWindowActive,
  };

  if (!applicable) {
    return {
      class: "not_applicable",
      reason_code: "not_applicable",
      matched_rules: [],
      ...base,
    };
  }

  const raw = String(input.text ?? "").trim();
  const n = normalize(raw);
  const matched: string[] = [];

  // Emoji / symbol-only ack (normalize strips non-letters → empty)
  if (!n && raw.length > 0 && farewellWindowActive && raw.length <= 8) {
    return {
      class: "farewell_ack",
      reason_code: "emoji_ack_in_window",
      matched_rules: ["farewell:emoji"],
      ...base,
    };
  }

  if (!n) {
    return {
      class: "ambiguous",
      reason_code: "empty_text",
      matched_rules: [],
      ...base,
    };
  }

  // 1) Hard / soft opt-out again (negation wins)
  const hard = matchesAny(n, HARD_OPT_OUT);
  if (hard) {
    matched.push(`hard:${hard}`);
    return {
      class: "opt_out_again",
      reason_code: "hard_opt_out",
      matched_rules: matched,
      ...base,
    };
  }
  const soft = matchesAny(n, SOFT_OPT_OUT);
  if (soft) {
    matched.push(`soft:${soft}`);
    return {
      class: "opt_out_again",
      reason_code: "soft_opt_out",
      matched_rules: matched,
      ...base,
    };
  }

  // 2) Reopen explicit (beats courtesy tokens)
  const reopen = matchesAny(n, REOPEN);
  if (reopen) {
    matched.push(`reopen:${reopen}`);
    return {
      class: "reopen_intent",
      reason_code: "explicit_reopen",
      matched_rules: matched,
      ...base,
    };
  }
  // Product question with ?
  if (/\?/.test(raw) && /\b(preco|preço|valor|funciona|nexvy|ia|whatsapp|agenda)\b/i.test(raw)) {
    matched.push("reopen:question_product");
    return {
      class: "reopen_intent",
      reason_code: "product_question",
      matched_rules: matched,
      ...base,
    };
  }

  // 3) Farewell in window — short polite ack
  if (farewellWindowActive) {
    const fare = matchesAny(n, FAREWELL);
    if (fare) {
      matched.push(`farewell:${fare}`);
      return {
        class: "farewell_ack",
        reason_code: "farewell_in_window",
        matched_rules: matched,
        ...base,
      };
    }
    // Short courtesy without commercial tokens (≤40 chars normalized)
    if (
      n.length <= 40 &&
      !/\b(quero|interesse|funciona|custa|preco|preço|link|site|agenda)\b/.test(n) &&
      /^(obrigad[oa]|valeu|ok|combinado|beleza|pode deixar|certo|entendi|tranquilo|show)( mesmo)?$/.test(
        n,
      )
    ) {
      matched.push("farewell:short_courtesy");
      return {
        class: "farewell_ack",
        reason_code: "short_courtesy_in_window",
        matched_rules: matched,
        ...base,
      };
    }
  }

  // 4) Rest
  return {
    class: "ambiguous",
    reason_code: farewellWindowActive ? "ambiguous_in_window" : "ambiguous_outside_window",
    matched_rules: matched,
    ...base,
  };
}
