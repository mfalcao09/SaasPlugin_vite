// Vida do bilhete + puxador (PRD-13 Corte A).
// Um job por tick. Webhook não chama o cérebro. Create não invoca.
//   deno test --no-check supabase/functions/_shared/camila-harness/harness-puller.test.ts

import { decideAttendance } from "./attendance-window.ts";
import type { WakeFlags } from "./porta-juiz.ts";

export type HarnessJobStatus =
  | "held"
  | "ready"
  | "in_flight"
  | "done"
  | "failed";

export type HarnessJobRecord = {
  id: string;
  conversationId: string;
  inbound_id: string;
  status: HarnessJobStatus;
  reason: string;
  flags: WakeFlags;
  created_at: string;
  claimed_at?: string | null;
  done_at?: string | null;
};

export type PullerInvoke = {
  conversation_id: string;
  harness_job_id: string;
  harness_wake_flags: WakeFlags;
};

const EMPTY_FLAGS: WakeFlags = {
  pending_inbound_id: null,
  needs_new_consent: false,
  spoke_during_package: false,
  wake_reason: null,
};

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

export function statusFromActivationReason(reason: string): HarnessJobStatus {
  if (reason === "job_held_window") return "held";
  if (reason === "job_ready") return "ready";
  return "ready";
}

export function parseHarnessJob(raw: unknown): HarnessJobRecord | null {
  const o = asRecord(raw);
  if (typeof o.id !== "string" || !o.id.trim()) return null;
  const conversationId = String(o.conversationId ?? o.conversation_id ?? "");
  if (!conversationId) return null;
  const reason = String(o.reason ?? "");
  const rawStatus = String(o.status ?? "");
  const status: HarnessJobStatus =
    rawStatus === "held" || rawStatus === "ready" || rawStatus === "in_flight" ||
      rawStatus === "done" || rawStatus === "failed"
      ? rawStatus
      : statusFromActivationReason(reason);
  const flagsRaw = asRecord(o.flags);
  const flags: WakeFlags = {
    pending_inbound_id: typeof flagsRaw.pending_inbound_id === "string"
      ? flagsRaw.pending_inbound_id
      : null,
    needs_new_consent: flagsRaw.needs_new_consent === true,
    spoke_during_package: flagsRaw.spoke_during_package === true,
    wake_reason: flagsRaw.wake_reason === "pending_inbound"
      ? "pending_inbound"
      : null,
  };
  return {
    id: o.id.trim(),
    conversationId,
    inbound_id: String(o.inbound_id ?? flags.pending_inbound_id ?? ""),
    status,
    reason,
    flags: { ...EMPTY_FLAGS, ...flags },
    created_at: String(o.created_at ?? ""),
    claimed_at: typeof o.claimed_at === "string" ? o.claimed_at : null,
    done_at: typeof o.done_at === "string" ? o.done_at : null,
  };
}

export function buildHarnessJob(input: {
  conversationId: string;
  inboundId: string;
  reason: string;
  flags: WakeFlags;
  createdAt: string;
}): HarnessJobRecord {
  return {
    id: `job:${input.conversationId}:${input.inboundId}`,
    conversationId: input.conversationId,
    inbound_id: input.inboundId,
    status: statusFromActivationReason(input.reason),
    reason: input.reason,
    flags: input.flags,
    created_at: input.createdAt,
    claimed_at: null,
    done_at: null,
  };
}

export function promoteHeldJobs(
  jobs: readonly HarnessJobRecord[],
  windowAllowsReply: boolean,
): HarnessJobRecord[] {
  if (!windowAllowsReply) return jobs.map((j) => ({ ...j }));
  return jobs.map((j) =>
    j.status === "held" ? { ...j, status: "ready" as const } : { ...j }
  );
}

export function pickNextReadyJob(
  jobs: readonly HarnessJobRecord[],
): HarnessJobRecord | null {
  const ready = jobs
    .filter((j) => j.status === "ready")
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return ready[0] ?? null;
}

export function claimJob(
  job: HarnessJobRecord,
  nowIso: string,
): HarnessJobRecord {
  if (job.status === "in_flight" || job.status === "done") return { ...job };
  if (job.status !== "ready") return { ...job };
  return { ...job, status: "in_flight", claimed_at: nowIso };
}

export function completeJob(
  job: HarnessJobRecord,
  nowIso: string,
  status: "done" | "failed" = "done",
): HarnessJobRecord {
  return { ...job, status, done_at: nowIso };
}

function isHumanStatus(status: string | undefined): boolean {
  return status === "human_active" || status === "waiting_human";
}

export type PullerPassInput = {
  now: Date;
  holidayDates?: ReadonlySet<string> | null;
  jobs: HarnessJobRecord[];
  conversationStatusById?: Record<string, string>;
  brainWamidByJobId?: Record<string, boolean>;
  forceDry?: boolean;
  onInvoke?: (payload: PullerInvoke) => Promise<void>;
};

