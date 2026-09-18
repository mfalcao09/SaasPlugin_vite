// Pool + inbound wire transitions (no campaign schedule).
import type { LeadShadow } from "./states.ts";
import { triageInbound } from "./triage.ts";

/** Mark remarketing pool eligible — does NOT schedule rmkt_t*. */
export function markRemarketingPool(lead: LeadShadow): LeadShadow {
  return {
    ...lead,
    state: "remarketing_pool",
  };
}

export function silence24hToPool(lead: LeadShadow): LeadShadow {
  if (lead.state !== "contacted") return lead;
  return markRemarketingPool(lead);
}

/**
 * Inbound while in pool/contacted/service — triage → next state (no send).
 */
export function wireApplyInbound(
  lead: LeadShadow,
  text: string,
): { lead: LeadShadow; triage: string; cite: boolean } {
  const t = triageInbound(text, { exitAlreadySent: lead.exitMessageSent === true });
  if (t.class === "goodbye") {
    return { lead, triage: "goodbye", cite: false };
  }
  if (t.class === "interest" || t.class === "neutral") {
    return {
      lead: {
        ...lead,
        state: "service",
        serviceOrigin: lead.serviceOrigin ?? "first_contact",
      },
      triage: t.class,
      cite: true,
    };
  }
  if (t.class === "noise") {
    return { lead, triage: "noise", cite: false };
  }
  return { lead, triage: t.class, cite: false };
}
