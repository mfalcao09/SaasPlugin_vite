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
  attempt_outcome?: "not_judged" | "judged" | null;
  attempt_reason?: string | null;
  verdict?: string | null;
};

export type PullerInvoke = {
  conversation_id: string;
  harness_job_id: string;
  harness_wake_flags: WakeFlags;
};

export type BrainAttemptReceipt = {
  httpStatus: number;
  body: unknown;
};

export type InboundVerdictWrite = {
  inboundId: string;
  verdict: string;
};

/** Livro aceita 1 ou 2 bolhas por reserva. O resto fica para outra tentativa. */
export const LEDGER_REPLY_BUBBLE_CAP = 2;

export function bubblesWithinLedgerCap<T>(bubbles: readonly T[]): T[] {
  return bubbles.slice(0, LEDGER_REPLY_BUBBLE_CAP);
}

const JUDGED_VERDICTS = new Set([
  "noise",
  "exit",
  "attend",
  "consent_no",
  "consent_yes",
  "consent_asked",
]);

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
    attempt_outcome: o.attempt_outcome === "judged" || o.attempt_outcome === "not_judged"
      ? o.attempt_outcome
      : null,
    attempt_reason: typeof o.attempt_reason === "string" ? o.attempt_reason : null,
    verdict: typeof o.verdict === "string" ? o.verdict : null,
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
  onClaimed?: (job: HarnessJobRecord) => Promise<void>;
  onInvoke?: (payload: PullerInvoke) => Promise<BrainAttemptReceipt | void>;
};

export type PullerPassResult = {
  jobs: HarnessJobRecord[];
  invoked: PullerInvoke[];
  updates: string[];
  verdicts: InboundVerdictWrite[];
};

function classifyReceipt(receipt: BrainAttemptReceipt | void | undefined): {
  drawer: "not_judged" | "judged";
  reason: string;
  verdict: string | null;
} {
  if (!receipt || typeof receipt.httpStatus !== "number") {
    return { drawer: "not_judged", reason: "no_receipt", verdict: null };
  }
  if (receipt.httpStatus < 200 || receipt.httpStatus >= 300) {
    return { drawer: "not_judged", reason: `http_${receipt.httpStatus}`, verdict: null };
  }
  const body = asRecord(receipt.body);
  const skipped = typeof body.skipped === "string" ? body.skipped : "";
  if (skipped) {
    const reason = typeof body.reason === "string" && body.reason ? body.reason : skipped;
    return { drawer: "not_judged", reason, verdict: null };
  }
  const verdict = typeof body.verdict === "string" ? body.verdict : "";
  if (JUDGED_VERDICTS.has(verdict)) {
    return { drawer: "judged", reason: verdict, verdict };
  }
  const wamid = typeof body.wamid === "string" ? body.wamid.trim() : "";
  if (body.success === true && wamid) {
    return { drawer: "judged", reason: "attend", verdict: "attend" };
  }
  return { drawer: "not_judged", reason: "unreadable_attempt", verdict: null };
}

function finishAttempt(
  job: HarnessJobRecord,
  nowIso: string,
  classified: { drawer: "not_judged" | "judged"; reason: string; verdict: string | null },
): HarnessJobRecord {
  return {
    ...completeJob(job, nowIso, classified.drawer === "judged" ? "done" : "failed"),
    attempt_outcome: classified.drawer,
    attempt_reason: classified.reason,
    verdict: classified.verdict,
  };
}

