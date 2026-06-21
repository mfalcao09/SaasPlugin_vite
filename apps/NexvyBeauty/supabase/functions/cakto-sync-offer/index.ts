// cakto-sync-offer
// Gera/atualiza as ofertas Cakto dos planos e grava as URLs de checkout em
// platform_plans. Acionada pelo super-admin.
//
// Dois modos:
//   { plan_id }  -> sincroniza UM plano.
//   { all: true} -> sincroniza TODOS os planos ativos, com auto-match produto↔plano.
//
// Auto-match (one-click): lista os produtos da conta (GET /public_api/products/)
// e casa cada plano por NOME (igual, case-insensitive) ou, em fallback, por PREÇO
// mensal. Achou produto -> grava cakto_product_id + gera ofertas + URLs.
//
// Reconciliação de ofertas: casa por (recorrência + preço). Reusa se já existir;
// cria se faltar (mudar preço gera oferta nova, sem afetar assinantes da antiga).
// A API Create Offer NÃO devolve URL -> montada como `${BASE}/${slug}`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  ensureCaktoToken,
  caktoCreateOffer,
  caktoUpdateOffer,
  caktoListOffers,
  caktoListProducts,
  buildCaktoCheckoutUrl,
  CAKTO_CHECKOUT_BASE_DEFAULT,
  type CaktoOfferInput,
  type CaktoProduct,
} from '../_shared/cakto-client.ts';

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

const MIN_PRICE = 5; // mínimo de preço aceito pela Cakto (R$ 5,00)
const PLAN_COLS =
  'id,name,slug,price_monthly,price_yearly,trial_days,cakto_product_id,checkout_url,checkout_url_yearly,checkout_url_cakto,cakto_offer_slug';

type Cycle = 'monthly' | 'yearly';

interface CycleResult {
  cycle: Cycle;
  action: 'created' | 'updated' | 'unchanged' | 'skipped_min_price';
  slug: string | null;
  url: string | null;
}

