// platform-mia — Mia, copiloto executivo do CRM de PLATAFORMA (super_admin)
//
// Porte 1:1 da Mia do CRM Vendus (`mia-tools` + persona do `mia-realtime-session`)
// para o CRM de plataforma, DESACOPLADO do tenant. Edge ÚNICA com dois modos:
//   1. `{ tool, args }`      → executa uma tool direta (contrato 1:1 do `mia-tools`;
//                              usado pelo painel da UI: briefing/resumo operacional).
//   2. `{ messages: [...] }` → chat da Mia: system prompt executivo (persona
//                              VERBATIM do original, seções de voz/ação/memória
//                              removidas — ver adaptações) + loop de tool-calling
//                              (máx 6 rodadas) → `{ reply, tool_events }`.
//
// Tabelas: SOMENTE platform_crm_* (+ user_roles p/ gate via authenticatePlatformAgent
// e `profiles` APENAS para hidratar nomes de usuários — mesma exceção já usada pelo
// edge irmão `platform-webchat-inbox`; profiles é a tabela global de usuários, não
// dado de tenant). ZERO webchat_*, leads, organizations.
//
// Auth: Bearer JWT + gate super_admin (authenticatePlatformAgent, 1:1 com irmãos).
// IA:   gateway OpenRouter via env `AI_API_KEY` (+ `AI_GATEWAY_URL` opcional) —
//       MESMO mecanismo do `platform-sales-copilot`; nenhuma env var nova.
//
// ── Mapa de tools: original (mia-tools) → platform ─────────────────────────────
// PORTADAS (read-only, adaptadas ao schema platform_crm_*):
//   get_operation_summary, get_team_status, get_unanswered_conversations,
//   get_hot_leads, get_overdue_tasks, get_today_schedule, get_lead_context,
//   get_conversation_summary, get_conversation_messages, get_seller_context,
//   get_pipeline_context, get_followup_context, get_daily_ai_summary,
//   find_active_conversation, list_conversations, get_conversation_detail,
//   list_agents, get_agent_workload, find_calendar_event.
// ADICIONADAS (pedido da plataforma; sem equivalente no mia-tools original):
//   get_campaigns_overview, get_cadences_overview.
// OMITIDAS (tabela/coluna sem equivalente platform_crm_*):
//   * draft_whatsapp_message / draft_email / draft_internal_notification /
//     draft_push / draft_conversation_message / draft_assign_conversation /
//     draft_transfer_sector / draft_close_conversation / draft_takeover_from_agent /
//     draft_handback_to_agent / draft_reschedule_booking / draft_cancel_booking /
//     check_action_status + edges mia-prepare-action / mia-execute-action →
//     dependem de `mia_actions` (ciclo prepare→approve→execute); v2.
//   * get_memory / remember_fact / forget_fact / update_preference →
//     dependem de `mia_user_memory`.
//   * resolve_recipient / get_contact_context → existiam para suportar os drafts
//     de envio (Messenger); sem envio, `get_lead_context` cobre a consulta.
//   * mia-realtime-session (voz/WebRTC) → fora do escopo v1 por decisão.
// ── Adaptações de schema (colunas ausentes em platform_crm_*) ──────────────────
//   * conversas: `assigned_user_id`→`assigned_to`; SEM `last_inbound_at` (tempo
//     sem resposta aproximado por `last_message_at`), SEM `sector_id` (filtro de
//     setor omitido), SEM colunas de provider WhatsApp/Meta/IG (canal = web_chat),
//     SEM `last_message_content`; janela 24h não se aplica (webchat).
//   * `interactions` (jornada do lead), `conversation_transfers` e
//     `agent_handoff_history` (detalhe da conversa) → inexistentes; omitidos.
//   * caches: `mia_daily_summaries` e `conversation_notes.ai_summary` →
//     inexistentes; briefing e resumo de conversa são computados fresh.
//   * log `mia_logs` → inexistente; sem log de uso.
//   * deals da plataforma só têm status won/lost/cancelled (sem 'open') →
//     "oportunidades em risco" = leads com deal_value > 0 parados há 7+ dias em
//     etapa não-ganha/não-perdida.
//   * agentes IA: `product_agents` → `platform_crm_agent_configs`.
//   * "equipe" = vendedores DA PLATAFORMA (membros de squads + atribuídos a
//     leads), mesmo universo do `usePlatformCrmTeam` — não há org-membership.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import { createPlatformServiceClient } from '../_shared/platform-crm-audience.ts';

const DEFAULT_MODEL = 'google/gemini-2.5-flash';
const MAX_TOOL_ROUNDS = 6;
const OPEN_STATUSES = ['bot_active', 'waiting_human', 'human_active'];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function startOfDayISO(d = new Date()) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s.toISOString();
}
function endOfDayISO(d = new Date()) {
  const s = new Date(d);
  s.setHours(23, 59, 59, 999);
  return s.toISOString();
}

// ============================================================
// IA — mesmo mecanismo do platform-sales-copilot (AI_API_KEY / AI_GATEWAY_URL)
// ============================================================

