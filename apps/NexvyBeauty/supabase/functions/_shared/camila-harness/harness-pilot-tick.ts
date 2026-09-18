// harness-pilot-tick — um envelope por chamada; VPS cron é o dono do disparo.
// Roster = derived_stage=preselected no DB (sem lista hardcoded).
import {
  absorbPreselectedIntoQueue,
  planPilotQueue,
  runPilotTick,
  type PilotTickResult,
} from "./pilot-deliver.ts";
import {
  createDryWireTransport,
  type WireTransport,
} from "./wire-transport.ts";
import { resolveWireTransport } from "./wire-transport-zapi.ts";
import {
  createMemoryPilotQueueStore,
  type PersistedPilotQueue,
} from "./pilot-queue-store.ts";
import {
  harnessAllowsRealWhatsapp,
  readKillOn,
  readVoiceGate,
} from "./runtime-bridge.ts";
import { emptyOutboundQueue, type OutboundQueueState } from "./outbound-queue.ts";
import { FIXTURE } from "./attendance-window.ts";
import {
  loadPreselectedPilotLeads,
  loadHarnessLeadByPhone,
  type PreselectedLeadRow,
} from "./harness-roster-db.ts";
import { outboundAlreadySent } from "./harness-preflight.ts";
import { markLeadContactedAfterFirstBubble, markLeadAfterExitMessage } from "./harness-stage-db.ts";
import type { PilotLead } from "./pilot-roster.ts";

export type PilotQueueStore = {
  load: () => Promise<{ queue: OutboundQueueState; goId: string }>;
  save: (queue: OutboundQueueState, goId: string) => Promise<void>;
};