interface PlanSyncResult {
  plan_id: string;
  plan_name: string;
  product_id: string | null;
  product_name?: string | null;
  matched_by: 'existing' | 'name' | 'price' | null;
  status: 'synced' | 'no_product_match' | 'skipped_free' | 'error';
  monthly?: CycleResult;
  yearly?: CycleResult;
  error?: string;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

// Casa um plano com um produto Cakto: por nome igual, senão por preço mensal.
function matchProduct(
  plan: any,
  products: CaktoProduct[],
): { product: CaktoProduct | null; matchedBy: 'name' | 'price' | null } {
  const byName = products.find((p) => norm(p.name) === norm(plan.name));
  if (byName) return { product: byName, matchedBy: 'name' };
  const pm = Number(plan.price_monthly);
  const byPrice =
    Number.isFinite(pm) && pm >= MIN_PRICE ? products.find((p) => Number(p.price) === pm) : undefined;
  if (byPrice) return { product: byPrice, matchedBy: 'price' };
  return { product: null, matchedBy: null };
}

// Reconcilia um ciclo (mensal/anual) contra as ofertas do produto.
async function syncCycle(
  cycle: Cycle,
  plan: any,
  productId: string,
  offers: any[],
  accessToken: string,
  trialDays: number,
  base: string,
): Promise<CycleResult> {
  const price = Number(cycle === 'monthly' ? plan.price_monthly : plan.price_yearly);
  if (!Number.isFinite(price) || price < MIN_PRICE) {
    return { cycle, action: 'skipped_min_price', slug: null, url: null };
  }

  const intervalType = cycle === 'monthly' ? 'month' : 'year';
  const desired: CaktoOfferInput = {
    name: `${plan.name} — ${cycle === 'monthly' ? 'Mensal' : 'Anual'}`.slice(0, 255),
    price,
    product: productId,
    type: 'subscription',
    intervalType,
    interval: 1,
    recurrence_period: cycle === 'monthly' ? 30 : 365,
    quantity_recurrences: -1,
    trial_days: trialDays,
    status: 'active',
  };

  const existing = offers.find(
    (o) =>
      o.intervalType === intervalType &&
      Number(o.price) === price &&
      o.type === 'subscription' &&
      o.status === 'active',
  );

  if (existing) {
    if (Number(existing.trial_days ?? 0) === trialDays) {
      return { cycle, action: 'unchanged', slug: existing.id, url: buildCaktoCheckoutUrl(existing.id, base) };
    }
    const updated = await caktoUpdateOffer(accessToken, existing.id, desired);
    return { cycle, action: 'updated', slug: updated.id, url: buildCaktoCheckoutUrl(updated.id, base) };
  }

  const created = await caktoCreateOffer(accessToken, desired);
  return { cycle, action: 'created', slug: created.id, url: buildCaktoCheckoutUrl(created.id, base) };
}

function buildUpdate(monthly: CycleResult, yearly: CycleResult, productId: string): Record<string, string> {
  const u: Record<string, string> = { cakto_product_id: productId };
  if (monthly.url) {
    u.checkout_url = monthly.url;
    u.checkout_url_cakto = monthly.url; // espelho da mensal (casamento de pedido / LP)
    if (monthly.slug) u.cakto_offer_slug = monthly.slug;
  }
  if (yearly.url) u.checkout_url_yearly = yearly.url;
  return u;
}

// Sincroniza um plano: resolve produto (existente ou auto-match) -> ofertas -> grava.
async function syncPlan(
  admin: any,
  accessToken: string,
  plan: any,
  products: CaktoProduct[],
  base: string,
): Promise<PlanSyncResult> {
  const priceM = Number(plan.price_monthly);
  const priceY = Number(plan.price_yearly);
  const head = { plan_id: plan.id, plan_name: plan.name };

  if ((!Number.isFinite(priceM) || priceM < MIN_PRICE) && (!Number.isFinite(priceY) || priceY < MIN_PRICE)) {
    return { ...head, product_id: null, matched_by: null, status: 'skipped_free' };
  }

  let productId: string | null = (plan.cakto_product_id as string | null) || null;
  let matchedBy: PlanSyncResult['matched_by'] = productId ? 'existing' : null;
  let productName: string | null | undefined;

  if (!productId) {
    const m = matchProduct(plan, products);
    if (m.product) {
      productId = m.product.id;
      matchedBy = m.matchedBy;
      productName = m.product.name;
    }
  }

  if (!productId) {
    return { ...head, product_id: null, matched_by: null, status: 'no_product_match' };
  }

  const offers = await caktoListOffers(accessToken, productId);
  const trialDays = Number(plan.trial_days ?? 0);
  const monthly = await syncCycle('monthly', plan, productId, offers, accessToken, trialDays, base);
  const yearly = await syncCycle('yearly', plan, productId, offers, accessToken, trialDays, base);

  const update = buildUpdate(monthly, yearly, productId);
  const { error } = await admin.from('platform_plans').update(update).eq('id', plan.id);
  if (error) throw new Error(`Falha ao gravar plano ${plan.name}: ${error.message}`);

  return { ...head, product_id: productId, product_name: productName, matched_by: matchedBy, status: 'synced', monthly, yearly };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const CHECKOUT_BASE = Deno.env.get('CAKTO_CHECKOUT_BASE') ?? CAKTO_CHECKOUT_BASE_DEFAULT;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const userJwt = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await userClient.auth.getUser(userJwt);
    if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);

    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userData.user.id);
    const isSuper = (roles ?? []).some((r: any) => r.role === 'super_admin');
    if (!isSuper) return json({ error: 'Apenas super admin pode sincronizar ofertas' }, 403);

    const body = await req.json().catch(() => ({}));

    // Credencial da plataforma + token Cakto
    const { data: cred } = await admin
      .from('cakto_credentials')
      .select('*')
      .eq('scope', 'platform')
      .maybeSingle();
    if (!cred) return json({ error: 'Credenciais Cakto (scope platform) não configuradas' }, 400);
    const accessToken = await ensureCaktoToken(admin, cred);

    // Produtos da conta (necessário p/ auto-match)
    const products = await caktoListProducts(accessToken);

    // --- Modo: sincronizar TODOS os planos ---------------------------------
    if (body.all === true) {
      const { data: plans, error: plansErr } = await admin
        .from('platform_plans')
        .select(PLAN_COLS)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (plansErr) return json({ error: plansErr.message }, 500);

      const results: PlanSyncResult[] = [];
      for (const plan of plans ?? []) {
        try {
          results.push(await syncPlan(admin, accessToken, plan, products, CHECKOUT_BASE));
        } catch (e: any) {
          results.push({
            plan_id: plan.id,
            plan_name: plan.name,
            product_id: null,
            matched_by: null,
            status: 'error',
            error: String(e?.message ?? e),
          });
        }
      }

      console.log(
        '[cakto-sync-offer:all]',
        JSON.stringify({
          products: products.map((p) => ({ id: p.id, name: p.name, price: p.price, type: p.type })),
          results,
        }),
      );
      return json({ ok: true, mode: 'all', results });
    }

    // --- Modo: sincronizar UM plano ----------------------------------------
    const planId = body.plan_id as string | undefined;
    if (!planId) return json({ error: 'plan_id ou all obrigatório' }, 400);

    const { data: plan, error: planErr } = await admin
      .from('platform_plans')
      .select(PLAN_COLS)
      .eq('id', planId)
      .maybeSingle();
    if (planErr) return json({ error: planErr.message }, 500);
    if (!plan) return json({ error: 'Plano não encontrado' }, 404);

    const result = await syncPlan(admin, accessToken, plan, products, CHECKOUT_BASE);
    console.log('[cakto-sync-offer:one]', JSON.stringify(result));

    if (result.status === 'no_product_match') return json({ skipped: true, reason: 'no_product_id', ...result });
    if (result.status === 'skipped_free') return json({ skipped: true, reason: 'free_plan', ...result });

    // Compat com o hook single existente.
    return json({
      ok: true,
      plan_id: planId,
      product_id: result.product_id,
      monthly: result.monthly,
      yearly: result.yearly,
    });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
