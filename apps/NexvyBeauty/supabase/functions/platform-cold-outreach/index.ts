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
import { assignVariant, type Channel, renderOpening, renderFollowup, type ScriptTokens } from "../_shared/cold-outreach/script.ts";
import { planInbound } from "../_shared/cold-outreach/inbound-plan.ts";
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
  return json({ ok: true, now: now.toISOString(), campaigns: results });
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
    // PR-BDR-9: registra a abertura no inbox ANTES de fechar a linha da fila, pra
    // o conversation_id nascer preenchido. Só no envio REAL e só no canal WA:
    // dry-run não inventa conversa, e o IG tem outra identidade de thread.
    // `tokens.nome` cai em "tudo bem?" quando o lead não tem primeiro_nome — isso
    // é saudação, não nome, e não pode virar visitor_name no inbox.
    const nomeReal = tokens.nome && tokens.nome !== "tudo bem?" ? tokens.nome : null;
    const inboxConversationId = (!dryRun && channel === "whatsapp")
      ? await persistOpeningInInbox(sb, {
        productId,
        instanceId,
        telefone: due.telefone,
        text,
        nome: nomeReal,
        agentId: c.agent_id ?? null,
        campaignId: c.id,
        variant: due.variant ?? null,
        // Fecha a cadeia: envio → wamid → metadata da mensagem → ACK do webhook
        // acha esta linha e sabe de qual campanha incrementar delivered_count.
        wamid: sendRes.wamid ?? null,
      })
      : null;
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
  a: { channel: Channel; dryRun: boolean; productId: string; instanceId: string | null; to: string | null; handle: string | null; text: string },
): Promise<{ ok: boolean; error?: string; manual?: boolean; conversationId?: string | null; wamid?: string | null }> {
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
      // WAMID — a chave que faltava pra medir ENTREGA.
      //
      // O `data` já vinha completo do platform-evolution-send (que devolve a
      // resposta bruta da Evolution) e este `return { ok: true }` DESCARTAVA tudo.
      // Sem o wamid gravado não há como casar o ACK de MESSAGES_UPDATE com a
      // campanha — e sem isso delivered_count fica em zero pra sempre, deixando o
      // kill-switch por não-entrega inerte (ver anti-ban.ts).
      //
      // Shape da Evolution: { body: { key: { id: "<wamid>" } } }. Tolerante a
      // variação entre versões; se não achar, devolve null e o chamador grava
      // null. Campo AUSENTE é melhor que id ERRADO: id errado casaria o ACK com a
      // mensagem de outra campanha e corromperia o contador — e contador corrompido
      // pausa campanha saudável, que é o modo de falha caro deste mecanismo.
      const d = data as any;
      const wamid: string | null = d?.body?.key?.id ?? d?.key?.id ?? null;
      return { ok: true, wamid };
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
 * PR-BDR-9 — a abertura do cold passa a EXISTIR no inbox.
 *
 * MEDIDO no primeiro disparo real (2026-08-05): o envio não gravava conversa nem
 * mensagem (0 e 0) e `queue.conversation_id` ficava null. Quando a lead respondia,
 * o platform-sales-brain via um inbound SEM histórico — não sabia a que ela se
 * referia ("É o que?" → "Oi Marcelo, tudo bem?") e se apresentava DE NOVO, 17
 * minutos depois de já ter se apresentado. Do lado da lead isso lê como golpe.
 *
 * A IDENTIDADE aqui é a MESMA tripla que o platform-evolution-webhook usa para
 * REENCONTRAR a conversa (visitor_id='wa_evo:<dígitos>' + channel + instância —
 * webhook:403-411). Divergir dela abriria uma SEGUNDA conversa quando a lead
 * respondesse — pior que o defeito que esta função fecha.
 *
 * Devolve o id da conversa, ou null em falha — e nesse caso GRITA: o envio já
 * saiu, então engolir o erro aqui recria o buraco original em silêncio.
 */
async function persistOpeningInInbox(
  sb: SupabaseClient,
  o: {
    productId: string;
    instanceId: string | null;
    telefone: string;
    text: string;
    nome: string | null;
    agentId: string | null;
    campaignId: string;
    /** wamid da mensagem enviada — chave pro ACK de entrega casar (pode ser null). */
    wamid?: string | null;
    variant: unknown;
  },
): Promise<string | null> {
  try {
    const digits = String(o.telefone ?? "").replace(/\D/g, "");
    if (!digits || !o.instanceId) {
      console.error(
        `[platform-cold-outreach] abertura NAO persistida: digits=${digits.length} instance=${o.instanceId ?? "null"} — a lead recebeu e o CRM nao registrou`,
      );
      return null;
    }
    const visitorId = `wa_evo:${digits}`;
    const phonePlus = `+${digits}`;

    const { data: found } = await sb
      .from("platform_crm_conversations")
      .select("id, status")
      .eq("visitor_id", visitorId)
      .eq("channel", "whatsapp_evolution")
      .eq("evolution_instance_id", o.instanceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId: string | null = found?.id ?? null;

    if (conversationId) {
      // Fechada volta a bot_active — mesma régua do webhook: a abertura reativa o fio.
      if (found?.status === "closed") {
        await sb.from("platform_crm_conversations")
          // O pin vai TAMBÉM no caminho de reuso. Sem isto o fix seria meia guarda:
          // conversa que já existe (criada antes deste commit, ou por outro fluxo)
          // continuaria com current_agent_id NULL e cairia na Duda — e é justamente
          // a conversa reutilizada que tem histórico, ou seja, onde a troca de
          // persona no meio do caminho é mais visível pra lead.
          .update({
            status: "bot_active",
            needs_human: false,
            current_agent_id: o.agentId ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
      }
    } else {
      const { data: created, error } = await sb
        .from("platform_crm_conversations")
        .insert({
          visitor_id: visitorId,
          visitor_name: o.nome,
          visitor_phone: phonePlus,
          visitor_whatsapp: phonePlus,
          channel: "whatsapp_evolution",
          status: "bot_active",
          needs_human: false,
          evolution_instance_id: o.instanceId,
          product_id: o.productId,
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
          `[platform-cold-outreach] criar conversa da abertura FALHOU visitor=${visitorId}: ${error.message}`,
        );
        return null;
      }
      conversationId = (created?.id as string) ?? null;
    }
    if (!conversationId) return null;

    const { error: msgErr } = await sb.from("platform_crm_messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      sender_type: "bot",
      content: o.text,
      content_type: "text",
      message_type: "text",
      metadata: {
        channel: "whatsapp_evolution",
        connection_id: o.instanceId,
        agent_id: o.agentId,
        delivery_status: "sent",
        origem: "cold_outreach_abertura",
        campaign_id: o.campaignId,
        variant: o.variant ?? null,
        step: 0,
        // Elo da cadeia de ENTREGA: o webhook recebe MESSAGES_UPDATE com key.id e
        // precisa achar ESTA linha pra saber de qual campanha incrementar o
        // delivered_count. `campaign_id` acima já está aqui; faltava a chave.
        // null é aceitável (shape variou / dry-run) — o ACK simplesmente não casa
        // e o contador não sobe. Melhor não contar que contar na campanha errada.
        wamid: o.wamid ?? null,
      },
    });
    if (msgErr) {
      console.error(
        `[platform-cold-outreach] gravar a bolha da abertura FALHOU conversation_id=${conversationId}: ${msgErr.message}`,
      );
      return conversationId;
    }
    return conversationId;
  } catch (e) {
    console.error(
      "[platform-cold-outreach] persistOpeningInInbox exception (a lead recebeu, o CRM nao registrou):",
      e,
    );
    return null;
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
// ON-INBOUND — opt-out (SAIR/PARE) + registro da intenção de compra ("quero")
// ═══════════════════════════════════════════════════════════════════════════
async function actionOnInbound(sb: SupabaseClient, body: any) {
  const { product_id, conversation_id, telefone, handle, text } = body;
  if (!text) return json({ error: "text required" }, 400);

  // Localiza as linhas de fila do lead por QUALQUER identificador presente (OR),
  // nunca pelo primeiro que existir. Era um else-if e o `conversation_id` vencia
  // sempre — mas no canal WhatsApp a fila tem conversation_id NULL: a conversa
  // só NASCE quando a lead responde (criada pelo platform-evolution-webhook),
  // depois do envio. Resultado: 0 linhas, `queueStatus` (opted_out) não era
  // aplicado, `next_followup_at` não era limpo e a cadência seguia disparando
  // pra quem pediu PARE — invisível, porque a supressão em
  // platform_crm_lead_optout era gravada normalmente.
  //
  // `.or()` do PostgREST é uma STRING: vírgula separa filtros e parêntese agrupa.
  // Valor vindo do body com esses caracteres reescreveria o filtro, então só
  // entra no OR o identificador que passa por regex estrita (mesma régua
  // injection-safe do gate de instância do platform-evolution-webhook).
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
  if (plan.silenceConversation && conversation_id) await silenceConversation(sb, conversation_id);
  // 5) instrumentação
  await logJourney(sb, productId, rows?.[0]?.lead_id ?? null, plan.journey.type, plan.journey.category, "whatsapp", plan.journey.title, {
    matched: plan.journey.matched, intent: plan.intent, buy_intent: plan.handoff,
  });

  return json({ ok: true, intent: plan.intent, affected: rows?.length ?? 0 });
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

  // MEDIDO 2026-08-04 (mesmo defeito de platform-evolution-send): `functions.invoke`
  // manda a chave de serviço no header `apikey`, não no Authorization. O
  // platform-evolution-webhook notifica o inbound por invoke — e caía em 401, ou
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
