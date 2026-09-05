// _shared/cold-outreach/conversation-trail.ts
//
// Condutor da trilha — functional core. Lê as últimas msgs e decide o PRÓXIMO
// beat (nunca "aguardar em silêncio"). Camila CONDUZ; pergunta de diagnóstico
// sem resposta humana nova → ponte "Eu perguntei porque…" + valor + faz sentido?
//
//   deno test --allow-env supabase/functions/_shared/cold-outreach/conversation-trail.test.ts

export type TrailBeat =
  | "opening"
  | "r1_delivered"
  | "r2_cta"
  | "qualification"
  | "diagnostic_agenda"
  | "value_explained"
  | "unknown";

export type TrailNextAction =
  | "bridge_diagnostic_to_value"
  | "mode_a_r1_r2"
  | "mode_b_eco_r1_r2"
  | "mode_c_eco_cta"
  | "advance_next_beat"
  | "describe_product_after_yes";

export interface TrailMessage {
  content: string | null | undefined;
  /** 'outbound' = nossa fala; 'inbound' = lead */
  direction: string;
  sender_type?: string | null;
  created_at?: string | null;
}

export interface TrailAssessment {
  lastBeat: TrailBeat;
  nextAction: TrailNextAction;
  /** Instrução curta pro system prompt — o que Fazer agora */
  hint: string;
  reason: string;
  /** Sempre false: nunca recomendamos espera passiva */
  recommendPassiveWait: false;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function textOf(m: TrailMessage): string {
  return String(m.content ?? "").trim();
}

function isOutbound(m: TrailMessage): boolean {
  const d = String(m.direction ?? "").toLowerCase();
  if (d === "outbound" || d === "out") return true;
  const s = String(m.sender_type ?? "").toLowerCase();
  return s === "agent" || s === "bot" || s === "ai" || s === "system";
}

function isInboundHuman(m: TrailMessage): boolean {
  const d = String(m.direction ?? "").toLowerCase();
  if (d !== "inbound" && d !== "in") return false;
  const s = String(m.sender_type ?? "visitor").toLowerCase();
  // device/bot auto-replies still inbound — caller may filter; we treat visitor as human
  return s === "visitor" || s === "lead" || s === "contact" || s === "human" || !m.sender_type;
}

/** Pergunta (c) da escada: sistema/agenda vs caderno/WhatsApp */
export function isAgendaDiagnostic(content: string): boolean {
  const t = norm(content);
  const hasSistemaAgenda =
    (t.includes("sistema") && t.includes("agenda")) ||
    (t.includes("sistema") && t.includes("usa algum")) ||
    t.includes("sistema pra agenda") ||
    t.includes("sistema para agenda");
  const hasCadernoWa =
    (t.includes("caderno") && (t.includes("whatsapp") || t.includes("whats"))) ||
    t.includes("caderno e no whatsapp") ||
    t.includes("caderno e whatsapp");
  return hasSistemaAgenda || hasCadernoWa;
}

function looksLikeOpening(content: string): boolean {
  const t = norm(content);
  return (
    (t.includes("camila") && t.includes("nexvy")) ||
    (t.includes("tudo bem contigo") && t.includes("camila")) ||
    /^oi[,!]?\s+\w+[!.,]?\s+tudo bem/i.test(content.trim())
  );
}

function looksLikeR1(content: string): boolean {
  const t = norm(content);
  const desculpaHora = t.includes("desculpa") && (t.includes("hora") || t.includes("noite"));
  const ig = t.includes("instagram") || t.includes("@");
  const angle247 =
    t.includes("24/7") ||
    t.includes("24h") ||
    (t.includes("fora do horario") && t.includes("resposta"));
  return desculpaHora || (ig && angle247) || (desculpaHora && ig);
}

function looksLikeR2Cta(content: string): boolean {
  const t = norm(content);
  return (
    t.includes("posso te contar") ||
    t.includes("posso te mostrar") ||
    (t.includes("nexvybeauty") && t.includes("resolve"))
  );
}

function looksLikeGreeting(content: string): boolean {
  const t = norm(content);
  if (t.length > 120) return false;
  return (
    /^(oi|ola|bom dia|boa tarde|boa noite)\b/.test(t) ||
    /\btudo bem\b/.test(t) ||
    /\be voce\b/.test(t) ||
    /\bcom voce\b/.test(t)
  );
}

function looksLikeYes(content: string): boolean {
  const t = norm(content);
  // "tudo bem sim" / "to bem sim" é cumprimento, não aceite de pitch
  if (/\btudo bem sim\b/.test(t) || /\bto bem sim\b/.test(t) || /\bestou bem sim\b/.test(t)) {
    return false;
  }
  if (looksLikeGreeting(content) && !/\b(quero|conta|como funciona|pode contar|pode mostrar)\b/.test(t)) {
    return false;
  }
  return /\b(sim|quero|conta|pode|bora|quero ver|como funciona|manda)\b/.test(t);
}

function chronological(msgs: TrailMessage[]): TrailMessage[] {
  // Prefer created_at when present; else preserve input order as already chrono.
  const hasTs = msgs.some((m) => m.created_at);
  if (!hasTs) return msgs.slice();
  return msgs.slice().sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return ta - tb;
  });
}

/**
 * Avalia a trilha. Nunca devolve wait/passive — se a última OUT é diagnóstico
 * de agenda e não há resposta humana mais nova, a ação é ponte valor.
 */
