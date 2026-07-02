// platform-cadence-tick — motor de CADÊNCIAS do CRM de PLATAFORMA (super_admin)
//
// Porte 1:1 do `cadence-tick` do CRM Vendus, DESACOPLADO do tenant.
// Cron a cada 5min (idempotente — lock otimista por step_run). Executa
// platform_crm_cadence_step_runs vencidos: valida janela, condições, gera a
// mensagem contextual via IA e agenda o próximo step.
//
// Adaptações de canal (a plataforma NÃO tem WhatsApp conectado ainda):
//   * O original delegava o envio ao `manual-outreach` (Evolution/Meta via
//     resolveAgentSendConnection). Aqui a geração é inline via gateway de IA
//     env-driven (AI_GATEWAY_URL / AI_API_KEY / AI_MODEL — mesmo padrão dos
//     edges platform-* já portados) e a ENTREGA é o webchat: se o lead tem
//     conversa aberta (platform_crm_conversations, status != closed), a
//     mensagem é persistida em platform_crm_messages + broadcast no canal
//     `platform-conversation:{id}` evento `new_message`; senão o run é
//     registrado como skipped (skip_reason = "skipped_no_channel").
//     TODO(whatsapp): quando o canal WhatsApp da plataforma existir, enviar
//     por ele quando não houver conversa webchat aberta.
//   * Bloco Meta 24h/template HSM do original → cai fora (sem conexão Meta;
//     platform_crm_cadence_steps não tem reengagement_template_id).
//   * Bot-loop guard (webchat_conversations.bot_loop_detected_at) → sem coluna
//     equivalente em platform_crm_conversations; guard omitido.
//   * "Comprou" (deals + pipeline_stages.stage_type='won') →
//     platform_crm_deals.status = 'won'.
//   * getStepContext: platform_crm_cadence_steps não tem context_id (nem existe
//     campaign_contexts na plataforma) → context_inline ?? objective.
//   * Auth: cron/interno = bearer SERVICE_ROLE; humano = JWT super_admin
//     (platform-crm-auth).
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

const MAX_PER_TICK = 50;

const DAY_MAP: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function withinWindow(window: any): boolean {
  if (!window) return true;
  const now = new Date();
  const day = now.getDay();
  const days: any[] = Array.isArray(window.days) ? window.days : [];
  if (days.length) {
    const allowed = days.map((d) => (typeof d === "number" ? d : DAY_MAP[String(d).toLowerCase()]));
    if (!allowed.includes(day)) return false;
  }
  if (window.start && window.end) {
    const [sh, sm] = String(window.start).split(":").map(Number);
    const [eh, em] = String(window.end).split(":").map(Number);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < sh * 60 + (sm || 0) || nowMin > eh * 60 + (em || 0)) return false;
  }
  return true;
}

function computeScheduledAt(step: any, fromDate: Date): Date {
  if (step.execute_immediately) return new Date();
  const v = Number(step.delay_value ?? 0);
  const unit = step.delay_unit ?? "days";
  const mult = unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : 86_400_000;
  return new Date(fromDate.getTime() + v * mult);
}

async function evaluateStepConditions(supabase: any, conditions: any, lead_id: string): Promise<{ ok: boolean; reason?: string }> {
  // NOTA: o guard global de bot-loop do original (webchat_conversations.
  // bot_loop_detected_at) não existe na plataforma — coluna ausente em
  // platform_crm_conversations. Omitido.

  if (!conditions || !Object.keys(conditions).length) return { ok: true };

  // not_purchased — lead não tem deal ganho (platform_crm_deals.status='won')
  if (conditions.not_purchased) {
    const { data } = await supabase
      .from("platform_crm_deals")
      .select("id")
      .eq("lead_id", lead_id)
      .eq("status", "won")
      .limit(1);
    if (data && data.length) return { ok: false, reason: "Lead já comprou" };
  }

  // not_responded — não respondeu em runs anteriores desta cadência (passa, será stop_rules quem trata)
  // without_tag — lead não tem essas tags
  if (Array.isArray(conditions.without_tags) && conditions.without_tags.length) {
    const { data } = await supabase
      .from("platform_crm_lead_tag_assignments")
      .select("tag_id")
      .eq("lead_id", lead_id)
      .in("tag_id", conditions.without_tags)
      .limit(1);
    if (data && data.length) return { ok: false, reason: "Lead possui tag de exclusão" };
  }

  // with_tag — exige uma das tags
  if (Array.isArray(conditions.with_tags) && conditions.with_tags.length) {
    const { data } = await supabase
      .from("platform_crm_lead_tag_assignments")
      .select("tag_id")
      .eq("lead_id", lead_id)
      .in("tag_id", conditions.with_tags)
      .limit(1);
    if (!data || !data.length) return { ok: false, reason: "Lead não possui tag exigida" };
  }

  return { ok: true };
}

