// affiliate-salon — dono de salão cliente gera link e escolhe crédito ou PIX.
// JWT obrigatório. Programa continua de PLATAFORMA (não motor tenant / Onda 3).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { DEFAULT_COMMISSION_PCT } from '../_shared/affiliate-policy.ts';
import {
  canSalonOwnerGenerateLink,
  parseCosellStub,
  parsePayoutPreference,
  randomRefSuffix,
  slugifyAffiliateName,
} from '../_shared/affiliate-onda2.ts';

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

function publicAppUrl(): string {
  const explicit = Deno.env.get('PUBLIC_APP_URL');
  if (explicit && explicit.length > 0) return explicit.replace(/\/+$/, '');
  return 'https://app.nexvybeauty.com.br';
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
    const user = userData.user;

    const { data: profile } = await admin
      .from('profiles')
      .select('id, full_name, email, phone, organization_id')
      .eq('id', user.id)
      .maybeSingle();

    const organizationId = profile?.organization_id ?? null;
    let planStatus: string | null = null;
    if (organizationId) {
      const { data: org } = await admin
        .from('organizations')
        .select('plan_status')
        .eq('id', organizationId)
        .maybeSingle();
      planStatus = org?.plan_status ?? null;
    }

    const body = await req.json().catch(() => ({}));
    const action = (body.action as string) || 'ensure_link';

    const loadAffiliate = async () => {
      if (organizationId) {
        const { data: byOrg } = await admin
          .from('affiliates')
          .select('*')
          .eq('organization_id', organizationId)
          .maybeSingle();
        if (byOrg) return byOrg;
      }
      const email = (profile?.email || user.email || '').trim().toLowerCase();
      if (!email) return null;
      const { data: byEmail } = await admin
        .from('affiliates')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      return byEmail;
    };

    switch (action) {
      case 'ensure_link': {
        if (!canSalonOwnerGenerateLink({ organizationId, planStatus })) {
          return json({ error: 'Só salão cliente com plano ativo/trial gera link.' }, 403);
        }

        let aff = await loadAffiliate();
        const name = (profile?.full_name || 'Dona de salão').trim();
        const email = (profile?.email || user.email || '').trim().toLowerCase();
        const phone = profile?.phone ?? null;

        if (!aff) {
          const { data: created, error } = await admin
            .from('affiliates')
            .insert({
              user_id: user.id,
              organization_id: organizationId,
              name,
              email,
              phone,
              status: 'active',
              commission_pct: DEFAULT_COMMISSION_PCT,
              payout_preference: 'subscription_credit',
              kind: 'externo',
              notes: 'salon_owner_referral',
            })
            .select('*')
            .single();
          if (error) {
            if ((error as { code?: string }).code === '23505') {
              aff = await loadAffiliate();
            } else {
              return json({ error: error.message }, 500);
            }
          } else {
            aff = created;
          }
        } else {
          const patch: Record<string, unknown> = {
            user_id: aff.user_id ?? user.id,
            organization_id: aff.organization_id ?? organizationId,
            updated_at: new Date().toISOString(),
          };
          if (aff.status === 'pending') patch.status = 'active';
          await admin.from('affiliates').update(patch).eq('id', aff.id);
          aff = { ...aff, ...patch };
        }

        const { data: links } = await admin
          .from('affiliate_links')
          .select('*')
          .eq('affiliate_id', aff.id)
          .order('created_at', { ascending: true });
        let link = Array.isArray(links) && links[0] ? links[0] : null;
        if (!link) {
          const ref = `${slugifyAffiliateName(aff.name)}-${randomRefSuffix()}`;
          const { data: inserted, error } = await admin
            .from('affiliate_links')
            .insert({
              affiliate_id: aff.id,
              ref_code: ref,
              label: 'Indique um salão',
            })
            .select('*')
            .single();
          if (error) return json({ error: error.message }, 500);
          link = inserted;
        }

        const publicUrl = `${publicAppUrl()}/vendas?ref=${encodeURIComponent(link.ref_code)}`;
        return json({
          ok: true,
          affiliate: aff,
          link,
          public_url: publicUrl,
        });
      }

      case 'set_payout_preference': {
        const pref = parsePayoutPreference(body.payout_preference);
        if (!pref) return json({ error: 'payout_preference inválido' }, 422);
        const aff = await loadAffiliate();
        if (!aff) return json({ error: 'afiliado não encontrado' }, 404);
        if (aff.user_id && aff.user_id !== user.id) return json({ error: 'Forbidden' }, 403);
        const { data: updated, error } = await admin
          .from('affiliates')
          .update({ payout_preference: pref, updated_at: new Date().toISOString() })
          .eq('id', aff.id)
          .select('*')
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, affiliate: updated });
      }

      case 'list_stages': {
        const { data, error } = await userClient.rpc('affiliate_my_lead_stages');
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, stages: data ?? [] });
      }

      case 'mark_cosell': {
        const parsed = parseCosellStub(body);
        if (!parsed.ok) return json({ error: parsed.error }, 422);
        const aff = await loadAffiliate();
        if (!aff) return json({ error: 'afiliado não encontrado' }, 404);
        const { data: lead } = await admin
          .from('sales_leads')
          .select('id, affiliate_funnel_stage')
          .eq('affiliate_id', aff.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!lead) return json({ error: 'nenhum indicado para registrar reunião' }, 404);
        const { data: updated, error } = await admin
          .from('sales_leads')
          .update({
            co_sell: true,
            co_sell_meeting_at: parsed.value.meetingAt,
            co_sell_closer_user_id: parsed.value.closerUserId,
            affiliate_funnel_stage: lead.affiliate_funnel_stage === 'paid' ? 'paid' : 'in_conversation',
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id)
          .select('id, affiliate_funnel_stage, co_sell, co_sell_meeting_at')
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, lead: updated, split_kind: parsed.value.splitKind });
      }

      default:
        return json({ error: `Ação inválida: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