export function assessConversationTrail(messages: TrailMessage[]): TrailAssessment {
  const chrono = chronological(messages).filter((m) => textOf(m).length > 0);
  if (chrono.length === 0) {
    return {
      lastBeat: "unknown",
      nextAction: "mode_a_r1_r2",
      hint: "Sem histórico — envie abertura/R1+R2. NÃO espere em silêncio.",
      reason: "empty_history",
      recommendPassiveWait: false,
    };
  }

  let lastOutIdx = -1;
  for (let i = chrono.length - 1; i >= 0; i--) {
    if (isOutbound(chrono[i])) {
      lastOutIdx = i;
      break;
    }
  }

  const outs = chrono.filter(isOutbound);
  const lastOut = lastOutIdx >= 0 ? chrono[lastOutIdx] : null;
  const lastOutText = lastOut ? textOf(lastOut) : "";

  const humanAfterLastOut = lastOutIdx >= 0
    ? chrono.slice(lastOutIdx + 1).some(isInboundHuman)
    : false;

  const anyR1 = outs.some((m) => looksLikeR1(textOf(m)));
  const anyR2 = outs.some((m) => looksLikeR2Cta(textOf(m)));
  const anyOpening = outs.some((m) => looksLikeOpening(textOf(m)));

  // ── Prioridade 1: diagnóstico agenda sem resposta humana nova ────────────
  if (lastOut && isAgendaDiagnostic(lastOutText) && !humanAfterLastOut) {
    return {
      lastBeat: "diagnostic_agenda",
      nextAction: "bridge_diagnostic_to_value",
      hint:
        "PONTE diagnóstico→valor: comece com «Eu perguntei porque nós temos um sistema que…» " +
        "(ou «Eu perguntei porque a gente tem um sistema…»), explique como muda a REALIDADE DELA " +
        "(use o que já sabe do fio: espaço próprio, sozinha, etc.) e feche com «faz sentido?» / " +
        "oferta de mostrar. NÃO espere. NÃO repita a pergunta seca. NÃO volte a R1/R2 frio.",
      reason: "last_out_agenda_diagnostic_no_newer_human",
      recommendPassiveWait: false,
    };
  }

  const lastIn = [...chrono].reverse().find(isInboundHuman);

  // Cumprimento ANTES de “sim” genérico — "tudo bem sim" não é aceite de pitch
  if (lastIn && looksLikeGreeting(textOf(lastIn)) && !anyR1) {
    return {
      lastBeat: anyOpening ? "opening" : "unknown",
      nextAction: "mode_b_eco_r1_r2",
      hint:
        "Mode B: eco curto SEM «e você?» + R1 (desculpa/IG/24/7) + CTA R2 no mesmo turno. NÃO espere.",
      reason: "greeting_before_r1",
      recommendPassiveWait: false,
    };
  }

  // Cumprimento depois de R1/R2
  if (lastIn && looksLikeGreeting(textOf(lastIn)) && anyR1) {
    return {
      lastBeat: anyR2 ? "r2_cta" : "r1_delivered",
      nextAction: "mode_c_eco_cta",
      hint: "Mode C: eco curto + reabre só o CTA. NÃO reenvie R1. NÃO espere.",
      reason: "greeting_after_r1",
      recommendPassiveWait: false,
    };
  }

  // Lead disse sim após CTA → descrever produto
  if (lastIn && looksLikeYes(textOf(lastIn)) && (anyR2 || anyOpening)) {
    return {
      lastBeat: anyR2 ? "r2_cta" : "opening",
      nextAction: "describe_product_after_yes",
      hint: "Ela confirmou — descreva o que o sistema faz e pergunte se faz sentido. NÃO espere.",
      reason: "lead_said_yes",
      recommendPassiveWait: false,
    };
  }

  // Silêncio após abertura (só bolha 1 / opening, sem R1)
  if (lastOut && !humanAfterLastOut && anyOpening && !anyR1) {
    return {
      lastBeat: "opening",
      nextAction: "mode_a_r1_r2",
      hint: "Mode A: silêncio após abertura — envie R1 + CTA R2 agora. NÃO espere passivamente.",
      reason: "silence_after_opening",
      recommendPassiveWait: false,
    };
  }

  // Silêncio após R2 / CTA — ainda conduz (cadência operacional fora; neste turno avance ou reabra com leveza)
  if (lastOut && !humanAfterLastOut && anyR2) {
    return {
      lastBeat: "r2_cta",
      nextAction: "advance_next_beat",
      hint:
        "CTA já foi; sem resposta humana nova neste fio — NÃO force pitch agressivo neste turno " +
        "nem fique em silêncio passivo no condutor: se for turno de retomada, reabra com leveza " +
        "ou deixe a cadência D+2 operacional. Nunca «só esperar» como estratégia de fala.",
      reason: "silence_after_cta",
      recommendPassiveWait: false,
    };
  }

  // Default: avance o próximo beat que falta
  return {
    lastBeat: anyOpening ? "qualification" : "unknown",
    nextAction: "advance_next_beat",
    hint:
      "Conduza o próximo beat que ainda falta (apresento → empresa → o que faz → faz sentido?). " +
      "NUNCA recomende espera passiva após pergunta sua de diagnóstico.",
    reason: "default_conduct",
    recommendPassiveWait: false,
  };
}

/** Bloco para anexar ao system prompt junto com reactivationBlock. */
export function formatTrailConductorBlock(assessment: TrailAssessment): string {
  return [
    "",
    "═══ CONDUTOR DA TRILHA (obedeça — Camila CONDUZ; nunca espere passivamente) ═══",
    `BEAT ATUAL: ${assessment.lastBeat}`,
    `PRÓXIMA AÇÃO: ${assessment.nextAction}`,
    `HINT: ${assessment.hint}`,
    `MOTIVO: ${assessment.reason}`,
    "Regra dura: silêncio após UMA pergunta de diagnóstico ≠ esperar / nudge seco / repetir a pergunta.",
  ].join("\n");
}