export type PullerPassResult = {
  jobs: HarnessJobRecord[];
  invoked: PullerInvoke[];
  updates: string[];
};

export async function runPullerPass(
  input: PullerPassInput,
): Promise<PullerPassResult> {
  const updates: string[] = [];
  const invoked: PullerInvoke[] = [];
  const windowAllows = decideAttendance({
    now: input.now,
    action: "reply",
    holidayDates: input.holidayDates,
  }).allowed;
  const nowIso = input.now.toISOString();

  let jobs = promoteHeldJobs(input.jobs, windowAllows);
  const byId = new Map(jobs.map((j) => [j.id, j]));

  for (const job of [...byId.values()]) {
    if (input.brainWamidByJobId?.[job.id]) {
      const done = completeJob(job, nowIso, "done");
      byId.set(job.id, done);
      updates.push(`${job.id}:done:brain_wamid`);
    }
  }
  jobs = [...byId.values()];

  if (input.forceDry === true || !input.onInvoke) {
    return { jobs, invoked, updates: [...updates, "puller_noop:dry_or_no_invoke"] };
  }

  const pick = pickNextReadyJob(jobs);
  if (!pick) return { jobs, invoked, updates };

  if (isHumanStatus(input.conversationStatusById?.[pick.conversationId])) {
    updates.push(`${pick.id}:skip:human`);
    return { jobs, invoked, updates };
  }

  const claimed = claimJob(pick, nowIso);
  byId.set(claimed.id, claimed);
  const payload: PullerInvoke = {
    conversation_id: claimed.conversationId,
    harness_job_id: claimed.id,
    harness_wake_flags: claimed.flags,
  };
  await input.onInvoke(payload);
  invoked.push(payload);
  updates.push(`${claimed.id}:in_flight`);
  return { jobs: [...byId.values()], invoked, updates };
}

type Sb = { from: (table: string) => any };

export async function loadHarnessJobsFromSb(
  sb: Sb,
  productId: string,
): Promise<{
  jobs: HarnessJobRecord[];
  conversationStatusById: Record<string, string>;
  prevMetaByConv: Record<string, Record<string, unknown>>;
}> {
  const { data, error } = await sb
    .from("platform_crm_conversations")
    .select("id, status, metadata")
    .eq("product_id", productId)
    .limit(300);
  const jobs: HarnessJobRecord[] = [];
  const conversationStatusById: Record<string, string> = {};
  const prevMetaByConv: Record<string, Record<string, unknown>> = {};
  if (error || !Array.isArray(data)) {
    return { jobs, conversationStatusById, prevMetaByConv };
  }
  for (const row of data) {
    const id = String(row.id ?? "");
    if (!id) continue;
    conversationStatusById[id] = String(row.status ?? "");
    const meta = asRecord(row.metadata);
    prevMetaByConv[id] = meta;
    const parsed = parseHarnessJob(meta.harness_job);
    if (parsed) {
      parsed.conversationId = id;
      jobs.push(parsed);
    }
  }
  return { jobs, conversationStatusById, prevMetaByConv };
}

export async function persistHarnessJob(
  sb: Sb,
  job: HarnessJobRecord,
  prevMeta: Record<string, unknown>,
): Promise<string> {
  const { error } = await sb
    .from("platform_crm_conversations")
    .update({
      metadata: {
        ...prevMeta,
        harness_job: job,
        harness_activation: job.reason,
        harness_wake_flags: job.flags,
      },
    })
    .eq("id", job.conversationId);
  return error ? `persist_fail:${error.message ?? "error"}` : `persist:${job.id}`;
}

export function mergeJobsById(
  ...lists: readonly (readonly HarnessJobRecord[])[]
): HarnessJobRecord[] {
  const map = new Map<string, HarnessJobRecord>();
  for (const list of lists) {
    for (const job of list) map.set(job.id, job);
  }
  return [...map.values()];
}

export function dropMouth1ExitEnvelopes<
  T extends { pending: { kind: string }[] },
>(queue: T): T {
  return {
    ...queue,
    pending: queue.pending.filter((e) => e.kind !== "exit_message"),
  };
}

export function mouth1OutboundMetadata(
  idempotencyKey: string,
  wamid: string | null,
): Record<string, unknown> {
  return {
    idempotency_key: idempotencyKey,
    harness_mouth: 1,
    ...(wamid ? { wamid } : {}),
  };
}

export function g7MayWriteFunnel(
  wamid: string | null | undefined,
): boolean {
  return Boolean(wamid && String(wamid).trim());
}

export function housekeepMayMoveToPool(input: {
  pendingInbound: boolean;
  jobStatus: HarnessJobStatus | null;
  silence24hDue: boolean;
}): boolean {
  if (input.pendingInbound) return false;
  if (
    input.jobStatus === "held" ||
    input.jobStatus === "ready" ||
    input.jobStatus === "in_flight"
  ) {
    return false;
  }
  return input.silence24hDue;
}
