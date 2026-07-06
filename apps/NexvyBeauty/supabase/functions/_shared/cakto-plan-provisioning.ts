// Helper compartilhado entre `cakto-webhook` e `cakto-reprocess-order`.
// Provisiona o plano da plataforma e o usuário admin a partir de um pedido Cakto.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { GRAPH_BASE } from './meta-graph.ts';
import { decryptSecret } from './meta-crypto.ts';
import { normalizePhoneBR } from './phone.ts';

export interface CaktoOrderLike {
  cakto_id?: string | null;
  cakto_ref_id?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  amount?: number | null;
  status?: string | null;
  cakto_offer_slug?: string | null;
  product_cakto_id?: string | null;
  product_name?: string | null;
  raw_payload?: any;
}

/**
 * Normaliza um texto em slug: minúsculo, sem acento, apenas [a-z0-9] e hífens.
 * Mesma regra do backfill de organizations.slug (migrations_salao/20260623),
 * porém em JS (NFD) — a org PRECISA nascer com slug ou a página pública /s/<slug>
 * dá 404.
 */
function slugifyOrg(input: string | null | undefined): string {
  const base = (input ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

/**
 * Gera um slug único para a organização a partir do nome.
 * Em colisão (organizations.slug tem UNIQUE INDEX parcial), tenta sufixo
 * -2, -3, ... Fallback para `salao-<random>` se o nome não render slug válido.
 */
async function generateUniqueOrgSlug(
  admin: SupabaseClient,
  name: string | null | undefined,
): Promise<string> {
  let base = slugifyOrg(name);
  if (!base) base = 'salao';

  // Limita tamanho para não estourar (nomes muito longos viram slug feio).
  base = base.slice(0, 48).replace(/-+$/g, '') || 'salao';

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data } = await admin
      .from('organizations')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (!data) return candidate;
  }

  // Último recurso: sufixo aleatório (colisão praticamente impossível).
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
}

