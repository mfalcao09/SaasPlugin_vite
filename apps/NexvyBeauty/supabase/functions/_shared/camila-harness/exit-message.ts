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
