// G4+G5 no tick: revisa wamid das 4, fecha o pacote, cria job no metadata.
// Sem DDL. Boca 1 só reenvia o que já tentou e não tem wamid.

import {
  decideActivation,
  reviewFirstContactPackage,
  extractWamid,
  isBrainOutboundWamid,
  type ActivationDecision,
  type PackageBubble,
  type PackageReview,
} from "./porta-juiz.ts";
import {
  buildHarnessJob,
  type HarnessJobRecord,
} from "./harness-puller.ts";

export type { HarnessJobRecord };
import {
  dropLeadPending,
  enqueue,
  makeContinueEnvelope,
  makeOpenBubble1Envelope,
  type OutboundEnvelope,
  type OutboundQueueState,
} from "./outbound-queue.ts";
import {
  apresentarBubble1,
  apresentarBubbles234,
  findPilotLead,
  type PilotLead,
} from "./pilot-roster.ts";
import { decideAttendance } from "./attendance-window.ts";

export type PackageBubbleSnap = PackageBubble & {
  attempted: boolean;
};

export type PackageLeadSnapshot = {
  phone: string;
  conversationId: string;
  conversationStatus: string;
  crmLeadId?: string;
  greeting?: string;
  handle?: string;
  firstBubbleAtMs: number | null;
  bubbles: PackageBubbleSnap[];
  pendingInboundId: string | null;
  spokeDuringPackage: boolean;
  dncOrHard: boolean;
  brainAlreadyRepliedWamid: boolean;
  windowAllowsReply: boolean;
  /** Fila ou metadata diz que a boca 1 ainda é deste lead. */
  mouth1Tracked: boolean;
  packageAlreadyClosed: boolean;
  existingJobId: string | null;
  harnessProduct: boolean;
  prevMetadata?: Record<string, unknown>;
};

export type PackageTickDecision = {
  phone: string;
  conversationId: string;
  review: PackageReview | null;
  activation: ActivationDecision | null;
  resendIndexes: number[];
  closePackage: boolean;
  createJob: boolean;
  job: HarnessJobRecord | null;
};

const MOUTH1 = new Set(["open_bubble1", "continue_bubble", "resume"]);

export function collectMouth1Phones(queue: OutboundQueueState): string[] {
  const s = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const d = String(raw ?? "").replace(/\D/g, "");
    if (d) s.add(d);
  };
  add(queue.inFlightLeadId);
  for (const e of queue.pending) {
    if (MOUTH1.has(e.kind)) add(e.leadId);
  }
  return [...s];
}

export function jobIdFor(conversationId: string, inboundId: string): string {
  return `job:${conversationId}:${inboundId}`;
}

export function decidePackageTick(
  snap: PackageLeadSnapshot,
  nowMs: number,
  nowIso = new Date(nowMs).toISOString(),
): PackageTickDecision {
  const empty: PackageTickDecision = {
    phone: snap.phone,
    conversationId: snap.conversationId,
    review: null,
    activation: null,
    resendIndexes: [],
    closePackage: false,
    createJob: false,
    job: null,
  };

  const activate = (packageInFlight: boolean): PackageTickDecision => {
    const activation = decideActivation({
      harnessProduct: snap.harnessProduct,
      status: snap.conversationStatus,
      dncOrHard: snap.dncOrHard,
      packageInFlight,
      pendingInboundId: snap.pendingInboundId,
      spokeDuringPackage: snap.spokeDuringPackage,
      brainAlreadyRepliedWamid: snap.brainAlreadyRepliedWamid,
      windowAllowsReply: snap.windowAllowsReply,
    });
    const createJob = activation.action === "job" && !snap.existingJobId &&
      Boolean(snap.pendingInboundId);
    const job = createJob
      ? buildHarnessJob({
        conversationId: snap.conversationId,
        inboundId: String(snap.pendingInboundId),
        reason: activation.reason,
        flags: activation.flags,
        createdAt: nowIso,
      })
      : null;
    return { ...empty, activation, createJob, job };
  };

  if (!snap.harnessProduct) return empty;

  if (!snap.mouth1Tracked || snap.packageAlreadyClosed) {
    return activate(false);
  }

  const review = reviewFirstContactPackage({
    firstBubbleAtMs: snap.firstBubbleAtMs,
    nowMs,
    bubbles: snap.bubbles,
  });

  if (!review.closed) {
    return {
      ...empty,
      review,
      resendIndexes: review.resendIndexes,
    };
  }

  const afterClose = activate(false);
  return {
    ...afterClose,
    review,
    closePackage: true,
  };
}