export function extractOfferSlug(raw: any, fallback?: string | null): string | null {
  if (fallback) return fallback;
  // Cakto envia em camelCase (`checkoutUrl`); aceitar ambos.
  const candidates: Array<string | undefined> = [
    raw?.checkoutUrl,
    raw?.checkout_url,
    raw?.data?.order?.checkoutUrl,
    raw?.data?.order?.checkout_url,
    raw?.order?.checkoutUrl,
    raw?.order?.checkout_url,
    raw?.data?.checkoutUrl,
    raw?.data?.checkout_url,
  ];
  const url = candidates.find((u) => typeof u === 'string' && u.length > 0);
  if (!url) return null;
  const m = url.match(/\/([^/?#]+)(?:[?#].*)?$/);
  return m ? m[1] : null;
}

interface ProvisionResult {
  ok: boolean;
  organization_id?: string;
  plan_id?: string;
  user_id?: string;
  /** true só quando a organization foi CRIADA nesta invocação — gate de
   *  idempotência do welcome (retry/renovação/reprocesso não reenviam). */
  org_created?: boolean;
  skipped?: string;
  errors?: string[];
}

/**
 * Resolve um plano pelo cakto_offer_slug (preferencial) ou cakto_product_id (fallback).
 */
async function resolvePlatformPlan(
  admin: SupabaseClient,
  offerSlug: string | null,
  productCaktoId: string | null,
) {
  if (offerSlug) {
    const { data } = await admin
      .from('platform_plans')
      .select('id, name, slug, price_monthly, cakto_offer_slug, cakto_product_id')
      .eq('cakto_offer_slug', offerSlug)
      .maybeSingle();
    if (data) return data;
  }
  if (productCaktoId) {
    const { data } = await admin
      .from('platform_plans')
      .select('id, name, slug, price_monthly, cakto_offer_slug, cakto_product_id')
      .eq('cakto_product_id', productCaktoId)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

/**
 * Provisiona o plano da plataforma para o e-mail do comprador.
 * - Cria/encontra a organization pelo cakto_customer_email.
 * - Grava plan_id, plan_status='active', plan_activated_at, cakto_subscription_id.
 * - Insere billing_history idempotente via metadata.cakto_id.
 */
export async function provisionPlatformPlan(
  admin: SupabaseClient,
  order: CaktoOrderLike,
): Promise<ProvisionResult> {
  const errors: string[] = [];
  const email = (order.customer_email || '').trim().toLowerCase();
  if (!email) return { ok: false, skipped: 'missing customer_email' };

  // Só provisiona quando o pedido está aprovado/pago
  const status = (order.status || '').toLowerCase();
  if (status !== 'paid' && status !== 'approved') {
    return { ok: false, skipped: `status=${status}` };
  }

  const offerSlug = extractOfferSlug(order.raw_payload, order.cakto_offer_slug ?? null);
  const plan = await resolvePlatformPlan(admin, offerSlug, order.product_cakto_id ?? null);
  if (!plan) {
    return {
      ok: false,
      skipped: `plan not found (offer=${offerSlug ?? '-'}, product=${order.product_cakto_id ?? '-'})`,
    };
  }

  // 1) Localiza/cria a organization
  let orgId: string | null = null;
  let orgCreated = false;
  const orgName = order.customer_name || email;
  const { data: existingOrg } = await admin
    .from('organizations')
    .select('id, slug')
    .eq('cakto_customer_email', email)
    .maybeSingle();

  if (existingOrg) {
    orgId = existingOrg.id;
    // Backfill defensivo: org pré-existente sem slug tornaria /s/<slug> um 404.
    if (!existingOrg.slug) {
      const slug = await generateUniqueOrgSlug(admin, orgName);
      const { error: slugErr } = await admin
        .from('organizations')
        .update({ slug })
        .eq('id', orgId);
      if (slugErr) errors.push(`slug backfill: ${slugErr.message}`);
    }
  } else {
    // Org nasce COM slug único — sem slug a página pública /s/<slug> dá 404.
    const slug = await generateUniqueOrgSlug(admin, orgName);
    const { data: created, error: createErr } = await admin
      .from('organizations')
      .insert({
        name: orgName,
        email,
        cakto_customer_email: email,
        status: 'active',
        slug,
      })
      .select('id')
      .single();
    if (createErr || !created) {
      errors.push(`org create: ${createErr?.message ?? 'unknown'}`);
      return { ok: false, errors };
    }
    orgId = created.id;
    orgCreated = true;

    // F2.4 — trava fundadora: org nascida de VENDA durante a campanha 30/30/1
    // é carimbada is_founder (se ainda há vaga) ou not_founder. A view
    // founder_campaign_status DERIVA slots_left da contagem de is_founder —
    // este write é o que faz o contador andar. Non-fatal por construção.
    try {
      const { data: camp } = await admin
        .from('founder_campaign_status')
        .select('slots_left, campanha_encerrada')
        .limit(1)
        .maybeSingle();
      const isFounder = !!camp && !camp.campanha_encerrada && Number(camp.slots_left) > 0;
      const { error: fsErr } = await admin
        .from('organizations')
        .update({ founder_status: isFounder ? 'is_founder' : 'not_founder' })
        .eq('id', orgId);
      if (fsErr) errors.push(`founder_status: ${fsErr.message}`);
    } catch (e) {
      console.warn('[cakto-provisioning] founder_status (non-fatal):', e);
    }
  }

  // 2) Ativa plano
  const { error: planErr } = await admin
    .from('organizations')
    .update({
      plan_id: plan.id,
      plan_status: 'active',
      plan_activated_at: new Date().toISOString(),
      cakto_subscription_id: order.cakto_ref_id ?? order.cakto_id ?? null,
      // Módulos do NexvyBeauty são FIXOS — o provisioning é a fonte de verdade.
      // Espelha PRODUCT_MODULES de src/config/modules.ts (não importável aqui: Deno).
      enabled_modules: ['erp_salao', 'crm_vendas', 'atendimento'],
    })
    .eq('id', orgId);
  if (planErr) errors.push(`plan update: ${planErr.message}`);

  // 3) Registra billing_history idempotente
  const caktoId = order.cakto_id ?? order.cakto_ref_id ?? null;
  if (caktoId) {
    const { data: existingBill } = await admin
      .from('billing_history')
      .select('id')
      .eq('organization_id', orgId)
      .filter('metadata->>cakto_id', 'eq', caktoId)
      .maybeSingle();

    if (!existingBill) {
      const { error: billErr } = await admin.from('billing_history').insert({
        organization_id: orgId,
        amount: order.amount ?? plan.price_monthly ?? 0,
        status: 'paid',
        description: `Plano ${plan.name} — Cakto`,
        payment_date: new Date().toISOString(),
        metadata: {
          cakto_id: caktoId,
          cakto_offer_slug: offerSlug,
          source: 'cakto',
        } as any,
      });
      if (billErr) errors.push(`billing: ${billErr.message}`);
    }
  }

  return { ok: errors.length === 0, organization_id: orgId ?? undefined, plan_id: plan.id, org_created: orgCreated, errors };
}

function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const base = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  // garante variedade de classes
  return `Vd!${base.slice(0, 28)}A1`;
}

interface EnsureAdminArgs {
  email: string;
  fullName?: string | null;
  organizationId: string;
  planName?: string | null;
  phone?: string | null;
}

/**
 * Garante usuário admin para a organização e dispara e-mail de boas-vindas idempotente.
 */
export async function ensureAdminUser(
  admin: SupabaseClient,
  args: EnsureAdminArgs,
): Promise<{ ok: boolean; user_id?: string; errors?: string[] }> {
  const errors: string[] = [];
  const email = args.email.trim().toLowerCase();
  if (!email) return { ok: false, errors: ['missing email'] };

  // 1) Tenta achar usuário existente
  let userId: string | null = null;
  const { data: foundId, error: rpcErr } = await admin.rpc('get_auth_user_id_by_email', {
    _email: email,
  });
  if (rpcErr) errors.push(`rpc: ${rpcErr.message}`);
  if (typeof foundId === 'string') userId = foundId;

  // 2) Cria se necessário
  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { full_name: args.fullName ?? undefined },
    });
    if (createErr || !created?.user?.id) {
      errors.push(`createUser: ${createErr?.message ?? 'unknown'}`);
      return { ok: false, errors };
    }
    userId = created.user.id;
  }

  // 3) Upsert profile
  const { error: profileErr } = await admin.from('profiles').upsert(
    {
      id: userId,
      email,
      full_name: args.fullName ?? null,
      organization_id: args.organizationId,
      recovery_whatsapp: args.phone ?? null,
      is_active: true,
    } as any,
    { onConflict: 'id' },
  );
  if (profileErr) errors.push(`profile: ${profileErr.message}`);

  // 4) Garante role admin
  const { data: existingRole } = await admin
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (!existingRole) {
    const { error: roleErr } = await admin
      .from('user_roles')
      .insert({ user_id: userId, role: 'admin' } as any);
    if (roleErr) errors.push(`role: ${roleErr.message}`);
  }

  // 5) Gera link de recuperação + dispara e-mail (idempotente)
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { data: linkData } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
    });
    const recoveryLink =
      (linkData as any)?.properties?.action_link ||
      (linkData as any)?.action_link ||
      null;

    await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        templateName: 'welcome-admin-access',
        recipientEmail: email,
        idempotencyKey: `welcome-admin-${userId}`,
        templateData: {
          fullName: args.fullName ?? null,
          planName: args.planName ?? null,
          recoveryLink,
          email,
        },
      }),
    });
  } catch (e: any) {
    errors.push(`email: ${e?.message ?? String(e)}`);
  }

  return { ok: errors.length === 0, user_id: userId, errors };
}

