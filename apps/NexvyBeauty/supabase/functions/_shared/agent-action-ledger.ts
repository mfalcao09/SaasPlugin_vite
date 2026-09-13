import type { AgentActionType } from "./agent-safety-kernel.ts";

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

export interface AgentActionInput {
  productId: string;
  leadId: string;
  conversationId: string | null;
  agentId: string;
  instanceId: string;
  channel: string;
  actionType: AgentActionType;
  proactive: boolean;
  bubbleCount: number;
  content: string;
  sourceEventId: string;
  strategyVersionId?: string | null;
  experimentId?: string | null;
}

export interface ReservationResult {
  allowed: boolean;
  actionId: string | null;
  status: string;
  reason: string | null;
}

export interface ProviderResult {
  ok: boolean;
  providerMessageId?: string | null;
  error?: string | null;
}

export interface ExecutedActionResult extends ProviderResult {
  actionId: string | null;
  reason: string | null;
  ledgerTransitioned: boolean;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

export function buildAgentActionIdempotencyKey(
  input: Pick<
    AgentActionInput,
    "productId" | "leadId" | "actionType" | "sourceEventId"
  >,
): string {
  return [
    "camila",
    input.productId,
    input.leadId,
    input.actionType,
    input.sourceEventId,
  ].join(":");
}

async function sha256Hex(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function reserveAgentAction(
  supabase: RpcClient,
  input: AgentActionInput,
): Promise<ReservationResult> {
  const { data, error } = await supabase.rpc(
    "pcrm_authorize_and_reserve_agent_action",
    {
      p_idempotency_key: buildAgentActionIdempotencyKey(input),
      p_product_id: input.productId,
      p_lead_id: input.leadId,
      p_conversation_id: input.conversationId,
      p_agent_id: input.agentId,
      p_instance_id: input.instanceId,
      p_channel: input.channel,
      p_action_type: input.actionType,
      p_proactive: input.proactive,
      p_bubble_count: input.bubbleCount,
      p_content_hash: await sha256Hex(input.content),
      p_strategy_version_id: input.strategyVersionId ?? null,
      p_experiment_id: input.experimentId ?? null,
    },
  );
  if (error) {
    return {
      allowed: false,
      actionId: null,
      status: "unavailable",
      reason: "ledger_unavailable",
    };
  }
  const row = asRecord(data);
  if (
    typeof row.allowed !== "boolean" ||
    typeof row.status !== "string" ||
    (row.action_id != null && typeof row.action_id !== "string")
  ) {
    return {
      allowed: false,
      actionId: null,
      status: "malformed",
      reason: "ledger_malformed",
    };
  }
  return {
    allowed: row.allowed,
    actionId: typeof row.action_id === "string" ? row.action_id : null,
    status: row.status,
    reason: typeof row.reason === "string" ? row.reason : null,
  };
}

export async function transitionAgentAction(
  supabase: RpcClient,
  actionId: string,
  expectedStatus: "reserved" | "accepted" | "delivered",
  nextStatus: "accepted" | "delivered" | "read" | "failed" | "cancelled",
  providerMessageId: string | null,
  failureReason: string | null,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "pcrm_transition_agent_action",
    {
      p_action_id: actionId,
      p_expected_status: expectedStatus,
      p_next_status: nextStatus,
      p_provider_message_id: providerMessageId,
      p_failure_reason: failureReason,
    },
  );
  return !error && asRecord(data).ok === true;
}

export async function runReservedAgentAction(
  supabase: RpcClient,
  input: AgentActionInput,
  providerCall: () => Promise<ProviderResult>,
): Promise<ExecutedActionResult> {
  const reservation = await reserveAgentAction(supabase, input);
  if (!reservation.allowed || !reservation.actionId) {
    return {
      ok: false,
      actionId: reservation.actionId,
      reason: reservation.reason ?? "not_reserved",
      ledgerTransitioned: false,
    };
  }
  let provider: ProviderResult;
  try {
    provider = await providerCall();
  } catch (error) {
    provider = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const transitioned = await transitionAgentAction(
    supabase,
    reservation.actionId,
    "reserved",
    provider.ok ? "accepted" : "failed",
    provider.providerMessageId ?? null,
    provider.error ?? null,
  );
  if (!transitioned) {
    return {
      ...provider,
      ok: provider.ok,
      actionId: reservation.actionId,
      reason: "ledger_transition_failed",
      ledgerTransitioned: false,
    };
  }
  return {
    ...provider,
    actionId: reservation.actionId,
    reason: provider.ok ? null : provider.error ?? "provider_failed",
    ledgerTransitioned: true,
  };
}
