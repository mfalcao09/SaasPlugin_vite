// tenant-referral — módulo do SALÃO: cliente indica amiga (pacote/agendamento).
// JWT do tenant. Comissão sai do faturamento do salão (program=tenant).
// Programa de plataforma (NexvyBeauty) continua em affiliate-admin / affiliate-salon.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { randomRefSuffix, slugifyAffiliateName } from '../_shared/affiliate-onda2.ts';
import {
  canGenerateTenantClientLink,
  parseTenantCommissionPct,
  tenantBookingReferralUrl,
  tenantReferrerStatsUrl,
} from '../_shared/affiliate-onda3.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APEX = 'https://nexvybeauty.com.br';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

    const { data: profile } = await admin
      .from('profiles')
      .select('id, organization_id')
      .eq('id', userData.user.id)
      .maybeSingle();
    const organizationId = profile?.organization_id ?? null;
    if (!organizationId) return json({ error: 'Sem organização' }, 403);

    const { data: org } = await admin
      .from('organizations')
      .select('id, slug')
      .eq('id', organizationId)
      .maybeSingle();
    const slug = (org?.slug ?? '').trim();

    const body = await req.json().catch(() => ({}));
    const action = (body.action as string) || 'get_program';

    const loadProgram = async () => {
      const { data } = await admin
        .from('tenant_referral_programs')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();
      return data ?? { organization_id: organizationId, enabled: false, commission_pct: 10 };
    };

    switch (action) {
      case 'get_program': {
        return json({ ok: true, program: await loadProgram(), slug });
      }

      case 'save_program': {
        const pct = parseTenantCommissionPct(body.commission_pct ?? 10);
        if (pct == null) return json({ error: 'commission_pct inválido (1–50)' }, 422);
        const enabled = Boolean(body.enabled);
        const { data, error } = await admin
          .from('tenant_referral_programs')
          .upsert({
            organization_id: organizationId,
            enabled,
            commission_pct: pct,
            updated_at: new Date().toISOString(),
          })
          .select('*')
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, program: data });
      }

      case 'generate_client_link': {
        const program = await loadProgram();
        if (!canGenerateTenantClientLink({ programEnabled: Boolean(program.enabled), organizationId })) {
          return json({ error: 'Ligue o programa de indicação do salão antes de gerar o link.' }, 403);
        }
        if (!slug) return json({ error: 'Salão sem slug de agendamento público.' }, 422);
        const clienteId = typeof body.cliente_id === 'string' ? body.cliente_id.trim() : '';
        if (!clienteId) return json({ error: 'cliente_id obrigatório' }, 422);

        const { data: cliente } = await admin
          .from('clientes')
          .select('id, nome, email, telefone')
          .eq('id', clienteId)
          .eq('organization_id', organizationId)
          .maybeSingle();
        if (!cliente) return json({ error: 'cliente não encontrado neste salão' }, 404);

        const pct = parseTenantCommissionPct(program.commission_pct) ?? 10;
        const email = (cliente.email ?? '').trim().toLowerCase()
          || `indicacao+${cliente.id.replace(/-/g, '')}@tenant.invalid`;
        const name = (cliente.nome ?? 'Cliente').trim();

        let aff = (await admin
          .from('affiliates')
          .select('*')
          .eq('program', 'tenant')
          .eq('owner_organization_id', organizationId)
          .eq('referrer_cliente_id', cliente.id)
          .maybeSingle()).data;

        if (!aff) {
          const { data: created, error } = await admin
            .from('affiliates')
            .insert({
              name,
              email,
              phone: cliente.telefone ?? null,
              status: 'active',
              commission_pct: pct,
              program: 'tenant',
              owner_organization_id: organizationId,
              referrer_cliente_id: cliente.id,
              payout_preference: 'pix',
              notes: 'tenant_client_referral',
            })
            .select('*')
            .single();
          if (error) return json({ error: error.message }, 500);
          aff = created;
        }

        const { data: links } = await admin
          .from('affiliate_links')
          .select('*')
          .eq('affiliate_id', aff.id)
          .order('created_at', { ascending: true });
        let link = Array.isArray(links) && links[0] ? links[0] : null;
        if (!link) {
          const ref = `${slugifyAffiliateName(name)}-${randomRefSuffix()}`;
          const { data: inserted, error } = await admin
            .from('affiliate_links')
            .insert({
              affiliate_id: aff.id,
              ref_code: ref,
              label: 'Indique uma amiga',
              program: 'tenant',
              owner_organization_id: organizationId,
            })
            .select('*')
            .single();
          if (error) return json({ error: error.message }, 500);
          link = inserted;
        }

        return json({
          ok: true,
          affiliate: { id: aff.id, name: aff.name, program: 'tenant' },
          link,
          public_url: tenantBookingReferralUrl({ apexUrl: APEX, slug, refCode: link.ref_code }),
          stats_url: tenantReferrerStatsUrl({ apexUrl: APEX, slug, refCode: link.ref_code }),
        });
      }

      case 'list_links': {
        const { data: affs } = await admin
          .from('affiliates')
          .select('id, name, referrer_cliente_id, commission_pct, status')
          .eq('program', 'tenant')
          .eq('owner_organization_id', organizationId);
        const ids = (affs ?? []).map((a: { id: string }) => a.id);
        if (ids.length === 0) return json({ ok: true, links: [], slug });

        const { data: links } = await admin
          .from('affiliate_links')
          .select('id, affiliate_id, ref_code, clicks, label')
          .eq('program', 'tenant')
          .eq('owner_organization_id', organizationId);

        const { data: comms } = await admin
          .from('affiliate_commissions')
          .select('affiliate_id, status')
          .eq('program', 'tenant')
          .eq('owner_organization_id', organizationId);

        const byAff = new Map((affs ?? []).map((a: { id: string }) => [a.id, a]));
        const rows = (links ?? []).map((l: { affiliate_id: string; ref_code: string; clicks: number; label: string | null }) => {
          const a = byAff.get(l.affiliate_id);
          const mine = (comms ?? []).filter((c: { affiliate_id: string }) => c.affiliate_id === l.affiliate_id);
          return {
            ref_code: l.ref_code,
            label: l.label,
            clicks: l.clicks ?? 0,
            referrer_name: a?.name ?? 'Cliente',
            pending_count: mine.filter((c: { status: string }) => c.status === 'pending').length,
            approved_count: mine.filter((c: { status: string }) => c.status === 'approved').length,
            public_url: slug ? tenantBookingReferralUrl({ apexUrl: APEX, slug, refCode: l.ref_code }) : null,
            stats_url: slug ? tenantReferrerStatsUrl({ apexUrl: APEX, slug, refCode: l.ref_code }) : null,
          };
        });
        return json({ ok: true, links: rows, slug });
      }

      default:
        return json({ error: `Ação inválida: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
