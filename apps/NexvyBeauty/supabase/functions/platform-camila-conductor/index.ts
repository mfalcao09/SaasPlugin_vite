// platform-camila-conductor — loop da vendedora Camila (harness próprio).
//
// NÃO é o sweeper da Duda (8/20/25/35). Varre a allowlist v1, classifica com
// decideCamilaWake e — só se flags liberarem — acorda o brain com conductor_wake.
//
// ┌─ GATES (default seguro) ─────────────────────────────────────────────────┐
// │ CAMILA_CONDUCTOR_ENABLED != 'true' → {skipped:'flag_off'}                 │
// │ Dry-run default ON: classifica sem chamar brain.                          │
// │ Live só com TRIPLO opt-in:                                                │
// │   CAMILA_CONDUCTOR_DRY_RUN=false                                          │
// │   CAMILA_CONDUCTOR_ALLOW_LIVE=true   ← trava anti-disparo em lead real    │
// │   body.dry_run===false                                                    │
// │ Anti-rajada:                                                              │
// │   MAX_WAKES_PER_TICK=1  → no máximo UMA conversa acordada por minuto      │
// │   cooldown 2h via metadata.camila_last_wake_at (lido de verdade)          │
// │   allowlist fixa de 5 (INCIDENT_ALLOWLIST)                                │
// │   auto-reply inbound → noop (não responde away-message)                   │
// │   lead_closed (horário WA da loja) → noop no cold/conduct; dívida fica    │
// └───────────────────────────────────────────────────────────────────────────┘
//
// Auth: service-role (bearer/apikey) OU x-brain-secret — igual inactivity-sweeper.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { timingSafeEqual } from '../_shared/meta-graph.ts';
import {
  decideCamilaWake,
  INCIDENT_ALLOWLIST,
  WAKE_COOLDOWN_MS,
  MAX_WAKES_PER_HOUR,
} from '../_shared/cold-outreach/camila-conductor-policy.ts';
import type { TrailMessage } from '../_shared/cold-outreach/conversation-trail.ts';
import {
  asWaLeadProfile,
  formatWaLeadBrainContext,
  isLeadAcceptingOutbound,
  normalizeWaLeadProfile,
  type WaLeadProfile,
} from '../_shared/cold-outreach/wa-lead-profile.ts';
import { zapiGetBusinessProfile, zapiGetChat } from '../_shared/zapi-client.ts';
import {
  loadPlatformQrProviderConfig,
  zapiCredsFromInstance,
} from '../_shared/platform-qr-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-brain-secret',
};

/** Teto duro: 1 wake WhatsApp por tick do cron (1/min). Nunca rajada nas 5. */
const MAX_WAKES_PER_TICK = 1;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isAuthorized(req: Request): boolean {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const brainSecret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const apikey = req.headers.get('apikey') ?? '';
  const brainHeader = req.headers.get('x-brain-secret') ?? '';
  if (serviceKey && bearer && timingSafeEqual(bearer, serviceKey)) return true;
  if (serviceKey && apikey && timingSafeEqual(apikey, serviceKey)) return true;
  if (brainSecret && brainHeader && timingSafeEqual(brainHeader, brainSecret)) return true;
  return false;
}