// platform_crm_cadence_steps não tem context_id — só inline (ver header).
function getStepContext(step: any): string {
  if (step.context_inline && step.context_inline.trim()) return step.context_inline.trim();
  return step.objective ?? "";
}

/**
 * Gera a mensagem contextual da etapa via gateway de IA (substitui a chamada
 * ao `manual-outreach` do original, que montava prompt com contexto +
 * histórico do lead). Persona = platform_crm_agent_configs (cadence.agent_id).
 */
async function generateCadenceMessage(
  supabase: any,
  opts: {
    agent: any;
    leadName: string | null;
    conversationId: string;
    cadenceName: string;
    extraContext: string;
  },
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  // Histórico da conversa (mesmo padrão do platform-webchat-bot: limit 80,
  // inbound→user / outbound→assistant, ignora deletadas).
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
    `Sua tarefa AGORA é escrever a PRÓXIMA mensagem PROATIVA de follow-up para o lead${firstName ? ` ${firstName}` : ""}, como parte de uma cadência automática de contato.`,
    opts.extraContext,
    `Regras: escreva apenas o texto da mensagem (sem aspas, sem prefixo), em português brasileiro, curta e natural, coerente com o histórico da conversa. Não invente dados que você não tem.`,
  ].filter(Boolean).join("\n\n");

  const aiResponse = await aiChatCompletions({
    model: aiModel(),
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: `[SISTEMA] Gere agora a mensagem de follow-up da cadência "${opts.cadenceName}".` },
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
  try {
    const supabase = createPlatformServiceClient();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({}));

    // Cron/interno: bearer = SERVICE_ROLE key. Humano: JWT super_admin.
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (bearer !== serviceKey) {
      const { errorResponse } = await authenticatePlatformAgent(req, supabase, serviceKey, body);
      if (errorResponse) return errorResponse;
    }

    const { data: runs } = await supabase
      .from("platform_crm_cadence_step_runs")
      .select("id, enrollment_id, step_id, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .limit(MAX_PER_TICK);

    const list = runs ?? [];
    if (!list.length) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0, skipped = 0, failed = 0, completed = 0;
    const cadenceCache = new Map<string, any>();
    const stepsCache = new Map<string, any[]>();
    const agentCache = new Map<string, any>();

    for (const run of list) {
      // Lock otimista (1:1) — idempotente: só um tick consegue o update.
      const { data: locked } = await supabase
        .from("platform_crm_cadence_step_runs")
        .update({ status: "sent" }) // será revertido se falhar / skip
        .eq("id", run.id)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();
      if (!locked) { skipped++; continue; }

      try {
        // Pega enrollment + cadence + step
        const { data: enrollment } = await supabase
          .from("platform_crm_cadence_enrollments")
          .select("id, cadence_id, lead_id, status, current_step_index")
          .eq("id", run.enrollment_id)
          .maybeSingle();
        if (!enrollment || enrollment.status !== "active") {
          await supabase.from("platform_crm_cadence_step_runs").update({ status: "skipped", skip_reason: "enrollment_inactive", executed_at: new Date().toISOString() }).eq("id", run.id);
          skipped++; continue;
        }

        let cadence = cadenceCache.get(enrollment.cadence_id);
        if (!cadence) {
          const { data } = await supabase
            .from("platform_crm_cadences")
            .select("id, status, agent_id, name, execution_window, stop_rules")
            .eq("id", enrollment.cadence_id)
            .maybeSingle();
          if (data) cadenceCache.set(enrollment.cadence_id, data);
          cadence = data;
        }
        if (!cadence || cadence.status !== "active") {
          await supabase.from("platform_crm_cadence_step_runs").update({ status: "skipped", skip_reason: "cadence_inactive", executed_at: new Date().toISOString() }).eq("id", run.id);
          skipped++; continue;
        }

        if (!withinWindow(cadence.execution_window)) {
          // Reagendar 10min à frente (1:1)
          await supabase
            .from("platform_crm_cadence_step_runs")
            .update({ status: "scheduled", scheduled_at: new Date(Date.now() + 10 * 60_000).toISOString() })
            .eq("id", run.id);
          skipped++; continue;
        }

        // stop_rules globais — ex: stop_on_purchase (deal ganho na plataforma)
        const stopRules = cadence.stop_rules ?? {};
        if (stopRules.stop_on_purchase) {
          const { data: deals } = await supabase
            .from("platform_crm_deals")
            .select("id")
            .eq("lead_id", enrollment.lead_id)
            .eq("status", "won")
            .limit(1);
          if (deals && deals.length) {
            await supabase.from("platform_crm_cadence_enrollments").update({ status: "stopped", stopped_at: new Date().toISOString(), stop_reason: "purchased" }).eq("id", enrollment.id);
            await supabase.from("platform_crm_cadence_step_runs").update({ status: "skipped", skip_reason: "stopped_on_purchase", executed_at: new Date().toISOString() }).eq("id", run.id);
            skipped++; continue;
          }
        }

        let steps = stepsCache.get(enrollment.cadence_id);
        if (!steps) {
          const { data } = await supabase
            .from("platform_crm_cadence_steps")
            .select("*")
            .eq("cadence_id", enrollment.cadence_id)
            .order("order_index", { ascending: true });
          steps = data ?? [];
          stepsCache.set(enrollment.cadence_id, steps!);
        }

        const currentStep = steps!.find((s: any) => s.id === run.step_id);
        if (!currentStep) {
          await supabase.from("platform_crm_cadence_step_runs").update({ status: "skipped", skip_reason: "step_not_found", executed_at: new Date().toISOString() }).eq("id", run.id);
          skipped++; continue;
        }

        // Avalia condições da etapa
        const evalResult = await evaluateStepConditions(supabase, currentStep.conditions, enrollment.lead_id);
        if (!evalResult.ok) {
          await supabase.from("platform_crm_cadence_step_runs").update({ status: "skipped", skip_reason: evalResult.reason ?? "conditions", executed_at: new Date().toISOString() }).eq("id", run.id);
          skipped++;
          // Avança mesmo assim para próximo step? Sim — não trava o lead na etapa. (1:1)
        } else {
          if (!cadence.agent_id) {
            await supabase.from("platform_crm_cadence_step_runs").update({ status: "failed", error: "Cadence has no agent_id", executed_at: new Date().toISOString() }).eq("id", run.id);
            failed++; continue;
          }

          // Persona do agente da plataforma (análogo do product_agent do original)
          let agent = agentCache.get(cadence.agent_id);
          if (agent === undefined) {
            const { data } = await supabase
              .from("platform_crm_agent_configs")
              .select("id, name, persona_prompt, is_active")
              .eq("id", cadence.agent_id)
              .maybeSingle();
            agent = data ?? null;
            agentCache.set(cadence.agent_id, agent);
          }

          // ── CANAL DE ENVIO ────────────────────────────────────────────────
          // Original: resolveAgentSendConnection (Evolution/Meta WhatsApp).
          // Plataforma: única entrega disponível é a conversa de webchat aberta
          // do lead. Sem conversa aberta → skipped_no_channel.
          // TODO(whatsapp): enviar via WhatsApp da plataforma quando existir.
          const { data: convRow } = await supabase
            .from("platform_crm_conversations")
            .select("id")
            .eq("lead_id", enrollment.lead_id)
            .neq("status", "closed")
            .order("last_message_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();

          if (!convRow?.id) {
            await supabase.from("platform_crm_cadence_step_runs").update({
              status: "skipped",
              skip_reason: "skipped_no_channel",
              executed_at: new Date().toISOString(),
            }).eq("id", run.id);
            skipped++;
            // fall-through: ainda agenda o próximo step abaixo (mesmo padrão do
            // out_of_window_no_template do original).
          } else {
            // Monta contexto + objetivo da etapa + tom (1:1)
            const ctx = getStepContext(currentStep);
            const extra_context = [
              `[Cadência: ${cadence.name}]`,
              currentStep.objective ? `Objetivo da etapa: ${currentStep.objective}` : "",
              currentStep.tone ? `Tom: ${currentStep.tone}` : "",
              ctx ? `Contexto:\n${ctx}` : "",
            ].filter(Boolean).join("\n\n");

            const { data: leadRow } = await supabase
              .from("platform_crm_leads")
              .select("id, name")
              .eq("id", enrollment.lead_id)
              .maybeSingle();

            const gen = await generateCadenceMessage(supabase, {
              agent,
              leadName: leadRow?.name ?? null,
              conversationId: convRow.id,
              cadenceName: cadence.name,
              extraContext: extra_context,
            });

            if (!gen.ok) {
              await supabase.from("platform_crm_cadence_step_runs").update({ status: "failed", error: gen.error, executed_at: new Date().toISOString() }).eq("id", run.id);
              failed++; continue;
            }

            // Persiste a mensagem no webchat da plataforma + broadcast
            // (canal `platform-conversation:{id}`, evento `new_message`).
            const { data: savedMessage, error: msgError } = await supabase
              .from("platform_crm_messages")
              .insert({
                conversation_id: convRow.id,
                direction: "outbound",
                sender_type: "bot",
                content: gen.message,
                message_type: "text",
                metadata: {
                  source: "cadence",
                  cadence_id: cadence.id,
                  cadence_step_id: currentStep.id,
                  cadence_run_id: run.id,
                },
              })
              .select()
              .single();

            if (msgError || !savedMessage) {
              await supabase.from("platform_crm_cadence_step_runs").update({ status: "failed", error: msgError?.message ?? "message_insert_failed", executed_at: new Date().toISOString() }).eq("id", run.id);
              failed++; continue;
            }

            // last_message_at da conversa — non-fatal (padrão platform-webchat-bot)
            try {
              await supabase
                .from("platform_crm_conversations")
                .update({ last_message_at: new Date().toISOString() })
                .eq("id", convRow.id);
            } catch (e) {
              console.warn("[platform-cadence-tick] conversation update failed (non-fatal):", e);
            }

            await broadcastPlatformNewMessage(supabase, convRow.id, savedMessage);

            await supabase.from("platform_crm_cadence_step_runs").update({
              status: "sent",
              executed_at: new Date().toISOString(),
              conversation_id: convRow.id,
              agent_message: gen.message,
            }).eq("id", run.id);
            processed++;
          }
        }

        // Agenda próximo step (1:1)
        const nextIndex = (enrollment.current_step_index ?? 0) + 1;
        const nextStep = steps![nextIndex];
        if (nextStep) {
          const scheduledAt = computeScheduledAt(nextStep, new Date());
          await supabase.from("platform_crm_cadence_step_runs").insert({
            enrollment_id: enrollment.id,
            step_id: nextStep.id,
            scheduled_at: scheduledAt.toISOString(),
            status: "scheduled",
          });
          await supabase.from("platform_crm_cadence_enrollments").update({
            current_step_id: nextStep.id,
            current_step_index: nextIndex,
          }).eq("id", enrollment.id);
        } else {
          // Concluído
          await supabase.from("platform_crm_cadence_enrollments").update({
            status: "completed",
            completed_at: new Date().toISOString(),
          }).eq("id", enrollment.id);
          completed++;
        }

        // Atualiza last_executed_at da cadência
        await supabase.from("platform_crm_cadences").update({ last_executed_at: new Date().toISOString() }).eq("id", cadence.id);
      } catch (err) {
        console.error("[platform-cadence-tick] run error", run.id, err);
        await supabase.from("platform_crm_cadence_step_runs").update({ status: "failed", error: (err as Error).message, executed_at: new Date().toISOString() }).eq("id", run.id);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ processed, skipped, failed, completed, total: list.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[platform-cadence-tick]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
