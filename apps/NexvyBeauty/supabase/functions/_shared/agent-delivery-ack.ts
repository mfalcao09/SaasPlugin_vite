import { transitionAgentAction } from "./agent-action-ledger.ts";

export type MessageDeliveryStatus =
  | "accepted"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type LedgerDeliveryStatus =
  | "reserved"
  | "accepted"
  | "delivered"
  | "read"
  | "failed"
  | "cancelled"
  | "denied";

export const ACK_PENDING_AFTER_MS = 2 * 60 * 60 * 1000;

const SUCCESS_RANK: Record<Exclude<MessageDeliveryStatus, "failed">, number> = {
  accepted: 1,
  sent: 2,
  delivered: 3,
  read: 4,
};

export interface MessageAckDecision {
  apply: boolean;
  next: MessageDeliveryStatus;
  countsDelivered: boolean;
  countsFailed: boolean;
  countsExperimentExposure: boolean;
  reason: string;
}

export interface QrDeliveryAckResult {
  meta: Record<string, unknown>;
  applied: boolean;
  countsDelivered: boolean;
  countsFailed: boolean;
  persisted: boolean;
  ledgerTransitioned: boolean;
}

export interface LedgerAckTransition {
  expected: "reserved" | "accepted" | "delivered";
  next: "accepted" | "delivered" | "read" | "failed";
}

function isSuccessStatus(
  status: MessageDeliveryStatus,
): status is Exclude<MessageDeliveryStatus, "failed"> {
  return status !== "failed";
}

export function applyMessageAck(
  current: MessageDeliveryStatus | null,
  incoming: MessageDeliveryStatus,
): MessageAckDecision {
  if (current === incoming) {
    return {
      apply: false,
      next: incoming,
      countsDelivered: false,
      countsFailed: false,
      countsExperimentExposure: false,
      reason: "duplicate",
    };
  }

  if (incoming === "failed") {
    if (current === "delivered" || current === "read") {
      return {
        apply: false,
        next: current,
        countsDelivered: false,
        countsFailed: false,
        countsExperimentExposure: false,
        reason: "late_failure",
      };
    }
    return {
      apply: true,
      next: "failed",
      countsDelivered: false,
      countsFailed: true,
      countsExperimentExposure: false,
      reason: "delivery_failed",
    };
  }

  if (current === "failed") {
    return {
      apply: false,
      next: "failed",
      countsDelivered: false,
      countsFailed: false,
      countsExperimentExposure: false,
      reason: "already_failed",
    };
  }

  const currentRank = current && isSuccessStatus(current)
    ? SUCCESS_RANK[current]
    : 0;
  const incomingRank = SUCCESS_RANK[incoming];
  if (incomingRank <= currentRank) {
    return {
      apply: false,
      next: current ?? incoming,
      countsDelivered: false,
      countsFailed: false,
      countsExperimentExposure: false,
      reason: "out_of_order",
    };
  }

  const firstDeviceAck = incomingRank >= SUCCESS_RANK.delivered &&
    currentRank < SUCCESS_RANK.delivered;
  return {
    apply: true,
    next: incoming,
    countsDelivered: firstDeviceAck,
    countsFailed: false,
    countsExperimentExposure: firstDeviceAck,
    reason: "upgraded",
  };
}

export function ledgerTransitionsForAck(
  ledgerStatus: LedgerDeliveryStatus,
  incoming: MessageDeliveryStatus,
): LedgerAckTransition[] {
  if (incoming === "sent") return [];
  if (incoming === "accepted" && ledgerStatus === "reserved") {
    return [{ expected: "reserved", next: "accepted" }];
  }
  if (incoming === "failed") {
    if (ledgerStatus === "reserved") {
      return [{ expected: "reserved", next: "failed" }];
    }
    if (ledgerStatus === "accepted") {
      return [{ expected: "accepted", next: "failed" }];
    }
    return [];
  }
  if (incoming === "delivered") {
    if (ledgerStatus === "accepted") {
      return [{ expected: "accepted", next: "delivered" }];
    }
    return [];
  }
  if (incoming === "read") {
    if (ledgerStatus === "accepted") {
      return [
        { expected: "accepted", next: "delivered" },
        { expected: "delivered", next: "read" },
      ];
    }
    if (ledgerStatus === "delivered") {
      return [{ expected: "delivered", next: "read" }];
    }
    return [];
  }
  return [];
}

