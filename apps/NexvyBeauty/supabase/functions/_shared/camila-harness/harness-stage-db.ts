// Transitions of platform_crm_lead_state.derived_stage (CAS).
import {
  nextStageAfterFirstOutbound,
  nextStageAfterSoftExit,
  nextStageAfterHardExit,
} from "./harness-stage.ts";

type SbRpc = {
  from: (t: string) => any;
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

async function casStage(
  sb: SbRpc,
  input: {
    leadId: string;
    productId: string;
    expectedVersion?: number;
    stage: string;
    nextAction?: string;
  },
): Promise<{ ok: boolean; stage?: string; error?: string }> {
  if (!input.leadId || !input.productId) {
    return { ok: false, error: "missing_ids" };
  }
  let expected = input.expectedVersion;
  if (expected == null) {
    const { data } = await sb
      .from("platform_crm_lead_state")
      .select("version, derived_stage")
      .eq("lead_id", input.leadId)
      .eq("product_id", input.productId)
      .maybeSingle();
    expected = typeof data?.version === "number" ? data.version : 0;
    if (data?.derived_stage === input.stage) {
      return { ok: true, stage: input.stage };
    }
  }
  const { data, error } = await sb.rpc("platform_crm_lead_state_cas_patch", {
    p_lead_id: input.leadId,
    p_product_id: input.productId,
    p_expected_version: expected,
    p_patch: {
      derived_stage: input.stage,
      ...(input.nextAction ? { next_action: input.nextAction } : {}),
    },
  });
  if (error) return { ok: false, error: error.message ?? "cas_failed" };
  const rec = data && typeof data === "object" ? data as Record<string, unknown> : {};
  if (rec.ok === true) return { ok: true, stage: input.stage };
  if (rec.conflict === true) {
    const { data: again } = await sb
      .from("platform_crm_lead_state")
      .select("version, derived_stage")
      .eq("lead_id", input.leadId)
      .eq("product_id", input.productId)
      .maybeSingle();
    if (again?.derived_stage === input.stage) {
      return { ok: true, stage: input.stage };
    }
    const v = typeof again?.version === "number" ? again.version : 0;
    const { data: d2, error: e2 } = await sb.rpc("platform_crm_lead_state_cas_patch", {
      p_lead_id: input.leadId,
      p_product_id: input.productId,
      p_expected_version: v,
      p_patch: { derived_stage: input.stage },
    });
    if (e2) return { ok: false, error: e2.message ?? "cas_retry_failed" };
    const r2 = d2 && typeof d2 === "object" ? d2 as Record<string, unknown> : {};
    return r2.ok === true
      ? { ok: true, stage: input.stage }
      : { ok: false, error: "cas_conflict" };
  }
  return { ok: false, error: String(rec.error ?? "cas_rejected") };
}

export async function markLeadContactedAfterFirstBubble(
  sb: SbRpc,
  input: {
    leadId: string;
    productId: string;
    expectedVersion?: number;
  },
): Promise<{ ok: boolean; stage?: string; error?: string }> {
  const stage = nextStageAfterFirstOutbound("preselected");
  {
    const { data } = await sb
      .from("platform_crm_lead_state")
      .select("version, derived_stage")
      .eq("lead_id", input.leadId)
      .eq("product_id", input.productId)
      .maybeSingle();
    const cur = data?.derived_stage as string | null;
    if (cur === "contacted" || cur === "service" || cur === "remarketing_pool") {
      return { ok: true, stage: cur ?? "contacted" };
    }
  }
  return casStage(sb, {
    leadId: input.leadId,
    productId: input.productId,
    expectedVersion: input.expectedVersion,
    stage,
    nextAction: "await_reply_or_complete_package",
  });
}

export async function markLeadAfterExitMessage(
  sb: SbRpc,
  input: {
    leadId: string;
    productId: string;
    kind: "soft" | "hard";
    expectedVersion?: number;
  },
): Promise<{ ok: boolean; stage?: string; error?: string }> {
  const stage = input.kind === "hard"
    ? nextStageAfterHardExit("contacted")
    : nextStageAfterSoftExit("contacted");
  return casStage(sb, {
    leadId: input.leadId,
    productId: input.productId,
    expectedVersion: input.expectedVersion,
    stage,
    nextAction: input.kind === "hard" ? "do_not_contact" : "remarketing_pool_idle",
  });
}

export async function markLeadFunnelStage(
  sb: SbRpc,
  input: {
    leadId: string;
    productId: string;
    stage: "do_not_contact" | "remarketing_pool";
    expectedVersion?: number;
  },
): Promise<{ ok: boolean; stage?: string; error?: string }> {
  return casStage(sb, {
    leadId: input.leadId,
    productId: input.productId,
    expectedVersion: input.expectedVersion,
    stage: input.stage,
    nextAction: input.stage === "do_not_contact"
      ? "do_not_contact"
      : "remarketing_pool_idle",
  });
}
