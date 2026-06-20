// Edge Function `affiliate-admin` — CRUD super-admin de afiliados (Fase 4).
//
// Gate: Bearer obrigatório -> auth.getUser -> rpc('is_super_admin', { _user_id })
//   (espelha cakto-proxy + reusa a mesma RPC já usada nas RLS de 20260619).
// Escrita via service_role client. Despacho por body.action.
//
// Onboarding de auth user espelha `ensureAdminUser`:
//   get_auth_user_id_by_email -> (ausente) auth.admin.createUser(email_confirm:true)
//   -> generateLink({type:'recovery'}) -> send-transactional-email (best-effort).
//
// Regra travada: commission_pct no banco é PERCENTUAL INTEIRO (30 = 30%), igual ao
// que o helper de comissão usa (amountCents = amount * pct). A UI envia 30; grava 30.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const VALID_STATUS = new Set(['active', 'paused', 'blocked']);

function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const base = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `Vd!${base.slice(0, 28)}A1`;
}

/** Gera sufixo aleatório base36 (6 chars) para o ref_code. */
function randomSuffix(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n.toString(36).slice(0, 6).padStart(6, '0');
}

/** slug a partir do nome: minúsculas, sem acento, hifeniza. */
function slugify(name: string): string {
  return (name || 'afiliado')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'afiliado';
}

function publicAppUrl(): string {
  const explicit = Deno.env.get('PUBLIC_APP_URL');
  if (explicit && explicit.length > 0) return explicit.replace(/\/+$/, '');
  // Sem PUBLIC_APP_URL configurada: usa default conhecido do projeto (espelha src/lib/publicUrl.ts).
  return 'https://app.vendus.com.br';
}

interface AffiliateSummary {
  pending_cents: number;
  approved_cents: number;
  paid_cents: number;
  cancelled_cents: number;
  commissions_count: number;
}