/**
 * Envia mensagem de boas-vindas ao comprador via WhatsApp Cloud API.
 * Non-fatal por design: nunca lança nem derruba o provisionamento.
 * Usa a conexão Meta ATIVA da plataforma (mesmo padrão de platform-webchat-inbox:
 * connection status='active' + decryptSecret + GRAPH_BASE).
 * Se o payload Cakto não trouxer telefone, apenas loga TODO e retorna.
 */
async function sendWelcomeWhatsApp(
  admin: SupabaseClient,
  args: { phone?: string | null; fullName?: string | null; planName?: string | null },
): Promise<{ ok: boolean; skipped?: string }> {
  const to = normalizePhoneBR(args.phone);
  if (!to) {
    // TODO: Cakto não enviou telefone do comprador — sem destino não há boas-vindas WhatsApp.
    console.log('[cakto-provisioning] welcome WhatsApp pulado: TODO telefone do comprador ausente no payload Cakto');
    return { ok: false, skipped: 'no_phone' };
  }

  try {
    const { data: conn } = await admin
      .from('platform_crm_whatsapp_meta_connections')
      .select('id, phone_number_id, access_token_encrypted')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conn?.access_token_encrypted || !conn?.phone_number_id) {
      return { ok: false, skipped: 'no_active_connection' };
    }

    const token = await decryptSecret(conn.access_token_encrypted as string);
    const firstName = (args.fullName || '').trim().split(/\s+/)[0] || '';
    const saudacao = firstName ? `Olá, ${firstName}!` : 'Olá!';
    const planoTxt = args.planName ? ` do plano ${args.planName}` : '';
    const body =
      `${saudacao} 🎉 Sua conta NexvyBeauty${planoTxt} foi ativada com sucesso. ` +
      `Enviamos ao seu e-mail o link para definir a senha e acessar o painel. ` +
      `Qualquer dúvida, é só responder por aqui.`;

    const payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body } };
    const res = await fetch(`${GRAPH_BASE}/${conn.phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data?.error?.message ?? `graph ${res.status}`;
      console.warn('[cakto-provisioning] welcome WhatsApp falhou:', String(msg).slice(0, 200));
      return { ok: false, skipped: 'send_failed' };
    }
    return { ok: true };
  } catch (e: any) {
    console.warn('[cakto-provisioning] welcome WhatsApp exception:', e?.message ?? String(e));
    return { ok: false, skipped: 'exception' };
  }
}

/**
 * Roda o pipeline completo (plano + admin user).
 */
export async function provisionFromOrder(
  admin: SupabaseClient,
  order: CaktoOrderLike,
): Promise<ProvisionResult & { user_id?: string }> {
  const planRes = await provisionPlatformPlan(admin, order);
  if (!planRes.ok || !planRes.organization_id) return planRes;

  const offerSlug = extractOfferSlug(order.raw_payload, order.cakto_offer_slug ?? null);
  const plan = await resolvePlatformPlan(admin, offerSlug, order.product_cakto_id ?? null);

  const userRes = await ensureAdminUser(admin, {
    email: order.customer_email!,
    fullName: order.customer_name ?? null,
    phone: order.customer_phone ?? null,
    organizationId: planRes.organization_id,
    planName: plan?.name ?? null,
  });

  // Boas-vindas WhatsApp ao comprador — non-fatal, e SÓ na primeira ativação
  // (org recém-criada). Retry de webhook, renovação mensal e reprocesso manual
  // reexecutam provisionFromOrder e NÃO podem duplicar o welcome (idempotência).
  if (planRes.org_created) {
    await sendWelcomeWhatsApp(admin, {
      phone: order.customer_phone ?? null,
      fullName: order.customer_name ?? null,
      planName: plan?.name ?? null,
    });
  }

  return {
    ...planRes,
    user_id: userRes.user_id,
    ok: planRes.ok && userRes.ok,
    errors: [...(planRes.errors ?? []), ...(userRes.errors ?? [])],
  };
}

export function buildAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
