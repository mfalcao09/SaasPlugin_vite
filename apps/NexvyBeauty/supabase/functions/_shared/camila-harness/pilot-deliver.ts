// Pilot deliver — monta fila a partir de leads preselected (DB) + executa ticks.
// Real send só se transport.allowReal === true; BUILD força dry.
// Nunca importa Z-API neste módulo. Nunca usa lista hardcoded.

import { authorizeWireSend, type VoiceGate } from "./wire-gates.ts";
import {
  emptyOutboundQueue,
  enqueue,
  pickNext,
  deliverPicked,
  makeOpenBubble1Envelope,
  makeContinueEnvelope,
  type OutboundEnvelope,
  type OutboundQueueState,
} from "./outbound-queue.ts";
import {
  RENATA_RESUME_TEXT,
  RENATA_PHONE,
  apresentarBubble1,
  apresentarBubbles234,
  pilotManualList,
  findPilotLead,
  type PilotLead,
} from "./pilot-roster.ts";
import { DEFAULT_LEAD_SPACING } from "./lead-spacing.ts";
import { decideAttendance } from "./attendance-window.ts";
import { mensagemDeSaidaBubbles } from "./exit-message.ts";
import {
  createDryWireTransport,
  type WireTransport,
} from "./wire-transport.ts";

export type { WireTransport } from "./wire-transport.ts";
export { createDryWireTransport } from "./wire-transport.ts";
export { RENATA_PHONE, RENATA_RESUME_TEXT, pilotManualList };

/** Delay curto entre bolhas 2–4 do mesmo pacote (~30s). */
export const PILOT_INTRA_BUBBLE_MS = 30_000;

export type PilotPlanResult = {
  allowed: boolean;
  reason: string;
  goId: string;
  manualList: string[];
  envelopesQueued: number;
  queue: OutboundQueueState;
  realSends: number;
  dryRun: true;
  renataResumeText: string;
};

function convRef(lead: PilotLead): string {
  return lead.leadId ? `lead:${lead.leadId}` : `pilot-conv:${lead.phone}`;
}

function firstEnvelopeForLead(lead: PilotLead, now: Date): OutboundEnvelope {
  const base = {
    leadId: lead.phone,
    conversationId: convRef(lead),
    crmLeadId: lead.leadId,
  };
  if (lead.resumeException) {
    return {
      id: `pilot:${lead.phone}:resume`,
      ...base,
      kind: "resume",
      bubbleIndex: null,
      text: RENATA_RESUME_TEXT,
      notBeforeIso: now.toISOString(),
      idempotencyKey: `pilot:${lead.phone}:resume`,
    };
  }
  return makeOpenBubble1Envelope({
    id: `pilot:${lead.phone}:b1`,
    leadId: lead.phone,
    conversationId: convRef(lead),
    text: apresentarBubble1(lead.greeting),
    notBefore: now,
  });
}

/** Após 1ª (open/resume), agenda bolhas 2–4 do MESMO lead. */
export function enqueueFollowupBubbles(
  queue: OutboundQueueState,
  lead: PilotLead,
  after: Date,
): OutboundQueueState {
  const [b2, b3, b4] = apresentarBubbles234(lead.handle);
  let q = queue;
  for (const [idx, text] of [[2, b2], [3, b3], [4, b4]] as const) {
    const env = makeContinueEnvelope({
      id: `pilot:${lead.phone}:b${idx}`,
      leadId: lead.phone,
      conversationId: convRef(lead),
      bubbleIndex: idx,
      text,
      notBefore: new Date(after.getTime() + PILOT_INTRA_BUBBLE_MS * (idx - 1)),
    });
    if (lead.leadId) env.crmLeadId = lead.leadId;
    q = enqueue(q, env);
  }
  return q;
}

/**
 * Monta a fila a partir do roster já carregado do DB (preselected).
 * `roster` é obrigatório — sem atalho hardcoded.
 */