/** Tira só boca 1 (não usa dropLeadPending inteiro se no futuro a fila tiver reply). */
export function dropMouth1Pending(
  state: OutboundQueueState,
  leadRef: string,
): OutboundQueueState {
  const dropped = dropLeadPending(state, leadRef);
  const keep = state.pending.filter((e) => {
    const same = e.leadId === leadRef || e.crmLeadId === leadRef ||
      e.leadId.replace(/\D/g, "") === leadRef.replace(/\D/g, "");
    return same && !MOUTH1.has(e.kind);
  });
  return {
    ...dropped,
    pending: [...dropped.pending, ...keep],
  };
}

export function applyPackageTickToQueue(
  queue: OutboundQueueState,
  decision: PackageTickDecision,
  envelopes: OutboundEnvelope[],
): OutboundQueueState {
  let q = queue;
  if (decision.closePackage) {
    q = dropMouth1Pending(q, decision.phone);
  }
  if (!decision.closePackage) {
    for (const env of envelopes) {
      q = enqueue(q, env);
    }
  }
  return q;
}

export function resendEnvelopesFor(
  snap: PackageLeadSnapshot,
  indexes: number[],
  now: Date,
  roster: readonly PilotLead[] = [],
): OutboundEnvelope[] {
  const lead = findPilotLead(snap.phone, roster);
  const greeting = snap.greeting ?? lead?.greeting ?? "Lead";
  const handle = snap.handle ?? lead?.handle ?? "unknown";
  const conv = snap.conversationId;
  const out: OutboundEnvelope[] = [];
  for (const index of indexes) {
    if (index === 1) {
      const env = makeOpenBubble1Envelope({
        id: `pilot:${snap.phone}:b1`,
        leadId: snap.phone,
        conversationId: conv,
        text: apresentarBubble1(greeting),
        notBefore: now,
      });
      if (snap.crmLeadId) env.crmLeadId = snap.crmLeadId;
      out.push(env);
      continue;
    }
    if (index === 2 || index === 3 || index === 4) {
      const text = apresentarBubbles234(handle)[index - 2];
      const env = makeContinueEnvelope({
        id: `pilot:${snap.phone}:b${index}`,
        leadId: snap.phone,
        conversationId: conv,
        bubbleIndex: index,
        text,
        notBefore: now,
      });
      if (snap.crmLeadId) env.crmLeadId = snap.crmLeadId;
      out.push(env);
    }
  }
  return out;
}

export function packageMetaPatch(
  prev: Record<string, unknown>,
  decision: PackageTickDecision,
  nowIso: string,
): { metadata: Record<string, unknown>; status?: "bot_active" } {
  const prevPkg = prev.harness_package && typeof prev.harness_package === "object"
    ? prev.harness_package as Record<string, unknown>
    : {};
  const metadata: Record<string, unknown> = { ...prev };
  if (decision.review || decision.closePackage) {
    metadata.harness_package = {
      ...prevPkg,
      closed: decision.closePackage || prevPkg.closed === true,
      close_reason: decision.review?.reason ?? prevPkg.close_reason ?? null,
      wamid_count: decision.review?.wamidCount ?? prevPkg.wamid_count ?? 0,
      reviewed_at: nowIso,
      ...(decision.closePackage ? { closed_at: nowIso } : {}),
    };
  }
  if (decision.job) {
    metadata.harness_job = decision.job;
    metadata.harness_activation = decision.activation?.reason ?? decision.job.reason;
    metadata.harness_wake_flags = decision.job.flags;
    const human = prev.status === "human_active" ||
      String(prev.conversation_status ?? "") === "human_active";
    if (!human) {
      metadata.remarketing = false;
      metadata.harness_state = "service";
      metadata.harness_wake_at = nowIso;
      return { metadata, status: "bot_active" };
    }
  }
  return { metadata };
}

type Sb = { from: (table: string) => any };

function digitsOf(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
}

function fcKey(phone: string, index: number): string {
  return `fc:${phone}:b${index}`;
}

function matchBubbleIndex(
  phone: string,
  content: string,
  meta: Record<string, unknown>,
  greeting: string,
  handle: string,
): 1 | 2 | 3 | 4 | null {
  const key = String(meta.idempotency_key ?? "");
  for (const i of [1, 2, 3, 4] as const) {
    if (key === fcKey(phone, i) || key === `pilot:${phone}:b${i}`) return i;
  }
  if (content === apresentarBubble1(greeting)) return 1;
  const rest = apresentarBubbles234(handle);
  const hit = rest.findIndex((t) => t === content);
  if (hit >= 0) return (hit + 2) as 2 | 3 | 4;
  return null;
}

