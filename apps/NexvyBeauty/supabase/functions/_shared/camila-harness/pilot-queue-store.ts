// Persistência da fila piloto — Option A (settings.harness_pilot_queue).
import {
  emptyOutboundQueue,
  type OutboundQueueState,
  type OutboundEnvelope,
} from "./outbound-queue.ts";
import {
  emptyLeadSpacing,
  type LeadSpacingState,
} from "./lead-spacing.ts";

export const HARNESS_PILOT_QUEUE_KEY = "harness_pilot_queue";

export type PersistedPilotQueue = {
  pending: OutboundEnvelope[];
  inFlightLeadId: string | null;
  spacing: LeadSpacingState;
  lastDeliveredId: string | null;
  goId: string;
  updated_at: string;
};

export function serializePilotQueue(
  queue: OutboundQueueState,
  goId: string,
  updatedAt: Date = new Date(),
): PersistedPilotQueue {
  return {
    pending: queue.pending.map((e) => ({ ...e })),
    inFlightLeadId: queue.inFlightLeadId,
    spacing: { ...queue.spacing },
    lastDeliveredId: queue.lastDeliveredId,
    goId,
    updated_at: updatedAt.toISOString(),
  };
}

export function deserializePilotQueue(
  raw: unknown,
): { queue: OutboundQueueState; goId: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.pending)) return null;
  const pending: OutboundEnvelope[] = [];
  for (const item of o.pending) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    if (typeof e.id !== "string" || typeof e.leadId !== "string") continue;
    if (typeof e.text !== "string" || typeof e.notBeforeIso !== "string") continue;
    if (typeof e.idempotencyKey !== "string") continue;
    const sendAs = e.sendAs === "link" ? "link" as const : e.sendAs === "text" ? "text" as const : undefined;
    const preview = e.linkPreview && typeof e.linkPreview === "object"
      ? e.linkPreview as Record<string, unknown>
      : null;
    pending.push({
      id: e.id,
      leadId: e.leadId,
      conversationId: String(e.conversationId ?? ""),
      crmLeadId: typeof e.crmLeadId === "string" ? e.crmLeadId : undefined,
      kind: e.kind as OutboundEnvelope["kind"],
      bubbleIndex: typeof e.bubbleIndex === "number" ? e.bubbleIndex : null,
      text: e.text,
      notBeforeIso: e.notBeforeIso,
      idempotencyKey: e.idempotencyKey,
      ...(sendAs ? { sendAs } : {}),
      ...(preview && typeof preview.linkUrl === "string"
        ? {
          linkPreview: {
            linkUrl: String(preview.linkUrl),
            title: String(preview.title ?? ""),
            linkDescription: String(preview.linkDescription ?? ""),
            image: String(preview.image ?? ""),
            linkType: preview.linkType === "SMALL" || preview.linkType === "MEDIUM"
              ? preview.linkType
              : "LARGE" as const,
          },
        }
        : {}),
    });
  }
  const spacingRaw = o.spacing && typeof o.spacing === "object"
    ? o.spacing as Record<string, unknown>
    : null;
  const spacing: LeadSpacingState = spacingRaw
    ? {
      lastFirstBubbleAtIso: typeof spacingRaw.lastFirstBubbleAtIso === "string"
        ? spacingRaw.lastFirstBubbleAtIso
        : null,
      nextLeadNotBeforeIso: typeof spacingRaw.nextLeadNotBeforeIso === "string"
        ? spacingRaw.nextLeadNotBeforeIso
        : null,
      lastSampledMs: typeof spacingRaw.lastSampledMs === "number"
        ? spacingRaw.lastSampledMs
        : null,
    }
    : emptyLeadSpacing();
  return {
    goId: String(o.goId ?? ""),
    queue: {
      pending,
      inFlightLeadId: typeof o.inFlightLeadId === "string" ? o.inFlightLeadId : null,
      spacing,
      lastDeliveredId: typeof o.lastDeliveredId === "string" ? o.lastDeliveredId : null,
    },
  };
}

export function queueFromMeta(
  meta: Record<string, unknown>,
): { queue: OutboundQueueState; goId: string } {
  const parsed = deserializePilotQueue(meta[HARNESS_PILOT_QUEUE_KEY]);
  if (parsed) return parsed;
  return { queue: emptyOutboundQueue(), goId: "" };
}

export function metaWithQueue(
  prevMeta: Record<string, unknown>,
  queue: OutboundQueueState,
  goId: string,
  updatedAt?: Date,
): Record<string, unknown> {
  return {
    ...prevMeta,
    [HARNESS_PILOT_QUEUE_KEY]: serializePilotQueue(queue, goId, updatedAt),
  };
}

/** In-memory store for unit tests (no Supabase). */
export function createMemoryPilotQueueStore(seed?: {
  queue?: OutboundQueueState;
  goId?: string;
}) {
  let queue = seed?.queue ?? emptyOutboundQueue();
  let goId = seed?.goId ?? "";
  return {
    async load(): Promise<{ queue: OutboundQueueState; goId: string }> {
      return { queue: structuredClone(queue), goId };
    },
    async save(next: OutboundQueueState, nextGoId: string): Promise<void> {
      queue = structuredClone(next);
      goId = nextGoId;
    },
    snapshot(): PersistedPilotQueue {
      return serializePilotQueue(queue, goId);
    },
  };
}

type SbLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: { id: string; settings: unknown } | null; error: unknown }>;
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: unknown }>;
    };
  };
};

/** Persist queue on platform_crm_products.settings.harness_pilot_queue. */
export function createProductPilotQueueStore(
  sb: SbLike,
  productId: string,
) {
  return {
    async load(): Promise<{ queue: OutboundQueueState; goId: string }> {
      const { data } = await sb
        .from("platform_crm_products")
        .select("id, settings")
        .eq("id", productId)
        .maybeSingle();
      const meta = data?.settings && typeof data.settings === "object"
        ? data.settings as Record<string, unknown>
        : {};
      return queueFromMeta(meta);
    },
    async save(queue: OutboundQueueState, goId: string): Promise<void> {
      const { data } = await sb
        .from("platform_crm_products")
        .select("id, settings")
        .eq("id", productId)
        .maybeSingle();
      const prev = data?.settings && typeof data.settings === "object"
        ? data.settings as Record<string, unknown>
        : {};
      const settings = metaWithQueue(prev, queue, goId);
      const { error } = await sb
        .from("platform_crm_products")
        .update({ settings })
        .eq("id", productId);
      if (error) {
        throw new Error(
          `pilot_queue_save_failed:${(error as { message?: string }).message ?? String(error)}`,
        );
      }
    },
  };
}