export function planPilotQueue(input: {
  goId: string | null;
  voice: VoiceGate;
  killOn: boolean;
  now: Date;
  /** Leads em derived_stage=preselected (vindo do DB). */
  roster: readonly PilotLead[];
  holidayDates?: ReadonlySet<string> | null;
  onlyPhones?: string[] | null;
}): PilotPlanResult {
  const roster = input.roster;
  const manualList = pilotManualList(roster);
  const dryRun = true as const;
  const empty = {
    allowed: false,
    goId: String(input.goId ?? ""),
    manualList,
    envelopesQueued: 0,
    queue: emptyOutboundQueue(),
    realSends: 0,
    dryRun,
    renataResumeText: RENATA_RESUME_TEXT,
    reason: "blocked",
  };

  if (!roster.length) {
    return { ...empty, reason: "no_preselected_leads_in_db" };
  }
  if (!input.goId || String(input.goId).trim() === "") {
    return { ...empty, reason: "supervised_requires_go_id" };
  }

  let q = emptyOutboundQueue();
  let queued = 0;
  const leads = input.onlyPhones?.length
    ? roster.filter((l) => input.onlyPhones!.includes(l.phone))
    : [...roster];

  for (const lead of leads) {
    const attendanceAction = lead.resumeException
      ? "resume_package" as const
      : "open_new_package" as const;

    // Abertura nova só em janela comercial; resume usa estendida.
    if (attendanceAction === "open_new_package") {
      const att = decideAttendance({
        now: input.now,
        action: attendanceAction,
        holidayDates: input.holidayDates,
      });
      if (!att.allowed) {
        return {
          ...empty,
          reason: `${lead.phone}:${att.reason}`,
          goId: input.goId,
          queue: q,
          envelopesQueued: queued,
        };
      }
    }

    const gate = authorizeWireSend({
      kind: "supervised",
      goId: input.goId,
      leadId: lead.phone,
      manualList,
      voice: input.voice,
      killOn: input.killOn,
      dryRun: true,
      allowRealWhatsapp: false,
      now: input.now,
      attendanceAction,
      holidayDates: input.holidayDates,
    });
    if (!gate.allowed) {
      return {
        ...empty,
        reason: `${lead.phone}:${gate.reason}`,
        goId: input.goId,
        queue: q,
        envelopesQueued: queued,
      };
    }

    const env = firstEnvelopeForLead(lead, input.now);
    if (lead.leadId) env.crmLeadId = lead.leadId;
    q = enqueue(q, env);
    queued++;
  }

  return {
    allowed: true,
    reason: "pilot_queue_planned",
    goId: input.goId,
    manualList,
    envelopesQueued: queued,
    queue: q,
    realSends: 0,
    dryRun,
    renataResumeText: RENATA_RESUME_TEXT,
  };
}

export type PilotTickResult = {
  queue: OutboundQueueState;
  delivered: OutboundEnvelope | null;
  realSends: number;
  reason: string;
};

function attendanceForKind(kind: OutboundEnvelope["kind"]) {
  if (kind === "open_bubble1") return "open_new_package" as const;
  if (kind === "resume") return "resume_package" as const;
  if (kind === "continue_bubble") return "continue_package" as const;
  if (kind === "exit_message") return "exit_message" as const;
  return "reply" as const;
}

/**
 * Encaixa só quem entrou em preselected e ainda não está na fila.
 * Não reordena o que já estava. Uma passagem, sem remontar.
 */
export function absorbPreselectedIntoQueue(
  queue: OutboundQueueState,
  roster: readonly PilotLead[],
  now: Date,
): { queue: OutboundQueueState; added: number } {
  const present = new Set(queue.pending.map((e) => e.leadId));
  if (queue.inFlightLeadId) present.add(queue.inFlightLeadId);
  let q = queue;
  let added = 0;
  for (const lead of roster) {
    if (present.has(lead.phone)) continue;
    const env = firstEnvelopeForLead(lead, now);
    if (lead.leadId) env.crmLeadId = lead.leadId;
    const next = enqueue(q, env);
    if (next.pending.length !== q.pending.length) added++;
    q = next;
    present.add(lead.phone);
  }
  return { queue: q, added };
}

/**
 * Texto canônico da bolha. Não confia no que ficou gravado na fila.
 */
