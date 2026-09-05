// camila-journey.ts — fatos de jornada da Camila (F5) + guarda de fecho (F6).
//
// EFÊMERO: rederivado do histórico a cada turno. NÃO grava em conversation_state
// (tier 3 / prosa — Lei dos Tiers). Só injeta "não repergunte" no prompt.
//
//   deno test --allow-env supabase/functions/_shared/cold-outreach/camila-journey.test.ts

import type { TrailMessage, TrailNextAction } from "./conversation-trail.ts";

export type CamilaJourneyFact =
  | "espaco_proprio"
  | "atende_sozinha"
  | "agenda_caderno_wa"
  | "agenda_sistema";

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isInboundHuman(m: TrailMessage): boolean {
  const d = String(m.direction ?? "").toLowerCase();
  if (d !== "inbound" && d !== "in") return false;
  const s = String(m.sender_type ?? "visitor").toLowerCase();
  return (
    s === "visitor" ||
    s === "lead" ||
    s === "contact" ||
    s === "human" ||
    !m.sender_type
  );
}

function textOf(m: TrailMessage): string {
  return String(m.content ?? "").trim();
}

/** Negação curta — se a frase nega, NÃO vira fato. */
function isNegated(t: string): boolean {
  return (
    /\bnao\b/.test(t) ||
    /\bnunca\b/.test(t) ||
    t.includes("sem espaco") ||
    t.includes("nao tenho")
  );
}

/**
 * Extrai fatos JÁ ditos pela lead (inbound). Conservador: só afirmações claras.
 */
export function extractCamilaJourneyFacts(
  messages: TrailMessage[],
): CamilaJourneyFact[] {
  const out = new Set<CamilaJourneyFact>();
  for (const m of messages) {
    if (!isInboundHuman(m)) continue;
    const t = norm(textOf(m));
    if (!t || isNegated(t)) continue;

    if (
      t.includes("espaco proprio") ||
      t.includes("sala propria") ||
      t.includes("meu salao") ||
      t.includes("tenho salao") ||
      (t.includes("proprio") && (t.includes("espaco") || t.includes("sala")))
    ) {
      out.add("espaco_proprio");
    }
    if (
      t.includes("sozinha") ||
      t.includes("atendo sozinha") ||
      t.includes("so eu") ||
      t.includes("trabalho sozinha")
    ) {
      out.add("atende_sozinha");
    }
    if (
      (t.includes("caderno") && (t.includes("whatsapp") || t.includes("whats"))) ||
      t.includes("tudo no whatsapp") ||
      t.includes("agenda no whatsapp")
    ) {
      out.add("agenda_caderno_wa");
    }
    if (
      (t.includes("uso") || t.includes("uso um") || t.includes("tenho")) &&
      t.includes("sistema") &&
      (t.includes("agenda") || t.includes("gestao"))
    ) {
      out.add("agenda_sistema");
    }
  }
  return [...out];
}

const LABELS: Record<CamilaJourneyFact, string> = {
  espaco_proprio: "Tem espaço/sala própria (já dito). PROIBIDO perguntar de novo.",
  atende_sozinha: "Atende sozinha (já dito). PROIBIDO perguntar de novo.",
  agenda_caderno_wa:
    "Agenda no caderno/WhatsApp (já dito). PROIBIDO repetir a pergunta de sistema/agenda.",
  agenda_sistema:
    "Já usa sistema de agenda (já dito). PROIBIDO repetir a pergunta de sistema/agenda.",
};

/** Bloco para o system prompt. Vazio se não há fatos. */
export function formatCamilaJourneyBlock(facts: CamilaJourneyFact[]): string {
  if (!facts.length) return "";
  const lines = facts.map((f) => `- ${LABELS[f]}`);
  return (
    `\n═══════════════════════════════════════\n` +
    `FATOS DA JORNADA CAMILA (não repergunte — obedeça)\n` +
    `═══════════════════════════════════════\n` +
    `${lines.join("\n")}\n`
  );
}

export interface CamilaCloseGuard {
  /** Já saiu do frio: NÃO voltar a Mode A R1/R2. */
  forbidColdR1: boolean;
  /** Lead pediu demo/ver — caminho Raio-X / produto, não abertura. */
  expectDemoIntent: boolean;
  /** Lead pediu pagar/contratar — checkout URL obrigatória no turno. */
  expectCheckoutIntent: boolean;
}

/**
 * Guarda de fecho (F6): a partir da trilha + última inbound, o que NÃO pode acontecer.
 * Puro — o brain/eval usa para asserção; não envia WA.
 */
export function camilaCloseGuard(input: {
  nextAction: TrailNextAction;
  lastInboundText: string;
}): CamilaCloseGuard {
  const t = norm(input.lastInboundText);
  const advanced =
    input.nextAction === "bridge_diagnostic_to_value" ||
    input.nextAction === "advance_next_beat" ||
    input.nextAction === "describe_product_after_yes" ||
    input.nextAction === "mode_c_eco_cta";

  const expectDemoIntent =
    /\b(quero ver|mostra|mostrar|como funciona|me mostra|pode mostrar|raio-?x|demo)\b/
      .test(t);
  const expectCheckoutIntent =
    /\b(quero contratar|como pago|manda o link|quero comecar|quero começar|fechou|fechado|assinar|assinatura)\b/
      .test(t);

  return {
    forbidColdR1: advanced || expectDemoIntent || expectCheckoutIntent,
    expectDemoIntent,
    expectCheckoutIntent,
  };
}