export function reconcileMissingAck(
  current: MessageDeliveryStatus | null,
  ageMs: number,
  timeoutMs = ACK_PENDING_AFTER_MS,
): { action: "none" | "mark_pending"; reason: string | null } {
  if (current === "delivered" || current === "read" || current === "failed") {
    return { action: "none", reason: null };
  }
  if ((current === "accepted" || current === "sent" || current == null) &&
    ageMs >= timeoutMs
  ) {
    return { action: "mark_pending", reason: "ack_missing" };
  }
  return { action: "none", reason: null };
}

type RpcClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => PromiseLike<{ error: { message?: string } | null }>;
    };
  };
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

function asStatus(raw: unknown): MessageDeliveryStatus | null {
  return raw === "accepted" || raw === "sent" || raw === "delivered" ||
      raw === "read" || raw === "failed"
    ? raw
    : null;
}

function unchangedAck(
  meta: Record<string, unknown>,
): QrDeliveryAckResult {
  return {
    meta,
    applied: false,
    countsDelivered: false,
    countsFailed: false,
    persisted: false,
    ledgerTransitioned: false,
  };
}

export async function applyQrDeliveryAck(
  supabase: RpcClient,
  input: {
    message: Record<string, unknown> | null | undefined;
    instanceId: string;
    wamid: string;
    outcome: MessageDeliveryStatus;
    ledgerStatus?: LedgerDeliveryStatus;
  },
): Promise<QrDeliveryAckResult> {
  const meta = (input.message?.metadata ?? {}) as Record<string, unknown>;
  if (String(meta.connection_id ?? "") !== String(input.instanceId)) {
    return unchangedAck(meta);
  }

  const current = asStatus(meta.delivery_status);
  const decision = applyMessageAck(current, input.outcome);
  if (!decision.apply) return unchangedAck(meta);

  const nowIso = new Date().toISOString();
  const nextMeta: Record<string, unknown> = {
    ...meta,
    delivery_status: decision.next,
  };
  if (decision.next === "sent") nextMeta.sent_at = nowIso;
  if (decision.next === "delivered") nextMeta.delivered_at = nowIso;
  if (decision.next === "read") nextMeta.read_at = nowIso;
  if (decision.next === "failed") {
    nextMeta.failed_at = nowIso;
    nextMeta.delivery_error = "delivery_ack_failed";
  }
  if (decision.countsExperimentExposure) {
    nextMeta.experiment_exposed_at = nowIso;
  }

  const messageId = typeof input.message?.id === "string" ? input.message.id : "";
  if (messageId) {
    const updated = await supabase
      .from("platform_crm_messages")
      .update({ metadata: nextMeta })
      .eq("id", messageId);
    if (updated.error) return unchangedAck(meta);
  }

  const actionId = typeof meta.action_id === "string" ? meta.action_id : null;
  const transitions = actionId
    ? ledgerTransitionsForAck(input.ledgerStatus ?? "accepted", input.outcome)
    : [];
  let ledgerTransitioned = transitions.length === 0;
  if (actionId) {
    const results: boolean[] = [];
    for (const step of transitions) {
      results.push(
        await transitionAgentAction(
          supabase,
          actionId,
          step.expected,
          step.next,
          input.wamid,
          step.next === "failed" ? "delivery_ack_failed" : null,
        ),
      );
    }
    ledgerTransitioned = results.length === 0 || results.every(Boolean);
  }

  return {
    meta: nextMeta,
    applied: true,
    countsDelivered: decision.countsDelivered,
    countsFailed: decision.countsFailed,
    persisted: true,
    ledgerTransitioned,
  };
}