export function matchDispatchText(
  lead: PilotLead | null,
  envelope: Pick<OutboundEnvelope, "kind" | "bubbleIndex" | "text">,
): { ok: boolean; reason: string } {
  if (!lead) return { ok: false, reason: "text_unverified" };
  if (envelope.kind === "reply") {
    if (
      envelope.text.startsWith("Recebi sua mensagem") ||
      /em breve te respondo/i.test(envelope.text)
    ) {
      return { ok: false, reason: "reply_stub_forbidden" };
    }
    return { ok: true, reason: "reply_from_brain" };
  }
  let expected: string | null = null;
  if (envelope.kind === "resume") {
    expected = lead.resumeException ? RENATA_RESUME_TEXT : null;
  } else if (envelope.kind === "open_bubble1") {
    expected = apresentarBubble1(lead.greeting);
  } else if (
    envelope.kind === "continue_bubble" &&
    envelope.bubbleIndex != null &&
    envelope.bubbleIndex >= 2 &&
    envelope.bubbleIndex <= 4
  ) {
    expected = apresentarBubbles234(lead.handle)[envelope.bubbleIndex - 2] ?? null;
  } else if (envelope.kind === "exit_message") {
    const exit = mensagemDeSaidaBubbles(lead.greeting);
    expected = envelope.bubbleIndex === 2
      ? (exit[1] ?? null)
      : (exit[0] ?? null);
    if (
      envelope.bubbleIndex === 2 &&
      (envelope.sendAs !== "link" || !envelope.linkPreview?.linkUrl)
    ) {
      return { ok: false, reason: "exit_link_requires_preview" };
    }
  }
  if (!expected || envelope.text !== expected) {
    return { ok: false, reason: "text_mismatch" };
  }
  return { ok: true, reason: "text_ok" };
}

/**
 * "Posso disparar?" — última confirmação, com a lista e o roteiro recém-lidos.
 * Chip e "já saiu" entram como leitura feita agora pelo caller.
 */
export function canDispatchNow(input: {
  envelope: OutboundEnvelope;
  now: Date;
  goId: string | null;
  voice: VoiceGate;
  killOn: boolean;
  roster: readonly PilotLead[];
  holidayDates?: ReadonlySet<string> | null;
  realIntent?: boolean;
  pilotLive?: boolean;
  scriptLead?: PilotLead | null;
  chipConnected?: boolean;
  alreadySent?: boolean;
  lookupFailed?: boolean;
}): { allowed: boolean; reason: string } {
  const action = attendanceForKind(input.envelope.kind);
  const rosterPhones = pilotManualList(input.roster);
  const opening = action === "open_new_package" || action === "resume_package";
  const manualList = opening
    ? rosterPhones
    : rosterPhones.includes(input.envelope.leadId)
      ? rosterPhones
      : [...rosterPhones, input.envelope.leadId];
  const real = input.realIntent === true;
  const gate = authorizeWireSend({
    kind: "supervised",
    goId: input.goId,
    leadId: input.envelope.leadId,
    manualList,
    voice: input.voice,
    killOn: input.killOn,
    dryRun: !real,
    allowRealWhatsapp: real,
    pilotLive: input.pilotLive === true,
    now: input.now,
    attendanceAction: action,
    holidayDates: input.holidayDates,
  });
  if (!gate.allowed) return { allowed: false, reason: gate.reason };

  const script = input.scriptLead ?? findPilotLead(input.envelope.leadId, input.roster);
  const text = matchDispatchText(script, input.envelope);
  if (!text.ok) return { allowed: false, reason: text.reason };

  if (input.lookupFailed === true) {
    return { allowed: false, reason: "already_sent_lookup_failed" };
  }
  if (input.alreadySent === true) {
    return { allowed: false, reason: "already_sent_outside_queue" };
  }
  if (real && input.chipConnected !== true) {
    return { allowed: false, reason: "chip_not_connected" };
  }
  return { allowed: true, reason: gate.reason };
}

