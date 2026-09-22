// Camila Harness — funnel states (contrato v1.2). Pure.
// deno test supabase/functions/_shared/camila-harness/

export type HarnessState =
  | "db"
  | "preselected"
  | "contacted"
  | "remarketing_pool"
  | "service"
  | "do_not_contact"
  | "closing"
  | "onboarding";

export type DncReason = "hard_stop" | "closed_lost" | "cadence_exhausted";

export type LeadShadow = {
  id: string;
  state: HarnessState;
  dncReason?: DncReason | null;
  /** True after Mensagem de Saída delivered (shadow). */
  exitMessageSent?: boolean;
  /** Origin of current service: first_contact | remarketing (TBD). */
  serviceOrigin?: "first_contact" | "remarketing" | null;
};
