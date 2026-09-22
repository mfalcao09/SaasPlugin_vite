// platform-cold-outreach — MOTOR de cold outreach (platform-side), gated OFF.
//
// Orquestra os módulos PUROS de _shared/cold-outreach (anti-ban, segment-gate,
// script, opt-out, persona) sobre os leads raspados (platform_crm_extracted_leads),
// enviando pelo número BURNER via platform-whatsapp-qr-send (WA) ou platform-ig-send (IG).
//
// DUPLO GATE (nada dispara sem o Marcelo):
//   1. campaign.dry_run  (default true)  → simula: gera+enfileira+instrumenta, NÃO envia.
//   2. env COLD_OUTREACH_ENABLED != 'true' → força dry-run mesmo se a campanha pedir real.
// O número burner + o start do warm-up (flip dry_run=false + ENABLED=true) = ativação do Marcelo.
//
// Ações (body.action): 'enqueue' | 'tick' | 'on-inbound' | 'status' | 'harness-plan'.
// harness-plan: Camila Harness v1.2 — plano supervisionado SEMPRE dry-run (0 WhatsApp real).
// Auth interno (verify_jwt=false): Bearer==SERVICE_ROLE_KEY OU x-cold-secret.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  runReservedAgentAction,
  type AgentActionInput,
} from "../_shared/agent-action-ledger.ts";
import {
  canSendNow,
  type KillSwitchStats,
  killSwitch,
  jitterMs,
  warmupDayFromFirstSend,
} from "../_shared/cold-outreach/anti-ban.ts";
import {
  avaliarLifecycle,
  lifecycleDaLinha,
  limparAutorizacaoAoMatar,
} from "../_shared/cold-outreach/campaign-lifecycle.ts";
import {
  type DispatchTier,
  type GateLead,
  passesInstagramGate,
  passesWhatsappGate,
  selectAndOrderForDispatch,
  dispatchTier,
  TIER_ORDER,
} from "../_shared/cold-outreach/segment-gate.ts";
import { assignVariant, type Channel, CAMILA_PROSPECTOR_AGENT_ID, renderOpeningFromDb, renderFollowup, type ScriptTokens, extractApresentarBubbles, fillAgentTemplate, fetchAgentAdditionalPrompt } from "../_shared/cold-outreach/script.ts";
import { planInbound } from "../_shared/cold-outreach/inbound-plan.ts";
import {
  getR2AutoMode,
  isR2Allowlisted,
} from "../_shared/cold-outreach/path-a-flags.ts";
import { pathAColdOpeningGate } from "../_shared/cold-outreach/path-a-reopen-decision.ts";
import { planR2Close, R2_PLAN_VERSION, R2_LINK_PREVIEW, isR2SiteUrl } from "../_shared/cold-outreach/r2-plan.ts";
import { isApprovedForSend, partitionByApproval, UNAPPROVED_SKIP_REASON } from "../_shared/cold-outreach/approved-gate.ts";
import {
  advanceApresentarState,
  APRESENTAR_SEQUENCE_ENABLED,
  buildApresentarState,
  bumpApresentarAfterAutoReply,
  abortApresentarForHuman,
  isApresentarDue,
  nextBubbleText,
  parseApresentarState,
  type ApresentarSequenceState,
} from "../_shared/cold-outreach/apresentar-sequence.ts";
import { validateRealSend, validateWindowForRealSend } from "../_shared/cold-outreach/go-live-gates.ts";
import {
  harnessPlanSupervised,
  harnessPlanAutomaticBlocked,
  harnessPlanConversationOut,
  parseManualList,
  parseAttendanceAction,
  HARNESS_RUNTIME_VERSION,
  harnessAllowsRealWhatsapp,
  readKillOn,
  readVoiceGate,
} from "../_shared/camila-harness/runtime-bridge.ts";
import { loadHarnessHolidayDates } from "../_shared/camila-harness/holidays.ts";
import {
  planPilotQueue,
  RENATA_RESUME_TEXT,
} from "../_shared/camila-harness/pilot-deliver.ts";
import { FIXTURE } from "../_shared/camila-harness/attendance-window.ts";
import {
  legacyCamilaSendersEnabled,
  LEGACY_TICK_RETIRED,
} from "../_shared/camila-harness/legacy-cutover.ts";
import { runHarnessPilotTick } from "../_shared/camila-harness/harness-pilot-tick.ts";
import { coldShouldClassifyText } from "../_shared/camila-harness/harness-job-gate.ts";
import {
  createProductPilotQueueStore,
} from "../_shared/camila-harness/pilot-queue-store.ts";
import { loadPreselectedPilotLeads } from "../_shared/camila-harness/harness-roster-db.ts";
import type { PilotLead } from "../_shared/camila-harness/pilot-roster.ts";

import { ensureLeadForColdOpening } from "../_shared/platform-crm-find-create-lead.ts";
import {
  buildLeadName,
  ensureCanonicalLeadState,
} from "../_shared/platform-crm-lead-context.ts";
import { ensurePlatformLeadInPipeline } from "../_shared/platform-crm-pipeline.ts";
import {
  WA_QR_CHANNEL_CANONICAL,
  WA_QR_CHANNELS,
} from '../_shared/platform-wa-qr-identity.ts';
import {
  buildWaQrConversationIdentity,
  outboundConversationInsertAllowed,
  planWaQrOutboundBind,
  type WaQrConversationRow,
} from "../_shared/wa-qr-conversation-resolve.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cold-secret",
};
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Dia local (America/Sao_Paulo) em YYYY-MM-DD, p/ os contadores diários. */
function spDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** best-effort: instrumenta 1 evento de jornada (nunca lança). */
async function logJourney(
  sb: SupabaseClient,
  productId: string,
  leadId: string | null,
  type: string,
  category: string,
  channel: string,
  title: string,
  payload: Record<string, unknown>,
) {
  try {
    await sb.rpc("pcrm_log_journey_event", {
      p_product: productId,
      p_lead: leadId,
      p_type: type,
      p_category: category,
      p_channel: channel,
      p_source: "cold_outreach",
      p_title: title,
      p_description: null,
      p_payload: payload,
    });
  } catch (_e) { /* best-effort */ }
}

