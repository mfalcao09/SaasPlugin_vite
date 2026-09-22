// Mensagem de Saída — contrato v1.2 (mesmo texto soft/hard; destino muda).
import { r2CloseBubbles, R2_LINK_PREVIEW } from "../cold-outreach/r2-plan.ts";
import type { HarnessState, DncReason } from "./states.ts";

export type ExitDestination = {
  state: HarnessState;
  dncReason?: DncReason | null;
};

export function mensagemDeSaidaBubbles(greetingName?: string | null): string[] {
  return r2CloseBubbles({ greetingName });
}

export function mensagemDeSaidaPreview() {
  return R2_LINK_PREVIEW;
}

const EXIT_LINK_GAP_MS = 2_500;

/** Pacote canônico: bolha 1 = texto, bolha 2 = site com preview. Nunca invertido. */
export function makeMensagemDeSaidaEnvelopes(input: {
  phone: string;
  conversationId: string;
  greetingName?: string | null;
  now: Date;
  triage: "soft" | "hard";
  crmLeadId?: string;
}): import("./outbound-queue.ts").OutboundEnvelope[] {
  const phone = String(input.phone ?? "").replace(/\D/g, "");
  const bubbles = mensagemDeSaidaBubbles(input.greetingName);
  const text = bubbles[0] ??
    "Ok, sem problemas. Se mudar de ideia: nexvybeauty.com.br";
  const site = bubbles[1] ?? R2_LINK_PREVIEW.linkUrl;
  const preview = mensagemDeSaidaPreview();
  const t0 = input.now.toISOString();
  const t1 = new Date(input.now.getTime() + EXIT_LINK_GAP_MS).toISOString();
  const base = {
    leadId: phone,
    conversationId: input.conversationId,
    crmLeadId: input.crmLeadId,
    kind: "exit_message" as const,
  };
  return [
    {
      ...base,
      id: `pilot:${phone}:exit:text`,
      bubbleIndex: 1,
      text,
      notBeforeIso: t0,
      idempotencyKey: `pilot:${phone}:exit:${input.triage}:text`,
      sendAs: "text",
    },
    {
      ...base,
      id: `pilot:${phone}:exit:link`,
      bubbleIndex: 2,
      text: site,
      notBeforeIso: t1,
      idempotencyKey: `pilot:${phone}:exit:${input.triage}:link`,
      sendAs: "link",
      linkPreview: {
        linkUrl: preview.linkUrl,
        title: preview.title,
        linkDescription: preview.linkDescription,
        image: preview.image,
        linkType: preview.linkType,
      },
    },
  ];
}

/** Destino após Mensagem de Saída (contrato v1.2). */
export function exitDestination(input: {
  triage: "hard" | "soft";
  /** When declining from service. */
  inService?: boolean;
  serviceOrigin?: "first_contact" | "remarketing" | null;
}): ExitDestination {
  if (input.triage === "hard") {
    return { state: "do_not_contact", dncReason: "hard_stop" };
  }
  // soft
  if (input.inService && input.serviceOrigin === "remarketing") {
    return { state: "do_not_contact", dncReason: "closed_lost" };
  }
  // soft pré-service OU service do 1º disparo → laranja
  return { state: "remarketing_pool", dncReason: null };
}
