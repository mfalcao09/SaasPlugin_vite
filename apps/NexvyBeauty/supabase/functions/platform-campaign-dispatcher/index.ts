// platform-campaign-dispatcher — motor de CAMPANHAS do CRM de PLATAFORMA
//
// Porte 1:1 do `campaign-dispatcher` do CRM Vendus, DESACOPLADO do tenant.
// Cron 1/min. Pega targets vencidos e envia a mensagem da campanha por lead.
// Respeita janela horária da recorrência e status da campanha (active).
//
// Adaptações (mapeamento tenant → plataforma):
//   * campaigns / campaign_targets → platform_crm_campaigns /
//     platform_crm_campaign_targets. SEM organization_id.
//   * Claim fair-share por org (RPC `claim_campaign_targets`): a plataforma é
//     tenant-of-one — fair-share degenera para o limite global. A RPC não
//     existe no banco (verificado) → claim via SELECT + UPDATE condicionado a
//     `status='queued'` (idempotente entre ticks). TODO: RPC SKIP LOCKED se
//     surgir concorrência real.
//   * Validações WhatsApp do original (whatsapp_opt_in / telefone BR /
//     bot_loop_detected_at): colunas inexistentes na plataforma (canal =
//     webchat) — removidas. TODO(whatsapp): restaurar quando o canal existir.
//   * ENVIO: o original delegava ao manual-outreach(-batch) (Evolution/Meta).
//     A plataforma NÃO tem WhatsApp → a mensagem é gerada inline via gateway
//     de IA env-driven (AI_GATEWAY_URL / AI_API_KEY / AI_MODEL — padrão dos
//     edges platform-* já portados) com a persona de
//     platform_crm_agent_configs (campaign.agent_id) + context_used do target,
//     e ENTREGUE no webchat: lead com conversa aberta
//     (platform_crm_conversations, status != closed) → grava em
//     platform_crm_messages + broadcast `platform-conversation:{id}` evento
//     `new_message`; sem conversa → target `skipped_no_channel`.
//     TODO(whatsapp): enviar via WhatsApp da plataforma quando existir.
//   * meta_template_config (HSM Meta) → sem par na plataforma; ignorado.
//   * Update final: RPC `exec_finalize_campaign_targets` não existe → o
//     fallback per-status do original é o caminho único.
//   * Post-cadence: fire-and-forget ao `platform-cadence-enroll` (par já
//     portado). O enroll exige actorUserId em chamadas service-role →
//     usa campaign.created_by; sem created_by, pula com warn.
//   * Auth: cron/interno = bearer SERVICE_ROLE; humano = JWT super_admin.
//
// 🔒 ZERO tabela de tenant.

import { createPlatformServiceClient } from "../_shared/platform-crm-audience.ts";
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from "../_shared/platform-crm-auth.ts";
import {
  aiChatCompletions,
  aiModel,
  broadcastPlatformNewMessage,
  safeFirstName,
} from "../_shared/platform-crm-webchat.ts";

const GLOBAL_LIMIT = 100; // máx total de targets por tick (1:1)
const CONCURRENCY  = 8;   // gerações/envios paralelos (1:1 com o original)

function withinWindow(campaign: any): boolean {
  if (campaign.schedule_type !== "recurring") return true;
  const rec = campaign.recurrence;
  if (!rec) return true;
  const now = new Date();
  const day = now.getDay();
  if (Array.isArray(rec.days) && rec.days.length && !rec.days.includes(day)) return false;
  if (rec.start && rec.end) {
    const [sh, sm] = String(rec.start).split(":").map(Number);
    const [eh, em] = String(rec.end).split(":").map(Number);
    const nowMin   = now.getHours() * 60 + now.getMinutes();
    const startMin = sh * 60 + (sm || 0);
    const endMin   = eh * 60 + (em || 0);
    if (nowMin < startMin || nowMin > endMin) return false;
  }
  return true;
}

/** Executa array de promises com no máximo `limit` em paralelo por vez (1:1) */
async function pLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += limit) {
    const batch = await Promise.all(tasks.slice(i, i + limit).map((fn) => fn()));
    results.push(...batch);
  }
  return results;
}

/**
 * Gera a mensagem da campanha via gateway de IA (substitui o manual-outreach
 * do original, que montava prompt com agente + contexto + histórico do lead).
 * Mesmo padrão do platform-cadence-tick.
 */
