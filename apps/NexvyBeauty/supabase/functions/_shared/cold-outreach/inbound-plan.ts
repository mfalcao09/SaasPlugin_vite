// _shared/cold-outreach/inbound-plan.ts
//
// Planejador PURO da reação a uma resposta do lead (functional core). Recebe o
// texto + as linhas de fila do lead e devolve o PLANO de escritas — sem tocar no
// banco. O motor (imperative shell) apenas EXECUTA o plano. Assim o opt-out
// (para cadência) e o handoff ("quero"→Duda) ficam 100% testáveis sem DB.
//
//   deno test --no-check supabase/functions/_shared/cold-outreach/inbound-plan.test.ts
import { classifyReply, type ReplyIntent } from "./opt-out.ts";
import { classifyInboundKind, type InboundKind } from "./auto-reply.ts";

export interface QueueRowRef {
  id: string;
  lead_id?: string | null;
  handle?: string | null;
  product_id?: string | null;
}

export interface InboundContext {
  product_id?: string | null;
  conversation_id?: string | null;
  telefone?: string | null;
  handle?: string | null;
}

export interface InboundPlan {
  intent: ReplyIntent | "auto_reply";
  inboundKind: InboundKind;
  /** grava/atualiza platform_crm_lead_optout */
  optOut: { product_id: string; telefone: string | null; handle: string | null; reason: string } | null;
  /** novo status a aplicar em TODAS as linhas de fila do lead (null = não mexer) */
  queueStatus: "opted_out" | "handed_off" | "replied" | null;
  /** limpa next_followup_at (para a cadência) */
  clearFollowups: boolean;
  /** dispara handoff BDR→Duda no mesmo thread */
  handoff: boolean;
  /** muda status da conversa p/ silenciar o brain (só no opt-out) */
  silenceConversation: boolean;
  /** brain NÃO deve responder (auto-resposta ou apresentar em curso) */
  suppressBrain: boolean;
  /** continua sequência APRESENTAR após auto-resposta */
  bumpApresentar: boolean;
  /** aborta sequência APRESENTAR (resposta humana real) */
  abortApresentar: boolean;
  /** evento de instrumentação */
  journey: { type: string; category: string; title: string; matched: string | null };
}

/**
 * Decide o que fazer com a resposta do lead. Opt-out para tudo e grava supressão;
 * "quero" faz handoff (só se há conversa); resposta neutra apenas para os
 * follow-ups (stop-on-response), sem opt-out nem handoff.
 */
export function planInbound(text: string, rows: QueueRowRef[], ctx: InboundContext): InboundPlan {
  const verdict = classifyReply(text);
  const inboundKind = classifyInboundKind(text);
  const productId = ctx.product_id ?? rows[0]?.product_id ?? null;
  const handle = ctx.handle ?? rows[0]?.handle ?? null;
  const telefone = ctx.telefone ? String(ctx.telefone).replace(/\D/g, "") : null;

  if (verdict.intent === "opt_out") {
    return {
      intent: "opt_out",
      inboundKind,
      optOut: productId ? { product_id: productId, telefone, handle, reason: "runtime_opt_out" } : null,
      queueStatus: "opted_out",
      clearFollowups: true,
      handoff: false,
      silenceConversation: !!ctx.conversation_id,
      suppressBrain: true,
      bumpApresentar: false,
      abortApresentar: true,
      journey: { type: "customer_lost", category: "contact", title: "Cold: opt-out (SAIR/PARE)", matched: verdict.matched },
    };
  }

  // Auto-resposta comercial: NÃO é lead — não dispara brain, não marca replied.
  if (inboundKind === "auto_reply") {
    return {
      intent: "auto_reply",
      inboundKind,
      optOut: null,
      queueStatus: null,
      clearFollowups: false,
      handoff: false,
      silenceConversation: false,
      suppressBrain: true,
      bumpApresentar: true,
      abortApresentar: false,
      journey: { type: "auto_reply_seen", category: "contact", title: "Cold: auto-resposta ignorada", matched: "auto_reply_heuristic" },
    };
  }

  if (verdict.intent === "want" && ctx.conversation_id) {
    return {
      intent: "want",
      inboundKind,
      optOut: null,
      queueStatus: "handed_off",
      clearFollowups: true,
      handoff: true,
      silenceConversation: false,
      suppressBrain: false,
      bumpApresentar: false,
      abortApresentar: true,
      journey: { type: "conversation_accepted", category: "attendance", title: "Cold: 'quero' -> handoff Duda", matched: verdict.matched },
    };
  }

  // Resposta humana real: para follow-ups, brain pode responder, aborta APRESENTAR.
  return {
    intent: verdict.intent,
    inboundKind,
    optOut: null,
    queueStatus: "replied",
    clearFollowups: true,
    handoff: false,
    silenceConversation: false,
    suppressBrain: false,
    bumpApresentar: false,
    abortApresentar: true,
    journey: { type: "first_message_in", category: "contact", title: "Cold: resposta do lead", matched: verdict.matched },
  };
}