// ── heurística leve pra token [serviço] (sem LLM, determinístico) ────────────
function guessServico(categoria?: string | null, bio?: string | null): string | undefined {
  const hay = `${categoria ?? ""} ${bio ?? ""}`.toLowerCase();
  const map: [RegExp, string][] = [
    [/unha|manicure|nail/, "unha"],
    [/sobrancelha|brow|design/, "sobrancelha"],
    [/cílios|cilios|lash|extens/, "cílios"],
    [/cabelo|escova|coloraç|progressiva|hair|mechas/, "escova"],
    [/maquiag|make/, "maquiagem"],
    [/depila|cera/, "depilação"],
  ];
  for (const [re, s] of map) if (re.test(hay)) return s;
  return undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENQUEUE — segment-gate + ordem de disparo → preenche a fila
// ═══════════════════════════════════════════════════════════════════════════
async function actionEnqueue(sb: SupabaseClient, campaignId: string, limit: number) {
  const { data: campaign } = await sb.from("platform_crm_cold_campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (!campaign) return json({ error: "campaign not found" }, 404);
  const channel = campaign.channel as Channel;
  const productId = campaign.product_id as string;

  // Puxa candidatos por segmento (o gate fino roda no código; o predicado SQL
  // pré-filtra por segmento/exclusão/APROVAÇÃO pra não trazer a base inteira).
  // approved_at IS NOT NULL = portão per-lead da Prospecção (só base aprovada;
  // espelha `platform_crm_consolidated_leads`). NULL = em tratamento → nunca dispara.
  const wantSegment = channel === "instagram" ? "acionamento_via_instagram" : "salao_cliente";
  const { data: rawLeads, error } = await sb
    .from("platform_crm_extracted_leads")
    .select("id, product_id, handle, primeiro_nome, telefone, segment, qualified, phone_is_br, is_seed, seguidores, categoria, bio, excluded_at, approved_at")
    .eq("product_id", productId)
    .eq("segment", wantSegment)
    .is("excluded_at", null)
    .not("approved_at", "is", null)
    .limit(Math.min(limit, 5000));
  if (error) return json({ error: `query leads: ${error.message}` }, 500);

  // opt-out + lixeira: respeita as tabelas de supressão (Art.18).
  const [{ data: optouts }, { data: excluded }] = await Promise.all([
    sb.from("platform_crm_lead_optout").select("telefone, handle").eq("product_id", productId),
    sb.from("platform_crm_lead_excluded").select("handle").eq("product_id", productId),
  ]);
  const optoutPhones = new Set((optouts ?? []).map((o: any) => (o.telefone ?? "").replace(/\D/g, "")).filter(Boolean));
  const optoutHandles = new Set((optouts ?? []).map((o: any) => (o.handle ?? "").toLowerCase()).filter(Boolean));
  const excludedHandles = new Set((excluded ?? []).map((e: any) => (e.handle ?? "").toLowerCase()).filter(Boolean));

  const gate = channel === "instagram" ? passesInstagramGate : passesWhatsappGate;
  const eligible = (rawLeads ?? []).filter((l: any) => {
    if (!gate(l as GateLead).ok) return false;
    const ph = (l.telefone ?? "").replace(/\D/g, "");
    const h = (l.handle ?? "").toLowerCase();
    if (ph && optoutPhones.has(ph)) return false;
    if (h && (optoutHandles.has(h) || excludedHandles.has(h))) return false;
    return true;
  });

  const ordered = channel === "instagram"
    ? eligible
    : selectAndOrderForDispatch(eligible as GateLead[]) as any[];

  let enqueued = 0;
  const byTier: Record<string, number> = { semente_limpa: 0, is_seed: 0, massa: 0 };
  for (const l of ordered) {
    const tier: DispatchTier = channel === "instagram" ? "massa" : dispatchTier(l as GateLead);
    const row = {
      campaign_id: campaignId,
      product_id: productId,
      extracted_lead_id: l.id,
      handle: l.handle ?? null,
      telefone: l.telefone ?? null,
      tier,
      tier_rank: TIER_ORDER[tier], // 0=semente-limpa,1=is_seed,2=massa (ordem correta)
      variant: assignVariant(l.id),
      status: "queued",
      step: 0,
      scheduled_for: null,
    };
    // Dedupe por índice único (campaign, extracted_lead); ignora colisão.
    const { error: insErr } = await sb.from("platform_crm_cold_outreach_queue").insert(row);
    if (!insErr) { enqueued++; byTier[tier] = (byTier[tier] ?? 0) + 1; }
  }
  return json({ ok: true, enqueued, byTier, considered: (rawLeads ?? []).length, eligible: eligible.length });
}

// ── Sequência APRESENTAR (bolhas 2–4) ────────────────────────────────────────
async function loadConversationMeta(sb: SupabaseClient, conversationId: string) {
  const { data } = await sb.from("platform_crm_conversations")
    .select(
      "id, metadata, visitor_phone, visitor_name, wa_qr_instance_id, product_id, current_agent_id, status, lead_id",
    )
    .eq("id", conversationId).maybeSingle();
  return data as Record<string, unknown> | null;
}

type PathAR2InboundResult = {
  delivered: boolean;
  bubblesSent: number;
  deliveredAtIso: string | null;
  lastActionId: string | null;
  planLogged: boolean;
};

/** Path A F6 — R2 close before opt-out/DNC/silence (shadow log; enforce+allowlist sends ≤2). */
async function tryPathAR2OnInbound(
  sb: SupabaseClient,
  a: {
    conversationId: string;
    telefone: string;
    text: string;
    inboundEventId: string;
    productId: string | null;
  },
): Promise<PathAR2InboundResult> {
  const empty: PathAR2InboundResult = {
    delivered: false,
    bubblesSent: 0,
    deliveredAtIso: null,
    lastActionId: null,
    planLogged: false,
  };
  // PRD-12 cutover: R2 auto dead unless LEGACY_CAMILA_SENDERS=1
  if (!legacyCamilaSendersEnabled()) {
    return empty;
  }
  const conv = await loadConversationMeta(sb, a.conversationId);
  if (!conv) return empty;
  const status = String(conv.status ?? "");
  const meta = (conv.metadata && typeof conv.metadata === "object")
    ? conv.metadata as Record<string, unknown>
    : {};
  const dnc = meta.do_not_contact === true || meta.do_not_contact === "true";
  if (status !== "bot_active" || dnc) return empty;

  const phoneDigits = String(a.telefone ?? conv.visitor_phone ?? "").replace(/\D/g, "");
  const mode = getR2AutoMode();
  const lastR2 = typeof meta.last_r2_delivered_at === "string"
    ? meta.last_r2_delivered_at
    : null;
  const greetingName = String(conv.visitor_name ?? "").trim() || null;
  const plan = planR2Close({
    conversationId: a.conversationId,
    eventId: a.inboundEventId,
    optOutText: a.text,
    mode,
    lastR2AtIso: lastR2,
    greetingName,
  });

  if (!plan.shouldPlan) {
    if (mode !== "off" && plan.optOutKind === "soft") {
      console.log(
        `[cold-outreach][r2] skip conversation_id=${a.conversationId} reason=${plan.skipReason ?? "n/a"} mode=${mode}`,
      );
    }
    return { ...empty, planLogged: mode !== "off" && plan.optOutKind !== null };
  }

  const allowlisted = isR2Allowlisted({
    phoneDigits,
    conversationId: a.conversationId,
  });
  const bubbles = plan.bubbles.slice(0, 2);
  const logPayload = {
    mode,
    allowlisted,
    version: R2_PLAN_VERSION,
    idempotency_key: plan.idempotencyKey,
    bubbles: bubbles.length,
    opt_out_kind: plan.optOutKind,
  };

  if (mode === "shadow") {
    console.log(
      `[cold-outreach][r2] shadow plan conversation_id=${a.conversationId} ${JSON.stringify(logPayload)}`,
    );
    return { ...empty, planLogged: true };
  }

  if (mode !== "enforce" || !allowlisted) {
    console.log(
      `[cold-outreach][r2] no-send conversation_id=${a.conversationId} ${JSON.stringify(logPayload)}`,
    );
    return { ...empty, planLogged: true };
  }

  const instanceId = conv.wa_qr_instance_id as string | null;
  const productId = String(a.productId ?? conv.product_id ?? "");
  const agentId = String(conv.current_agent_id ?? CAMILA_PROSPECTOR_AGENT_ID);
  const leadId = conv.lead_id ? String(conv.lead_id) : null;
  if (!instanceId || !productId || !leadId || !phoneDigits) {
    console.error(
      `[cold-outreach][r2] missing send context conversation_id=${a.conversationId}`,
    );
    return { ...empty, planLogged: true };
  }

  const sourceEventId = plan.idempotencyKey ?? `r2-close:${a.conversationId}:${a.inboundEventId}`;
  let bubblesSent = 0;
  let lastActionId: string | null = null;
  for (let i = 0; i < bubbles.length; i++) {
    const bubble = bubbles[i];
    const asLink = isR2SiteUrl(bubble);
    const sendRes = await deliver(sb, {
      channel: "whatsapp",
      dryRun: false,
      productId,
      instanceId,
      to: phoneDigits,
      handle: null,
      text: bubble,
      linkPreview: asLink
        ? {
          linkUrl: R2_LINK_PREVIEW.linkUrl,
          title: R2_LINK_PREVIEW.title,
          linkDescription: R2_LINK_PREVIEW.linkDescription,
          image: R2_LINK_PREVIEW.image,
          linkType: R2_LINK_PREVIEW.linkType,
          message: R2_LINK_PREVIEW.linkUrl,
        }
        : null,
      ledger: {
        leadId,
        conversationId: a.conversationId,
        agentId,
        actionType: "reply",
        proactive: false,
        bubbleCount: 1,
        sourceEventId: `${sourceEventId}:b${i + 1}`,
      },
    });
    if (!sendRes.ok) {
      console.error(
        `[cold-outreach][r2] bubble ${i + 1} failed conversation_id=${a.conversationId} reason=${sendRes.error}`,
      );
      break;
    }
    bubblesSent++;
    lastActionId = sendRes.actionId ?? lastActionId;
    await sb.from("platform_crm_messages").insert({
      conversation_id: a.conversationId,
      direction: "outbound",
      sender_type: "bot",
      content: bubble,
      content_type: asLink ? "link" : "text",
      message_type: asLink ? "link" : "text",
      metadata: {
        channel: WA_QR_CHANNEL_CANONICAL,
        connection_id: instanceId,
        agent_id: agentId,
        delivery_status: "sent",
        origem: "path_a_r2_close",
        path_a_r2: true,
        r2_plan_version: R2_PLAN_VERSION,
        idempotency_key: sourceEventId,
        wamid: sendRes.wamid ?? null,
        action_id: sendRes.actionId ?? null,
        ...(asLink
          ? {
            link_preview: true,
            link_url: R2_LINK_PREVIEW.linkUrl,
            link_title: R2_LINK_PREVIEW.title,
            link_image: R2_LINK_PREVIEW.image,
          }
          : {}),
      },
    });
  }

  if (bubblesSent === 0) {
    return { ...empty, planLogged: true };
  }

  const deliveredAtIso = new Date().toISOString();
  console.log(
    `[cold-outreach][r2] delivered conversation_id=${a.conversationId} bubbles=${bubblesSent} ${JSON.stringify(logPayload)}`,
  );
  return {
    delivered: true,
    bubblesSent,
    deliveredAtIso,
    lastActionId,
    planLogged: true,
  };
}

async function saveApresentarState(sb: SupabaseClient, conversationId: string, meta: Record<string, unknown>, state: ApresentarSequenceState | null) {
  const next = { ...meta };
  if (state && state.status === "in_progress") {
    next.apresentar_sequence = state;
  } else {
    delete next.apresentar_sequence;
  }
  await sb.from("platform_crm_conversations").update({ metadata: next, updated_at: new Date().toISOString() }).eq("id", conversationId);
}

async function startApresentarSequence(
  sb: SupabaseClient,
  o: { conversationId: string; campaignId: string; queueId: string; agentId: string; tokens: ScriptTokens },
) {
  if (!APRESENTAR_SEQUENCE_ENABLED) {
    // Corte 2026-09-15: opening = bolha 1 only; sem agenda 2–4.
    return;
  }
  try {
    const prompt = await fetchAgentAdditionalPrompt(sb, o.agentId);
    const bubbles = extractApresentarBubbles(prompt);
    const bubbles234 = bubbles.slice(1, 4).map((b) => fillAgentTemplate(b, o.tokens));
    if (bubbles234.length === 0) return;
    const conv = await loadConversationMeta(sb, o.conversationId);
    if (!conv) return;
    const meta = (conv.metadata && typeof conv.metadata === "object") ? conv.metadata as Record<string, unknown> : {};
    const state = buildApresentarState({
      campaignId: o.campaignId,
      queueId: o.queueId,
      agentId: o.agentId,
      bubbles234,
    });
    await saveApresentarState(sb, o.conversationId, meta, state);
  } catch (e) {
    console.error("[platform-cold-outreach] startApresentarSequence falhou:", String(e).slice(0, 200));
  }
}

async function processApresentarSteps(sb: SupabaseClient, now: Date, envEnabled: boolean) {
  // PRD-12: apresentar retired unless LEGACY_CAMILA_SENDERS=1
  if (!legacyCamilaSendersEnabled() || !APRESENTAR_SEQUENCE_ENABLED) {
    return [{ action: "apresentar_retired", legacy: false }];
  }
  const { data: rows } = await sb
    .from("platform_crm_conversations")
    .select("id, metadata, visitor_phone, wa_qr_instance_id, product_id, current_agent_id, lead_id")
    .filter("metadata->apresentar_sequence->>status", "eq", "in_progress")
    .limit(20);
  const results: any[] = [];
  if (!APRESENTAR_SEQUENCE_ENABLED) {
    // Drain: aborta estados legados sem chamar provider.
    for (const conv of rows ?? []) {
      const meta = (conv.metadata ?? {}) as Record<string, unknown>;
      const state = parseApresentarState(meta);
      if (!state) continue;
      const aborted = abortApresentarForHuman(state, now);
      await saveApresentarState(sb, String(conv.id), meta, aborted);
      results.push({ conversation_id: conv.id, action: "apresentar_aborted_disabled" });
    }
    return results;
  }
  for (const conv of rows ?? []) {
    const meta = (conv.metadata ?? {}) as Record<string, unknown>;
    const state = parseApresentarState(meta);
    if (!state || !isApresentarDue(state, now)) continue;
    const text = nextBubbleText(state);
    if (!text) continue;
    const phone = String(conv.visitor_phone ?? "").replace(/\D/g, "");
    const instanceId = conv.wa_qr_instance_id as string | null;
    const productId = conv.product_id as string;
    if (!phone || !instanceId || !productId) continue;
    const sendRes = await deliver(sb, {
      channel: "whatsapp",
      dryRun: !envEnabled,
      productId,
      instanceId,
      to: phone,
      handle: null,
      text,
      ledger: conv.lead_id && conv.current_agent_id
        ? {
          leadId: String(conv.lead_id),
          conversationId: String(conv.id),
          agentId: String(conv.current_agent_id),
          actionType: "opening_part",
          proactive: true,
          bubbleCount: 1,
          sourceEventId: `${state.queue_id || conv.id}:apresentar:${state.last_sent + 1}`,
        }
        : undefined,
    });
    if (!sendRes.ok) {
      results.push({ conversation_id: conv.id, action: "apresentar_failed", error: sendRes.error });
      continue;
    }
    const newState = advanceApresentarState(state, now);
    await saveApresentarState(sb, String(conv.id), meta, newState.status === "in_progress" ? newState : null);
    await sb.from("platform_crm_messages").insert({
      conversation_id: conv.id,
      direction: "outbound",
      sender_type: "bot",
      content: text,
      content_type: "text",
      message_type: "text",
      metadata: {
        channel: WA_QR_CHANNEL_CANONICAL,
        connection_id: instanceId,
        agent_id: state.agent_id,
        delivery_status: "sent",
        origem: "cold_outreach_apresentar",
        campaign_id: state.campaign_id,
        apresentar_step: newState.last_sent,
        wamid: sendRes.wamid ?? null,
        action_id: sendRes.actionId ?? null,
      },
    });
    results.push({ conversation_id: conv.id, action: "apresentar_sent", step: newState.last_sent, done: newState.status === "done" });
  }
  return results;
}

async function updateApresentarOnInbound(sb: SupabaseClient, conversationId: string, plan: ReturnType<typeof planInbound>) {
  const conv = await loadConversationMeta(sb, conversationId);
  if (!conv) return;
  const meta = (conv.metadata && typeof conv.metadata === "object") ? conv.metadata as Record<string, unknown> : {};
  const state = parseApresentarState(meta);
  if (!state) return;
  const now = new Date();
  // Abordagem incompleta: NÃO aborta — completa bolhas 2–4 mesmo com reply humano.
  // (Produto 2026-09-15: se a abertura já saiu, o script deve terminar.)
  if (plan.abortApresentar && state.pending.length > 0) {
    const next = bumpApresentarAfterAutoReply(state, now);
    meta.apresentar_finish_despite_inbound = true;
    await saveApresentarState(sb, conversationId, meta, next);
    return;
  }
  if (plan.abortApresentar) {
    abortApresentarForHuman(state, now);
    await saveApresentarState(sb, conversationId, meta, null);
    return;
  }
  if (plan.bumpApresentar) {
    const next = bumpApresentarAfterAutoReply(state, now);
    await saveApresentarState(sb, conversationId, meta, next);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TICK — anti-ban gate + envio (dry-run OU real) + follow-ups
// ═══════════════════════════════════════════════════════════════════════════
async function actionTick(sb: SupabaseClient, onlyCampaign: string | null, envEnabled: boolean) {
  const now = new Date();
  const apresentarResults = await processApresentarSteps(sb, now, envEnabled);
  // Traz TODOS os estados não-terminais — inclusive `draft` e `paused`.
  //
  // Antes filtrava `in (active, warming)`, e era esse filtro que esvaziava o
  // portão: `canSendNow` recebia `campaignPaused: status === "paused"`, que nunca
  // podia ser verdadeiro porque `paused` já havia sido removido aqui. Um portão
  // cujo insumo o filtro anterior tornou impossível é decoração.
  //
  // Agora quem decide é `avaliarLifecycle`, e o tick RELATA por que cada campanha
  // não disparou (`lifecycle:nao_autorizada`, `lifecycle:aguardando_agendamento`).
  // O custo é uma avaliação pura por campanha; o retorno antecipado em
  // `tickCampaign` evita as duas leituras de contadores das que não estão armadas.
  // `killed` e `completed` ficam de fora: terminais não precisam de tick.
  const q = sb.from("platform_crm_cold_campaigns").select("*")
    .in("status", ["draft", "warming", "active", "paused"]);
  const { data: campaigns } = onlyCampaign ? await q.eq("id", onlyCampaign) : await q;
  const results: any[] = [];

  for (const c of campaigns ?? []) {
    results.push(await tickCampaign(sb, c, now, envEnabled));
  }
  return json({ ok: true, now: now.toISOString(), apresentar: apresentarResults, campaigns: results });
}

/**
 * BLOQUEANTE #3 (auditoria 2026-08-06): o teto diário EVAPORAVA no dia em que o
 * burner era atribuído à campanha.
 *
 * Era `.or(instance_id.eq.X, instance_id.is.null)` + `.maybeSingle()`. Rodando em
 * dry-run com instance_id NULL e depois recebendo o burner, existem DUAS linhas no
 * mesmo (campaign, day). `maybeSingle` com 2 linhas devolve erro PGRST116 — e o
 * código só desestruturava `{ data }`, DESCARTANDO o erro. `counters` virava null,
 * `sentToday` virava 0 em TODO tick, e `canSendNow` nunca mais devolvia
 * daily_cap_reached: cap de 20/dia virava ~540/dia (60/h × 9h de janela).
 * Efeito permanente no health (que não tem coluna `day`): first_send_at lido como
 * null, `killed` nunca lido, `consecutive_failures` nunca acumulando — o
 * kill-switch por falha morria junto.
 *
 * Correção: buscar TODAS as linhas e agregar.
 *  - counters: SOMA. Duas linhas são dois baldes do MESMO dia da MESMA campanha;
 *    somar nunca subestima o que já saiu.
 *  - health: a leitura mais CONSERVADORA — first_send_at mais ANTIGO (trocar de
 *    instância não pode reiniciar o aquecimento), maior consecutive_failures, e
 *    `killed` verdadeiro se QUALQUER linha estiver morta.
 * E o erro deixa de ser descartado: sem leitura confiável, o tick ABORTA em vez de
 * seguir com zero. Silêncio que vira permissão foi o defeito.
 */
async function loadHealthAndCounters(sb: SupabaseClient, campaignId: string, instanceId: string | null, day: string) {
  const filtro = `instance_id.eq.${instanceId ?? ZERO_UUID},instance_id.is.null`;

  const { data: healthRows, error: healthErr } = await sb
    .from("platform_crm_cold_instance_health").select("*")
    .eq("campaign_id", campaignId)
    .or(filtro);
  const { data: counterRows, error: countersErr } = await sb
    .from("platform_crm_cold_daily_counters").select("*")
    .eq("campaign_id", campaignId).eq("day", day)
    .or(filtro);

  // Leitura falhada NÃO pode virar "zero enviado hoje" — era assim que o teto sumia.
  if (healthErr || countersErr) {
    console.error("[cold-outreach] LEITURA DE CONTADORES FALHOU — tick abortado", {
      campaign_id: campaignId, day,
      health_error: healthErr?.message, counters_error: countersErr?.message,
    });
    return { health: null, counters: null, leituraFalhou: true };
  }

  const hs = (healthRows ?? []) as any[];
  const cs = (counterRows ?? []) as any[];

  const health = hs.length === 0 ? null : {
    first_send_at: hs.map((h) => h.first_send_at).filter(Boolean).sort()[0] ?? null,
    consecutive_failures: Math.max(0, ...hs.map((h) => h.consecutive_failures ?? 0)),
    killed: hs.some((h) => h.killed === true),
    killed_reason: hs.find((h) => h.killed)?.killed_reason ?? null,
  };

  const soma = (k: string) => cs.reduce((a: number, r: any) => a + (r[k] ?? 0), 0);
  const counters = cs.length === 0 ? null : {
    sent_count: soma("sent_count"),
    // delivered_count entrou aqui tarde: quando redesenhei esta função (bloqueante
    // #3) ele não era usado por ninguém e ficou de fora. O typecheck pegou ao
    // ligar a regra de não-entrega — e o modo de falha seria SILENCIOSO: campo
    // ausente ⇒ `delivered` undefined ⇒ a regra se cala pra sempre, com aparência
    // de mecanismo pronto.
    delivered_count: soma("delivered_count"),
    blocked_count: soma("blocked_count"),
    reported_count: soma("reported_count"),
    failed_count: soma("failed_count"),
  };

  return { health, counters, leituraFalhou: false };
}

async function tickCampaign(sb: SupabaseClient, c: any, now: Date, envEnabled: boolean) {
  const productId = c.product_id as string;
  const channel = c.channel as Channel;
  const instanceId: string | null = c.instance_id ?? null;
  const dryRun = c.dry_run !== false || !envEnabled; // duplo gate
  const day = spDay(now);
  const warmup = c.warmup_config ?? { startPerDay: 20, doublingEveryDays: 2, maxPerDay: 200 };
  const windowCfg = c.window_config ?? { startHour: 9, endHour: 18, days: [1, 2, 3, 4, 5], timeZone: "America/Sao_Paulo" };
  const jitterCfg = c.jitter_config ?? { minMs: 40000, maxMs: 180000 };
  const killCfg = c.killswitch_config ?? { maxBlockRate: 0.05, maxReportRate: 0.02, minSample: 20, maxConsecutiveFailures: 10 };

  // ═══════════════════════════════════════════════════════════════════════════
  // PORTÃO 0 — CICLO DE VIDA: a campanha está ARMADA?
  //
  // Vem antes de TUDO, inclusive da leitura de contadores, por dois motivos:
  //  1. correção — nenhum efeito colateral deve ocorrer para campanha desarmada;
  //  2. custo — evita duas queries por campanha que não vai disparar mesmo.
  //
  // "Armada" é estado disparável + carimbo de autorização + vigência corrente.
  // Um `status='active'` gravado por UPDATE, sem carimbo, morre aqui — que é
  // exatamente o caso da campanha `TESTE Gate G` (2026-08-07): configuração de
  // teste armada como produção, disparando ao primeiro lead que entrasse na fila.
  // ═══════════════════════════════════════════════════════════════════════════
  const lifecycle = avaliarLifecycle(lifecycleDaLinha(c), now);
  if (!lifecycle.armada) {
    // Vigência vencida é o único caso em que o motor PERSISTE a transição: a
    // campanha acabou sozinha, e deixá-la `active` faria o tick reavaliá-la para
    // sempre — e o operador leria "ativa" para algo encerrado.
    if (lifecycle.transicao === "completed") {
      await sb.from("platform_crm_cold_campaigns")
        .update({ status: "completed", updated_at: now.toISOString() })
        .eq("id", c.id);
    }
    return { campaign: c.id, action: "skip", reason: `lifecycle:${lifecycle.motivo}`, transicao: lifecycle.transicao };
  }

  // F4 — go-live gates: impede envio real acidental em campanha piloto / janela 24/7.
  const campaignWantsReal = c.dry_run === false;
  if (campaignWantsReal) {
    const realGate = validateRealSend({
      campaignName: String(c.name ?? ""),
      dryRun: dryRun,
      envEnabled,
      allowRealSendEnv: Deno.env.get("ALLOW_REAL_SEND"),
    });
    if (!realGate.allowed) {
      return { campaign: c.id, action: "skip", reason: `go_live:${realGate.reason}` };
    }
    const winGate = validateWindowForRealSend(windowCfg, Deno.env.get("ALLOW_PERMISSIVE_WINDOW"));
    if (!winGate.allowed) {
      return { campaign: c.id, action: "skip", reason: `go_live:${winGate.reason}` };
    }
  }

  const { health, counters, leituraFalhou } = await loadHealthAndCounters(sb, c.id, instanceId, day);
  // Sem contador confiável não há teto. Calar é o erro barato; disparar é o caro.
  if (leituraFalhou) {
    return { campaign: c.id, action: "abort", reason: "counters_read_failed" };
  }
  const firstSendAt = health?.first_send_at ? new Date(health.first_send_at) : null;
  const warmupDay = warmupDayFromFirstSend(firstSendAt, now);
  const sentToday = counters?.sent_count ?? 0;
  const killStats: KillSwitchStats = {
    sent: sentToday,
    blocked: counters?.blocked_count ?? 0,
    reported: counters?.reported_count ?? 0,
    consecutiveFailures: health?.consecutive_failures ?? 0,
    // ELO FINAL da cadeia do wamid. Sem esta linha, tudo o mais é decorativo: o
    // webhook grava delivered_count e a regra nunca o vê.
    //
    // `?? undefined` e NÃO `?? 0`, deliberadamente: sem linha de contador, a
    // regra recebe undefined e SE CALA (anti-ban.ts só opina com `number`).
    // Com `?? 0` ela leria "zero entregas" = 100% de não-entrega e PAUSARIA
    // CAMPANHA SAUDÁVEL no primeiro tick. Fonte errada é pior que fonte ausente.
    delivered: counters?.delivered_count ?? undefined,
  };

  // Kill-switch: se já tripou, marca a campanha killed e para.
  const kill = killSwitch(killStats, killCfg);
  if (kill.tripped || health?.killed) {
    // Matar LIMPA o carimbo de autorização. Sem isso, `killed` seria reversível
    // por um UPDATE de uma palavra (`status='active'`) e o kill-switch viraria um
    // aviso, não um freio. Agora reativar exige um humano carimbar de novo — que
    // é o ponto onde ele lê o motivo da morte.
    await sb.from("platform_crm_cold_campaigns")
      .update(limparAutorizacaoAoMatar(kill.reason ?? "kill_switch", now))
      .eq("id", c.id);
    await upsertHealth(sb, c.id, instanceId, { killed: true, killed_reason: kill.reason, killed_at: now.toISOString() });
    return { campaign: c.id, action: "killed", reason: kill.reason };
  }

  // BLOQUEANTE #4 (auditoria 2026-08-06): os FOLLOW-UPS não passavam pelo portão.
  // `processFollowups` rodava AQUI, ANTES de `canSendNow`, e não consultava janela
  // comercial nem teto de warm-up: até 5 por tick × cron de 1 minuto = 300/hora,
  // 24h/dia, 7 dias/semana — às 3h da manhã de domingo. E ainda consumiam a cota da
  // abertura (bumpCounter sent:1) sem obedecer a ela: gastavam o teto sem respeitá-lo.
  // É a forma EXATA do incidente do outro canal (4 mensagens em 23h a quem
  // respondeu uma palavra).
  //
  // Agora o portão vem PRIMEIRO e vale para os dois caminhos. Follow-up é mensagem
  // não solicitada igual à abertura — não há razão para ter freio diferente.

  // BLOQUEANTE #1 (auditoria 2026-08-06): o kill-switch por taxa NUNCA pode
  // disparar. Ele compara blocked/sent > 5% e reported/sent > 2%, mas NADA em todo
  // o repositório incrementa `blocked_count` ou `reported_count` — `bumpCounter` só
  // é chamado com {sent} e {failed}. As taxas são sempre 0/N.
  // E o único gatilho vivo (10 falhas de API seguidas) NÃO mede bloqueio: quando
  // uma pessoa bloqueia o número no WhatsApp, o envio continua retornando SUCESSO.
  // Ou seja: a proteção que dá nome à camada anti-ban é decorativa.
  //
  // Alimentar essas taxas exige instrumentar o webhook da Evolution (sinal de
  // bloqueio/denúncia) — trabalho real, não one-liner, e fora do escopo deste fix.
  // O que NÃO se pode é seguir dando falsa segurança: enquanto o numerador for
  // sempre zero, o motor DECLARA a cada envio real que opera sem essa proteção.
  // Alerta silencioso é como o incidente do outro canal passou despercebido.
  if (!dryRun && (counters?.blocked_count ?? 0) === 0 && (counters?.reported_count ?? 0) === 0 && sentToday >= (killCfg.minSample ?? 20)) {
    console.warn("[cold-outreach] ⚠️ ANTI-BAN POR TAXA INOPERANTE — blocked/reported nunca são alimentados", {
      campaign_id: c.id, instance_id: instanceId, sent_today: sentToday,
      detalhe: "kill-switch por bloqueio/denúncia não pode disparar; só resta consecutive_failures, que NÃO detecta bloqueio",
    });
  }

  // 1) Portão anti-ban, ANTES de qualquer envio (abertura OU follow-up).
  const gate = canSendNow({
    now, window: windowCfg, warmup, warmupDay, sentToday,
    killStats, killCfg, lifecycle,
  });
  if (!gate.canSend) {
    return { campaign: c.id, action: "skip", reason: gate.reason, remaining: gate.remaining, followups: null };
  }

  // 2) FOLLOW-UPS vencidos (status='sent', next_followup_at <= now) — só depois
  //    de o portão liberar.
  const followupResult = await processFollowups(sb, c, now, dryRun, channel, productId, instanceId, day);

  // 3) Claim 1 lead 'queued' devido (scheduled_for null ou <= now), ordem da fila.
  const { data: due } = await sb
    .from("platform_crm_cold_outreach_queue")
    .select("*")
    .eq("campaign_id", c.id).eq("status", "queued")
    .or(`scheduled_for.is.null,scheduled_for.lte.${now.toISOString()}`)
    .order("tier_rank", { ascending: true }) // 26 semente-limpa → 66 is_seed → massa
    .order("created_at", { ascending: true })
    .limit(1).maybeSingle();
  if (!due) return { campaign: c.id, action: "idle", reason: "no_due_queued", remaining: gate.remaining, followups: followupResult };

  // Lock otimista: queued -> sending (idempotente entre ticks concorrentes).
  const { data: locked } = await sb
    .from("platform_crm_cold_outreach_queue")
    .update({ status: "sending", attempts: (due.attempts ?? 0) + 1, updated_at: now.toISOString() })
    .eq("id", due.id).eq("status", "queued").select("id").maybeSingle();
  if (!locked) return { campaign: c.id, action: "raced", followups: followupResult };

  // Path A (PRD-10): mesma matriz do webhook — 0 opening se cold_suppressed /
  // soft ativo / cold_not_before / conversa bot_active. Sem segundo classificador.
  if (due.conversation_id) {
    const { data: pathAConv } = await sb
      .from("platform_crm_conversations")
      .select("status, metadata")
      .eq("id", due.conversation_id)
      .maybeSingle();
    if (pathAConv) {
      const meta =
        pathAConv.metadata && typeof pathAConv.metadata === "object"
          ? pathAConv.metadata as Record<string, unknown>
          : {};
      const pathAGate = pathAColdOpeningGate({
        dncHard: meta.dnc_hard === true,
        coldSuppressed: meta.cold_suppressed === true || meta.do_not_contact === true,
        softOptOutActive: meta.soft_opt_out_active === true ||
          meta.do_not_contact === true,
        conversationStatus: String(pathAConv.status ?? ""),
        coldNotBeforeIso: typeof meta.cold_not_before === "string"
          ? meta.cold_not_before
          : null,
        nowIso: now.toISOString(),
      });
      if (!pathAGate.allowed) {
        await sb.from("platform_crm_cold_outreach_queue").update({
          status: "skipped",
          skip_reason: `path_a_${pathAGate.reason}`.slice(0, 120),
          updated_at: now.toISOString(),
        }).eq("id", due.id);
        return {
          campaign: c.id,
          action: "skipped_path_a",
          reason: pathAGate.reason,
          lead: due.id,
          remaining: gate.remaining,
          followups: followupResult,
        };
      }
    }
  }

  // SEND-BOUNDARY recheck (defense-in-depth): o lead AINDA está aprovado?
  // O gate de enqueue já filtra approved_at, mas esta linha pode predatar o gate
  // ou o lead pode ter sido DES-aprovado após enfileirado. Sem approved_at → NÃO
  // envia: marca 'skipped' (mesmo padrão do skip de deliver abaixo) e segue.
  const leadId = due.extracted_lead_id as string | null | undefined;
  let approvedAt: string | null | undefined = null;
  if (leadId) {
    const { data: leadApproval } = await sb.from("platform_crm_extracted_leads")
      .select("approved_at").eq("id", leadId).maybeSingle();
    approvedAt = leadApproval?.approved_at ?? null;
  }
  if (!isApprovedForSend(approvedAt)) {
    await sb.from("platform_crm_cold_outreach_queue")
      .update({ status: "skipped", skip_reason: UNAPPROVED_SKIP_REASON, updated_at: now.toISOString() })
      .eq("id", due.id);
    return { campaign: c.id, action: "skipped_unapproved", lead: due.id, remaining: gate.remaining, followups: followupResult };
  }

  // Render da abertura: WhatsApp SEMPRE do additional_prompt do agente (Camila).
  // Fail closed — nunca cai no template hardcoded stale ("da Nexvy 🌿").
  const tokens = await buildTokens(sb, c, due);
  const agentId = (c.agent_id as string | null | undefined) ?? CAMILA_PROSPECTOR_AGENT_ID;
  let text: string;
  try {
    text = await renderOpeningFromDb(sb, channel, tokens, {
      agentId,
      variant: due.variant ?? undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("platform_crm_cold_outreach_queue").update({
      status: "failed",
      last_error: `opening_from_db: ${msg}`.slice(0, 400),
      updated_at: now.toISOString(),
    }).eq("id", due.id);
    return {
      campaign: c.id,
      action: "opening_render_failed",
      lead: due.id,
      error: msg,
      followups: followupResult,
    };
  }

  // Abertura real só cruza o provider depois de existir lead + estado canônico.
  // Dry-run continua sem inventar registros de CRM.
  const nomeReal = tokens.nome && tokens.nome !== "tudo bem?" ? tokens.nome : null;
  let crmLeadId = typeof due.lead_id === "string" && due.lead_id ? due.lead_id : null;
  if (!dryRun && channel === "whatsapp") {
    crmLeadId = crmLeadId ?? await ensureLeadForColdOpening(sb, {
      phone: String(due.telefone ?? ""),
      pushName: nomeReal,
      productId,
    });
    if (!crmLeadId) {
      await sb.from("platform_crm_cold_outreach_queue").update({
        status: "failed",
        last_error: "canonical_lead_unavailable",
        updated_at: now.toISOString(),
      }).eq("id", due.id);
      return { campaign: c.id, action: "canonical_lead_unavailable", lead: due.id, followups: followupResult };
    }
    await ensurePlatformLeadInPipeline(sb, crmLeadId);
    if (!await ensureCanonicalLeadState(sb, crmLeadId, productId)) {
      await sb.from("platform_crm_cold_outreach_queue").update({
        status: "failed",
        lead_id: crmLeadId,
        last_error: "canonical_state_unavailable",
        updated_at: now.toISOString(),
      }).eq("id", due.id);
      return { campaign: c.id, action: "canonical_state_unavailable", lead: due.id, followups: followupResult };
    }
    await sb.from("platform_crm_cold_outreach_queue")
      .update({ lead_id: crmLeadId, updated_at: now.toISOString() })
      .eq("id", due.id);
  }

  // Conversa com lead_id + identidade canônica ANTES do provider.
  // Senão o fromMe do webhook nasce órfã (visitor_id com 9º) e o persist
  // posterior abre uma segunda row (visitor_id sem 9º). Edna 2026-08-18.
  let openingConversationId: string | null = null;
  if (!dryRun && channel === "whatsapp" && crmLeadId) {
    openingConversationId = await ensureColdOpeningConversation(sb, {
      productId,
      instanceId,
      telefone: String(due.telefone ?? ""),
      nome: nomeReal,
      leadId: crmLeadId,
      agentId: c.agent_id ?? null,
    });
    if (!openingConversationId) {
      await sb.from("platform_crm_cold_outreach_queue").update({
        status: "failed",
        last_error: "canonical_conversation_unavailable",
        updated_at: now.toISOString(),
      }).eq("id", due.id);
      return {
        campaign: c.id,
        action: "canonical_conversation_unavailable",
        lead: due.id,
        followups: followupResult,
      };
    }
  }

  const sendRes = await deliver(sb, {
    channel,
    dryRun,
    productId,
    instanceId,
    to: due.telefone,
    handle: due.handle,
    text,
    ledger: crmLeadId
      ? {
        leadId: crmLeadId,
        conversationId: openingConversationId ?? due.conversation_id ?? null,
        agentId,
        actionType: "opening",
        proactive: true,
        bubbleCount: 1,
        sourceEventId: String(due.id),
      }
      : undefined,
  });

  if (sendRes.ok) {
    const followupDelayH = 48; // D+2
    // Mensagem da abertura só depois do send (wamid). A conversa já existe.
    const inboxConversationId = (!dryRun && channel === "whatsapp" && openingConversationId)
      ? await persistOpeningMessage(sb, {
        conversationId: openingConversationId,
        instanceId,
        text,
        agentId: c.agent_id ?? null,
        campaignId: c.id,
        variant: due.variant ?? null,
        actionId: sendRes.actionId ?? null,
        wamid: sendRes.wamid ?? null,
      })
      : openingConversationId;
    await sb.from("platform_crm_cold_outreach_queue").update({
      status: "sent", sent_at: now.toISOString(), last_outreach_at: now.toISOString(),
      next_followup_at: new Date(now.getTime() + followupDelayH * 3_600_000).toISOString(),
      conversation_id: sendRes.conversationId ?? inboxConversationId ?? due.conversation_id ?? null,
      updated_at: now.toISOString(),
    }).eq("id", due.id);

    // BLOQUEANTE #2 (auditoria 2026-08-06): o DRY-RUN queimava o relógio do
    // aquecimento. `deliver()` devolve ok:true em dry-run, e este caminho de
    // sucesso gravava `first_send_at` e incrementava o contador IGUAL a um envio
    // real. Como `warmupDayFromFirstSend` conta dias corridos desde first_send_at,
    // uma campanha validada 9 dias em dry-run — que é EXATAMENTE o fluxo de
    // validação que se recomendaria — chegaria ao primeiro dia real já no "dia 9"
    // e liberaria 200 mensagens em vez de 20. O chip novo não faria aquecimento
    // nenhum, e o relógio teria sido gasto em simulação.
    if (!dryRun) {
      await bumpCounter(sb, c.id, instanceId, day, { sent: 1 });
      await upsertHealth(sb, c.id, instanceId, { first_send_at: firstSendAt ? undefined : now.toISOString(), consecutive_failures: 0 });
    }
    await logJourney(sb, productId, due.lead_id ?? null, "message_sent", "contact", channel, "Cold: abertura enviada", {
      campaign_id: c.id, step: 0, tier: due.tier, handle: due.handle, dry_run: dryRun, variant: due.variant,
    });
    // finalidade LGPD: só flipa no envio REAL (dry-run preserva audiencia_ads).
    if (!dryRun && due.extracted_lead_id) {
      await sb.from("platform_crm_extracted_leads").update({ finalidade: "prospeccao_comercial_b2b" }).eq("id", due.extracted_lead_id);
    }
    if (!dryRun && channel === "whatsapp" && inboxConversationId) {
      await startApresentarSequence(sb, {
        conversationId: inboxConversationId,
        campaignId: c.id,
        queueId: due.id,
        agentId,
        tokens,
      });
    }
    // Jitter: espaça a PRÓXIMA abertura da fila.
    await scheduleNext(sb, c.id, now, jitterMs(jitterCfg));
    return { campaign: c.id, action: dryRun ? "sent_dry" : "sent", lead: due.id, remaining: gate.remaining - 1, followups: followupResult };
  } else if (sendRes.manual) {
    // IG cold (sem PSID): não é falha — fica pronto pra DM manual, sem tripar kill-switch.
    await sb.from("platform_crm_cold_outreach_queue").update({ status: "skipped", skip_reason: sendRes.error, updated_at: now.toISOString() }).eq("id", due.id);
    return { campaign: c.id, action: "ig_manual", lead: due.id, followups: followupResult };
  } else {
    const consec = (health?.consecutive_failures ?? 0) + 1;
    await sb.from("platform_crm_cold_outreach_queue").update({ status: "failed", last_error: sendRes.error?.slice(0, 400), updated_at: now.toISOString() }).eq("id", due.id);
    await bumpCounter(sb, c.id, instanceId, day, { failed: 1 });
    await upsertHealth(sb, c.id, instanceId, { consecutive_failures: consec });
    return { campaign: c.id, action: "send_failed", lead: due.id, error: sendRes.error, followups: followupResult };
  }
}

async function processFollowups(sb: SupabaseClient, c: any, now: Date, dryRun: boolean, channel: Channel, productId: string, instanceId: string | null, day: string) {
  const maxFollowups = channel === "whatsapp" ? 2 : 1;
  const { data: dueFollowups } = await sb
    .from("platform_crm_cold_outreach_queue").select("*")
    .eq("campaign_id", c.id).eq("status", "sent")
    .lte("next_followup_at", now.toISOString())
    .lt("followups_sent", maxFollowups)
    .order("next_followup_at", { ascending: true })
    .limit(5);

  // SEND-BOUNDARY recheck (batch, defense-in-depth): quais desses leads seguem
  // APROVADOS agora? 1 query (.in) evita N+1. Lead des-aprovado após o envio da
  // abertura NÃO recebe follow-up: para a cadência (next_followup_at=null) + skip_reason.
  const rowsF = (dueFollowups ?? []) as any[];
  const leadIds = [...new Set(rowsF.map((f) => f.extracted_lead_id).filter(Boolean) as string[])];
  const approvedLeadIds = new Set<string>();
  if (leadIds.length) {
    const { data: approvedRows } = await sb.from("platform_crm_extracted_leads")
      .select("id").in("id", leadIds).not("approved_at", "is", null);
    for (const r of approvedRows ?? []) approvedLeadIds.add(r.id as string);
  }
  const { sendable, skip: unapproved } = partitionByApproval(rowsF, approvedLeadIds);
  for (const f of unapproved) {
    await sb.from("platform_crm_cold_outreach_queue")
      .update({ next_followup_at: null, skip_reason: UNAPPROVED_SKIP_REASON, updated_at: now.toISOString() })
      .eq("id", f.id);
  }

  let sent = 0;
  for (const f of sendable) {
    const step = (f.followups_sent ?? 0) + 1; // 1=D+2, 2=breakup
    const tokens = await buildTokens(sb, c, f);
    const text = renderFollowup(channel, step as 1 | 2, tokens, f.variant ?? undefined);
    const res = await deliver(sb, {
      channel,
      dryRun,
      productId,
      instanceId,
      to: f.telefone,
      handle: f.handle,
      text,
      ledger: f.lead_id && f.conversation_id && c.agent_id
        ? {
          leadId: String(f.lead_id),
          conversationId: String(f.conversation_id),
          agentId: String(c.agent_id),
          actionType: "followup",
          proactive: true,
          bubbleCount: 1,
          sourceEventId: `${f.id}:followup:${step}`,
        }
        : undefined,
    });
    if (res.ok) {
      const isLast = step >= maxFollowups;
      const nextDelayH = step === 1 ? 60 : 0; // D+2 -> D+4/5 (48+60=108h)
      await sb.from("platform_crm_cold_outreach_queue").update({
        followups_sent: step, last_outreach_at: now.toISOString(),
        next_followup_at: isLast ? null : new Date(now.getTime() + nextDelayH * 3_600_000).toISOString(),
        status: "sent", updated_at: now.toISOString(),
      }).eq("id", f.id);
      // BLOQUEANTE #2, mesmo defeito no caminho do follow-up: dry-run não pode
      // consumir cota nem envelhecer o aquecimento.
      if (!dryRun) await bumpCounter(sb, c.id, instanceId, day, { sent: 1 });
      await logJourney(sb, productId, f.lead_id ?? null, "cadence_step_sent", "contact", channel, `Cold: follow-up ${step}`, {
        campaign_id: c.id, step, tier: f.tier, handle: f.handle, dry_run: dryRun,
      });
      sent++;
    } else if (res.manual) {
      // IG manual: para a cadência automática (o operador segue o DM na mão).
      await sb.from("platform_crm_cold_outreach_queue").update({ next_followup_at: null, skip_reason: res.error, updated_at: now.toISOString() }).eq("id", f.id);
    }
  }
  return { processed: rowsF.length, sent, skippedUnapproved: unapproved.length };
}

// ── entrega (dry-run curto-circuita o envio real) ────────────────────────────
async function deliver(
  sb: SupabaseClient,
  a: {
    channel: Channel;
    dryRun: boolean;
    productId: string;
    instanceId: string | null;
    to: string | null;
    handle: string | null;
    text: string;
    /** Z-API /send-link preview (R2 site bubble). */
    linkPreview?: {
      linkUrl: string;
      title: string;
      linkDescription: string;
      image: string;
      linkType?: "SMALL" | "MEDIUM" | "LARGE";
      message?: string;
    } | null;
    ledger?: Omit<
      AgentActionInput,
      "productId" | "instanceId" | "channel" | "content"
    >;
  },
): Promise<{
  ok: boolean;
  error?: string;
  manual?: boolean;
  conversationId?: string | null;
  wamid?: string | null;
  actionId?: string | null;
}> {
  if (a.dryRun) {
    console.log(`[cold-outreach][DRY] ${a.channel} -> ${a.handle ?? a.to}: ${a.text.slice(0, 80)}...`);
    return { ok: true, conversationId: null };
  }
  try {
    if (a.channel === "whatsapp") {
      if (!a.to) return { ok: false, error: "no phone" };
      if (!a.instanceId || !a.ledger) {
        return { ok: false, error: "safety_reservation_input_missing" };
      }
      let rawWamid: string | null = null;
      const executed = await runReservedAgentAction(sb, {
        ...a.ledger,
        productId: a.productId,
        instanceId: a.instanceId,
        channel: a.channel,
        content: a.text,
      }, async () => {
        const sendBody = a.linkPreview
          ? {
            product_id: a.productId,
            instance_id: a.instanceId,
            type: "link",
            to: a.to,
            payload: {
              linkUrl: a.linkPreview.linkUrl,
              title: a.linkPreview.title,
              linkDescription: a.linkPreview.linkDescription,
              image: a.linkPreview.image,
              linkType: a.linkPreview.linkType ?? "LARGE",
              message: a.linkPreview.message ?? a.linkPreview.linkUrl,
              text: a.text,
            },
          }
          : {
            product_id: a.productId,
            instance_id: a.instanceId,
            type: "text",
            to: a.to,
            payload: { text: a.text },
          };
        const { data, error } = await sb.functions.invoke("platform-whatsapp-qr-send", {
          body: sendBody,
        });
        if (error || (data && (data as any).ok === false)) {
          return { ok: false, error: error?.message ?? JSON.stringify(data) };
        }
        const d = data as any;
        rawWamid =
          d?.body?.messageId ??
          d?.body?.key?.id ??
          d?.key?.id ??
          (typeof d?.body?.zaapId === "string" ? d.body.zaapId : null) ??
          null;
        return rawWamid
          ? { ok: true, providerMessageId: rawWamid }
          : { ok: false, error: "provider_message_id_missing" };
      });
      if (executed.ok && !executed.ledgerTransitioned) {
        console.error(
          `[platform-cold-outreach] provider accepted but ledger transition failed action_id=${executed.actionId}`,
        );
      }
      return executed.ok
        ? { ok: true, wamid: rawWamid, actionId: executed.actionId }
        : {
          ok: false,
          error: executed.reason ?? executed.error ?? "safety_kernel_denied",
          actionId: executed.actionId,
        };
    } else {
      // Instagram DM: a Graph API (platform-ig-send) precisa do PSID do
      // destinatário — que NÃO existe pra @handle raspado a frio (só se obtém
      // depois que a lead te manda DM). Logo cold IG = render + instrumentar +
      // DM MANUAL (1/sessão, COLD-OUTREACH §2B). NÃO auto-envia; sinaliza manual
      // (não é falha → não conta pro kill-switch). O texto renderizado fica na
      // fila (status skipped/ig_manual) pra o operador copiar e enviar 1 a 1.
      return { ok: false, manual: true, error: "ig_manual_required: sem PSID p/ @handle raspado (DM manual 1/sessão)" };
    }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/**
 * PR-BDR-9 + Edna 2026-08-18 — conversa do disparo nasce ANTES do send,
 * com lead_id e identidade canônica (55+DDD+9+8). O fromMe/inbound reencontra
 * a MESMA row; visitor_id cru (sem 9º) + unique (visitor_id, channel, instance)
 * era o que partia a thread em duas.
 */
async function loadWaQrConversationCandidates(
  sb: SupabaseClient,
  identity: ReturnType<typeof buildWaQrConversationIdentity>,
  instanceId: string,
): Promise<WaQrConversationRow[]> {
  const select =
    "id, status, lead_id, visitor_phone, current_agent_id, created_at, metadata";
  const { data: byVisitor } = await sb
    .from("platform_crm_conversations")
    .select(select)
    .in("visitor_id", identity.visitorIds.length ? identity.visitorIds : [identity.visitorId])
    .in("channel", [...WA_QR_CHANNELS])
    .eq("wa_qr_instance_id", instanceId)
    .order("created_at", { ascending: true })
    .limit(20);
  let candidates = (byVisitor ?? []) as WaQrConversationRow[];
  if (candidates.length === 0 && identity.phoneVariants.length > 0) {
    const { data: byPhone } = await sb
      .from("platform_crm_conversations")
      .select(select)
      .in("visitor_phone", identity.phoneVariants)
      .in("channel", [...WA_QR_CHANNELS])
      .eq("wa_qr_instance_id", instanceId)
      .order("created_at", { ascending: true })
      .limit(20);
    candidates = (byPhone ?? []) as WaQrConversationRow[];
  }
  return candidates;
}

/** Cria/reusa a conversa do disparo ANTES do send — lead_id + identidade canônica. */
async function ensureColdOpeningConversation(
  sb: SupabaseClient,
  o: {
    productId: string;
    instanceId: string | null;
    telefone: string;
    nome: string | null;
    leadId: string;
    agentId: string | null;
  },
): Promise<string | null> {
  try {
    if (!o.instanceId || !outboundConversationInsertAllowed(o.leadId)) {
      console.error(
        `[platform-cold-outreach] conversa da abertura recusada: instance=${o.instanceId ?? "null"} lead_id=${o.leadId || "null"}`,
      );
      return null;
    }
    const identity = buildWaQrConversationIdentity(o.telefone);
    if (!identity.visitorId || !identity.visitorPhone) {
      console.error(
        `[platform-cold-outreach] conversa da abertura recusada: telefone inválido '${o.telefone}'`,
      );
      return null;
    }

    const candidates = await loadWaQrConversationCandidates(sb, identity, o.instanceId);
    const plan = planWaQrOutboundBind({ identity, leadId: o.leadId, candidates });
    if (plan.action === "refuse") {
      console.error(
        `[platform-cold-outreach] conversa da abertura recusada: ${plan.reason}`,
      );
      return null;
    }

    const resolvedVisitorName = buildLeadName(o.nome, identity.visitorPhone);
    const safeVisitorName = resolvedVisitorName.startsWith("WhatsApp ")
      ? null
      : resolvedVisitorName;

    if (plan.action === "reuse") {
      const found = candidates.find((c) => c.id === plan.conversationId);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (found?.status === "closed") {
        patch.status = "bot_active";
        patch.needs_human = false;
      }
      if (o.agentId) patch.current_agent_id = o.agentId;
      if (plan.patchLeadId) patch.lead_id = o.leadId;
      await sb.from("platform_crm_conversations").update(patch).eq("id", plan.conversationId);
      return plan.conversationId;
    }

    const { data: created, error } = await sb
      .from("platform_crm_conversations")
      .insert({
        visitor_id: plan.identity.visitorId,
        visitor_name: safeVisitorName,
        visitor_phone: plan.identity.visitorPhone,
        visitor_whatsapp: plan.identity.visitorWhatsapp,
        channel: WA_QR_CHANNEL_CANONICAL,
        status: "bot_active",
        needs_human: false,
        wa_qr_instance_id: o.instanceId,
        product_id: o.productId,
        lead_id: plan.leadId,
        // ⚠️ PIN DA PERSONA — sem isto, a prospecção ativa é atendida pela DUDA.
        //
        // Medido em produção 2026-08-06: a campanha DECLARA agent_id = "Camila ·
        // Prospecção" (agent_type 'prospector', ativa), mas esse id só era gravado
        // no metadata da MENSAGEM (autoria, :614) — nunca em current_agent_id. A
        // conversa nascia com pin NULL.
        //
        // E o roteador (_shared/agent-routing.ts) NÃO conhece 'prospector': tem
        // pickSdrPersona/Closer/Retention e mais nada. Sem pin, cai em 'sdr_open'
        // → DUDA. Ou seja: a agente de ABORDAGEM FRIA era substituída pela de
        // INBOUND, com o prompt errado, no canal errado — e nada acusava, porque
        // tecnicamente "um agente respondeu".
        //
        // Foi assim que um golden de eval capturou a resposta
        // "Sem problema, DUDA te espera" numa conversa whatsapp_evolution.
        //
        // Pin explícito é a correção certa: a campanha JÁ declara quem fala; o
        // motor é que descartava a declaração. Ensinar 'prospector' ao roteador
        // (alternativa B) mexeria no caminho da Duda, que não é meu território.
        current_agent_id: o.agentId ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.error(
        `[platform-cold-outreach] criar conversa da abertura FALHOU visitor=${plan.identity.visitorId}: ${error.message}`,
      );
      return null;
    }
    return (created?.id as string) ?? null;
  } catch (e) {
    console.error(
      "[platform-cold-outreach] ensureColdOpeningConversation exception:",
      e,
    );
    return null;
  }
}

async function persistOpeningMessage(
  sb: SupabaseClient,
  o: {
    conversationId: string;
    instanceId: string | null;
    text: string;
    agentId: string | null;
    campaignId: string;
    actionId?: string | null;
    wamid?: string | null;
    variant: unknown;
  },
): Promise<string | null> {
  const { error: msgErr } = await sb.from("platform_crm_messages").insert({
    conversation_id: o.conversationId,
    direction: "outbound",
    sender_type: "bot",
    content: o.text,
    content_type: "text",
    message_type: "text",
    metadata: {
      channel: WA_QR_CHANNEL_CANONICAL,
      connection_id: o.instanceId,
      agent_id: o.agentId,
      delivery_status: "sent",
      origem: "cold_outreach_abertura",
      campaign_id: o.campaignId,
      action_id: o.actionId ?? null,
      variant: o.variant ?? null,
      step: 0,
      wamid: o.wamid ?? null,
    },
  });
  if (msgErr) {
    console.error(
      `[platform-cold-outreach] gravar a bolha da abertura FALHOU conversation_id=${o.conversationId}: ${msgErr.message}`,
    );
  }
  return o.conversationId;
}

async function buildTokens(sb: SupabaseClient, campaign: any, row: any): Promise<ScriptTokens> {
  // primeiro_nome/categoria/bio do lead raspado, se ainda referenciado.
  let nome = "tudo bem?";
  let servico: string | undefined;
  let detalhe: string | undefined;
  if (row.extracted_lead_id) {
    const { data: lead } = await sb.from("platform_crm_extracted_leads")
      .select("primeiro_nome, categoria, bio, handle").eq("id", row.extracted_lead_id).maybeSingle();
    if (lead) {
      nome = (lead.primeiro_nome ?? "").trim() || "tudo bem?";
      servico = guessServico(lead.categoria, lead.bio);
      detalhe = lead.categoria ?? undefined;
    }
  }
  return {
    nome,
    seuNome: campaign.sender_name ?? "Nexvy",
    salao: row.handle ? `@${row.handle}` : "seu salão",
    servico,
    detalheIg: detalhe,
  };
}

async function scheduleNext(sb: SupabaseClient, campaignId: string, now: Date, jitter: number) {
  const { data: next } = await sb
    .from("platform_crm_cold_outreach_queue").select("id")
    .eq("campaign_id", campaignId).eq("status", "queued")
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (next) {
    await sb.from("platform_crm_cold_outreach_queue")
      .update({ scheduled_for: new Date(now.getTime() + jitter).toISOString() })
      .eq("id", next.id);
  }
}

async function bumpCounter(sb: SupabaseClient, campaignId: string, instanceId: string | null, day: string, d: Partial<Record<"sent" | "delivered" | "blocked" | "reported" | "failed", number>>) {
  await sb.rpc("pcrm_cold_bump_counter", {
    p_campaign: campaignId, p_instance: instanceId, p_day: day,
    p_sent: d.sent ?? 0, p_delivered: d.delivered ?? 0, p_blocked: d.blocked ?? 0, p_reported: d.reported ?? 0, p_failed: d.failed ?? 0,
  });
}

async function upsertHealth(sb: SupabaseClient, campaignId: string, instanceId: string | null, patch: Record<string, unknown>) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const { data: existing } = await sb.from("platform_crm_cold_instance_health").select("id")
    .eq("campaign_id", campaignId).or(`instance_id.eq.${instanceId ?? ZERO_UUID},instance_id.is.null`).maybeSingle();
  if (existing) {
    await sb.from("platform_crm_cold_instance_health").update({ ...clean, updated_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await sb.from("platform_crm_cold_instance_health").insert({ campaign_id: campaignId, instance_id: instanceId, ...clean });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ON-INBOUND — opt-out (SAIR/PARE) + registro da intenção de compra ("quero")
// ═══════════════════════════════════════════════════════════════════════════
async function actionOnInbound(sb: SupabaseClient, body: any) {
  const { product_id, conversation_id, telefone, handle, text } = body;
  if (!text) return json({ error: "text required" }, 400);
  if (!coldShouldClassifyText(product_id)) {
    return json({
      ok: true,
      intent: "harness_record_only",
      affected: 0,
      suppress_brain: false,
    });
  }

  // Localiza as linhas de fila do lead por QUALQUER identificador presente (OR),
  // nunca pelo primeiro que existir. Era um else-if e o `conversation_id` vencia
  // sempre — mas no canal WhatsApp a fila tem conversation_id NULL: a conversa
  // só NASCE quando a lead responde (criada pelo platform-whatsapp-qr-webhook),
  // depois do envio. Resultado: 0 linhas, `queueStatus` (opted_out) não era
  // aplicado, `next_followup_at` não era limpo e a cadência seguia disparando
  // pra quem pediu PARE — invisível, porque a supressão em
  // platform_crm_lead_optout era gravada normalmente.
  //
  // `.or()` do PostgREST é uma STRING: vírgula separa filtros e parêntese agrupa.
  // Valor vindo do body com esses caracteres reescreveria o filtro, então só
  // entra no OR o identificador que passa por regex estrita (mesma régua
  // injection-safe do gate de instância do platform-whatsapp-qr-webhook).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const PHONE_RE = /^[0-9]{6,20}$/;
  const HANDLE_RE = /^[A-Za-z0-9._-]{1,64}$/;

  const convId = conversation_id == null ? "" : String(conversation_id);
  const phoneDigits = telefone == null ? "" : String(telefone).replace(/\D/g, "");
  const handleStr = handle == null ? "" : String(handle).trim().replace(/^@/, "");

  const idFilters: string[] = [];
  if (UUID_RE.test(convId)) idFilters.push(`conversation_id.eq.${convId}`);
  if (PHONE_RE.test(phoneDigits)) idFilters.push(`telefone.eq.${phoneDigits}`);
  if (HANDLE_RE.test(handleStr)) idFilters.push(`handle.eq.${handleStr}`);

  let rows: any[] = [];
  if (idFilters.length === 0) {
    // Sem identificador NENHUM a query filtraria só por status e devolveria
    // linhas de OUTROS leads — o plano seria aplicado a quem não respondeu.
    // Guarda dura: nenhuma linha, e o motivo sai no log (nunca em silêncio).
    console.error(
      `[cold-outreach][on-inbound] sem identificador válido — nenhuma linha de fila será tocada` +
        ` (conversation_id=${convId || "-"} telefone_digitos=${phoneDigits.length} handle=${handleStr || "-"})`,
    );
  } else {
    const { data, error } = await sb.from("platform_crm_cold_outreach_queue").select("*")
      .in("status", ["sent", "queued", "sending"])
      .or(idFilters.join(","))
      .limit(10);
    if (error) {
      console.error(`[cold-outreach][on-inbound] busca de fila FALHOU reason=${error.message} filters=${idFilters.join(",")}`);
    }
    rows = data ?? [];
  }

  const inboundEventId = String(
    body.inbound_event_id ?? body.message_id ??
      `${convId || "no-conv"}:${phoneDigits}:${String(text).slice(0, 48)}`,
  );
  let r2Result: PathAR2InboundResult = {
    delivered: false,
    bubblesSent: 0,
    deliveredAtIso: null,
    lastActionId: null,
    planLogged: false,
  };
  if (UUID_RE.test(convId)) {
    r2Result = await tryPathAR2OnInbound(sb, {
      conversationId: convId,
      telefone: phoneDigits,
      text: String(text),
      inboundEventId,
      productId: product_id == null ? null : String(product_id),
    });
  }
  const r2CloseMeta: Record<string, unknown> = r2Result.delivered && r2Result.deliveredAtIso
    ? {
      soft_opt_out_active: true,
      cold_suppressed: true,
      last_r2_delivered_at: r2Result.deliveredAtIso,
      ...(r2Result.lastActionId ? { last_r2_action_id: r2Result.lastActionId } : {}),
    }
    : {};

  // DECISÃO pura (testada em inbound-plan.test.ts); o resto é só executar o plano.
  const plan = planInbound(String(text), (rows ?? []) as any[], { product_id, conversation_id, telefone, handle });
  const productId = plan.optOut?.product_id ?? product_id ?? rows?.[0]?.product_id;

  // 1) supressão Art.18 (opt-out) + marca remarketing (WHEN TBD)
  if (plan.optOut) {
    await sb.from("platform_crm_lead_optout").upsert(plan.optOut, { onConflict: "product_id,telefone" });
  }
  if (plan.remarketing && conversation_id) {
    try {
      const { data: convRow } = await sb.from("platform_crm_conversations")
        .select("metadata").eq("id", conversation_id).maybeSingle();
      const prev = (convRow?.metadata && typeof convRow.metadata === "object")
        ? convRow.metadata as Record<string, unknown>
        : {};
      await sb.from("platform_crm_conversations").update({
        metadata: {
          ...prev,
          ...r2CloseMeta,
          remarketing: true,
          remarketing_reason: plan.optOut?.reason ?? "runtime_opt_out_remarketing",
          remarketing_at: new Date().toISOString(),
          do_not_contact: true,
          do_not_contact_reason: "opt_out_remarketing",
        },
        ...(r2Result.delivered ? { status: "closed" as const } : {}),
        updated_at: new Date().toISOString(),
      }).eq("id", conversation_id);
    } catch (_e) { /* best-effort */ }
  }
  // 2) status da fila (para cadência)
  if (plan.queueStatus) {
    for (const r of rows ?? []) {
      await sb.from("platform_crm_cold_outreach_queue")
        .update({ status: plan.queueStatus, next_followup_at: plan.clearFollowups ? null : undefined, updated_at: new Date().toISOString() })
        .eq("id", r.id);
    }
  }
  // 3) intenção de compra detectada — a BDR NÃO passa o bastão.
  // Antes daqui saía um handoff BDR→Duda (UPDATE current_agent_id). Morreu: a
  // Camila foi especificada pra FECHAR sozinha e mandar o link de checkout, e o
  // caminho era código morto medido (0 conversas em whatsapp_evolution, 0 com a
  // Bia, e o platform-sales-brain não conhece cold_outreach). Trocar o efeito por
  // silêncio seria pior que o handoff: o sinal mais valioso do motor é justamente
  // "a lead disse que quer". Ele fica registrado em DOIS lugares — log (aqui) e
  // journey durável (`buy_intent` na meta, abaixo) — pra continuar mensurável.
  if (plan.handoff && conversation_id) {
    console.warn(
      `[cold-outreach][on-inbound] INTENÇÃO DE COMPRA detectada — a BDR segue dona da conversa (sem handoff)` +
        ` conversation_id=${conversation_id} product_id=${productId ?? "-"} intent=${plan.intent}`,
    );
  }
  // 4) silencia o brain nesta conversa (opt-out)
  if (plan.silenceConversation && conversation_id) await silenceConversation(sb, conversation_id, r2CloseMeta);
  if (conversation_id && (plan.bumpApresentar || plan.abortApresentar)) {
    await updateApresentarOnInbound(sb, conversation_id, plan);
  }
  // 5) instrumentação
  await logJourney(sb, productId, rows?.[0]?.lead_id ?? null, plan.journey.type, plan.journey.category, "whatsapp", plan.journey.title, {
    matched: plan.journey.matched, intent: plan.intent, buy_intent: plan.handoff,
  });

  return json({ ok: true, intent: plan.intent, affected: rows?.length ?? 0, suppress_brain: plan.suppressBrain });
}

/** Silencia o brain nesta conversa sem editar o brain: 'closed' (≠ 'bot_active').
 * Valores válidos do enum platform_crm_conversation_status: bot_active|closed|human_active|waiting_human. */
async function silenceConversation(
  sb: SupabaseClient,
  conversationId: string,
  extraMeta: Record<string, unknown> = {},
) {
  try {
    const { data: convRow } = await sb.from("platform_crm_conversations")
      .select("metadata").eq("id", conversationId).maybeSingle();
    const prev = (convRow?.metadata && typeof convRow.metadata === "object")
      ? convRow.metadata as Record<string, unknown>
      : {};
    const { error } = await sb.from("platform_crm_conversations").update({
      status: "closed",
      metadata: {
        ...prev,
        ...extraMeta,
        do_not_contact: true,
        do_not_contact_reason: prev.do_not_contact_reason ?? "silence_opt_out",
      },
      updated_at: new Date().toISOString(),
    }).eq("id", conversationId);
    if (error) {
      console.error(
        `[cold-outreach] silenceConversation FALHOU conversation_id=${conversationId} reason=${error.message}`,
      );
    }
  } catch (e) {
    console.error(
      `[cold-outreach] silenceConversation exception conversation_id=${conversationId} reason=${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS — observabilidade da campanha
// ═══════════════════════════════════════════════════════════════════════════
async function actionStatus(sb: SupabaseClient, campaignId: string) {
  const { data: campaign } = await sb.from("platform_crm_cold_campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (!campaign) return json({ error: "campaign not found" }, 404);
  const { data: queue } = await sb.from("platform_crm_cold_outreach_queue").select("status").eq("campaign_id", campaignId);
  const byStatus: Record<string, number> = {};
  for (const r of queue ?? []) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const { data: counters } = await sb.from("platform_crm_cold_daily_counters").select("*").eq("campaign_id", campaignId).order("day", { ascending: false }).limit(7);
  const { data: health } = await sb.from("platform_crm_cold_instance_health").select("*").eq("campaign_id", campaignId);

  // O veredito do ciclo de vida é o que a UI precisa mostrar: `status` sozinho
  // MENTE — uma campanha `active` sem carimbo não dispara, e um console que
  // exibisse só "ativa" repetiria na tela o mesmo engano que o motor cometia.
  const lifecycle = avaliarLifecycle(lifecycleDaLinha(campaign), new Date());

  return json({
    ok: true,
    campaign: {
      id: campaign.id, name: campaign.name, status: campaign.status,
      dry_run: campaign.dry_run, channel: campaign.channel,
      activated_at: campaign.activated_at ?? null,
      scheduled_start_at: campaign.scheduled_start_at ?? null,
      scheduled_end_at: campaign.scheduled_end_at ?? null,
      /** `true` = está disparando agora (ou disparará no próximo tick). */
      armada: lifecycle.armada,
      /** Motivo estável quando `armada=false`. Serve de rótulo na UI. */
      motivo: lifecycle.motivo,
    },
    byStatus, counters, health,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // MEDIDO 2026-08-04 (mesmo defeito de platform-whatsapp-qr-send): `functions.invoke`
  // manda a chave de serviço no header `apikey`, não no Authorization. O
  // platform-whatsapp-qr-webhook notifica o inbound por invoke — e caía em 401, ou
  // seja, "a lead respondeu" era descartado em silêncio. platform-sales-brain:183
  // já aceita as duas portas; espelhado aqui.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  const apikeyHeader = (req.headers.get("apikey") ?? "").trim();
  const coldSecret = req.headers.get("x-cold-secret") ?? "";
  const secretEnv = Deno.env.get("COLD_OUTREACH_SECRET") ?? "";
  const authorized = (!!serviceKey && (auth === serviceKey || apikeyHeader === serviceKey)) ||
    (secretEnv !== "" && coldSecret === secretEnv);
  if (!authorized) return json({ error: "unauthorized (internal only)" }, 401);

  const envEnabled = (Deno.env.get("COLD_OUTREACH_ENABLED") ?? "false").toLowerCase() === "true";

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "tick";

    switch (action) {
      case "enqueue": {
        if (!body.campaign_id) return json({ error: "campaign_id required" }, 400);
        return await actionEnqueue(sb, body.campaign_id, body.limit ?? 2000);
      }
      case "tick":
        // PRD-12: cold tick retired — VPS owns harness-pilot-tick only
        if (!legacyCamilaSendersEnabled()) {
          return json({
            ok: true,
            skipped: LEGACY_TICK_RETIRED,
            real_whatsapp_sends: 0,
            now: new Date().toISOString(),
          });
        }
        return await actionTick(sb, body.campaign_id ?? null, envEnabled);
      case "harness-pilot-tick": {
        const envGet = (k: string) => Deno.env.get(k);
        const productId = String(
          body.product_id ?? Deno.env.get("HARNESS_PILOT_PRODUCT_ID") ?? "",
        ).trim();
        if (!productId) {
          return json({
            ok: false,
            error: "product_id required (body or HARNESS_PILOT_PRODUCT_ID)",
          }, 400);
        }
        const forceDry = body.force_dry === true ||
          !harnessAllowsRealWhatsapp({ get: envGet });
        const store = createProductPilotQueueStore(sb as any, productId);
        const holidayDates = await loadHarnessHolidayDates(sb, new Date());
        const instanceId = String(
          body.instance_id ?? Deno.env.get("HARNESS_PILOT_INSTANCE_ID") ?? "",
        ).trim();
        const sendText = forceDry || !instanceId
          ? undefined
          : async (input: {
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
          }) => {
            const asLink = input.sendAs === "link" && input.linkPreview;
            const { data, error } = await sb.functions.invoke(
              "platform-whatsapp-qr-send",
              {
                body: {
                  product_id: productId,
                  instance_id: instanceId,
                  type: asLink ? "link" : "text",
                  to: input.to,
                  payload: asLink
                    ? {
                      linkUrl: input.linkPreview!.linkUrl,
                      title: input.linkPreview!.title,
                      linkDescription: input.linkPreview!.linkDescription,
                      image: input.linkPreview!.image,
                      linkType: input.linkPreview!.linkType,
                      message: input.linkPreview!.linkUrl,
                    }
                    : { text: input.text },
                  idempotency_key: input.idempotencyKey,
                },
              },
            );
            if (error || (data && (data as { ok?: boolean }).ok === false)) {
              return {
                ok: false,
                error: error?.message ?? JSON.stringify(data),
              };
            }
            return { ok: true };
          };
        // Override: body.manual_list for dry probes only. Default: DB preselected.
        let overrideRoster: PilotLead[] | undefined = undefined;
        if (Array.isArray(body.manual_list) && body.manual_list.length > 0) {
          overrideRoster = body.manual_list.map((
            r: {
              phone?: string;
              name?: string;
              greeting?: string;
              handle?: string;
              resume_exception?: boolean;
              lead_id?: string;
            },
            i: number,
          ) => ({
            order: i + 1,
            phone: String(r.phone ?? "").replace(/\D/g, ""),
            greeting: String(r.greeting ?? r.name ?? "Lead"),
            handle: String(r.handle ?? "unknown"),
            resumeException: r.resume_exception === true,
            leadId: r.lead_id ? String(r.lead_id) : undefined,
          }));
        }
        const tick = await runHarnessPilotTick({
          productId,
          goId: body.go_id != null
            ? String(body.go_id)
            : (Deno.env.get("HARNESS_PILOT_GO_ID") ?? null),
          seedIfEmpty: body.seed_if_empty !== false,
          previewWindow: body.preview === true,
          store,
          envGet,
          forceDry,
          sendText,
          holidayDates,
          sb,
          instanceId,
          overrideRoster,
          probeChip: forceDry || !instanceId
            ? undefined
            : async () => {
              const { data, error } = await sb.functions.invoke(
                "platform-whatsapp-qr-send",
                {
                  body: {
                    product_id: productId,
                    instance_id: instanceId,
                    type: "status",
                  },
                },
              );
              if (error) return false;
              const rec = data as { ok?: boolean; connected?: boolean; smartphoneConnected?: boolean };
              return rec?.ok === true && rec.connected === true &&
                rec.smartphoneConnected === true;
            },
          now: typeof body.now_iso === "string"
            ? new Date(body.now_iso)
            : undefined,
        });
        console.log(
          `[cold-outreach][harness-pilot-tick] ${JSON.stringify({
            reason: tick.reason,
            real_sends: tick.real_whatsapp_sends,
            pending: tick.pending,
            dry: tick.dry,
            live_flags: tick.live_flags,
            product_id: productId,
            preselected_count: tick.preselected_count,
            stage_updates: tick.stage_updates,
          })}`,
        );
        return json(tick);
      }
      case "on-inbound":
        return await actionOnInbound(sb, body);
      case "status":
        if (!body.campaign_id) return json({ error: "campaign_id required" }, 400);
        return await actionStatus(sb, body.campaign_id);
      case "harness-plan": {
        // Integration bridge: plan only. Never calls deliver() / Z-API.
        const leadId = String(body.lead_id ?? body.phone ?? "").replace(/\D/g, "");
        const goId = body.go_id != null ? String(body.go_id) : null;
        const manualList = parseManualList(
          body.manual_list ?? Deno.env.get("HARNESS_MANUAL_LIST") ?? "",
        );
        const now = new Date();
        const attendanceAction = parseAttendanceAction(body.attendance_action);
        const holidayDates = await loadHarnessHolidayDates(sb, now);
        const env = { get: (k: string) => Deno.env.get(k) };
        const auto = harnessPlanAutomaticBlocked({
          leadId,
          manualList,
          env,
          now,
          holidayDates,
          attendanceAction,
        });
        const conversationOut = attendanceAction === "reply" ||
          attendanceAction === "exit_message";
        const plan = conversationOut
          ? {
            gate: harnessPlanConversationOut({
              now,
              action: attendanceAction,
              holidayDates,
            }),
            plannedBubbles: [] as string[],
            realSends: 0,
            dryRunForced: true as const,
          }
          : harnessPlanSupervised({
            goId,
            leadId,
            manualList,
            env,
            now,
            holidayDates,
            attendanceAction,
          });
        console.log(
          `[cold-outreach][harness-plan] ${JSON.stringify({
            runtime: HARNESS_RUNTIME_VERSION,
            lead_id: leadId,
            go_id: goId,
            attendance_action: attendanceAction,
            holidays_loaded: holidayDates.size,
            supervised_allowed: plan.gate.allowed,
            supervised_reason: plan.gate.reason,
            automatic_blocked: !auto.allowed,
            automatic_reason: auto.reason,
            bubbles: plan.plannedBubbles.length,
            real_sends: plan.realSends,
            dry_run_forced: plan.dryRunForced,
          })}`,
        );
        return json({
          ok: true,
          action: "harness-plan",
          runtime_version: HARNESS_RUNTIME_VERSION,
          attendance_action: attendanceAction,
          holidays_loaded: holidayDates.size,
          supervised: {
            allowed: plan.gate.allowed,
            reason: plan.gate.reason,
            planned_bubbles: plan.plannedBubbles,
          },
          automatic: { allowed: auto.allowed, reason: auto.reason },
          real_whatsapp_sends: 0,
          dry_run_forced: true,
        });
      }
      case "harness-pilot-plan": {
        // BUILD: preview da fila do piloto. Never Z-API / deliver.
        // Roster = derived_stage=preselected no DB (ou manual_list override).
        const productId = String(
          body.product_id ?? Deno.env.get("HARNESS_PILOT_PRODUCT_ID") ?? "",
        ).trim();
        if (!productId && !Array.isArray(body.manual_list)) {
          return json({
            ok: false,
            error: "product_id required (or body.manual_list override)",
          }, 400);
        }
        const goId = body.go_id != null ? String(body.go_id) : null;
        const preview = body.preview !== false; // default true → janela comercial fictícia
        const now = preview
          ? FIXTURE.tue1000
          : (typeof body.now_iso === "string" ? new Date(body.now_iso) : new Date());
        const holidayDates = await loadHarnessHolidayDates(sb, now);
        const only = Array.isArray(body.only_phones)
          ? body.only_phones.map((p: unknown) => String(p).replace(/\D/g, ""))
          : null;
        let roster: PilotLead[] = [];
        if (Array.isArray(body.manual_list) && body.manual_list.length > 0) {
          roster = body.manual_list.map((
            r: {
              phone?: string;
              name?: string;
              greeting?: string;
              handle?: string;
              resume_exception?: boolean;
              lead_id?: string;
            },
            i: number,
          ) => ({
            order: i + 1,
            phone: String(r.phone ?? "").replace(/\D/g, ""),
            greeting: String(r.greeting ?? r.name ?? "Lead"),
            handle: String(r.handle ?? "unknown"),
            resumeException: r.resume_exception === true,
            leadId: r.lead_id ? String(r.lead_id) : undefined,
          }));
        } else {
          const loaded = await loadPreselectedPilotLeads(sb as any, productId);
          if (loaded.error) {
            return json({
              ok: false,
              error: "preselected_load_failed",
              detail: loaded.error,
            }, 500);
          }
          roster = loaded.leads;
        }
        const plan = planPilotQueue({
          goId,
          voice: "TEST",
          killOn: true,
          now,
          holidayDates,
          onlyPhones: only,
          roster,
        });
        const first = plan.queue.pending[0] ?? null;
        console.log(
          `[cold-outreach][harness-pilot-plan] ${JSON.stringify({
            runtime: HARNESS_RUNTIME_VERSION,
            go_id: goId,
            allowed: plan.allowed,
            reason: plan.reason,
            queued: plan.envelopesQueued,
            preselected_count: roster.length,
            first_kind: first?.kind ?? null,
            first_lead: first?.leadId ?? null,
            renata_resume: first?.kind === "resume",
            real_sends: 0,
          })}`,
        );
        return json({
          ok: true,
          action: "harness-pilot-plan",
          runtime_version: HARNESS_RUNTIME_VERSION,
          preview,
          allowed: plan.allowed,
          reason: plan.reason,
          go_id: plan.goId,
          product_id: productId || null,
          manual_list: plan.manualList,
          preselected_count: roster.length,
          roster_size: roster.length,
          envelopes_queued: plan.envelopesQueued,
          first_envelope: first
            ? {
              lead_id: first.leadId,
              kind: first.kind,
              text: first.text,
            }
            : null,
          renata_resume_text: RENATA_RESUME_TEXT,
          real_whatsapp_sends: 0,
          dry_run_forced: true,
          awaiting: "GO PILOT HARNESS v1",
        });
      }
      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error("[platform-cold-outreach] exception:", err?.message ?? err);
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