async function generateCampaignMessage(
  supabase: any,
  opts: {
    agent: any;
    leadName: string | null;
    conversationId: string;
    campaignName: string;
    extraContext: string;
  },
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { data: messages } = await supabase
    .from("platform_crm_messages")
    .select("*")
    .eq("conversation_id", opts.conversationId)
    .order("created_at", { ascending: true })
    .limit(80);

  const history = (messages || [])
    .filter((msg: any) => !msg.is_deleted)
    .map((msg: any) => ({
      role: msg.direction === "inbound" ? "user" : "assistant",
      content: String(msg.content ?? ""),
    }));

  const agentName = opts.agent?.name || "Assistente";
  const persona = String(opts.agent?.persona_prompt || "").trim();
  const firstName = safeFirstName(opts.leadName);

  const systemPrompt = [
    `Você é ${agentName}, agente de relacionamento do CRM da plataforma.`,
    persona,
    `Sua tarefa AGORA é escrever a mensagem PROATIVA de uma campanha de contato para o lead${firstName ? ` ${firstName}` : ""}.`,
    opts.extraContext,
    `Regras: escreva apenas o texto da mensagem (sem aspas, sem prefixo), em português brasileiro, curta e natural, coerente com o histórico da conversa. Não invente dados que você não tem.`,
  ].filter(Boolean).join("\n\n");

  const aiResponse = await aiChatCompletions({
    model: aiModel(),
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: `[SISTEMA] Gere agora a mensagem da campanha "${opts.campaignName}".` },
    ],
    max_tokens: 800,
    temperature: 0.7,
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text().catch(() => "");
    return { ok: false, error: `ai_gateway_error ${aiResponse.status}: ${errorText.slice(0, 300)}` };
  }
  const aiData = await aiResponse.json().catch(() => null);
  const content = String(aiData?.choices?.[0]?.message?.content ?? "").trim();
  if (!content) return { ok: false, error: "ai_empty_response" };
  return { ok: true, message: content };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const tickId    = crypto.randomUUID().slice(0, 8);
  const tickStart = Date.now();

  try {
    const supabase    = createPlatformServiceClient();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({}));

    // Cron/interno: bearer = SERVICE_ROLE key. Humano: JWT super_admin.
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (bearer !== serviceKey) {
      const { errorResponse } = await authenticatePlatformAgent(req, supabase, serviceKey, body);
      if (errorResponse) return errorResponse;
    }

    // ── 1. Campanhas ativas ────────────────────────────────────────────────
    const { data: activeCampaigns } = await supabase
      .from("platform_crm_campaigns")
      .select("id, status, agent_id, schedule_type, recurrence, name, post_cadence_id, created_by")
      .eq("status", "active");

    const campaignCache = new Map<string, any>();
    for (const c of activeCampaigns ?? []) campaignCache.set(c.id, c);

    if (campaignCache.size === 0) {
      console.log(JSON.stringify({ tick_id: tickId, reason: "no_active_campaigns", duration_ms: Date.now() - tickStart }));
      return new Response(JSON.stringify({ processed: 0, reason: "no_active_campaigns" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Janela horária — adia targets fora de janela em lote (1:1) ─────
    const inWindowIds:    string[] = [];
    const outOfWindowIds: string[] = [];
    for (const [id, c] of campaignCache.entries()) {
      if (withinWindow(c)) inWindowIds.push(id);
      else outOfWindowIds.push(id);
    }

    if (outOfWindowIds.length) {
      await supabase
        .from("platform_crm_campaign_targets")
        .update({ scheduled_for: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
        .in("campaign_id", outOfWindowIds)
        .eq("status", "queued")
        .lte("scheduled_for", new Date().toISOString());
    }

    if (!inWindowIds.length) {
      console.log(JSON.stringify({ tick_id: tickId, reason: "all_out_of_window", duration_ms: Date.now() - tickStart }));
      return new Response(JSON.stringify({ processed: 0, reason: "all_out_of_window" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. CLAIM — SELECT + UPDATE condicionado (sem RPC; ver header) ─────
    // Tenant-of-one: sem fair-share por org; só o limite global. O UPDATE
    // guarda `status='queued'` — targets pegos por outro tick não retornam.
    const { data: candidates } = await supabase
      .from("platform_crm_campaign_targets")
      .select("id, campaign_id, lead_id, context_used, context_id, attempts")
      .in("campaign_id", inWindowIds)
      .eq("status", "queued")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(GLOBAL_LIMIT);

    // Incrementa attempts como a RPC do original: agrupa por valor atual de
    // attempts → 1 UPDATE por grupo (normalmente 1 grupo, attempts=0).
    const byAttempts = new Map<number, any[]>();
    for (const t of candidates ?? []) {
      const k = Number(t.attempts ?? 0);
      if (!byAttempts.has(k)) byAttempts.set(k, []);
      byAttempts.get(k)!.push(t);
    }

    const claimed: any[] = [];
    for (const [attempts, rows] of byAttempts.entries()) {
      const { data: got } = await supabase
        .from("platform_crm_campaign_targets")
        .update({ status: "sending", attempts: attempts + 1 })
        .in("id", rows.map((r: any) => r.id))
        .eq("status", "queued")
        .select("id");
      const gotIds = new Set((got ?? []).map((r: any) => r.id));
      claimed.push(...rows.filter((r: any) => gotIds.has(r.id)));
    }

    if (!claimed.length) {
      console.log(JSON.stringify({
        tick_id: tickId, claimed_count: 0,
        duration_ms: Date.now() - tickStart, sent: 0, failed: 0, skipped: 0,
      }));
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const leadIds = [...new Set(claimed.map((t: any) => t.lead_id))];

    // ── 4. BATCH: canal de entrega + nome do lead (substitui as validações
    // WhatsApp do original — ver header). Conversa webchat aberta mais recente
    // por lead; leads sem conversa → skipped_no_channel.
    const [convsResult, leadsResult] = await Promise.all([
      supabase
        .from("platform_crm_conversations")
        .select("id, lead_id, last_message_at")
        .in("lead_id", leadIds)
        .neq("status", "closed")
        .order("last_message_at", { ascending: false, nullsFirst: false }),
      supabase.from("platform_crm_leads").select("id, name").in("id", leadIds),
    ]);

    const convByLead = new Map<string, string>();
    for (const c of (convsResult.data ?? []) as any[]) {
      if (c.lead_id && !convByLead.has(c.lead_id)) convByLead.set(c.lead_id, c.id);
    }
    const leadNameById = new Map<string, string | null>(
      ((leadsResult.data ?? []) as any[]).map((l) => [l.id, l.name ?? null]),
    );

    // ── 5. Classificar targets sem tocar no banco (1:1) ───────────────────
    type FinalRow = {
      id: string;
      status: "sent" | "failed" | "cancelled" | "skipped";
      error: string | null;
      sent_at: string | null;
      conversation_id: string | null;
    };
    const finals: FinalRow[] = [];
    const toProcess: any[]   = [];

    for (const t of claimed) {
      const campaign = campaignCache.get(t.campaign_id);
      if (!campaign?.agent_id) {
        // 1:1 em espírito: no original o manual-outreach falharia sem agente.
        finals.push({ id: t.id, status: "failed", error: "campaign_has_no_agent", sent_at: null, conversation_id: null });
        continue;
      }
      const convId = convByLead.get(t.lead_id);
      if (!convId) {
        // Plataforma sem WhatsApp: sem conversa webchat aberta = sem canal.
        // TODO(whatsapp): tentar WhatsApp aqui quando o canal existir.
        finals.push({ id: t.id, status: "skipped", error: "skipped_no_channel", sent_at: null, conversation_id: null });
        continue;
      }
      toProcess.push({ ...t, conversation_id: convId });
    }

    // ── 6. ENVIO — geração IA inline + webchat (substitui manual-outreach) ─
    const agentCache = new Map<string, any>();
    async function getAgent(agentId: string): Promise<any> {
      if (agentCache.has(agentId)) return agentCache.get(agentId);
      const { data } = await supabase
        .from("platform_crm_agent_configs")
        .select("id, name, persona_prompt, is_active")
        .eq("id", agentId)
        .maybeSingle();
      agentCache.set(agentId, data ?? null);
      return data ?? null;
    }

    const processTasks = toProcess.map((t) => async () => {
      try {
        const campaign = campaignCache.get(t.campaign_id)!;
        const agent = await getAgent(campaign.agent_id);

        const extraContext = [
          `[Campanha: ${campaign.name}]`,
          t.context_used ? `Contexto:\n${t.context_used}` : "",
        ].filter(Boolean).join("\n\n");

        const gen = await generateCampaignMessage(supabase, {
          agent,
          leadName: leadNameById.get(t.lead_id) ?? null,
          conversationId: t.conversation_id,
          campaignName: campaign.name,
          extraContext,
        });

        if (!gen.ok) {
          finals.push({ id: t.id, status: "failed", error: gen.error, sent_at: null, conversation_id: null });
          return;
        }

        // Persiste no webchat da plataforma + broadcast
        // (canal `platform-conversation:{id}`, evento `new_message`).
        const { data: savedMessage, error: msgError } = await supabase
          .from("platform_crm_messages")
          .insert({
            conversation_id: t.conversation_id,
            direction: "outbound",
            sender_type: "bot",
            content: gen.message,
            message_type: "text",
            metadata: {
              source: "campaign",
              campaign_id: t.campaign_id,
              campaign_target_id: t.id,
              context_id: t.context_id ?? null,
            },
          })
          .select()
          .single();

        if (msgError || !savedMessage) {
          finals.push({ id: t.id, status: "failed", error: msgError?.message ?? "message_insert_failed", sent_at: null, conversation_id: null });
          return;
        }

        // last_message_at — non-fatal (padrão platform-webchat-bot)
        try {
          await supabase
            .from("platform_crm_conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", t.conversation_id);
        } catch (e) {
          console.warn("[platform-campaign-dispatcher] conversation update failed (non-fatal):", e);
        }

        await broadcastPlatformNewMessage(supabase, t.conversation_id, savedMessage);

        finals.push({
          id: t.id,
          status: "sent",
          error: null,
          sent_at: new Date().toISOString(),
          conversation_id: t.conversation_id,
        });
      } catch (err) {
        finals.push({ id: t.id, status: "failed", error: (err as Error).message, sent_at: null, conversation_id: null });
      }
    });
    await pLimit(processTasks, CONCURRENCY);

    // ── 7. UPDATE FINAL — fallback per-status do original (RPC inexistente) ─
    if (finals.length) {
      const byStatus: Record<string, FinalRow[]> = {};
      for (const f of finals) (byStatus[f.status] ||= []).push(f);

      // PostgrestFilterBuilder é thenable (PromiseLike), não Promise.
      const fallback: PromiseLike<any>[] = [];
      for (const [status, rows] of Object.entries(byStatus)) {
        if (status === "sent") {
          // conversation_id é único por linha — update individual (1:1)
          for (const r of rows) {
            fallback.push(
              supabase.from("platform_crm_campaign_targets").update({
                status: "sent",
                sent_at: r.sent_at,
                conversation_id: r.conversation_id,
              }).eq("id", r.id),
            );
          }
        } else {
          // failed / cancelled / skipped — agrupa por mensagem (1:1)
          const byErr: Record<string, string[]> = {};
          for (const r of rows) (byErr[r.error ?? "unknown"] ||= []).push(r.id);
          for (const [error, idList] of Object.entries(byErr)) {
            fallback.push(
              supabase.from("platform_crm_campaign_targets").update({ status, error }).in("id", idList),
            );
          }
        }
      }
      await Promise.all(fallback);
    }

    // ── 8. Post-cadence enroll (fire-and-forget, 1:1) ─────────────────────
    for (const f of finals.filter((x) => x.status === "sent")) {
      const t = toProcess.find((x) => x.id === f.id);
      if (!t) continue;
      const campaign = campaignCache.get(t.campaign_id)!;
      if (!campaign.post_cadence_id) continue;
      if (!campaign.created_by) {
        // platform-cadence-enroll exige actorUserId em chamada service-role.
        console.warn("[platform-campaign-dispatcher] post-cadence pulada — campanha sem created_by:", campaign.id);
        continue;
      }
      fetch(`${supabaseUrl}/functions/v1/platform-cadence-enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          cadence_id: campaign.post_cadence_id,
          lead_ids:   [t.lead_id],
          source:     "campaign",
          source_ref: { campaign_id: campaign.id, campaign_target_id: f.id },
          actorUserId: campaign.created_by,
        }),
      }).catch((e) => console.error("[platform-campaign-dispatcher] cadence-enroll non-fatal:", e));
    }

    // ── 9. Completa campanhas sem targets restantes (1:1) ─────────────────
    const touchedCampaigns = [...new Set(claimed.map((t: any) => t.campaign_id))];
    const completionChecks = touchedCampaigns.map(async (cid: any) => {
      const { count } = await supabase
        .from("platform_crm_campaign_targets")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", cid)
        .in("status", ["queued", "sending"]);
      if (count === 0) {
        const camp = campaignCache.get(cid);
        if (camp?.schedule_type !== "recurring") {
          await supabase
            .from("platform_crm_campaigns")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", cid)
            .eq("status", "active");
        }
      }
    });
    await Promise.all(completionChecks);

    const sent    = finals.filter((f) => f.status === "sent").length;
    const failed  = finals.filter((f) => f.status === "failed").length;
    const skipped = finals.filter((f) => f.status === "skipped" || f.status === "cancelled").length;

    console.log(JSON.stringify({
      tick_id:       tickId,
      claimed_count: claimed.length,
      duration_ms:   Date.now() - tickStart,
      sent, failed, skipped,
    }));

    return new Response(
      JSON.stringify({ processed: sent, skipped, failed, total: claimed.length, tick_id: tickId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(`[platform-campaign-dispatcher] tick=${tickId}`, err);
    return new Response(JSON.stringify({ error: (err as Error).message, tick_id: tickId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