export function snapshotFromRows(input: {
  phone: string;
  conversationId: string;
  conversationStatus: string;
  metadata: Record<string, unknown>;
  crmLeadId?: string;
  greeting?: string;
  handle?: string;
  messages: readonly {
    id: string;
    direction: string;
    sender_type?: string | null;
    content?: string | null;
    created_at?: string | null;
    metadata?: unknown;
  }[];
  mouth1Tracked: boolean;
  windowAllowsReply: boolean;
  harnessProduct?: boolean;
}): PackageLeadSnapshot {
  const phone = input.phone.replace(/\D/g, "");
  const meta = input.metadata;
  const pkg = asMeta(meta.harness_package);
  const job = asMeta(meta.harness_job);
  const greeting = input.greeting ?? "Lead";
  const handle = input.handle ?? "unknown";

  const bubbles: PackageBubbleSnap[] = ([1, 2, 3, 4] as const).map((index) => ({
    index,
    wamid: null,
    attempted: false,
  }));

  let firstBubbleAtMs: number | null = typeof pkg.first_bubble_at === "string"
    ? Date.parse(pkg.first_bubble_at)
    : null;
  if (firstBubbleAtMs != null && !Number.isFinite(firstBubbleAtMs)) {
    firstBubbleAtMs = null;
  }

  let pendingInboundId: string | null = null;
  let brainAlreadyRepliedWamid = false;
  let spokeDuringPackage = false;

  const sorted = [...input.messages].sort((a, b) =>
    String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
  );

  for (const row of sorted) {
    const rowMeta = asMeta(row.metadata);
    const at = Date.parse(String(row.created_at ?? ""));
    if (row.direction === "outbound") {
      const idx = matchBubbleIndex(
        phone,
        String(row.content ?? ""),
        rowMeta,
        greeting,
        handle,
      );
      if (idx) {
        const slot = bubbles[idx - 1];
        slot.attempted = true;
        slot.wamid = extractWamid(rowMeta);
        if (firstBubbleAtMs == null && Number.isFinite(at)) firstBubbleAtMs = at;
      }
      if (
        pendingInboundId &&
        isBrainOutboundWamid({
          direction: row.direction,
          senderType: row.sender_type,
          metadata: rowMeta,
        })
      ) {
        brainAlreadyRepliedWamid = true;
      }
    } else if (
      row.direction === "inbound" &&
      (row.sender_type == null || row.sender_type === "visitor")
    ) {
      const verdict = String(rowMeta.harness_verdict ?? "");
      if (!verdict || verdict === "pending") {
        pendingInboundId = row.id;
      }
      if (
        firstBubbleAtMs != null &&
        Number.isFinite(at) &&
        at >= firstBubbleAtMs
      ) {
        spokeDuringPackage = true;
      }
    }
  }

  const closed = pkg.closed === true || pkg.closed === "true";
  const existingJobId = typeof job.id === "string" && job.id ? job.id : null;
  const dnc = meta.do_not_contact === true || meta.do_not_contact === "true";

  return {
    phone,
    conversationId: input.conversationId,
    conversationStatus: input.conversationStatus,
    crmLeadId: input.crmLeadId,
    greeting,
    handle,
    firstBubbleAtMs,
    bubbles,
    pendingInboundId,
    spokeDuringPackage,
    dncOrHard: dnc,
    brainAlreadyRepliedWamid,
    windowAllowsReply: input.windowAllowsReply,
    mouth1Tracked: input.mouth1Tracked && !closed,
    packageAlreadyClosed: closed,
    existingJobId,
    harnessProduct: input.harnessProduct !== false,
    prevMetadata: meta,
  };
}