export async function runPullerPass(
  input: PullerPassInput,
): Promise<PullerPassResult> {
  const updates: string[] = [];
  const invoked: PullerInvoke[] = [];
  const verdicts: InboundVerdictWrite[] = [];
  const windowAllows = decideAttendance({
    now: input.now,
    action: "reply",
    holidayDates: input.holidayDates,
  }).allowed;
  const nowIso = input.now.toISOString();
  const interrupted = new Set<string>();

  let jobs = input.jobs.map((job) => {
    if (job.status !== "in_flight") return { ...job };
    const stale = !job.claimed_at || job.claimed_at < nowIso;
    if (!stale) return { ...job };
    interrupted.add(job.id);
    return finishAttempt(job, nowIso, {
      drawer: "not_judged",
      reason: "tick_interrupted",
      verdict: null,
    });
  });
  jobs = promoteHeldJobs(jobs, windowAllows);
  const byId = new Map(jobs.map((j) => [j.id, j]));

  for (const job of [...byId.values()]) {
    if (input.brainWamidByJobId?.[job.id]) {
      const done = completeJob(job, nowIso, "done");
      byId.set(job.id, { ...done, attempt_outcome: "judged", verdict: "attend" });
      updates.push(`${job.id}:done:brain_wamid`);
    }
  }
  jobs = [...byId.values()].map((job) => {
    if (!windowAllows || job.status !== "failed" || interrupted.has(job.id)) return job;
    return { ...job, status: "ready" as const };
  });

  if (input.forceDry === true || !input.onInvoke) {
    return { jobs, invoked, updates: [...updates, "puller_noop:dry_or_no_invoke"], verdicts };
  }

  const pick = pickNextReadyJob(jobs);
  if (!pick) return { jobs, invoked, updates, verdicts };

  if (isHumanStatus(input.conversationStatusById?.[pick.conversationId])) {
    updates.push(`${pick.id}:skip:human`);
    return { jobs, invoked, updates, verdicts };
  }

  const claimed = claimJob(pick, nowIso);
  const live = new Map(jobs.map((j) => [j.id, j]));
  live.set(claimed.id, claimed);
  if (input.onClaimed) await input.onClaimed(claimed);
  const payload: PullerInvoke = {
    conversation_id: claimed.conversationId,
    harness_job_id: claimed.id,
    harness_wake_flags: claimed.flags,
  };
  let receipt: BrainAttemptReceipt | void;
  try {
    receipt = await input.onInvoke(payload);
  } catch (err) {
    receipt = {
      httpStatus: 0,
      body: {
        skipped: "invoke_threw",
        reason: err instanceof Error ? err.message : "invoke_threw",
      },
    };
  }
  const classified = classifyReceipt(receipt);
  const finished = finishAttempt(claimed, nowIso, classified);
  live.set(finished.id, finished);
  if (classified.drawer === "judged" && classified.verdict) {
    verdicts.push({ inboundId: finished.inbound_id, verdict: classified.verdict });
  }
  invoked.push(payload);
  updates.push(`${finished.id}:${finished.status}:${classified.reason}`);
  return { jobs: [...live.values()], invoked, updates, verdicts };
}

/** Dono a gravar: só com a conversa vazia e um agente amarrado ao canal. */
export function agentIdToStamp(input: {
  currentAgentId: string | null | undefined;
  boundAgentId: string | null | undefined;
}): string | null {
  if (String(input.currentAgentId ?? "").trim()) return null;
  const bound = String(input.boundAgentId ?? "").trim();
  return bound || null;
}

type Sb = { from: (table: string) => any };

/**
 * O puxador carimba o agente do canal antes de chamar o cérebro.
 * Não sobrescreve um dono que já existe.
 */
export async function stampChannelAgentIfUnset(
  sb: Sb,
  conversationId: string,
): Promise<{ stamped: boolean; agentId: string | null; reason: string }> {
  const { data, error } = await sb
    .from("platform_crm_conversations")
    .select("id, current_agent_id, wa_qr_instance_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (error || !data?.id) {
    return { stamped: false, agentId: null, reason: "conversation_unread" };
  }
  const instanceId = String(data.wa_qr_instance_id ?? "").trim();
  if (!instanceId) {
    return { stamped: false, agentId: null, reason: "no_instance" };
  }
  const { data: bind, error: bindError } = await sb
    .from("platform_crm_agent_connections")
    .select("product_agent_id")
    .eq("connection_type", "evolution")
    .eq("connection_id", instanceId)
    .limit(1)
    .maybeSingle();
  if (bindError) {
    return { stamped: false, agentId: null, reason: "bind_unread" };
  }
  const agentId = agentIdToStamp({
    currentAgentId: typeof data.current_agent_id === "string" ? data.current_agent_id : null,
    boundAgentId: typeof bind?.product_agent_id === "string" ? bind.product_agent_id : null,
  });
  if (!agentId) {
    return {
      stamped: false,
      agentId: null,
      reason: String(data.current_agent_id ?? "").trim() ? "already_set" : "unbound",
    };
  }
  const { error: updateError } = await sb
    .from("platform_crm_conversations")
    .update({ current_agent_id: agentId })
    .eq("id", conversationId)
    .is("current_agent_id", null);
  if (updateError) {
    return { stamped: false, agentId, reason: "stamp_fail" };
  }
  return { stamped: true, agentId, reason: "stamped" };
}

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

export async function persistInboundVerdict(
  sb: Sb,
  inboundId: string,
  verdict: string,
): Promise<string> {
  const { data, error } = await sb
    .from("platform_crm_messages")
    .select("metadata")
    .eq("id", inboundId)
    .maybeSingle();
  if (error) return `verdict_fail:${error.message ?? "error"}`;
  const meta = asRecord(data?.metadata);
  const { error: updateError } = await sb
    .from("platform_crm_messages")
    .update({ metadata: { ...meta, harness_verdict: verdict } })
    .eq("id", inboundId);
  return updateError
    ? `verdict_fail:${updateError.message ?? "error"}`
    : `verdict:${inboundId}`;
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