function parseWakeAt(meta: Record<string, unknown> | null | undefined): number | null {
  const raw = meta?.camila_last_wake_at;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

const FETCH_RETRY_MS = 30 * 60 * 1000;

function digitsOf(raw: unknown): string {
  return String(raw ?? '').split('@')[0].replace(/\D/g, '');
}

function shouldFetchWaProfile(meta: Record<string, unknown>): boolean {
  if (asWaLeadProfile(meta.wa_profile)) return false;
  const err = meta.wa_profile_fetch_error;
  if (err && typeof err === 'object' && !Array.isArray(err)) {
    const at = (err as Record<string, unknown>).at;
    if (typeof at === 'string') {
      const t = Date.parse(at);
      if (Number.isFinite(t) && Date.now() - t < FETCH_RETRY_MS) return false;
    }
  }
  return true;
}

async function invokeBrain(
  conversationId: string,
  extraContext = '',
): Promise<{ ok: boolean; body: string }> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/platform-sales-brain`;
  const brainSecret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (brainSecret) headers['x-brain-secret'] = brainSecret;
  else headers['Authorization'] = `Bearer ${serviceKey}`;
  const payload: Record<string, unknown> = {
    conversation_id: conversationId,
    conductor_wake: true,
  };
  const ficha = extraContext.trim().slice(0, 4000);
  if (ficha) payload.extra_context = ficha;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const body = await res.text().catch(() => '');
    return { ok: res.ok, body: body.slice(0, 300) };
  } catch (e) {
    return { ok: false, body: String(e).slice(0, 300) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  if ((Deno.env.get('CAMILA_CONDUCTOR_ENABLED') ?? 'false').toLowerCase() !== 'true') {
    return json({ skipped: 'flag_off' });
  }

  const body = await req.json().catch(() => ({}));
  const dryEnv = (Deno.env.get('CAMILA_CONDUCTOR_DRY_RUN') ?? 'true').toLowerCase();
  const allowLive =
    (Deno.env.get('CAMILA_CONDUCTOR_ALLOW_LIVE') ?? 'false').toLowerCase() === 'true';
  // Live só com triplo opt-in explícito (protege lead real).
  const live = dryEnv === 'false' && allowLive && body?.dry_run === false;
  const dry = !live;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const now = new Date();
  const nowMs = now.getTime();
  const allowlist = [...INCIDENT_ALLOWLIST];
  const classified: Array<Record<string, unknown>> = [];
  const woken: string[] = [];
  const skippedCap: string[] = [];
  const errors: string[] = [];
  const enriched: string[] = [];

  const { data: convRows } = await supabase
    .from('platform_crm_conversations')
    .select('id, metadata, visitor_phone, visitor_whatsapp, visitor_name, wa_qr_instance_id')
    .in('id', allowlist);
  const metaById = new Map<string, Record<string, unknown>>();
  const convById = new Map<string, Record<string, unknown>>();
  const wakeTimes: number[] = [];
  for (const row of convRows ?? []) {
    const rec = row as Record<string, unknown>;
    const meta = (rec.metadata && typeof rec.metadata === 'object')
      ? rec.metadata as Record<string, unknown>
      : {};
    metaById.set(String(rec.id), meta);
    convById.set(String(rec.id), rec);
    const w = parseWakeAt(meta);
    if (w != null) wakeTimes.push(w);
  }
  const wakesInLastHour = wakeTimes.filter((t) => nowMs - t < 60 * 60 * 1000).length;

  const { data: queueRows } = await supabase
    .from('platform_crm_cold_outreach_queue')
    .select('conversation_id, extracted_lead_id')
    .in('conversation_id', allowlist);
  const extractedByConv = new Map<string, string>();
  const extractedIds: string[] = [];
  for (const q of queueRows ?? []) {
    const cid = String((q as { conversation_id?: string }).conversation_id ?? '');
    const eid = (q as { extracted_lead_id?: string | null }).extracted_lead_id;
    if (cid && eid) {
      extractedByConv.set(cid, eid);
      extractedIds.push(eid);
    }
  }
  const igByExtracted = new Map<string, {
    name: string | null;
    handle: string | null;
    primeiro_nome: string | null;
    telefone: string | null;
  }>();
  if (extractedIds.length) {
    const { data: leadRows } = await supabase
      .from('platform_crm_extracted_leads')
      .select('id, name, handle, primeiro_nome, telefone')
      .in('id', extractedIds);
    for (const lead of leadRows ?? []) {
      const r = lead as Record<string, unknown>;
      igByExtracted.set(String(r.id), {
        name: typeof r.name === 'string' ? r.name : null,
        handle: typeof r.handle === 'string' ? r.handle : null,
        primeiro_nome: typeof r.primeiro_nome === 'string' ? r.primeiro_nome : null,
        telefone: typeof r.telefone === 'string' ? r.telefone : null,
      });
    }
  }

  const instanceIds = [...new Set(
    [...convById.values()]
      .map((c) => typeof c.wa_qr_instance_id === 'string' ? c.wa_qr_instance_id : '')
      .filter(Boolean),
  )];
  const instanceById = new Map<string, Record<string, unknown>>();
  if (instanceIds.length) {
    const { data: instRows } = await supabase
      .from('platform_crm_wa_qr_instances')
      .select('id, instance_id, instance_token, metadata')
      .in('id', instanceIds);
    for (const inst of instRows ?? []) {
      instanceById.set(String((inst as { id: string }).id), inst as Record<string, unknown>);
    }
  }
  const qrCfg = await loadPlatformQrProviderConfig(supabase);

  for (const conversationId of allowlist) {
    try {
      const { data: msgs, error } = await supabase
        .from('platform_crm_messages')
        .select('content, direction, sender_type, created_at')
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(40);
      if (error) throw error;

      const messages = (msgs ?? []) as TrailMessage[];
      let meta = metaById.get(conversationId) ?? {};
      const conv = convById.get(conversationId) ?? {};
      const extractedId = extractedByConv.get(conversationId) ?? null;
      const ig = extractedId ? igByExtracted.get(extractedId) : null;

      if (qrCfg.zapi && shouldFetchWaProfile(meta)) {
        const phone = digitsOf(conv.visitor_whatsapp) || digitsOf(conv.visitor_phone) || digitsOf(ig?.telefone);
        const instRow = typeof conv.wa_qr_instance_id === 'string'
          ? instanceById.get(conv.wa_qr_instance_id)
          : undefined;
        const creds = (instRow ? zapiCredsFromInstance({
          instance_id: typeof instRow.instance_id === 'string' ? instRow.instance_id : null,
          instance_token: typeof instRow.instance_token === 'string' ? instRow.instance_token : null,
          metadata: instRow.metadata,
        }) : null) ?? qrCfg.bootstrap;
        if (phone && creds) {
          try {
            const [chatRes, bizRes] = await Promise.all([
              zapiGetChat(qrCfg.zapi, creds, phone),
              zapiGetBusinessProfile(qrCfg.zapi, creds, phone),
            ]);
            const profile: WaLeadProfile = normalizeWaLeadProfile({
              chat: chatRes.body,
              business: bizRes.body,
              igName: ig?.name,
              handle: ig?.handle,
              primeiroNome: ig?.primeiro_nome,
              now,
            });
            const nextMeta: Record<string, unknown> = { ...meta, wa_profile: profile };
            delete nextMeta.wa_profile_fetch_error;
            await supabase
              .from('platform_crm_conversations')
              .update({ metadata: nextMeta })
              .eq('id', conversationId);
            if (extractedId) {
              const { error: leadErr } = await supabase
                .from('platform_crm_extracted_leads')
                .update({
                  wa_profile: profile,
                  wa_profile_fetched_at: profile.fetched_at,
                })
                .eq('id', extractedId);
              if (leadErr) {
                console.warn(
                  '[platform-camila-conductor] extracted_leads.wa_profile skip',
                  leadErr.message.slice(0, 160),
                );
              }
            }
            meta = nextMeta;
            metaById.set(conversationId, nextMeta);
            enriched.push(conversationId);
          } catch (fetchErr) {
            const nextMeta = {
              ...meta,
              wa_profile_fetch_error: {
                at: now.toISOString(),
                message: String(fetchErr).slice(0, 160),
              },
            };
            await supabase
              .from('platform_crm_conversations')
              .update({ metadata: nextMeta })
              .eq('id', conversationId);
            meta = nextMeta;
            metaById.set(conversationId, nextMeta);
          }
        }
      }

      const lastWakeAtMs = parseWakeAt(meta);
      const waProfile = asWaLeadProfile(meta.wa_profile);
      const leadOpen = isLeadAcceptingOutbound(waProfile, now);
      const decision = decideCamilaWake({
        conversationId,
        messages,
        now,
        lastWakeAtMs,
        wakesInLastHour,
        leadAcceptingOutbound: leadOpen,
      });
      classified.push({
        conversation_id: conversationId,
        kind: decision.kind,
        due: decision.due,
        reason: decision.reason,
        nextAction: decision.nextAction,
        last_wake_at: typeof meta.camila_last_wake_at === 'string' ? meta.camila_last_wake_at : null,
        hours_mode: waProfile?.hours_mode ?? null,
        lead_open: leadOpen,
      });

      if (!dry && decision.due) {
        if (woken.length >= MAX_WAKES_PER_TICK) {
          skippedCap.push(conversationId);
          continue;
        }
        const brain = await invokeBrain(
          conversationId,
          formatWaLeadBrainContext(waProfile, now, String(conv.visitor_name ?? '')),
        );
        if (!brain.ok) {
          errors.push(`${conversationId}: ${brain.body}`);
        } else {
          woken.push(conversationId);
          const wakeIso = now.toISOString();
          const nextMeta = { ...meta, camila_last_wake_at: wakeIso };
          metaById.set(conversationId, nextMeta);
          await supabase
            .from('platform_crm_conversations')
            .update({ metadata: nextMeta })
            .eq('id', conversationId);
          // Evita rate-limit OpenRouter se no futuro o teto subir.
          await sleep(8000);
        }
      }
    } catch (e) {
      errors.push(`${conversationId}: ${String(e).slice(0, 200)}`);
    }
  }

  return json({
    ok: true,
    dry,
    allow_live: allowLive,
    max_wakes_per_tick: MAX_WAKES_PER_TICK,
    wake_cooldown_ms: WAKE_COOLDOWN_MS,
    max_wakes_per_hour: MAX_WAKES_PER_HOUR,
    wakes_in_last_hour: wakesInLastHour,
    now: now.toISOString(),
    classified,
    woken,
    skipped_cap: skippedCap,
    enriched,
    errors,
  });
});
