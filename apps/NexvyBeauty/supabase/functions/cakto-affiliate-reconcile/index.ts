// cakto-affiliate-reconcile — backstop de comissões de afiliado (first_sale + recorrência).
//
// Lista pedidos PAGOS via API Cakto (GET /orders) e cria uma comissão por order id, de forma
// IDEMPOTENTE (mesma idempotency_key = order id usada pelo cakto-webhook → nunca duplica).
// Pega o que o webhook em tempo real perder (renovações que não disparam webhook, downtime).
// Renovações aparecem como orders separadas (subscription_period > 1) → revenue share recorrente.
//
// Invocação: on-demand (service role) ou cron. Não é público (verify_jwt=true no deploy).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { caktoGet, ensureCaktoToken, type CaktoCredentialsRow } from '../_shared/cakto-client.ts';
import { attributeAffiliateCommission } from '../_shared/affiliate-commission.ts';
import { orderToCommissionArgs } from './reconcile-core.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const MAX_PAGES = 50;
const PAGE_LIMIT = 100;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Credencial da plataforma (mesma seleção do cakto-proxy / cakto-webhook).
    const { data: cred } = await admin
      .from('cakto_credentials')
      .select('*')
      .eq('scope', 'platform')
      .maybeSingle();
    if (!cred) return json({ error: 'cakto platform credentials not found' }, 404);

    const token = await ensureCaktoToken(admin, cred as CaktoCredentialsRow);

    let page = 1;
    let scanned = 0;
    let created = 0;
    const skips: Record<string, number> = {};

    while (page <= MAX_PAGES) {
      const data = await caktoGet(token, '/public_api/orders', {
        status: 'paid',
        limit: String(PAGE_LIMIT),
        page: String(page),
      });
      const results: unknown[] = Array.isArray(data?.results) ? data.results : [];
      if (results.length === 0) break;

      for (const order of results) {
        const args = orderToCommissionArgs(order);
        if (!args) continue;
        scanned++;

        let orgId: string | null = null;
        if (args.customerEmail) {
          const { data: org } = await admin
            .from('organizations')
            .select('id')
            .eq('cakto_customer_email', args.customerEmail.toLowerCase())
            .maybeSingle();
          orgId = org?.id ?? null;
        }

        const r = await attributeAffiliateCommission(admin, { ...args, organizationId: orgId });
        if (r.created) created++;
        else skips[r.skipped ?? 'unknown'] = (skips[r.skipped ?? 'unknown'] ?? 0) + 1;
      }

      if (!data?.next) break;
      page += 1;
    }

    return json({ ok: true, scanned, created, skips, pages: page });
  } catch (e) {
    console.error('[cakto-affiliate-reconcile] error', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