export async function runPilotTick(input: {
  queue: OutboundQueueState;
  now: Date;
  transport: WireTransport;
  roster: readonly PilotLead[];
  goId?: string | null;
  voice?: VoiceGate;
  killOn?: boolean;
  pilotLive?: boolean;
  /** Leitura ao vivo, feita agora: chip, duplicata fora da fila, roteiro. */
  confirm?: (envelope: OutboundEnvelope) => Promise<{
    chipConnected: boolean;
    alreadySent: boolean;
    scriptLead: PilotLead | null;
    lookupFailed?: boolean;
  }>;
  rng?: () => number;
  holidayDates?: ReadonlySet<string> | null;
}): Promise<PilotTickResult> {
  const roster = input.roster;
  const picked = pickNext(input.queue, input.now);
  if (!picked.envelope) {
    return {
      queue: input.queue,
      delivered: null,
      realSends: 0,
      reason: picked.reason,
    };
  }
  const env = picked.envelope;
  const realIntent = input.transport.allowReal === true;
  const confirmed = input.confirm ? await input.confirm(env) : null;

  const verdict = canDispatchNow({
    envelope: env,
    now: input.now,
    goId: input.goId ?? null,
    voice: input.voice ?? "TEST",
    killOn: input.killOn ?? true,
    roster,
    holidayDates: input.holidayDates,
    realIntent,
    pilotLive: input.pilotLive === true,
    scriptLead: confirmed?.scriptLead ?? findPilotLead(env.leadId, roster),
    chipConnected: confirmed?.chipConnected,
    alreadySent: confirmed?.alreadySent,
    lookupFailed: confirmed?.lookupFailed,
  });
  if (!verdict.allowed) {
    const drop = verdict.reason === "lead_not_on_manual_list" ||
      verdict.reason === "text_mismatch" ||
      verdict.reason === "text_unverified" ||
      verdict.reason === "already_sent_outside_queue";
    return {
      queue: drop
        ? { ...input.queue, pending: input.queue.pending.filter((e) => e.id !== env.id) }
        : input.queue,
      delivered: null,
      realSends: 0,
      reason: verdict.reason,
    };
  }

  const afterDeliver = (
    qIn: OutboundQueueState,
    realSends: number,
    reason: string,
  ): PilotTickResult => {
    let q2 = qIn;
    if (env.kind === "open_bubble1" || env.kind === "resume") {
      const lead = findPilotLead(env.leadId, roster);
      if (lead) q2 = enqueueFollowupBubbles(q2, lead, input.now);
    }
    return { queue: q2, delivered: env, realSends, reason };
  };

  if (input.transport.allowReal === true) {
    const sent = await input.transport.send(env);
    if (!sent.ok) {
      return {
        queue: input.queue,
        delivered: null,
        realSends: 0,
        reason: "transport_failed",
      };
    }
    const q2 = deliverPicked(input.queue, env, input.now, {
      rng: input.rng,
      spacingCfg: DEFAULT_LEAD_SPACING,
    });
    return afterDeliver(
      q2,
      sent.realSend ? 1 : 0,
      sent.realSend ? "real_delivered" : "dry_delivered",
    );
  }

  const q2 = deliverPicked(input.queue, env, input.now, {
    rng: input.rng,
    spacingCfg: DEFAULT_LEAD_SPACING,
  });
  return afterDeliver(q2, 0, "dry_delivered");
}

export async function dryRunPilotUntilIdle(input: {
  goId: string;
  now: Date;
  roster: readonly PilotLead[];
  voice?: VoiceGate;
  killOn?: boolean;
  onlyPhones?: string[];
  holidayDates?: ReadonlySet<string> | null;
  maxTicks?: number;
  advanceMs?: number;
  rng?: () => number;
}): Promise<{
  realSends: number;
  delivered: OutboundEnvelope[];
  plan: PilotPlanResult;
  finalQueue: OutboundQueueState;
}> {
  const plan = planPilotQueue({
    goId: input.goId,
    voice: input.voice ?? "TEST",
    killOn: input.killOn ?? true,
    now: input.now,
    roster: input.roster,
    onlyPhones: input.onlyPhones,
    holidayDates: input.holidayDates,
  });
  if (!plan.allowed) {
    return { realSends: 0, delivered: [], plan, finalQueue: plan.queue };
  }
  const transport = createDryWireTransport();
  let q = plan.queue;
  let now = input.now;
  const delivered: OutboundEnvelope[] = [];
  let realSends = 0;
  const max = input.maxTicks ?? 500;
  const step = input.advanceMs ?? 1_000;
  for (let i = 0; i < max; i++) {
    const tick = await runPilotTick({
      queue: q,
      now,
      transport,
      roster: input.roster,
      goId: input.goId,
      voice: input.voice ?? "TEST",
      killOn: input.killOn ?? true,
      rng: input.rng,
      holidayDates: input.holidayDates,
    });
    q = tick.queue;
    realSends += tick.realSends;
    if (tick.delivered) {
      delivered.push(tick.delivered);
    } else if (
      tick.reason === "none_due" ||
      tick.reason === "waiting_lead_spacing_or_not_before"
    ) {
      now = new Date(now.getTime() + step);
      continue;
    } else {
      break;
    }
    if (q.pending.length === 0) break;
  }
  return { realSends, delivered, plan, finalQueue: q };
}