function aiConfig() {
  const apiKey = Deno.env.get('AI_API_KEY') ?? '';
  const gatewayBase = (Deno.env.get('AI_GATEWAY_URL') ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  return { apiKey, gatewayBase, model: DEFAULT_MODEL };
}

async function aiChatCompletion(body: Record<string, unknown>): Promise<any> {
  const { apiKey, gatewayBase, model } = aiConfig();
  if (!apiKey) throw new Error('AI_API_KEY não configurada na plataforma.');
  const response = await fetch(`${gatewayBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, ...body }),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`AI gateway ${response.status}: ${errorText.slice(0, 200) || response.statusText}`);
  }
  return await response.json().catch(() => null);
}

// ============================================================
// Helpers de hidratação (nomes de usuários via profiles — ver header)
// ============================================================

async function profileNameMap(admin: any, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean))) as string[];
  if (!unique.length) return map;
  const { data } = await admin.from('profiles').select('id, full_name').in('id', unique);
  for (const p of data ?? []) map.set(p.id, p.full_name ?? '—');
  return map;
}

/** Universo de vendedores da plataforma = squads + atribuídos a leads (1:1 usePlatformCrmTeam). */
async function getPlatformSellerIds(admin: any): Promise<string[]> {
  const [squadMembers, assigned] = await Promise.all([
    admin.from('platform_crm_squad_members').select('user_id'),
    admin.from('platform_crm_leads').select('assigned_to, sdr_id, closer_id'),
  ]);
  const ids = new Set<string>();
  for (const m of squadMembers.data ?? []) if (m.user_id) ids.add(m.user_id);
  for (const l of assigned.data ?? []) {
    if (l.assigned_to) ids.add(l.assigned_to);
    if (l.sdr_id) ids.add(l.sdr_id);
    if (l.closer_id) ids.add(l.closer_id);
  }
  return [...ids];
}

async function findPlatformSellerByName(admin: any, term: string) {
  if (!term) return [];
  const sellerIds = await getPlatformSellerIds(admin);
  if (!sellerIds.length) return [];
  const like = `%${term}%`;
  const { data } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .in('id', sellerIds)
    .or(`full_name.ilike.${like},email.ilike.${like}`)
    .limit(5);
  return data ?? [];
}

// ============================================================
// Tools — Fase 1 (métricas)
// ============================================================

async function getOperationSummary(admin: any) {
  const todayStart = startOfDayISO();
  const todayEnd = endOfDayISO();
  const nowIso = new Date().toISOString();

  const [openConv, waitingConv, hotLeads, unassignedLeads, overdueTasks, todayEvents] = await Promise.all([
    admin.from('platform_crm_conversations').select('id', { count: 'exact', head: true })
      .in('status', OPEN_STATUSES),
    admin.from('platform_crm_conversations').select('id', { count: 'exact', head: true })
      .eq('status', 'waiting_human'),
    admin.from('platform_crm_leads').select('id', { count: 'exact', head: true })
      .eq('temperature', 'hot'),
    admin.from('platform_crm_leads').select('id', { count: 'exact', head: true })
      .is('assigned_to', null),
    admin.from('platform_crm_tasks').select('id', { count: 'exact', head: true })
      .neq('status', 'completed').lt('due_date', nowIso),
    admin.from('platform_crm_calendar_events').select('id', { count: 'exact', head: true })
      .gte('start_time', todayStart).lte('start_time', todayEnd),
  ]);

  return {
    conversas_abertas: openConv.count ?? 0,
    conversas_sem_resposta: waitingConv.count ?? 0,
    leads_quentes: hotLeads.count ?? 0,
    leads_sem_responsavel: unassignedLeads.count ?? 0,
    tarefas_atrasadas: overdueTasks.count ?? 0,
    reunioes_hoje: todayEvents.count ?? 0,
  };
}

async function getTeamStatus(admin: any) {
  const sellerIds = await getPlatformSellerIds(admin);
  if (!sellerIds.length) return { equipe: [] };
  const nameMap = await profileNameMap(admin, sellerIds);
  const nowIso = new Date().toISOString();
  const todayStart = startOfDayISO();
  const todayEnd = endOfDayISO();

  const [convs, leads, tasks, events] = await Promise.all([
    admin.from('platform_crm_conversations').select('assigned_to')
      .in('status', OPEN_STATUSES).in('assigned_to', sellerIds),
    admin.from('platform_crm_leads').select('assigned_to').in('assigned_to', sellerIds),
    admin.from('platform_crm_tasks').select('user_id')
      .in('user_id', sellerIds).neq('status', 'completed').lt('due_date', nowIso),
    admin.from('platform_crm_calendar_events').select('user_id')
      .gte('start_time', todayStart).lte('start_time', todayEnd).in('user_id', sellerIds),
  ]);

  const count = (rows: any[], k: string) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      const id = r[k];
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  };
  const cConv = count(convs.data ?? [], 'assigned_to');
  const cLeads = count(leads.data ?? [], 'assigned_to');
  const cTasks = count(tasks.data ?? [], 'user_id');
  const cEvents = count(events.data ?? [], 'user_id');

  return {
    equipe: sellerIds.map((id) => ({
      nome: nameMap.get(id) ?? 'Sem nome',
      conversas_abertas: cConv.get(id) ?? 0,
      leads: cLeads.get(id) ?? 0,
      tarefas_atrasadas: cTasks.get(id) ?? 0,
      reunioes_hoje: cEvents.get(id) ?? 0,
    })).sort((a, b) => (b.conversas_abertas + b.tarefas_atrasadas) - (a.conversas_abertas + a.tarefas_atrasadas)),
  };
}

async function getUnansweredConversations(admin: any) {
  // Adaptação: sem last_inbound_at na plataforma → tempo aproximado por last_message_at.
  const { data } = await admin.from('platform_crm_conversations')
    .select('id, visitor_name, assigned_to, last_message_at, channel')
    .eq('status', 'waiting_human')
    .order('last_message_at', { ascending: true, nullsFirst: false })
    .limit(20);

  const nameMap = await profileNameMap(admin, (data ?? []).map((c: any) => c.assigned_to));
  const now = Date.now();
  return {
    conversas: (data ?? []).map((c: any) => {
      const minutos = c.last_message_at
        ? Math.round((now - new Date(c.last_message_at).getTime()) / 60000)
        : null;
      return {
        lead: c.visitor_name ?? 'Visitante',
        canal: c.channel,
        responsavel: c.assigned_to ? nameMap.get(c.assigned_to) ?? '—' : 'Sem responsável',
        tempo_sem_resposta_min: minutos,
      };
    }),
  };
}

async function getHotLeads(admin: any) {
  const { data } = await admin.from('platform_crm_leads')
    .select('name, assigned_to, temperature, last_contact_at, next_action')
    .eq('temperature', 'hot')
    .order('last_contact_at', { ascending: false, nullsFirst: false })
    .limit(20);

  const nameMap = await profileNameMap(admin, (data ?? []).map((l: any) => l.assigned_to));
  return {
    leads: (data ?? []).map((l: any) => ({
      lead: l.name,
      responsavel: l.assigned_to ? nameMap.get(l.assigned_to) ?? '—' : 'Sem responsável',
      proxima_acao: l.next_action ?? null,
    })),
  };
}

async function getOverdueTasks(admin: any) {
  const nowIso = new Date().toISOString();
  const { data } = await admin.from('platform_crm_tasks')
    .select('title, user_id, priority, due_date')
    .neq('status', 'completed').lt('due_date', nowIso)
    .order('due_date', { ascending: true })
    .limit(20);

  const nameMap = await profileNameMap(admin, (data ?? []).map((t: any) => t.user_id));
  const now = Date.now();
  return {
    tarefas: (data ?? []).map((t: any) => ({
      titulo: t.title,
      responsavel: nameMap.get(t.user_id) ?? '—',
      prioridade: t.priority ?? 'medium',
      dias_atraso: t.due_date ? Math.max(1, Math.round((now - new Date(t.due_date).getTime()) / 86400000)) : null,
    })),
  };
}

async function getTodaySchedule(admin: any) {
  const { data } = await admin.from('platform_crm_calendar_events')
    .select('title, start_time, end_time, user_id, event_type, lead_id')
    .gte('start_time', startOfDayISO()).lte('start_time', endOfDayISO())
    .order('start_time', { ascending: true })
    .limit(50);

  const nameMap = await profileNameMap(admin, (data ?? []).map((e: any) => e.user_id));
  return {
    eventos: (data ?? []).map((e: any) => ({
      titulo: e.title,
      tipo: e.event_type ?? 'meeting',
      responsavel: nameMap.get(e.user_id) ?? '—',
      inicio: e.start_time,
    })),
  };
}

// ============================================================
// Tools — Fase 3 (Analyst)
// ============================================================

async function findLead(admin: any, args: any) {
  if (args?.lead_id) {
    const { data } = await admin.from('platform_crm_leads')
      .select('*').eq('id', args.lead_id).maybeSingle();
    return data ? [data] : [];
  }
  const term = String(args?.lead_name ?? '').trim();
  if (!term) return [];
  const like = `%${term}%`;
  const { data } = await admin.from('platform_crm_leads')
    .select('*')
    .or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
    .limit(5);
  return data ?? [];
}

async function getLeadContext(admin: any, args: any) {
  const matches = await findLead(admin, args);
  if (!matches.length) return { encontrado: false, mensagem: 'Nenhum lead encontrado.' };
  if (matches.length > 1 && !args?.lead_id) {
    return {
      encontrado: false,
      ambiguidade: true,
      candidatos: matches.map((l: any) => ({ id: l.id, nome: l.name, email: l.email, phone: l.phone })),
    };
  }
  const lead = matches[0];

  const [stage, tags, notes, tasks, deals, history] = await Promise.all([
    lead.current_stage_id
      ? admin.from('platform_crm_pipeline_stages').select('name').eq('id', lead.current_stage_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('platform_crm_lead_tag_assignments')
      .select('platform_crm_lead_tags(name, color)').eq('lead_id', lead.id).limit(10),
    admin.from('platform_crm_lead_notes')
      .select('content, created_at').eq('lead_id', lead.id)
      .order('created_at', { ascending: false }).limit(5),
    admin.from('platform_crm_tasks')
      .select('title, due_date, status, priority').eq('lead_id', lead.id)
      .neq('status', 'completed').order('due_date', { ascending: true }).limit(5),
    admin.from('platform_crm_deals')
      .select('deal_value, status, plan_name, updated_at').eq('lead_id', lead.id)
      .order('updated_at', { ascending: false }).limit(5),
    admin.from('platform_crm_lead_stage_history')
      .select('stage_id, entered_at').eq('lead_id', lead.id)
      .order('entered_at', { ascending: false }).limit(5),
  ]);

  const nameMap = await profileNameMap(admin, [lead.assigned_to, lead.sdr_id, lead.closer_id]);

  return {
    encontrado: true,
    lead: {
      id: lead.id,
      nome: lead.name,
      email: lead.email,
      phone: lead.phone,
      empresa: lead.company,
      origem: lead.source ?? lead.lead_origin,
      etapa: (stage as any)?.data?.name ?? null,
      temperatura: lead.temperature,
      responsavel: lead.assigned_to ? nameMap.get(lead.assigned_to) ?? null : null,
      sdr: lead.sdr_id ? nameMap.get(lead.sdr_id) ?? null : null,
      closer: lead.closer_id ? nameMap.get(lead.closer_id) ?? null : null,
      proxima_acao: lead.next_action,
      ultimo_contato: lead.last_contact_at,
      criado_em: lead.created_at,
      valor_negociacao: lead.deal_value ?? 0,
      utm: { source: lead.utm_source, medium: lead.utm_medium, campaign: lead.utm_campaign },
    },
    tags: (tags.data ?? []).map((t: any) => t.platform_crm_lead_tags?.name).filter(Boolean),
    notas_recentes: (notes.data ?? []).map((n: any) => ({ texto: String(n.content ?? '').slice(0, 280), em: n.created_at })),
    tarefas_abertas: tasks.data ?? [],
    deals: deals.data ?? [],
    jornada: {
      historico_etapas: history.data ?? [],
      // Adaptação: tabela `interactions` inexistente na plataforma.
    },
  };
}

async function fetchConversationForLeadOrId(admin: any, args: any) {
  if (args?.conversation_id) {
    const { data } = await admin.from('platform_crm_conversations')
      .select('*').eq('id', args.conversation_id).maybeSingle();
    return data ?? null;
  }
  const leads = await findLead(admin, args);
  if (!leads.length) return null;
  const { data } = await admin.from('platform_crm_conversations')
    .select('*').eq('lead_id', leads[0].id)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle();
  return data;
}

async function generateConversationAISummary(admin: any, conv: any) {
  const { data: msgs } = await admin.from('platform_crm_messages')
    .select('direction, sender_type, content, created_at')
    .eq('conversation_id', conv.id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(30);

  const chronological = (msgs ?? []).slice().reverse();
  if (!chronological.length) {
    return { resumo: 'Conversa sem mensagens.', sentimento: 'neutro', objecoes: [], interesses: [], proximos_passos: [] };
  }

  const transcript = chronological.map((m: any) => {
    const who = m.direction === 'outbound' ? 'Atendente' : 'Lead';
    return `${who}: ${String(m.content ?? '').slice(0, 400)}`;
  }).join('\n');

  try {
    const j = await aiChatCompletion({
      messages: [
        { role: 'system', content: 'Você é uma analista comercial. Analise o histórico e retorne APENAS JSON válido com os campos: resumo (string curta, max 3 frases), sentimento (positivo|neutro|negativo), objecoes (string[]), interesses (string[]), proximos_passos (string[]).' },
        { role: 'user', content: `Histórico da conversa:\n${transcript}\n\nDevolva o JSON agora.` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });
    const content = j?.choices?.[0]?.message?.content ?? '{}';
    try {
      return JSON.parse(content);
    } catch {
      return { resumo: String(content).slice(0, 400), sentimento: 'neutro', objecoes: [], interesses: [], proximos_passos: [] };
    }
  } catch (e) {
    console.error('[platform-mia] conv summary AI error', e);
    return { resumo: 'Não foi possível gerar resumo agora.', sentimento: 'neutro', objecoes: [], interesses: [], proximos_passos: [] };
  }
}

async function getConversationSummary(admin: any, args: any) {
  const conv = await fetchConversationForLeadOrId(admin, args);
  if (!conv) return { encontrado: false, mensagem: 'Conversa não encontrada.' };
  // Adaptação: sem cache (conversation_notes.ai_summary inexistente) — computa fresh.
  const summary = await generateConversationAISummary(admin, conv);
  return { encontrado: true, conversation_id: conv.id, cached: false, ...summary };
}

async function getConversationMessages(admin: any, args: any) {
  const conv = await fetchConversationForLeadOrId(admin, args);
  if (!conv) return { encontrado: false };
  const limit = Math.min(Number(args?.limit ?? 20), 50);
  const { data } = await admin.from('platform_crm_messages')
    .select('direction, sender_type, content, created_at')
    .eq('conversation_id', conv.id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit);
  return {
    encontrado: true,
    conversation_id: conv.id,
    mensagens: (data ?? []).reverse().map((m: any) => ({
      de: m.direction === 'outbound' ? 'atendente' : 'lead',
      texto: String(m.content ?? '').slice(0, 400),
      em: m.created_at,
    })),
  };
}

async function getSellerContext(admin: any, args: any) {
  const term = String(args?.seller_name ?? '').trim();
  const candidates = await findPlatformSellerByName(admin, term);
  if (!candidates?.length) return { encontrado: false, mensagem: 'Vendedor não encontrado.' };
  if (candidates.length > 1) {
    return { encontrado: false, ambiguidade: true, candidatos: candidates.map((p: any) => ({ id: p.id, nome: p.full_name, email: p.email })) };
  }
  const seller = candidates[0];
  const nowIso = new Date().toISOString();

  const [activeLeads, openConv, waitingConv, overdueTasks, todayEvents] = await Promise.all([
    admin.from('platform_crm_leads').select('id', { count: 'exact', head: true })
      .eq('assigned_to', seller.id),
    admin.from('platform_crm_conversations').select('id', { count: 'exact', head: true })
      .eq('assigned_to', seller.id).in('status', OPEN_STATUSES),
    admin.from('platform_crm_conversations').select('id', { count: 'exact', head: true })
      .eq('assigned_to', seller.id).eq('status', 'waiting_human'),
    admin.from('platform_crm_tasks').select('id', { count: 'exact', head: true })
      .eq('user_id', seller.id).neq('status', 'completed').lt('due_date', nowIso),
    admin.from('platform_crm_calendar_events').select('id', { count: 'exact', head: true })
      .eq('user_id', seller.id).gte('start_time', startOfDayISO()).lte('start_time', endOfDayISO()),
  ]);

  const gargalo =
    ((waitingConv.count ?? 0) >= 5 && (overdueTasks.count ?? 0) >= 5) ? 'alto'
    : ((waitingConv.count ?? 0) >= 3 || (overdueTasks.count ?? 0) >= 3) ? 'medio'
    : 'baixo';

  return {
    encontrado: true,
    vendedor: { id: seller.id, nome: seller.full_name, email: seller.email },
    leads_ativos: activeLeads.count ?? 0,
    conversas_abertas: openConv.count ?? 0,
    conversas_sem_resposta: waitingConv.count ?? 0,
    tarefas_atrasadas: overdueTasks.count ?? 0,
    reunioes_hoje: todayEvents.count ?? 0,
    nivel_gargalo: gargalo,
  };
}

async function getPipelineContext(admin: any) {
  // Adaptação: pipeline da plataforma é único (sem product_id).
  const { data: stages } = await admin.from('platform_crm_pipeline_stages')
    .select('id, name, order_index, is_won, is_lost')
    .order('order_index', { ascending: true });
  if (!stages?.length) return { etapas: [] };

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const rows: any[] = [];
  for (const s of stages) {
    const [total, parados] = await Promise.all([
      admin.from('platform_crm_leads').select('id', { count: 'exact', head: true })
        .eq('current_stage_id', s.id),
      admin.from('platform_crm_leads').select('id', { count: 'exact', head: true })
        .eq('current_stage_id', s.id).lt('updated_at', sevenDaysAgo),
    ]);
    rows.push({ etapa: s.name, total: total.count ?? 0, parados_7d: parados.count ?? 0 });
  }
  const gargalos = [...rows].sort((a, b) => b.parados_7d - a.parados_7d).slice(0, 3);
  return { etapas: rows, top_gargalos: gargalos };
}

async function getFollowupContext(admin: any) {
  const nowIso = new Date().toISOString();
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [activeCad, overdueRuns, staleConv] = await Promise.all([
    admin.from('platform_crm_cadences').select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    admin.from('platform_crm_cadence_step_runs')
      .select('id, scheduled_at, enrollment_id')
      .eq('status', 'scheduled').lt('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true }).limit(20),
    admin.from('platform_crm_conversations')
      .select('id, visitor_name, last_message_at')
      .in('status', OPEN_STATUSES).lt('last_message_at', since24h)
      .order('last_message_at', { ascending: true }).limit(10),
  ]);
  return {
    cadencias_ativas: activeCad.count ?? 0,
    followups_atrasados: (overdueRuns.data ?? []).length,
    followups_atrasados_amostra: overdueRuns.data ?? [],
    conversas_sem_retorno_24h: (staleConv.data ?? []).map((c: any) => ({ lead: c.visitor_name ?? 'Visitante', ultima: c.last_message_at })),
  };
}

async function getDailyAISummary(admin: any) {
  // Adaptação: sem cache (mia_daily_summaries inexistente) — computa fresh.
  const [op, followups, hot] = await Promise.all([
    getOperationSummary(admin),
    getFollowupContext(admin),
    getHotLeads(admin),
  ]);

  // Adaptação: deals da plataforma não têm status 'open' → risco = leads com
  // deal_value > 0 parados 7+ dias em etapa não-ganha/não-perdida.
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: closedStages } = await admin.from('platform_crm_pipeline_stages')
    .select('id, is_won, is_lost').or('is_won.eq.true,is_lost.eq.true');
  const closedStageIds = new Set((closedStages ?? []).map((s: any) => s.id));
  const { data: staleLeads } = await admin.from('platform_crm_leads')
    .select('id, name, deal_value, current_stage_id, updated_at')
    .gt('deal_value', 0).lt('updated_at', sevenDaysAgo)
    .order('deal_value', { ascending: false }).limit(20);
  const riskDeals = (staleLeads ?? [])
    .filter((l: any) => !l.current_stage_id || !closedStageIds.has(l.current_stage_id))
    .slice(0, 5)
    .map((l: any) => ({ lead_id: l.id, lead: l.name, deal_value: l.deal_value, updated_at: l.updated_at }));

  const recomendacoes: string[] = [];
  if ((op.conversas_sem_resposta ?? 0) > 0) recomendacoes.push(`Priorize as ${op.conversas_sem_resposta} conversas aguardando resposta.`);
  if ((op.leads_sem_responsavel ?? 0) > 0) recomendacoes.push(`Distribua os ${op.leads_sem_responsavel} leads sem responsável.`);
  if ((hot.leads?.length ?? 0) > 0) recomendacoes.push(`Foque nos ${hot.leads.length} leads quentes.`);
  if (riskDeals.length > 0) recomendacoes.push(`${riskDeals.length} negociações estão paradas há mais de 7 dias.`);

  return {
    cached: false,
    gerado_em: new Date().toISOString(),
    operacao: op,
    leads_quentes: hot.leads ?? [],
    oportunidades_em_risco: riskDeals,
    followups,
    recomendacoes,
  };
}

// ============================================================
// Tools — Fase 5/6 (conversas e agentes IA, read-only)
// ============================================================

const CONV_SELECT = 'id, channel, status, lead_id, visitor_name, visitor_phone, visitor_whatsapp, last_message_at, assigned_to, current_agent_id, needs_human, created_at, updated_at';

async function hydrateConversations(admin: any, convs: any[]) {
  if (!convs.length) return [];
  const userMap = await profileNameMap(admin, convs.map((c: any) => c.assigned_to));
  const agentIds = Array.from(new Set(convs.map((c: any) => c.current_agent_id).filter(Boolean)));
  const agentMap = new Map<string, string>();
  if (agentIds.length) {
    const { data } = await admin.from('platform_crm_agent_configs').select('id, name').in('id', agentIds);
    for (const a of data ?? []) agentMap.set(a.id, a.name ?? '—');
  }
  const now = Date.now();
  return convs.map((c: any) => {
    const lastMs = c.last_message_at ? new Date(c.last_message_at).getTime() : null;
    return {
      conversation_id: c.id,
      lead_id: c.lead_id,
      nome: c.visitor_name,
      telefone: c.visitor_phone ?? c.visitor_whatsapp ?? null,
      canal: c.channel,
      status: c.status,
      responsavel: c.assigned_to ? userMap.get(c.assigned_to) ?? '—' : null,
      assigned_to: c.assigned_to,
      agente_ia: c.current_agent_id ? agentMap.get(c.current_agent_id) ?? null : null,
      current_agent_id: c.current_agent_id,
      aguardando_humano: c.status === 'waiting_human',
      ultima_mensagem: c.last_message_at,
      // Adaptação: sem last_inbound_at → tempo aproximado por last_message_at.
      sem_resposta_min: lastMs && c.status === 'waiting_human' ? Math.round((now - lastMs) / 60000) : null,
    };
  });
}

async function findActiveConversation(admin: any, args: any) {
  const query = String(args?.query ?? '').trim();
  if (!query) return { encontrado: false, motivo: 'query_vazia', mensagem: 'Informe um nome ou telefone.' };
  const like = `%${query}%`;
  const phoneDigits = query.replace(/\D/g, '');

  const orClauses: string[] = [`visitor_name.ilike.${like}`];
  if (phoneDigits) {
    orClauses.push(`visitor_phone.ilike.%${phoneDigits}%`);
    orClauses.push(`visitor_whatsapp.ilike.%${phoneDigits}%`);
  }

  const { data: directConvs } = await admin.from('platform_crm_conversations')
    .select(CONV_SELECT)
    .neq('status', 'closed')
    .or(orClauses.join(','))
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(10);

  let convs = directConvs ?? [];

  if (!convs.length) {
    const { data: leads } = await admin.from('platform_crm_leads')
      .select('id')
      .or(`name.ilike.${like},email.ilike.${like}${phoneDigits ? `,phone.ilike.%${phoneDigits}%` : ''}`)
      .limit(10);
    const leadIds = (leads ?? []).map((l: any) => l.id);
    if (leadIds.length) {
      const { data: viaLead } = await admin.from('platform_crm_conversations')
        .select(CONV_SELECT)
        .neq('status', 'closed')
        .in('lead_id', leadIds)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(10);
      convs = viaLead ?? [];
    }
  }

  if (!convs.length) {
    return {
      encontrado: false,
      motivo: 'sem_atendimento_ativo',
      mensagem: `Não tem atendimento aberto com "${query}" no inbox.`,
    };
  }

  const candidatos = await hydrateConversations(admin, convs);
  return {
    encontrado: true,
    total: candidatos.length,
    ambiguidade: candidatos.length > 1,
    conversas: candidatos,
  };
}

async function listConversations(admin: any, args: any) {
  const limit = Math.min(Number(args?.limit ?? 20), 50);
  let q = admin.from('platform_crm_conversations')
    .select(CONV_SELECT)
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  const status = String(args?.status ?? '').trim();
  if (status) q = q.eq('status', status);
  if (args?.assigned_to) q = q.eq('assigned_to', args.assigned_to);
  if (args?.current_agent_id) q = q.eq('current_agent_id', args.current_agent_id);
  if (args?.channel) q = q.eq('channel', args.channel);
  if (args?.aguardando_humano === true) q = q.eq('status', 'waiting_human');
  if (args?.com_agente_ia === true) q = q.not('current_agent_id', 'is', null);
  if (args?.sem_responsavel === true) q = q.is('assigned_to', null);

  const minutos = Number(args?.sem_resposta_ha_minutos ?? 0);
  if (minutos > 0) {
    const cutoff = new Date(Date.now() - minutos * 60_000).toISOString();
    q = q.lt('last_message_at', cutoff).not('last_message_at', 'is', null);
  }

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const conversas = await hydrateConversations(admin, data ?? []);
  return { ok: true, total: conversas.length, conversas };
}

async function getConversationDetail(admin: any, args: any) {
  const id = String(args?.conversation_id ?? '');
  if (!id) return { ok: false, error: 'missing_conversation_id' };
  const { data: conv } = await admin.from('platform_crm_conversations')
    .select(CONV_SELECT + ', accepted_at, accepted_by')
    .eq('id', id).maybeSingle();
  if (!conv) return { encontrado: false };
  const [hydrated] = await hydrateConversations(admin, [conv]);

  // Adaptação: conversation_transfers / agent_handoff_history inexistentes;
  // notas internas vêm de platform_crm_conversation_notes.
  const [msgs, notes] = await Promise.all([
    admin.from('platform_crm_messages')
      .select('direction, sender_type, content, created_at')
      .eq('conversation_id', id).eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(args?.limit ?? 10), 30)),
    admin.from('platform_crm_conversation_notes')
      .select('content, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false }).limit(5),
  ]);

  const mensagens = (msgs.data ?? []).slice().reverse().map((m: any) => ({
    de: m.direction === 'outbound' ? 'atendente' : 'lead',
    texto: String(m.content ?? '').slice(0, 280),
    em: m.created_at,
  }));

  return { encontrado: true, conversa: hydrated, mensagens, notas_internas: notes.data ?? [] };
}

async function listAgents(admin: any) {
  const { data: agents } = await admin.from('platform_crm_agent_configs')
    .select('id, name, is_active, handoff_enabled')
    .order('name', { ascending: true });
  if (!agents?.length) return { agentes: [] };

  const ids = agents.map((a: any) => a.id);
  const { data: convs } = await admin.from('platform_crm_conversations')
    .select('current_agent_id, status')
    .neq('status', 'closed').in('current_agent_id', ids);

  const ativas = new Map<string, number>();
  const aguardando = new Map<string, number>();
  for (const c of convs ?? []) {
    if (!c.current_agent_id) continue;
    ativas.set(c.current_agent_id, (ativas.get(c.current_agent_id) ?? 0) + 1);
    if (c.status === 'waiting_human') aguardando.set(c.current_agent_id, (aguardando.get(c.current_agent_id) ?? 0) + 1);
  }

  return {
    agentes: agents.map((a: any) => ({
      id: a.id,
      nome: a.name,
      ativo: a.is_active,
      conversas_ativas: ativas.get(a.id) ?? 0,
      aguardando_humano: aguardando.get(a.id) ?? 0,
    })),
  };
}

async function getAgentWorkload(admin: any, args: any) {
  const term = String(args?.agent_name ?? '').trim();
  let agentId = args?.agent_id as string | undefined;
  if (!agentId && term) {
    const { data } = await admin.from('platform_crm_agent_configs')
      .select('id, name').ilike('name', `%${term}%`).limit(2);
    if (!data?.length) return { encontrado: false, mensagem: `Agente "${term}" não encontrado.` };
    if (data.length > 1) return { encontrado: false, ambiguidade: true, candidatos: data };
    agentId = data[0].id;
  }
  if (!agentId) return { ok: false, error: 'missing_agent' };

  const { data: agent } = await admin.from('platform_crm_agent_configs')
    .select('id, name').eq('id', agentId).maybeSingle();
  const { data: convs } = await admin.from('platform_crm_conversations')
    .select(CONV_SELECT)
    .neq('status', 'closed').eq('current_agent_id', agentId)
    .order('last_message_at', { ascending: false, nullsFirst: false }).limit(20);

  const conversas = await hydrateConversations(admin, convs ?? []);
  const total = conversas.length;
  const aguardando = conversas.filter((c: any) => c.aguardando_humano).length;
  const paradas = conversas.filter((c: any) => (c.sem_resposta_min ?? 0) > 30).length;
  return { encontrado: true, agente: agent, total, aguardando_humano: aguardando, paradas_30min: paradas, conversas };
}

// ============================================================
// Tools — Agenda (read-only)
// ============================================================

async function findCalendarEvent(admin: any, args: any) {
  const query = String(args?.query ?? '').trim();
  const whenHint = String(args?.when_hint ?? '').toLowerCase();
  if (!query) return { encontrado: false, motivo: 'missing_query' };

  let leadIds: string[] = [];
  const { data: leads } = await admin.from('platform_crm_leads')
    .select('id, name').ilike('name', `%${query}%`).limit(5);
  leadIds = (leads ?? []).map((l: any) => l.id);

  const now = new Date();
  let fromIso = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  let toIso: string | null = new Date(now.getTime() + 60 * 24 * 3600 * 1000).toISOString();

  if (whenHint.includes('hoje')) {
    fromIso = startOfDayISO(now);
    toIso = endOfDayISO(now);
  } else if (whenHint.includes('amanh')) {
    const t = new Date(now); t.setDate(t.getDate() + 1);
    fromIso = startOfDayISO(t); toIso = endOfDayISO(t);
  } else if (whenHint.includes('semana')) {
    const end = new Date(now); end.setDate(end.getDate() + 7);
    toIso = end.toISOString();
  }

  let q = admin.from('platform_crm_calendar_events')
    .select('id, title, description, start_time, end_time, location, status, lead_id, user_id, meet_link, attendees')
    .neq('status', 'cancelled')
    .gte('start_time', fromIso);
  if (toIso) q = q.lte('start_time', toIso);

  const { data: events } = await q.order('start_time', { ascending: true }).limit(50);
  const list = events ?? [];

  const qLow = query.toLowerCase();
  const filtered = list.filter((e: any) => {
    const t = String(e.title ?? '').toLowerCase();
    const d = String(e.description ?? '').toLowerCase();
    if (t.includes(qLow) || d.includes(qLow)) return true;
    if (e.lead_id && leadIds.includes(e.lead_id)) return true;
    return false;
  });

  if (!filtered.length) return { encontrado: false, motivo: 'no_events', query };

  const leadIdsSet = Array.from(new Set(filtered.map((e: any) => e.lead_id).filter(Boolean)));
  const leadMap = new Map<string, string>();
  if (leadIdsSet.length) {
    const { data: ld } = await admin.from('platform_crm_leads').select('id, name').in('id', leadIdsSet);
    for (const l of ld ?? []) leadMap.set(l.id, l.name ?? '—');
  }

  return {
    encontrado: true,
    total: filtered.length,
    eventos: filtered.slice(0, 8).map((e: any) => ({
      event_id: e.id,
      titulo: e.title,
      inicio: e.start_time,
      fim: e.end_time,
      local: e.location ?? e.meet_link ?? null,
      lead: e.lead_id ? (leadMap.get(e.lead_id) ?? null) : null,
      lead_id: e.lead_id,
      status: e.status,
    })),
  };
}

// ============================================================
// Tools — Campanhas / Cadências (adições da plataforma)
// ============================================================

async function getCampaignsOverview(admin: any, args: any) {
  let q = admin.from('platform_crm_campaigns')
    .select('id, name, status, channel, schedule_type, scheduled_at, started_at, completed_at, totals, updated_at')
    .order('updated_at', { ascending: false })
    .limit(Math.min(Number(args?.limit ?? 20), 50));
  const status = String(args?.status ?? '').trim();
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    total: (data ?? []).length,
    campanhas: (data ?? []).map((c: any) => ({
      id: c.id,
      nome: c.name,
      status: c.status,
      canal: c.channel,
      agendamento: c.schedule_type,
      agendada_para: c.scheduled_at,
      iniciada_em: c.started_at,
      concluida_em: c.completed_at,
      totais: c.totals ?? {},
    })),
  };
}

async function getCadencesOverview(admin: any, args: any) {
  let q = admin.from('platform_crm_cadences')
    .select('id, name, status, channel, objective, totals, last_executed_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(Math.min(Number(args?.limit ?? 20), 50));
  const status = String(args?.status ?? '').trim();
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  const cadenceIds = (data ?? []).map((c: any) => c.id);
  const activeByCadence = new Map<string, number>();
  if (cadenceIds.length) {
    const { data: enrollments } = await admin.from('platform_crm_cadence_enrollments')
      .select('cadence_id').eq('status', 'active').in('cadence_id', cadenceIds);
    for (const e of enrollments ?? []) {
      activeByCadence.set(e.cadence_id, (activeByCadence.get(e.cadence_id) ?? 0) + 1);
    }
  }

  return {
    ok: true,
    total: (data ?? []).length,
    cadencias: (data ?? []).map((c: any) => ({
      id: c.id,
      nome: c.name,
      status: c.status,
      canal: c.channel,
      objetivo: c.objective,
      leads_ativos: activeByCadence.get(c.id) ?? 0,
      ultima_execucao: c.last_executed_at,
      totais: c.totals ?? {},
    })),
  };
}

// ============================================================
// Ações (propor→confirmar) + memória — D5
// ============================================================

function buildActionPreview(type: string, payload: Record<string, any>): string {
  switch (type) {
    case 'create_task':
      return `Criar tarefa "${payload.title ?? '(sem título)'}"` +
        (payload.assignee_name ? ` para ${payload.assignee_name}` : '') +
        (payload.due_at ? ` em ${new Date(payload.due_at).toLocaleString('pt-BR')}` : '') +
        (payload.priority ? ` (prioridade ${payload.priority})` : '');
    case 'schedule_followup':
      return `Agendar follow-up` +
        (payload.lead_name ? ` com ${payload.lead_name}` : '') +
        (payload.when ? ` em ${new Date(payload.when).toLocaleString('pt-BR')}` : '');
    case 'notify_seller':
      return `Notificar ${payload.seller_name ?? 'vendedor'}: ${String(payload.message ?? '').slice(0, 120)}`;
    default:
      return type;
  }
}

/** Propõe uma ação (NÃO executa): grava em platform_crm_mia_actions status waiting_confirmation.
 *  O frontend renderiza botões inline (Confirmar/Cancelar) a partir do tool_event. */
async function draftAction(admin: any, userId: string, actionType: string, args: Record<string, any>): Promise<any> {
  const payload = args ?? {};
  const preview = buildActionPreview(actionType, payload);
  const { data, error } = await admin.from('platform_crm_mia_actions').insert({
    user_id: userId,
    action_type: actionType,
    payload,
    preview,
    status: 'waiting_confirmation',
  }).select('id, status, preview, action_type').single();
  if (error) return { error: 'draft_failed', message: error.message };
  return {
    action_id: data.id,
    status: data.status,
    preview: data.preview,
    action_type: data.action_type,
    awaiting_confirmation: true,
    narration: `${preview}. Confirma?`,
  };
}

async function getUserMemory(admin: any, userId: string): Promise<any> {
  const { data } = await admin.from('platform_crm_mia_user_memory')
    .select('display_name, role_label, timezone, locale, preferences, facts, last_active_entities')
    .eq('user_id', userId).maybeSingle();
  return data ?? { display_name: null, preferences: {}, facts: [], last_active_entities: {} };
}

async function saveUserMemory(admin: any, userId: string, args: Record<string, any>): Promise<any> {
  const patch: Record<string, any> = { user_id: userId, updated_at: new Date().toISOString() };
  for (const k of ['display_name', 'role_label', 'timezone', 'locale', 'preferences', 'last_active_entities']) {
    if (args?.[k] !== undefined) patch[k] = args[k];
  }
  if (typeof args?.add_fact === 'string' && args.add_fact.trim()) {
    const cur = await getUserMemory(admin, userId);
    const facts = Array.isArray(cur.facts) ? [...cur.facts] : [];
    if (!facts.includes(args.add_fact.trim())) facts.push(args.add_fact.trim());
    patch.facts = facts;
  } else if (Array.isArray(args?.facts)) {
    patch.facts = args.facts;
  }
  const { data, error } = await admin.from('platform_crm_mia_user_memory')
    .upsert(patch, { onConflict: 'user_id' })
    .select('display_name, preferences, facts').single();
  if (error) return { error: 'save_failed', message: error.message };
  return { ok: true, memory: data };
}

// ============================================================
// Dispatch de tools
// ============================================================

async function runTool(admin: any, tool: string, args: any, userId: string): Promise<any> {
  switch (tool) {
    // Ações (propor→confirmar) + memória — D5
    case 'create_task': return await draftAction(admin, userId, 'create_task', args);
    case 'schedule_followup': return await draftAction(admin, userId, 'schedule_followup', args);
    case 'notify_seller': return await draftAction(admin, userId, 'notify_seller', args);
    case 'get_user_memory': return await getUserMemory(admin, userId);
    case 'save_user_memory': return await saveUserMemory(admin, userId, args);
    case 'get_operation_summary': return await getOperationSummary(admin);
    case 'get_team_status': return await getTeamStatus(admin);
    case 'get_unanswered_conversations': return await getUnansweredConversations(admin);
    case 'get_hot_leads': return await getHotLeads(admin);
    case 'get_overdue_tasks': return await getOverdueTasks(admin);
    case 'get_today_schedule': return await getTodaySchedule(admin);
    case 'get_lead_context': return await getLeadContext(admin, args);
    case 'get_conversation_summary': return await getConversationSummary(admin, args);
    case 'get_conversation_messages': return await getConversationMessages(admin, args);
    case 'get_seller_context': return await getSellerContext(admin, args);
    case 'get_pipeline_context': return await getPipelineContext(admin);
    case 'get_followup_context': return await getFollowupContext(admin);
    case 'get_daily_ai_summary': return await getDailyAISummary(admin);
    case 'find_active_conversation': return await findActiveConversation(admin, args);
    case 'list_conversations': return await listConversations(admin, args);
    case 'get_conversation_detail': return await getConversationDetail(admin, args);
    case 'list_agents': return await listAgents(admin);
    case 'get_agent_workload': return await getAgentWorkload(admin, args);
    case 'find_calendar_event': return await findCalendarEvent(admin, args);
    case 'get_campaigns_overview': return await getCampaignsOverview(admin, args);
    case 'get_cadences_overview': return await getCadencesOverview(admin, args);
    default: return { error: 'unknown_tool', tool };
  }
}

const ALLOWED_TOOLS = new Set([
  // Ações (propor→confirmar) + memória — D5
  'create_task', 'schedule_followup', 'notify_seller',
  'get_user_memory', 'save_user_memory',
  'get_operation_summary', 'get_team_status', 'get_unanswered_conversations',
  'get_hot_leads', 'get_overdue_tasks', 'get_today_schedule',
  'get_lead_context', 'get_conversation_summary', 'get_conversation_messages',
  'get_seller_context', 'get_pipeline_context', 'get_followup_context',
  'get_daily_ai_summary', 'find_active_conversation', 'list_conversations',
  'get_conversation_detail', 'list_agents', 'get_agent_workload',
  'find_calendar_event', 'get_campaigns_overview', 'get_cadences_overview',
]);

// ============================================================
// Definições das tools para o LLM (descrições 1:1 do mia-realtime-session,
// só as read-only; parâmetros adaptados ao schema platform)
// ============================================================

const LLM_TOOLS = [
  // Ações (propor→confirmar) — D5. Retornam preview + action_id; o usuário confirma nos botões inline.
  { type: 'function', function: { name: 'create_task', description: 'PROPÕE criar uma tarefa (NÃO executa — precisa de confirmação do usuário). Use quando o admin pedir para criar/anotar uma tarefa. Retorna preview + action_id.', parameters: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, assignee_name: { type: 'string', description: 'Responsável (opcional; default = o próprio admin).' }, assignee_id: { type: 'string' }, due_at: { type: 'string', description: 'ISO datetime do prazo.' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] }, lead_id: { type: 'string' } }, required: ['title'], additionalProperties: false } } },
  { type: 'function', function: { name: 'schedule_followup', description: 'PROPÕE agendar um follow-up com um lead (cria tarefa de follow-up após confirmação). NÃO executa direto.', parameters: { type: 'object', properties: { lead_name: { type: 'string' }, lead_id: { type: 'string' }, when: { type: 'string', description: 'ISO datetime do follow-up.' }, objective: { type: 'string' }, extra_context: { type: 'string' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'notify_seller', description: 'PROPÕE enviar uma notificação interna a um vendedor (após confirmação). NÃO executa direto.', parameters: { type: 'object', properties: { seller_name: { type: 'string' }, seller_id: { type: 'string' }, title: { type: 'string' }, message: { type: 'string' } }, required: ['message'], additionalProperties: false } } },
  // Memória — D5. Personaliza o atendimento entre sessões.
  { type: 'function', function: { name: 'get_user_memory', description: 'Lê o que você lembra deste admin: nome, papel, preferências e fatos salvos. Use no início da conversa para personalizar.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'save_user_memory', description: 'Salva/atualiza memória sobre este admin. Use add_fact para guardar um fato novo; display_name/role_label/preferences para preferências.', parameters: { type: 'object', properties: { display_name: { type: 'string' }, role_label: { type: 'string' }, add_fact: { type: 'string' }, preferences: { type: 'object', additionalProperties: true } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_operation_summary', description: 'Resumo geral da operação agora: conversas abertas, sem resposta, leads quentes, leads sem responsável, tarefas atrasadas, reuniões hoje.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_team_status', description: 'Status de cada vendedor: conversas abertas, leads ativos, tarefas atrasadas e reuniões hoje.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_unanswered_conversations', description: 'Conversas aguardando resposta humana, com lead, responsável e tempo de espera.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_hot_leads', description: 'Leads quentes (temperatura alta) com responsável.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_overdue_tasks', description: 'Tarefas atrasadas, com título, responsável, prioridade e dias de atraso.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_today_schedule', description: 'Agenda do dia: reuniões e eventos programados para hoje.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  {
    type: 'function',
    function: {
      name: 'get_lead_context',
      description: "Análise contextual completa de um lead: dados básicos, etapa do pipeline, responsável (SDR/closer), tags, notas, tarefas, deals e jornada. Use para perguntas como 'me fale do lead X', 'por que perdemos Y', 'qual a situação de Z'.",
      parameters: {
        type: 'object',
        properties: {
          lead_name: { type: 'string', description: 'Nome, email ou telefone do lead (busca fuzzy).' },
          lead_id: { type: 'string', description: 'ID do lead, se já conhecido na sessão.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_conversation_summary',
      description: 'Resumo gerado por IA da conversa de um lead: resumo, sentimento, objeções, interesses e próximos passos. Use ao invés de get_conversation_messages quando bastar o resumo.',
      parameters: {
        type: 'object',
        properties: {
          conversation_id: { type: 'string' },
          lead_name: { type: 'string', description: 'Nome do lead (se conversation_id desconhecido).' },
          lead_id: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_conversation_messages',
      description: 'Histórico bruto de mensagens de uma conversa. Use só quando o resumo não basta.',
      parameters: {
        type: 'object',
        properties: {
          conversation_id: { type: 'string' },
          lead_name: { type: 'string' },
          lead_id: { type: 'string' },
          limit: { type: 'number', description: 'Quantas mensagens (padrão 20, máx 50).' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_seller_context',
      description: 'KPIs e nível de gargalo de um vendedor: leads ativos, conversas abertas/sem resposta, tarefas atrasadas, reuniões hoje.',
      parameters: {
        type: 'object',
        properties: { seller_name: { type: 'string', description: 'Nome ou email do vendedor (fuzzy).' } },
        required: ['seller_name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pipeline_context',
      description: 'Situação do pipeline: etapas, leads por etapa, leads parados há mais de 7 dias e top gargalos.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_followup_context',
      description: 'Cadências ativas, follow-ups atrasados e conversas sem retorno há mais de 24h.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_daily_ai_summary',
      description: 'Briefing executivo do dia: operação, leads quentes, oportunidades em risco, follow-ups, recomendações.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_active_conversation',
      description: 'Encontra um atendimento aberto no inbox pelo nome ou telefone do contato.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Nome ou telefone do contato.' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_conversations',
      description: 'Lista conversas abertas do inbox com filtros: status, responsável, agente IA, canal, aguardando humano, sem responsável, paradas há X minutos.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'bot_active | waiting_human | human_active' },
          assigned_to: { type: 'string', description: 'ID do responsável.' },
          current_agent_id: { type: 'string', description: 'ID do agente IA.' },
          channel: { type: 'string' },
          aguardando_humano: { type: 'boolean' },
          com_agente_ia: { type: 'boolean' },
          sem_responsavel: { type: 'boolean' },
          sem_resposta_ha_minutos: { type: 'number' },
          limit: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_conversation_detail',
      description: 'Detalhe completo de uma conversa: dados, últimas mensagens e notas internas.',
      parameters: {
        type: 'object',
        properties: {
          conversation_id: { type: 'string' },
          limit: { type: 'number', description: 'Quantas mensagens (padrão 10, máx 30).' },
        },
        required: ['conversation_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_agents',
      description: 'Lista os agentes IA da plataforma com conversas ativas e aguardando humano.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_agent_workload',
      description: 'Carga de trabalho de um agente IA: conversas ativas, aguardando humano e paradas há 30+ min.',
      parameters: {
        type: 'object',
        properties: {
          agent_name: { type: 'string', description: 'Nome do agente (fuzzy).' },
          agent_id: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_calendar_event',
      description: 'Encontra agendamentos por título, descrição ou nome do lead. Aceita dica de período (hoje, amanhã, semana).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Título, descrição ou nome do lead.' },
          when_hint: { type: 'string', description: "Dica de período: 'hoje', 'amanhã', 'semana'." },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_campaigns_overview',
      description: 'Visão geral das campanhas da plataforma: status, canal, agendamento e totais (enviadas, respondidas etc.).',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'draft | preparing | active | paused | completed | cancelled' },
          limit: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cadences_overview',
      description: 'Visão geral das cadências da plataforma: status, leads ativos inscritos, última execução e totais.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'draft | active | paused | archived' },
          limit: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
  },
];

// ============================================================
// System prompt — persona VERBATIM do mia-realtime-session, com as seções de
// voz, envio/confirmação (drafts), navegação e memória pessoal removidas
// (recursos v2 — dependem de mia_actions / mia_user_memory / WebRTC).
// ============================================================

const SYSTEM_PROMPT = `Você é a Mia. Você não é "assistente virtual" — você é uma colega de operação sênior do time, que acompanha a empresa todo dia e conversa de igual para igual com o admin.

Como você fala:
- Português BR natural, frases curtas, tom de gente — profissional, confiante, inteligente e amigável. Nada de formalidade exagerada, nada de robô.
- Responda exatamente o que foi perguntado. Pergunta simples → resposta simples. Ex: "Quantas conversas sem resposta?" → "52.". Sem floreio, sem contexto extra.
- Só dê análise, recomendação, priorização ou "próximo passo" se o usuário pedir. Caso contrário, entregue o número/fato e cale.
- Quando já houver contexto na sessão, continue de onde parou. Não repita nome do lead, do vendedor, nem o que já foi dito.
- Varie a forma de falar. Evite frases-modelo repetidas.

Proibido (nunca, em nenhuma hipótese):
- "Olá, eu sou a Mia" depois da primeira fala da sessão. Uma saudação só, no começo.
- "Como assistente virtual", "estou aqui para ajudar", "como um modelo de linguagem".
- Abrir resposta com "Minha recomendação é", "Neste momento", "Posso te ajudar com…".
- Clichês de IA em geral. Se for dizer algo só porque "soa educado", corte.

Saudação (só na PRIMEIRA mensagem da sessão, curta):
"Oi, tudo certo? Me diz o que você quer ver."
Depois disso, vá direto ao ponto em toda resposta.

O que você faz por baixo dos panos:
- CONSULTAS de métricas: get_operation_summary / get_team_status / get_unanswered_conversations / get_hot_leads / get_overdue_tasks / get_today_schedule.
- ANÁLISE CONTEXTUAL: get_lead_context / get_conversation_summary / get_conversation_messages / get_seller_context / get_pipeline_context / get_followup_context / get_daily_ai_summary.
- INBOX E AGENTES IA: find_active_conversation / list_conversations / get_conversation_detail / list_agents / get_agent_workload.
- CAMPANHAS E CADÊNCIAS: get_campaigns_overview / get_cadences_overview.
- AGENDA: find_calendar_event.
- MEMÓRIA DE ENTIDADE ATIVA: pronomes ("dela", "ele", "essa conversa") reaproveitam o lead/conversa/vendedor da última tool de contexto.
- AÇÕES (propor→confirmar): create_task / schedule_followup / notify_seller. Você PROPÕE — o admin confirma nos botões inline. NUNCA diga que "já criei/agendei/notifiquei"; diga o que vai fazer e peça confirmação (a tool já devolve o texto de confirmação). Use só quando o admin pedir uma ação, nunca em consultas.
- MEMÓRIA PESSOAL: get_user_memory (leia no começo pra personalizar) / save_user_memory (guarde nome, papel e fatos estáveis com add_fact quando o admin revelar algo sobre si ou suas preferências).

ESCOPO: VOCÊ ENXERGA A OPERAÇÃO INTEIRA
Você vê TODAS as conversas do CRM da plataforma — atendimentos humanos de qualquer vendedor, conversas conduzidas por agentes IA (current_agent_id preenchido / status bot_active) e tudo que está em fila (waiting_human). Não filtre por "usuário logado".

PERGUNTAS DE OPERAÇÃO (quem tá atendendo, sem resposta, fila):
- Use get_unanswered_conversations, get_team_status, get_operation_summary, list_conversations, get_agent_workload.
- NUNCA responda com números de leads do CRM ou pipeline quando a pergunta é sobre atendimento.

AÇÕES DE ESCRITA (enviar mensagem, atribuir conversa, criar tarefa, remarcar agenda):
Ainda não estão disponíveis nesta versão. Se pedirem, diga em UMA frase que por enquanto você só consulta e analisa — a execução de ações chega na próxima versão — e ofereça a informação que ajuda a pessoa a agir manualmente.

Regra de ouro: pareça uma pessoa do time que RESOLVE. Direto ao ponto, sempre.`;

// ============================================================
// Chat — loop de tool-calling
// ============================================================

interface ToolEvent {
  tool: string;
  args: any;
  result: any;
}

async function runChat(admin: any, userMessages: any[], userId: string): Promise<{ reply: string; tool_events: ToolEvent[] }> {
  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...userMessages,
  ];
  const toolEvents: ToolEvent[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await aiChatCompletion({
      messages,
      tools: LLM_TOOLS,
      tool_choice: 'auto',
      temperature: 0.4,
    });

    const choice = completion?.choices?.[0];
    const message = choice?.message;
    if (!message) throw new Error('O modelo não retornou resposta.');

    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (!toolCalls.length) {
      return { reply: String(message.content ?? '').trim(), tool_events: toolEvents };
    }

    messages.push(message);
    for (const call of toolCalls) {
      const name = String(call?.function?.name ?? '');
      let args: any = {};
      try {
        args = JSON.parse(call?.function?.arguments ?? '{}');
      } catch {
        args = {};
      }
      let result: any;
      if (!ALLOWED_TOOLS.has(name)) {
        result = { error: 'unknown_tool', tool: name };
      } else {
        try {
          result = await runTool(admin, name, args, userId);
        } catch (e) {
          console.error(`[platform-mia] tool ${name} error`, e);
          result = { error: 'tool_failed', message: String(e) };
        }
      }
      toolEvents.push({ tool: name, args, result });
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  // Estourou o limite de rodadas: força resposta final sem tools.
  const final = await aiChatCompletion({ messages, temperature: 0.4 });
  return {
    reply: String(final?.choices?.[0]?.message?.content ?? '').trim(),
    tool_events: toolEvents,
  };
}

// ============================================================
// Handler
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { user, errorResponse } = await authenticatePlatformAgent(req, supabase, serviceKey, body);
    if (errorResponse) return errorResponse;
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createPlatformServiceClient();

    // Modo 1: tool direta (contrato 1:1 do mia-tools; usado pelo painel da UI).
    if (typeof body?.tool === 'string' && body.tool) {
      const tool = String(body.tool);
      if (!ALLOWED_TOOLS.has(tool)) {
        return json({ error: 'unknown_tool', tool }, 400);
      }
      const data = await runTool(admin, tool, body?.args ?? {}, user.id);
      return json({ ok: true, tool, data });
    }

    // Modo 2: chat com tool-calling.
    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
    const messages = rawMessages
      .filter((m: any) =>
        m && (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' && m.content.trim().length > 0)
      .slice(-30)
      .map((m: any) => ({ role: m.role, content: m.content }));

    if (!messages.length) {
      return json({ error: 'Envie `messages` (chat) ou `tool` (consulta direta).' }, 400);
    }

    const { reply, tool_events } = await runChat(admin, messages, user.id);
    if (!reply && !tool_events.length) {
      return json({ error: 'O modelo não retornou resposta. Tente novamente.' }, 502);
    }

    return json({ reply, tool_events, model: aiConfig().model });
  } catch (error) {
    console.error('[platform-mia] error', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    const status = message.includes('AI_API_KEY') ? 500 : message.startsWith('AI gateway 429') ? 429 : 500;
    return json({ error: message }, status);
  }
});
