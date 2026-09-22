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
import { runHarnessHousekeep } from "./harness-funnel-sync.ts";
import type { PilotLead } from "./pilot-roster.ts";
import {
  runPackageTickPass,
  type HarnessJobRecord,
  type PackageLeadSnapshot,
} from "./harness-package-tick.ts";
import {
  dropMouth1ExitEnvelopes,
  loadHarnessJobsFromSb,
  mergeJobsById,
  persistHarnessJob,
  persistInboundVerdict,
  runPullerPass,
  type PullerInvoke,
} from "./harness-puller.ts";

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
    sendAs?: "text" | "link";
    linkPreview?: {
      linkUrl: string;
      title: string;
      linkDescription: string;
      image: string;
      linkType: "SMALL" | "MEDIUM" | "LARGE";
    };
  }) => Promise<{ ok: boolean; error?: string }>;
  previewWindow?: boolean;
  holidayDates?: ReadonlySet<string> | null;
  forceDry?: boolean;
  /** Pergunta ao chip agora. Obrigatório no envio real. */
  probeChip?: () => Promise<boolean>;
  /** Injeta supabase client (edge). Testes podem passar roster via overrideRoster. */
  sb?: unknown;
  overrideRoster?: readonly PilotLead[];
  /** UUID platform_crm_wa_qr_instances — sync de listas + close conv. */
  instanceId?: string | null;
  /** Testes / dry: snapshots G4+G5 sem CRM. */
  overridePackageSnapshots?: PackageLeadSnapshot[];
  /** Morto no caminho de produto (PRD-13). Só testes de regressão. */
  onHarnessJob?: (job: HarnessJobRecord) => Promise<void>;
  /** Teste: puxador chama isto em vez do fetch. */
  onPullerInvoke?: (payload: PullerInvoke) => Promise<void>;
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
  package_reviews: string[];
  jobs_created: string[];
  puller_invokes: number;
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
  // previewWindow congela o relógio do DISPARO (janela comercial). Housekeep
  // do funil (24h) precisa do relógio de parede — senão FORCE_DRY/preview
  // no cron de sábado nunca move contacted → remarketing_pool.
  const wallNow = input.now ?? new Date();
  const now = input.now ??
    (input.previewWindow ? FIXTURE.tue1000 : wallNow);

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
        package_reviews: [],
        jobs_created: [],
        puller_invokes: 0,
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
        package_reviews: [],
        jobs_created: [],
        puller_invokes: 0,
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
      const blockedPkg = await runPackageTickPass({
        sb: input.sb as Parameters<typeof runPackageTickPass>[0]["sb"],
        productId: input.productId,
        queue,
        now: wallNow,
        holidayDates: input.holidayDates,
        roster,
        snapshots: input.overridePackageSnapshots,
      });
      queue = dropMouth1ExitEnvelopes(blockedPkg.queue);
      await store.save(queue, goId);
      const blockedPuller = await runTickPuller({
        sb: input.sb,
        productId: input.productId,
        now: wallNow,
        holidayDates: input.holidayDates,
        createdJobs: blockedPkg.jobs,
        snapshots: input.overridePackageSnapshots,
        forceDry,
        envGet,
        onPullerInvoke: input.onPullerInvoke,
      });
      const blockedHk = await maybeHousekeep({
        sb: input.sb,
        productId: input.productId,
        instanceId: input.instanceId,
        envGet,
        now: wallNow,
        queue,
        store,
        goId,
      });
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
        stage_updates: blockedHk.updates,
        package_reviews: blockedPkg.updates,
        jobs_created: blockedPkg.jobs.map((j) => j.id),
        puller_invokes: blockedPuller.invokes,
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
        package_reviews: [],
        jobs_created: [],
        puller_invokes: 0,
        snapshot: null,
      };
    }
    roster = fresh.leads;
    preselectedCount = fresh.leads.length;
  }
  const absorbed = absorbPreselectedIntoQueue(queue, roster, now);
  queue = absorbed.queue;

  const pkgPass = await runPackageTickPass({
    sb: input.sb as Parameters<typeof runPackageTickPass>[0]["sb"],
    productId: input.productId,
    queue,
    now: wallNow,
    holidayDates: input.holidayDates,
    roster,
    snapshots: input.overridePackageSnapshots,
  });
  queue = dropMouth1ExitEnvelopes(pkgPass.queue);
  await store.save(queue, goId);
  const package_reviews = pkgPass.updates;
  const jobs_created = pkgPass.jobs.map((j) => j.id);
  const tickPuller = await runTickPuller({
    sb: input.sb,
    productId: input.productId,
    now: wallNow,
    holidayDates: input.holidayDates,
    createdJobs: pkgPass.jobs,
    snapshots: input.overridePackageSnapshots,
    forceDry,
    envGet,
    onPullerInvoke: input.onPullerInvoke,
  });

  if (queue.pending.length === 0) {
    const emptyHk = await maybeHousekeep({
      sb: input.sb,
      productId: input.productId,
      instanceId: input.instanceId,
      envGet,
      now: wallNow,
      queue,
      store,
      goId,
    });
    queue = emptyHk.queue;
    const emptyUpdates = emptyHk.updates;
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
      stage_updates: emptyUpdates,
      package_reviews,
      jobs_created,
      puller_invokes: tickPuller.invokes,
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
        const mouth1 = env.kind === "open_bubble1" ||
          env.kind === "continue_bubble" || env.kind === "resume";
        return {
          chipConnected,
          alreadySent: dup.error
            ? false
            : (mouth1 ? Boolean(dup.wamid) : dup.sent),
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

  queue = tick.queue;
  const afterHk = await maybeHousekeep({
    sb: input.sb,
    productId: input.productId,
    instanceId: input.instanceId,
    envGet,
    now: wallNow,
    queue,
    store,
    goId,
  });
  queue = afterHk.queue;
  stageUpdates.push(...afterHk.updates);

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
    pending: queue.pending.length,
    go_id: goId,
    dry: forceDry || !transport.allowReal,
    live_flags: live,
    preselected_count: preselectedCount,
    stage_updates: stageUpdates,
    package_reviews,
    jobs_created,
    puller_invokes: tickPuller.invokes,
    snapshot: {
      pending: queue.pending,
      inFlightLeadId: queue.inFlightLeadId,
      spacing: queue.spacing,
      lastDeliveredId: queue.lastDeliveredId,
      goId,
      updated_at: now.toISOString(),
    },
  };
}