export type HarnessPilotTickInput = {
  now?: Date;
  goId?: string | null;
  productId: string;
  /** Se fila vazia e goId presente, planeja a partir de preselected no DB. */
  seedIfEmpty?: boolean;
  store?: PilotQueueStore;
  transport?: WireTransport;
  envGet?: (k: string) => string | undefined;
  sendText?: (input: {
    to: string;
    text: string;
    idempotencyKey: string;
    conversationId: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  previewWindow?: boolean;
  holidayDates?: ReadonlySet<string> | null;
  forceDry?: boolean;
  /** Pergunta ao chip agora. Obrigatório no envio real. */
  probeChip?: () => Promise<boolean>;
  /** Injeta supabase client (edge). Testes podem passar roster via overrideRoster. */
  sb?: unknown;
  overrideRoster?: readonly PilotLead[];
};

export type HarnessPilotTickResult = {
  ok: true;
  action: "harness-pilot-tick";
  reason: string;
  delivered: { leadId: string; kind: string; id: string; crmLeadId?: string } | null;
  real_whatsapp_sends: number;
  pending: number;
  go_id: string;
  dry: boolean;
  live_flags: boolean;
  preselected_count: number;
  stage_updates: string[];
  snapshot: PersistedPilotQueue | null;
};

export async function runHarnessPilotTick(
  input: HarnessPilotTickInput,
): Promise<HarnessPilotTickResult> {
  const envGet = input.envGet ??
    ((k: string) => typeof Deno !== "undefined" ? Deno.env.get(k) : undefined);
  const live = harnessAllowsRealWhatsapp({ get: envGet });
  const forceDry = input.forceDry === true || !live;
  const transport = input.transport ??
    resolveWireTransport({
      envGet,
      sendText: input.sendText,
      forceDry,
    });
  const store = input.store ?? createMemoryPilotQueueStore();
  const now = input.now ??
    (input.previewWindow ? FIXTURE.tue1000 : new Date());

  let roster: PilotLead[] = input.overrideRoster
    ? [...input.overrideRoster]
    : [];
  let preselectedCount = roster.length;

  if (!input.overrideRoster) {
    if (!input.sb) {
      return {
        ok: true,
        action: "harness-pilot-tick",
        reason: "missing_supabase_client",
        delivered: null,
        real_whatsapp_sends: 0,
        pending: 0,
        go_id: String(input.goId ?? ""),
        dry: true,
        live_flags: live,
        preselected_count: 0,
        stage_updates: [],
        snapshot: null,
      };
    }
    const loaded = await loadPreselectedPilotLeads(
      input.sb as Parameters<typeof loadPreselectedPilotLeads>[0],
      input.productId,
    );
    if (loaded.error) {
      return {
        ok: true,
        action: "harness-pilot-tick",
        reason: `preselected_load_failed:${loaded.error}`,
        delivered: null,
        real_whatsapp_sends: 0,
        pending: 0,
        go_id: String(input.goId ?? ""),
        dry: true,
        live_flags: live,
        preselected_count: 0,
        stage_updates: [],
        snapshot: null,
      };
    }
    roster = loaded.leads;
    preselectedCount = loaded.leads.length;
  }

  let { queue, goId } = await store.load();
  const goFromInput = input.goId != null ? String(input.goId) : "";
  if (goFromInput) goId = goFromInput;

  if (
    (input.seedIfEmpty !== false) &&
    queue.pending.length === 0 &&
    goId
  ) {
    const plan = planPilotQueue({
      goId,
      voice: readVoiceGate({ get: envGet }),
      killOn: readKillOn({ get: envGet }),
      now,
      roster,
      holidayDates: input.holidayDates,
    });
    if (plan.allowed) {
      queue = plan.queue;
      await store.save(queue, goId);
    } else if (queue.pending.length === 0) {
      return {
        ok: true,
        action: "harness-pilot-tick",
        reason: plan.reason || "plan_blocked",
        delivered: null,
        real_whatsapp_sends: 0,
        pending: 0,
        go_id: goId,
        dry: true,
        live_flags: live,
        preselected_count: preselectedCount,
        stage_updates: [],
        snapshot: null,
      };
    }
  }

  // Leitura ao vivo, no instante do "posso disparar?" — não a lista da fila antiga.
  if (input.sb && !input.overrideRoster) {
    const fresh = await loadPreselectedPilotLeads(
      input.sb as Parameters<typeof loadPreselectedPilotLeads>[0],
      input.productId,
    );
    if (fresh.error) {
      return {
        ok: true,
        action: "harness-pilot-tick",
        reason: `preselected_load_failed:${fresh.error}`,
        delivered: null,
        real_whatsapp_sends: 0,
        pending: queue.pending.length,
        go_id: goId,
        dry: true,
        live_flags: live,
        preselected_count: 0,
        stage_updates: [],
        snapshot: null,
      };
    }
    roster = fresh.leads;
    preselectedCount = fresh.leads.length;
  }
  const absorbed = absorbPreselectedIntoQueue(queue, roster, now);
  queue = absorbed.queue;

  if (queue.pending.length === 0) {
    return {
      ok: true,
      action: "harness-pilot-tick",
      reason: preselectedCount === 0 ? "no_preselected_leads_in_db" : "queue_empty",
      delivered: null,
      real_whatsapp_sends: 0,
      pending: 0,
      go_id: goId,
      dry: forceDry || !transport.allowReal,
      live_flags: live,
      preselected_count: preselectedCount,
      stage_updates: [],
      snapshot: null,
    };
  }

  const tick: PilotTickResult = await runPilotTick({
    queue,
    now,
    transport: forceDry ? createDryWireTransport() : transport,
    roster,
    goId,
    voice: readVoiceGate({ get: envGet }),
    killOn: readKillOn({ get: envGet }),
    pilotLive: live,
    holidayDates: input.holidayDates,
    confirm: input.sb
      ? async (env) => {
        const known = roster.find((r) => r.phone === env.leadId) ?? null;
        const scriptLead = known ?? await loadHarnessLeadByPhone(
          input.sb as Parameters<typeof loadHarnessLeadByPhone>[0],
          input.productId,
          env.leadId,
        );
        const dup = await outboundAlreadySent(input.sb as any, {
          productId: input.productId,
          phone: env.leadId,
          idempotencyKey: env.idempotencyKey,
          text: env.text,
        });
        const chipConnected = input.probeChip ? await input.probeChip() : false;
        return {
          chipConnected,
          alreadySent: dup.error ? false : dup.sent,
          scriptLead,
          lookupFailed: Boolean(dup.error),
        };
      }
      : undefined,
  });
  await store.save(tick.queue, goId);

  const stageUpdates: string[] = [];
  // Stage CAS só em entrega real (não dry) — dry não muda funil no DB.
  const mutateStages = !forceDry && transport.allowReal === true &&
    tick.realSends > 0 && tick.delivered && tick.delivered.crmLeadId && input.sb;
  if (mutateStages) {
    const lead = roster.find((r) =>
      r.phone === tick.delivered!.leadId || r.leadId === tick.delivered!.crmLeadId
    ) as PreselectedLeadRow | PilotLead | undefined;
    if (
      tick.delivered!.kind === "open_bubble1" || tick.delivered!.kind === "resume"
    ) {
      const marked = await markLeadContactedAfterFirstBubble(input.sb as any, {
        leadId: tick.delivered!.crmLeadId!,
        productId: input.productId,
        expectedVersion: (lead as PreselectedLeadRow)?.stateVersion,
      });
      stageUpdates.push(
        marked.ok
          ? `${tick.delivered!.crmLeadId}->${marked.stage ?? "contacted"}`
          : `${tick.delivered!.crmLeadId}:fail:${marked.error}`,
      );
    } else if (tick.delivered!.kind === "exit_message") {
      const key = String(tick.delivered!.idempotencyKey ?? "");
      const kind = key.endsWith(":hard") ? "hard" as const : "soft" as const;
      const marked = await markLeadAfterExitMessage(input.sb as any, {
        leadId: tick.delivered!.crmLeadId!,
        productId: input.productId,
        kind,
      });
      stageUpdates.push(
        marked.ok
          ? `${tick.delivered!.crmLeadId}->${marked.stage ?? kind}`
          : `${tick.delivered!.crmLeadId}:exit_fail:${marked.error}`,
      );
    }
  }

  return {
    ok: true,
    action: "harness-pilot-tick",
    reason: tick.reason,
    delivered: tick.delivered
      ? {
        leadId: tick.delivered.leadId,
        kind: tick.delivered.kind,
        id: tick.delivered.id,
        crmLeadId: tick.delivered.crmLeadId,
      }
      : null,
    real_whatsapp_sends: tick.realSends,
    pending: tick.queue.pending.length,
    go_id: goId,
    dry: forceDry || !transport.allowReal,
    live_flags: live,
    preselected_count: preselectedCount,
    stage_updates: stageUpdates,
    snapshot: {
      pending: tick.queue.pending,
      inFlightLeadId: tick.queue.inFlightLeadId,
      spacing: tick.queue.spacing,
      lastDeliveredId: tick.queue.lastDeliveredId,
      goId,
      updated_at: now.toISOString(),
    },
  };
}

export { emptyOutboundQueue, createMemoryPilotQueueStore };