export async function loadPackageSnapshots(
  sb: Sb,
  input: {
    productId: string;
    queue: OutboundQueueState;
    now: Date;
    holidayDates?: ReadonlySet<string> | null;
    roster?: readonly PilotLead[];
  },
): Promise<PackageLeadSnapshot[]> {
  const mouthPhones = new Set(collectMouth1Phones(input.queue));
  const { data: convs, error } = await sb
    .from("platform_crm_conversations")
    .select("id, status, visitor_phone, lead_id, metadata")
    .eq("product_id", input.productId)
    .limit(300);
  if (error || !Array.isArray(convs)) return [];

  const windowAllowsReply = decideAttendance({
    now: input.now,
    action: "reply",
    holidayDates: input.holidayDates,
  }).allowed;

  const wanted: typeof convs = [];
  for (const c of convs) {
    const phone = digitsOf(c.visitor_phone);
    const meta = asMeta(c.metadata);
    const state = String(meta.harness_state ?? "");
    const pkg = asMeta(meta.harness_package);
    const openPkg = pkg.closed === false || pkg.closed === "false" ||
      (pkg.first_bubble_at != null && pkg.closed !== true);
    const service = state === "service" || String(c.status ?? "") === "bot_active";
    if (mouthPhones.has(phone) || openPkg || service) wanted.push(c);
  }

  const out: PackageLeadSnapshot[] = [];
  for (const c of wanted) {
    const phone = digitsOf(c.visitor_phone);
    const lead = findPilotLead(phone, input.roster ?? []);
    const { data: messages } = await sb
      .from("platform_crm_messages")
      .select("id, direction, sender_type, content, created_at, metadata")
      .eq("conversation_id", c.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(80);
    const convMeta = asMeta(c.metadata);
    const pkgMeta = asMeta(convMeta.harness_package);
    const pkgOpen = Boolean(pkgMeta.first_bubble_at) &&
      pkgMeta.closed !== true && pkgMeta.closed !== "true";
    out.push(snapshotFromRows({
      phone,
      conversationId: String(c.id),
      conversationStatus: String(c.status ?? ""),
      metadata: convMeta,
      crmLeadId: c.lead_id ? String(c.lead_id) : lead?.leadId,
      greeting: lead?.greeting,
      handle: lead?.handle,
      messages: Array.isArray(messages) ? messages : [],
      mouth1Tracked: mouthPhones.has(phone) || pkgOpen,
      windowAllowsReply,
      harnessProduct: true,
    }));
  }
  return out;
}

export async function persistPackageDecision(
  sb: Sb,
  decision: PackageTickDecision,
  prevMeta: Record<string, unknown>,
  nowIso: string,
): Promise<string> {
  if (!decision.closePackage && !decision.createJob && !decision.review) {
    return "package_noop";
  }
  const patch = packageMetaPatch(prevMeta, decision, nowIso);
  const update: Record<string, unknown> = { metadata: patch.metadata };
  if (patch.status) update.status = patch.status;
  const { error } = await sb
    .from("platform_crm_conversations")
    .update(update)
    .eq("id", decision.conversationId);
  if (error) return `package_persist_fail:${error.message ?? "error"}`;
  if (decision.job) return `job:${decision.job.id}`;
  if (decision.closePackage) {
    return `package_closed:${decision.review?.reason ?? "closed"}`;
  }
  if (decision.resendIndexes.length) {
    return `package_resend:${decision.resendIndexes.join(",")}`;
  }
  return "package_reviewed";
}

export async function runPackageTickPass(input: {
  sb?: Sb | null;
  productId: string;
  queue: OutboundQueueState;
  now: Date;
  holidayDates?: ReadonlySet<string> | null;
  roster?: readonly PilotLead[];
  snapshots?: PackageLeadSnapshot[];
  onJob?: (job: HarnessJobRecord) => Promise<void>;
}): Promise<{
  queue: OutboundQueueState;
  updates: string[];
  jobs: HarnessJobRecord[];
}> {
  const updates: string[] = [];
  const jobs: HarnessJobRecord[] = [];
  let queue = input.queue;
  const snaps = input.snapshots ??
    (input.sb
      ? await loadPackageSnapshots(input.sb, {
        productId: input.productId,
        queue,
        now: input.now,
        holidayDates: input.holidayDates,
        roster: input.roster,
      })
      : []);
  const nowMs = input.now.getTime();
  const nowIso = input.now.toISOString();

  for (const snap of snaps) {
    const decision = decidePackageTick(snap, nowMs, nowIso);
    const resend = resendEnvelopesFor(
      snap,
      decision.resendIndexes,
      input.now,
      input.roster ?? [],
    );
    queue = applyPackageTickToQueue(queue, decision, resend);
    if (input.sb && (decision.closePackage || decision.createJob || decision.review)) {
      const note = await persistPackageDecision(
        input.sb,
        decision,
        snap.prevMetadata ?? {},
        nowIso,
      );
      updates.push(`${snap.phone}:${note}`);
    } else if (decision.createJob || decision.closePackage || decision.resendIndexes.length) {
      updates.push(
        `${snap.phone}:${
          decision.job
            ? `job:${decision.job.id}`
            : decision.closePackage
            ? `package_closed:${decision.review?.reason}`
            : `package_resend:${decision.resendIndexes.join(",")}`
        }`,
      );
    }
    if (decision.job) {
      jobs.push(decision.job);
    }
  }
  return { queue, updates, jobs };
}
