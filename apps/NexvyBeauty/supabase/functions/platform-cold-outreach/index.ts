// platform-cold-outreach — MOTOR de cold outreach (platform-side), gated OFF.
//
// Orquestra os módulos PUROS de _shared/cold-outreach (anti-ban, segment-gate,
// script, opt-out, persona) sobre os leads raspados (platform_crm_extracted_leads),
// enviando pelo número BURNER via platform-evolution-send (WA) ou platform-ig-send (IG).
//
// DUPLO GATE (nada dispara sem o Marcelo):
//   1. campaign.dry_run  (default true)  → simula: gera+enfileira+instrumenta, NÃO envia.
//   2. env COLD_OUTREACH_ENABLED != 'true' → força dry-run mesmo se a campanha pedir real.
// O número burner + o start do warm-up (flip dry_run=false + ENABLED=true) = ativação do Marcelo.
//
// Ações (body.action): 'enqueue' | 'tick' | 'on-inbound' | 'status'.
// Auth interno (verify_jwt=false): Bearer==SERVICE_ROLE_KEY OU x-cold-secret.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  canSendNow,
  type KillSwitchStats,
  killSwitch,
  jitterMs,
  warmupDayFromFirstSend,
} from "../_shared/cold-outreach/anti-ban.ts";
import {
  type DispatchTier,
  type GateLead,
  passesInstagramGate,
  passesWhatsappGate,
  selectAndOrderForDispatch,
  dispatchTier,
  TIER_ORDER,
} from "../_shared/cold-outreach/segment-gate.ts";
import { assignVariant, type Channel, renderOpening, renderFollowup, type ScriptTokens } from "../_shared/cold-outreach/script.ts";
import { planInbound } from "../_shared/cold-outreach/inbound-plan.ts";
import { pickSdrPersona } from "../_shared/cold-outreach/persona.ts";
import { isApprovedForSend, partitionByApproval, UNAPPROVED_SKIP_REASON } from "../_shared/cold-outreach/approved-gate.ts";

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

// ═══════════════════════════════════════════════════════════════════════════
// TICK — anti-ban gate + envio (dry-run OU real) + follow-ups
// ═══════════════════════════════════════════════════════════════════════════
async function actionTick(sb: SupabaseClient, onlyCampaign: string | null, envEnabled: boolean) {
  const now = new Date();
  const q = sb.from("platform_crm_cold_campaigns").select("*").in("status", ["active", "warming"]);
  const { data: campaigns } = onlyCampaign ? await q.eq("id", onlyCampaign) : await q;
  const results: any[] = [];

  for (const c of campaigns ?? []) {
    results.push(await tickCampaign(sb, c, now, envEnabled));
  }
  return json({ ok: true, now: now.toISOString(), campaigns: results });
}