/** Carrega o summary agregado por affiliate_id (mapa). */
async function loadSummaries(admin: SupabaseClient, ids: string[]): Promise<Map<string, AffiliateSummary>> {
  const map = new Map<string, AffiliateSummary>();
  if (ids.length === 0) return map;
  const { data } = await admin
    .from('affiliate_commission_summary')
    .select('affiliate_id, pending_cents, approved_cents, paid_cents, cancelled_cents, commissions_count')
    .in('affiliate_id', ids);
  for (const row of ((data ?? []) as any[])) {
    map.set(row.affiliate_id, {
      pending_cents: Number(row.pending_cents ?? 0),
      approved_cents: Number(row.approved_cents ?? 0),
      paid_cents: Number(row.paid_cents ?? 0),
      cancelled_cents: Number(row.cancelled_cents ?? 0),
      commissions_count: Number(row.commissions_count ?? 0),
    });
  }
  return map;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);
    const userId = userData.user.id;

    // Gate duro: super admin via RPC (mesma usada nas RLS de afiliados).
    const { data: isSuper, error: superErr } = await admin.rpc('is_super_admin', { _user_id: userId });
    if (superErr) return json({ error: superErr.message }, 500);
    if (isSuper !== true) return json({ error: 'Apenas super admin' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    switch (action) {
      // ─────────────────────────────────────────────────────────────────
      case 'create_affiliate': {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!name || !email) return json({ error: 'name e email obrigatórios' }, 400);

        const status = VALID_STATUS.has(body.status) ? body.status : 'active';
        const pctRaw = Number(body.commission_pct);
        const pctPercent = Number.isFinite(pctRaw) && pctRaw >= 0 ? pctRaw : 0;
        const sendWelcome = body.send_welcome !== false;

        // 1) Resolve/cria auth user (espelha ensureAdminUser).
        let authUserId: string | null = null;
        let userCreated = false;
        const { data: foundId } = await admin.rpc('get_auth_user_id_by_email', { _email: email });
        if (typeof foundId === 'string') authUserId = foundId;
        if (!authUserId) {
          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email,
            password: randomPassword(),
            email_confirm: true,
            user_metadata: { full_name: name },
          });
          if (createErr || !created?.user?.id) {
            return json({ error: `createUser: ${createErr?.message ?? 'unknown'}` }, 500);
          }
          authUserId = created.user.id;
          userCreated = true;
        }

        // 2) Insere o afiliado (idempotência por idx unique lower(email) -> 23505).
        const { data: affiliate, error: insErr } = await admin
          .from('affiliates')
          .insert({
            user_id: authUserId,
            name,
            email,
            phone: body.phone ?? null,
            pix_key: body.pix_key ?? null,
            status,
            commission_pct: pctPercent,
            notes: body.notes ?? null,
          })
          .select('*')
          .single();

        if (insErr) {
          if ((insErr as { code?: string }).code === '23505') {
            return json({ error: 'afiliado já existe para este e-mail' }, 409);
          }
          return json({ error: insErr.message }, 500);
        }

        // 3) Dispara link de acesso (recovery) — best-effort, espelha ensureAdminUser.
        let welcomeSent = false;
        if (sendWelcome) {
          try {
            const { data: linkData } = await admin.auth.admin.generateLink({ type: 'recovery', email });
            const recoveryLink =
              (linkData as any)?.properties?.action_link ||
              (linkData as any)?.action_link ||
              null;
            const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
              body: JSON.stringify({
                templateName: 'affiliate-welcome-access',
                recipientEmail: email,
                idempotencyKey: `affiliate-welcome-${authUserId}`,
                templateData: { fullName: name, recoveryLink, email },
              }),
            });
            welcomeSent = resp.ok;
          } catch (_e) {
            welcomeSent = false;
          }
        }

        return json({ ok: true, affiliate, user_created: userCreated, welcome_sent: welcomeSent });
      }

      // ─────────────────────────────────────────────────────────────────
      case 'update_affiliate': {
        const id = body.id as string;
        if (!id) return json({ error: 'id obrigatório' }, 400);
        const patch = (body.patch ?? {}) as Record<string, unknown>;

        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (typeof patch.name === 'string') update.name = (patch.name as string).trim();
        if ('phone' in patch) update.phone = patch.phone ?? null;
        if ('pix_key' in patch) update.pix_key = patch.pix_key ?? null;
        if ('notes' in patch) update.notes = patch.notes ?? null;
        if ('status' in patch) {
          if (!VALID_STATUS.has(patch.status as string)) return json({ error: 'status inválido' }, 400);
          update.status = patch.status;
        }
        if ('commission_pct' in patch) {
          const h = Number(patch.commission_pct);
          if (!Number.isFinite(h) || h < 0) return json({ error: 'commission_pct inválido' }, 400);
          update.commission_pct = h; // percentual inteiro (30 = 30%)
        }
        // email NÃO é editável (chave do auth user).

        const { data: affiliate, error } = await admin
          .from('affiliates')
          .update(update)
          .eq('id', id)
          .select('*')
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!affiliate) return json({ error: 'afiliado não encontrado' }, 404);
        return json({ ok: true, affiliate });
      }

      // ─────────────────────────────────────────────────────────────────
      case 'generate_link': {
        const affiliateId = body.affiliate_id as string;
        if (!affiliateId) return json({ error: 'affiliate_id obrigatório' }, 400);

        // Confirma que o afiliado existe (e captura o nome p/ slug default).
        const { data: aff } = await admin
          .from('affiliates')
          .select('id, name')
          .eq('id', affiliateId)
          .maybeSingle();
        if (!aff) return json({ error: 'afiliado não encontrado' }, 404);

        const explicitRef = typeof body.ref_code === 'string' && body.ref_code.trim().length > 0
          ? body.ref_code.trim()
          : null;

        let inserted: any = null;
        let lastErr: { code?: string; message?: string } | null = null;
        const maxAttempts = explicitRef ? 1 : 5;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const refCode = explicitRef ?? `${slugify(aff.name)}-${randomSuffix()}`;
          const { data, error } = await admin
            .from('affiliate_links')
            .insert({
              affiliate_id: affiliateId,
              ref_code: refCode,
              label: body.label ?? null,
              default_utm_source: body.default_utm_source ?? null,
              default_utm_medium: body.default_utm_medium ?? null,
              default_utm_campaign: body.default_utm_campaign ?? null,
            })
            .select('*')
            .single();
          if (!error) { inserted = data; break; }
          lastErr = error as { code?: string; message?: string };
          // 23505 -> colisão no idx unique lower(ref_code). Se ref explícito, falha já.
          if (lastErr.code !== '23505' || explicitRef) break;
        }

        if (!inserted) {
          if (lastErr?.code === '23505') return json({ error: 'ref_code já em uso' }, 409);
          return json({ error: lastErr?.message ?? 'falha ao gerar link' }, 500);
        }

        const publicUrl = `${publicAppUrl()}/vendas?ref=${encodeURIComponent(inserted.ref_code)}`;
        return json({ ok: true, link: inserted, public_url: publicUrl });
      }

      // ─────────────────────────────────────────────────────────────────
      case 'list_affiliates': {
        const search = typeof body.search === 'string' ? body.search.trim() : '';
        const status = VALID_STATUS.has(body.status) ? body.status : null;
        const limit = Number.isFinite(Number(body.limit)) ? Math.min(Number(body.limit), 500) : 100;
        const offset = Number.isFinite(Number(body.offset)) ? Number(body.offset) : 0;

        let q = admin
          .from('affiliates')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (status) q = q.eq('status', status);
        if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`);

        const { data: affiliates, count, error } = await q;
        if (error) return json({ error: error.message }, 500);

        const ids = ((affiliates ?? []) as any[]).map((a) => a.id);
        const summaries = await loadSummaries(admin, ids);

        // links_count por afiliado.
        const linksCount = new Map<string, number>();
        if (ids.length > 0) {
          const { data: links } = await admin
            .from('affiliate_links')
            .select('affiliate_id')
            .in('affiliate_id', ids);
          for (const l of ((links ?? []) as any[])) {
            linksCount.set(l.affiliate_id, (linksCount.get(l.affiliate_id) ?? 0) + 1);
          }
        }

        const enriched = ((affiliates ?? []) as any[]).map((a) => ({
          ...a,
          links_count: linksCount.get(a.id) ?? 0,
          summary: summaries.get(a.id) ?? {
            pending_cents: 0, approved_cents: 0, paid_cents: 0, cancelled_cents: 0, commissions_count: 0,
          },
        }));

        return json({ ok: true, affiliates: enriched, total: count ?? enriched.length });
      }

      // ─────────────────────────────────────────────────────────────────
      case 'list_links': {
        const affiliateId = body.affiliate_id as string;
        if (!affiliateId) return json({ error: 'affiliate_id obrigatório' }, 400);
        const { data: links, error } = await admin
          .from('affiliate_links')
          .select('*')
          .eq('affiliate_id', affiliateId)
          .order('created_at', { ascending: false });
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, links: links ?? [] });
      }

      // ─────────────────────────────────────────────────────────────────
      case 'list_commissions': {
        const limit = Number.isFinite(Number(body.limit)) ? Math.min(Number(body.limit), 500) : 100;
        const offset = Number.isFinite(Number(body.offset)) ? Number(body.offset) : 0;

        let q = admin
          .from('affiliate_commissions')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (body.affiliate_id) q = q.eq('affiliate_id', body.affiliate_id);
        if (body.status) q = q.eq('status', body.status);
        if (body.from) q = q.gte('created_at', body.from);
        if (body.to) q = q.lte('created_at', body.to);

        const { data: commissions, count, error } = await q;
        if (error) return json({ error: error.message }, 500);

        // affiliate_name via join leve.
        const affIds = [...new Set(((commissions ?? []) as any[]).map((c) => c.affiliate_id))];
        const nameMap = new Map<string, string>();
        if (affIds.length > 0) {
          const { data: affs } = await admin.from('affiliates').select('id, name').in('id', affIds);
          for (const a of ((affs ?? []) as any[])) nameMap.set(a.id, a.name);
        }
        const enriched = ((commissions ?? []) as any[]).map((c) => ({
          ...c,
          affiliate_name: nameMap.get(c.affiliate_id) ?? null,
        }));

        return json({ ok: true, commissions: enriched, total: count ?? enriched.length });
      }

      // ─────────────────────────────────────────────────────────────────
      case 'approve_commission': {
        const id = body.id as string;
        if (!id) return json({ error: 'id obrigatório' }, 400);
        const { data: updated, error } = await admin
          .from('affiliate_commissions')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('status', 'pending')
          .select('*')
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!updated) {
          // Não estava pending: descobre o status atual p/ mensagem útil.
          const { data: cur } = await admin
            .from('affiliate_commissions').select('status').eq('id', id).maybeSingle();
          if (!cur) return json({ error: 'comissão não encontrada' }, 404);
          return json({ error: `comissão não está pending (status atual: ${cur.status})` }, 409);
        }
        return json({ ok: true, commission: updated });
      }

      // ─────────────────────────────────────────────────────────────────
      case 'cancel_commission': {
        const id = body.id as string;
        if (!id) return json({ error: 'id obrigatório' }, 400);

        const { data: cur } = await admin
          .from('affiliate_commissions')
          .select('id, status, metadata')
          .eq('id', id)
          .maybeSingle();
        if (!cur) return json({ error: 'comissão não encontrada' }, 404);
        if (cur.status === 'paid') return json({ error: 'comissão paga não pode ser cancelada' }, 409);
        if (cur.status === 'cancelled') return json({ ok: true, commission: cur });

        const mergedMeta = {
          ...(cur.metadata && typeof cur.metadata === 'object' ? cur.metadata : {}),
          cancel_reason: body.reason ?? null,
          cancelled_at: new Date().toISOString(),
        };

        // Transição pending|approved -> cancelled (guarda contra corrida c/ 'paid').
        const { data: updated, error } = await admin
          .from('affiliate_commissions')
          .update({ status: 'cancelled', metadata: mergedMeta, updated_at: new Date().toISOString() })
          .eq('id', id)
          .in('status', ['pending', 'approved'])
          .select('*')
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!updated) return json({ error: 'comissão paga não pode ser cancelada' }, 409);
        return json({ ok: true, commission: updated });
      }

      default:
        return json({ error: `Ação inválida: ${action}` }, 400);
    }
  } catch (e: any) {
    console.error('affiliate-admin error', e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