async function runTickPuller(input: {
  sb: unknown;
  productId: string;
  now: Date;
  holidayDates?: ReadonlySet<string> | null;
  createdJobs: HarnessJobRecord[];
  snapshots?: PackageLeadSnapshot[];
  forceDry: boolean;
  envGet: (k: string) => string | undefined;
  onPullerInvoke?: (p: PullerInvoke) => Promise<void>;
}): Promise<{ invokes: number; updates: string[] }> {
  let stored: HarnessJobRecord[] = [];
  let conversationStatusById: Record<string, string> = {};
  let prevMetaByConv: Record<string, Record<string, unknown>> = {};
  if (input.sb && typeof (input.sb as { from?: unknown }).from === "function") {
    const loaded = await loadHarnessJobsFromSb(
      input.sb as Parameters<typeof loadHarnessJobsFromSb>[0],
      input.productId,
    );
    stored = loaded.jobs;
    conversationStatusById = loaded.conversationStatusById;
    prevMetaByConv = loaded.prevMetaByConv;
  }
  for (const snap of input.snapshots ?? []) {
    conversationStatusById[snap.conversationId] = snap.conversationStatus;
  }
  const jobs = mergeJobsById(stored, input.createdJobs);
  const brainWamidByJobId: Record<string, boolean> = {};
  for (const snap of input.snapshots ?? []) {
    if (snap.existingJobId && snap.brainAlreadyRepliedWamid) {
      brainWamidByJobId[snap.existingJobId] = true;
    }
  }
  const sb = input.sb && typeof (input.sb as { from?: unknown }).from === "function"
    ? input.sb as Parameters<typeof persistHarnessJob>[0]
    : null;
  const onInvoke = input.forceDry
    ? undefined
    : input.onPullerInvoke ?? (async (payload: PullerInvoke) => {
      const base = input.envGet("SUPABASE_URL") ?? "";
      const secret = input.envGet("BRAIN_INTERNAL_SECRET") ?? "";
      const key = input.envGet("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!base || (!secret && !key)) {
        return {
          httpStatus: 0,
          body: { skipped: "missing_brain_auth", reason: "missing_brain_auth" },
        };
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (secret) headers["x-brain-secret"] = secret;
      else headers["Authorization"] = `Bearer ${key}`;
      try {
        const res = await fetch(`${base}/functions/v1/platform-sales-brain`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        let body: unknown = { skipped: "unreadable", reason: "unreadable" };
        try {
          body = JSON.parse(text);
        } catch {
          body = { skipped: "unreadable", reason: "unreadable" };
        }
        return { httpStatus: res.status, body };
      } catch {
        return { httpStatus: 0, body: { skipped: "fetch_failed", reason: "fetch_failed" } };
      }
    });
  const pass = await runPullerPass({
    now: input.now,
    holidayDates: input.holidayDates,
    jobs,
    conversationStatusById,
    brainWamidByJobId,
    forceDry: input.forceDry,
    onClaimed: sb
      ? async (job) => {
        await persistHarnessJob(sb, job, prevMetaByConv[job.conversationId] ?? {});
      }
      : undefined,
    onInvoke,
  });
  if (sb) {
    for (const job of pass.jobs) {
      await persistHarnessJob(
        sb,
        job,
        prevMetaByConv[job.conversationId] ?? {},
      );
    }
    for (const verdict of pass.verdicts) {
      await persistInboundVerdict(sb, verdict.inboundId, verdict.verdict);
    }
  }
  return { invokes: pass.invoked.length, updates: pass.updates };
}

async function maybeHousekeep(input: {
  sb: unknown;
  productId: string;
  instanceId?: string | null;
  envGet: (k: string) => string | undefined;
  now: Date;
  queue: OutboundQueueState;
  store: PilotQueueStore;
  goId: string;
}): Promise<{ queue: OutboundQueueState; updates: string[] }> {
  const updates: string[] = [];
  let queue = input.queue;
  if (!input.sb || typeof (input.sb as { from?: unknown }).from !== "function") {
    return { queue, updates: ["housekeep_skipped:no_sb"] };
  }
  const instanceId = String(
    input.instanceId ?? input.envGet("HARNESS_PILOT_INSTANCE_ID") ?? "",
  ).trim();
  if (!instanceId) {
    return { queue, updates: ["housekeep_skipped:no_instance_id"] };
  }
  try {
    const hk = await runHarnessHousekeep({
      sb: input.sb as any,
      productId: input.productId,
      instanceId,
      now: input.now,
      queue,
    });
    updates.push(`housekeep:${hk.updates.length}`, ...hk.updates);
    if (hk.changed) {
      queue = hk.queue;
      await input.store.save(queue, input.goId);
    }
  } catch (err) {
    updates.push(
      `housekeep_fail:${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return { queue, updates };
}

export { emptyOutboundQueue, createMemoryPilotQueueStore };