async function loadHealthAndCounters(sb: SupabaseClient, campaignId: string, instanceId: string | null, day: string) {
  const { data: health } = await sb
    .from("platform_crm_cold_instance_health").select("*")
    .eq("campaign_id", campaignId)
    .or(`instance_id.eq.${instanceId ?? ZERO_UUID},instance_id.is.null`)
    .maybeSingle();
  const { data: counters } = await sb
    .from("platform_crm_cold_daily_counters").select("*")
    .eq("campaign_id", campaignId).eq("day", day)
    .or(`instance_id.eq.${instanceId ?? ZERO_UUID},instance_id.is.null`)
    .maybeSingle();
  return { health, counters };
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

  const { health, counters } = await loadHealthAndCounters(sb, c.id, instanceId, day);
  const firstSendAt = health?.first_send_at ? new Date(health.first_send_at) : null;
  const warmupDay = warmupDayFromFirstSend(firstSendAt, now);
  const sentToday = counters?.sent_count ?? 0;
  const killStats: KillSwitchStats = {
    sent: sentToday,
    blocked: counters?.blocked_count ?? 0,
    reported: counters?.reported_count ?? 0,
    consecutiveFailures: health?.consecutive_failures ?? 0,
  };

  // Kill-switch: se já tripou, marca a campanha killed e para.
  const kill = killSwitch(killStats, killCfg);
  if (kill.tripped || health?.killed) {
    await sb.from("platform_crm_cold_campaigns").update({ status: "killed", paused_reason: kill.reason, updated_at: now.toISOString() }).eq("id", c.id);
    await upsertHealth(sb, c.id, instanceId, { killed: true, killed_reason: kill.reason, killed_at: now.toISOString() });
    return { campaign: c.id, action: "killed", reason: kill.reason };
  }

  // 1) FOLLOW-UPS vencidos (status='sent', next_followup_at <= now).
  const followupResult = await processFollowups(sb, c, now, dryRun, channel, productId, instanceId, day);

  // 2) Portão anti-ban para a PRÓXIMA abertura.
  const gate = canSendNow({
    now, window: windowCfg, warmup, warmupDay, sentToday,
    killStats, killCfg, campaignPaused: c.status === "paused",
  });
  if (!gate.canSend) {
    return { campaign: c.id, action: "skip", reason: gate.reason, remaining: gate.remaining, followups: followupResult };
  }

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

  // Render da abertura (script WIRED).
  const tokens = await buildTokens(sb, c, due);
  const text = renderOpening(channel, tokens, due.variant ?? undefined);

  const sendRes = await deliver(sb, { channel, dryRun, productId, instanceId, to: due.telefone, handle: due.handle, text });

  if (sendRes.ok) {
    const followupDelayH = 48; // D+2
    await sb.from("platform_crm_cold_outreach_queue").update({
      status: "sent", sent_at: now.toISOString(), last_outreach_at: now.toISOString(),
      next_followup_at: new Date(now.getTime() + followupDelayH * 3_600_000).toISOString(),
      conversation_id: sendRes.conversationId ?? due.conversation_id ?? null,
      updated_at: now.toISOString(),
    }).eq("id", due.id);

    await bumpCounter(sb, c.id, instanceId, day, { sent: 1 });
    await upsertHealth(sb, c.id, instanceId, { first_send_at: firstSendAt ? undefined : now.toISOString(), consecutive_failures: 0 });
    await logJourney(sb, productId, due.lead_id ?? null, "message_sent", "contact", channel, "Cold: abertura enviada", {
      campaign_id: c.id, step: 0, tier: due.tier, handle: due.handle, dry_run: dryRun, variant: due.variant,
    });
    // finalidade LGPD: só flipa no envio REAL (dry-run preserva audiencia_ads).
    if (!dryRun && due.extracted_lead_id) {
      await sb.from("platform_crm_extracted_leads").update({ finalidade: "prospeccao_comercial_b2b" }).eq("id", due.extracted_lead_id);
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
    const res = await deliver(sb, { channel, dryRun, productId, instanceId, to: f.telefone, handle: f.handle, text });
    if (res.ok) {
      const isLast = step >= maxFollowups;
      const nextDelayH = step === 1 ? 60 : 0; // D+2 -> D+4/5 (48+60=108h)
      await sb.from("platform_crm_cold_outreach_queue").update({
        followups_sent: step, last_outreach_at: now.toISOString(),
        next_followup_at: isLast ? null : new Date(now.getTime() + nextDelayH * 3_600_000).toISOString(),
        status: "sent", updated_at: now.toISOString(),
      }).eq("id", f.id);
      await bumpCounter(sb, c.id, instanceId, day, { sent: 1 });
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
  a: { channel: Channel; dryRun: boolean; productId: string; instanceId: string | null; to: string | null; handle: string | null; text: string },
): Promise<{ ok: boolean; error?: string; manual?: boolean; conversationId?: string | null }> {
  if (a.dryRun) {
    console.log(`[cold-outreach][DRY] ${a.channel} -> ${a.handle ?? a.to}: ${a.text.slice(0, 80)}...`);
    return { ok: true, conversationId: null };
  }
  try {
    if (a.channel === "whatsapp") {
      if (!a.to) return { ok: false, error: "no phone" };
      const { data, error } = await sb.functions.invoke("platform-evolution-send", {
        body: { product_id: a.productId, instance_id: a.instanceId, type: "text", to: a.to, payload: { text: a.text } },
      });
      if (error || (data && (data as any).ok === false)) return { ok: false, error: error?.message ?? JSON.stringify(data) };
      return { ok: true };
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
// ON-INBOUND — opt-out (SAIR/PARE) + handoff pra Duda ("quero")
// ═══════════════════════════════════════════════════════════════════════════
async function actionOnInbound(sb: SupabaseClient, body: any) {
  const { product_id, conversation_id, telefone, handle, text } = body;
  if (!text) return json({ error: "text required" }, 400);

  // Localiza as linhas de fila do lead (por conversa OU telefone/handle).
  let queueQ = sb.from("platform_crm_cold_outreach_queue").select("*").in("status", ["sent", "queued", "sending"]);
  if (conversation_id) queueQ = queueQ.eq("conversation_id", conversation_id);
  else if (telefone) queueQ = queueQ.eq("telefone", String(telefone));
  else if (handle) queueQ = queueQ.eq("handle", String(handle));
  const { data: rows } = await queueQ.limit(10);

  // DECISÃO pura (testada em inbound-plan.test.ts); o resto é só executar o plano.
  const plan = planInbound(String(text), (rows ?? []) as any[], { product_id, conversation_id, telefone, handle });
  const productId = plan.optOut?.product_id ?? product_id ?? rows?.[0]?.product_id;

  // 1) supressão Art.18 (opt-out)
  if (plan.optOut) {
    await sb.from("platform_crm_lead_optout").upsert(plan.optOut, { onConflict: "product_id,telefone" });
  }
  // 2) status da fila (para cadência)
  if (plan.queueStatus) {
    for (const r of rows ?? []) {
      await sb.from("platform_crm_cold_outreach_queue")
        .update({ status: plan.queueStatus, next_followup_at: plan.clearFollowups ? null : undefined, updated_at: new Date().toISOString() })
        .eq("id", r.id);
    }
  }
  // 3) handoff BDR→Duda no mesmo thread
  let handoff: any = undefined;
  if (plan.handoff && conversation_id) handoff = await handoffToDuda(sb, productId, conversation_id);
  // 4) silencia o brain nesta conversa (opt-out)
  if (plan.silenceConversation && conversation_id) await silenceConversation(sb, conversation_id);
  // 5) instrumentação
  await logJourney(sb, productId, rows?.[0]?.lead_id ?? null, plan.journey.type, plan.journey.category, "whatsapp", plan.journey.title, {
    matched: plan.journey.matched, intent: plan.intent, handoff,
  });

  return json({ ok: true, intent: plan.intent, affected: rows?.length ?? 0, handoff });
}

/** Handoff BDR->Duda no MESMO thread: UPDATE current_agent_id (padrão onboarding-handoff P10). */
async function handoffToDuda(sb: SupabaseClient, productId: string | undefined, conversationId: string) {
  if (!productId) return { ok: false, reason: "no product" };
  // active_in_whatsapp no filtro: o platform-sales-brain (quem conduz daqui pra
  // frente) só enxerga is_active + active_in_whatsapp. Pinar uma Duda fora do
  // WhatsApp criaria um current_agent_id ÓRFÃO no thread. Sem Duda utilizável, o
  // BDR (Bento) segue dono da conversa — ninguém fica sem agente.
  const { data: agents } = await sb.from("platform_crm_product_agents")
    .select("id, name, agent_type, is_active, active_in_whatsapp")
    .eq("product_id", productId).eq("is_active", true).eq("active_in_whatsapp", true);
  const duda = pickSdrPersona((agents ?? []) as any[]);
  if (!duda) return { ok: false, reason: "no sdr (Duda) agent active_in_whatsapp" };
  await sb.from("platform_crm_conversations").update({ current_agent_id: duda.id, updated_at: new Date().toISOString() }).eq("id", conversationId);
  return { ok: true, to_agent_id: duda.id };
}

/** Silencia o brain nesta conversa sem editar o brain: 'closed' (≠ 'bot_active').
 * Valores válidos do enum platform_crm_conversation_status: bot_active|closed|human_active|waiting_human. */
async function silenceConversation(sb: SupabaseClient, conversationId: string) {
  try {
    await sb.from("platform_crm_conversations").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", conversationId);
  } catch (_e) { /* best-effort */ }
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
  return json({ ok: true, campaign: { id: campaign.id, name: campaign.name, status: campaign.status, dry_run: campaign.dry_run, channel: campaign.channel }, byStatus, counters, health });
}

// ═══════════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const coldSecret = req.headers.get("x-cold-secret") ?? "";
  const secretEnv = Deno.env.get("COLD_OUTREACH_SECRET") ?? "";
  const authorized = auth === serviceKey || (secretEnv !== "" && coldSecret === secretEnv);
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
        return await actionTick(sb, body.campaign_id ?? null, envEnabled);
      case "on-inbound":
        return await actionOnInbound(sb, body);
      case "status":
        if (!body.campaign_id) return json({ error: "campaign_id required" }, 400);
        return await actionStatus(sb, body.campaign_id);
      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error("[platform-cold-outreach] exception:", err?.message ?? err);
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
