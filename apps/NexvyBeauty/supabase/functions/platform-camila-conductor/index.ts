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

async function invokeBrain(conversationId: string): Promise<{ ok: boolean; body: string }> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/platform-sales-brain`;
  const brainSecret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (brainSecret) headers['x-brain-secret'] = brainSecret;
  else headers['Authorization'] = `Bearer ${serviceKey}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversation_id: conversationId, conductor_wake: true }),
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

  // Pré-carrega metadata (cooldown) das 5 — 1 query.
  const { data: convRows } = await supabase
    .from('platform_crm_conversations')
    .select('id, metadata')
    .in('id', allowlist);
  const metaById = new Map<string, Record<string, unknown>>();
  const wakeTimes: number[] = [];
  for (const row of convRows ?? []) {
    const meta = (row.metadata && typeof row.metadata === 'object')
      ? row.metadata as Record<string, unknown>
      : {};
    metaById.set(String(row.id), meta);
    const w = parseWakeAt(meta);
    if (w != null) wakeTimes.push(w);
  }
  const wakesInLastHour = wakeTimes.filter((t) => nowMs - t < 60 * 60 * 1000).length;

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
      const meta = metaById.get(conversationId) ?? {};
      const lastWakeAtMs = parseWakeAt(meta);
      const decision = decideCamilaWake({
        conversationId,
        messages,
        now,
        lastWakeAtMs,
        wakesInLastHour,
      });
      classified.push({
        conversation_id: conversationId,
        kind: decision.kind,
        due: decision.due,
        reason: decision.reason,
        nextAction: decision.nextAction,
        last_wake_at: typeof meta.camila_last_wake_at === 'string' ? meta.camila_last_wake_at : null,
      });

      if (!dry && decision.due) {
        if (woken.length >= MAX_WAKES_PER_TICK) {
          skippedCap.push(conversationId);
          continue;
        }
        const brain = await invokeBrain(conversationId);
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
    errors,
  });
});
