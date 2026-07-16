// Helper compartilhado entre `cakto-webhook` e `cakto-reprocess-order`.
// Provisiona o plano da plataforma e o usuário admin a partir de um pedido Cakto.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { GRAPH_BASE } from './meta-graph.ts';
import { decryptSecret } from './meta-crypto.ts';
import { normalizePhoneBR } from './phone.ts';
import { handoffConversationToOnboarding } from './onboarding-handoff.ts';
import { sendTelegramAlert } from './platform-alerts.ts';

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
  coupon_code?: string | null;
  raw_payload?: any;
}

/** Tolerância (em reais) para arredondamento antes de considerar um pedido defasado. */
export const PRICE_TOLERANCE_REAIS = 0.5;

/**
 * Decisão PURA (sem I/O): o valor pago está ABAIXO do preço atual do plano além
 * da tolerância? Rede cinto-e-suspensório contra link de oferta ANTIGA ainda
 * vendendo por preço defasado. amount nulo/NaN → false (não dá pra afirmar);
 * preço atual inválido/≤0 → false. amount/currentPrice na MESMA unidade (reais).
 */
export function isUnderpaid(
  paidAmount: number | null | undefined,
  currentPrice: number | null | undefined,
  tolerance: number = PRICE_TOLERANCE_REAIS,
): boolean {
  if (paidAmount == null || !Number.isFinite(paidAmount)) return false;
  if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) return false;
  return paidAmount < currentPrice - tolerance;
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
  /** true quando uma org DEMO existente foi PROMOVIDA a paga nesta invocação
   *  (esteira: a org demo vira a paga in-place). Conta como "primeira ativação"
   *  para seeds/welcome/handoff (a org demo nunca foi semeada — D5). */
  promoted?: boolean;
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

  // Rede cinto-e-suspensório: pagou ABAIXO do preço atual (sem cupom) sinaliza
  // link de oferta ANTIGA/defasada ainda vendendo. NUNCA nega quem pagou —
  // provisiona igual — mas alerta o operador (nunca em silêncio). Cupom explica
  // legitimamente o desconto → não alerta. sendTelegramAlert é non-fatal.
  if (!order.coupon_code && isUnderpaid(order.amount, Number(plan.price_monthly))) {
    await sendTelegramAlert(
      `⚠️ Cakto: PREÇO DEFASADO / underpay (possível oferta antiga vendendo)\n` +
        `Comprador: ${email}\nPlano: ${plan.name}\n` +
        `Pago: R$ ${Number(order.amount).toFixed(2)} < atual: R$ ${Number(plan.price_monthly).toFixed(2)}\n` +
        `Oferta: ${offerSlug ?? '-'} · provisionando assim mesmo.`,
    );
  }

  // 1) Localiza/cria a organization
  let orgId: string | null = null;
  let orgCreated = false;
  let promoted = false;
  const orgName = order.customer_name || email;
  let { data: existingOrg } = await admin
    .from('organizations')
    .select('id, slug')
    .eq('cakto_customer_email', email)
    .maybeSingle();

  // Camada 2 (esteira demo): se a Camada 1 não achou (a lead pagou com email
  // diferente do da demo), casa a org DEMO por email OU telefone e promove
  // in-place. Consultas separadas (sem interpolar no .or()) = injection-safe.
  if (!existingOrg) {
    const { data: byEmail } = await admin
      .from('organizations')
      .select('id, slug')
      .eq('plan_status', 'demo')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1);
    let demoOrg = byEmail?.[0] ?? null;
    if (!demoOrg) {
      const phone = normalizePhoneBR(order.customer_phone ?? '');
      if (phone) {
        const { data: byPhone } = await admin
          .from('organizations')
          .select('id, slug')
          .eq('plan_status', 'demo')
          .eq('phone', phone)
          .order('created_at', { ascending: false })
          .limit(1);
        demoOrg = byPhone?.[0] ?? null;
      }
    }
    if (demoOrg) {
      existingOrg = demoOrg;
      promoted = true;
      await admin
        .from('organizations')
        .update({ cakto_customer_email: email })
        .eq('id', demoOrg.id);
    }
  }

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
    // SUNSET (2026-07-14): a trava "fundadora" foi aposentada — não há mais
    // campanha 30/30/1 nem consumidor de founder_status (a view
    // founder_campaign_status saiu do sales-brain/copilot). O carimbo virou
    // cosmético órfão, então foi removido daqui. Ativação de plano, billing,
    // welcome e seeds seguem intactos abaixo.
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
      // Esteira: cancela o TTL da demo (promoção in-place). Cinto-e-suspensório
      // com o guard plan_status='demo' do demo-reaper (que já não pegaria 'active').
      demo_expires_at: null,
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

  return { ok: errors.length === 0, organization_id: orgId ?? undefined, plan_id: plan.id, org_created: orgCreated, promoted, errors };
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
 * B5 — catálogo-template de serviços comuns de salão. Espelha SERVICOS_PADRAO de
 * src/components/onboarding/steps/OficinaServicesStep.tsx (duplicação consciente:
 * aquele é React/browser, este é Deno/edge — sem módulo compartilhável entre os
 * dois runtimes). Manter os dois em sincronia. A dona ajusta nomes/preços depois.
 */
const SALON_SERVICE_TEMPLATE = [
  'Corte',
  'Escova',
  'Coloração',
  'Manicure',
  'Esmaltação em gel',
  'Alongamento de cílios',
  'Design de sobrancelha',
  'Podologia / Spa dos pés',
  'Limpeza de pele',
  'Depilação',
] as const;

/**
 * B6 — as 4 regras que `salon-automation-run` de fato consome (CHECK do schema:
 * aniversario | pacote_vencendo | agendamento_24h | retorno_inativo). Nascem
 * enabled=TRUE (decisão Marcelo P9/CART 2026-07-15 — substitui a de 2026-07-06):
 * o opt-in puro produzia 0% de adoção comprovado (0 regras ligadas em produção),
 * então as 4 receitas nascem LIGADAS por default, com prévia + kill-switch visível
 * na tela de Automações (a dona nunca precisa LIGAR; pode DESLIGAR). Base LGPD:
 * legítimo interesse (Art.7 VII) sobre relacionamento comercial pré-existente.
 * antecedencia_dias segue a semântica de cada tipo.
 */
const SALON_AUTOMATION_SEED: Array<{ tipo: string; antecedencia_dias: number }> = [
  { tipo: 'aniversario', antecedencia_dias: 0 },
  { tipo: 'pacote_vencendo', antecedencia_dias: 3 },
  { tipo: 'agendamento_24h', antecedencia_dias: 1 },
  { tipo: 'retorno_inativo', antecedencia_dias: 45 },
];

/**
 * Faz a org recém-provisionada nascer OPERACIONAL (B5/B6/B7):
 *  - servico_catalogo: catálogo-template (shape provado em OficinaServicesStep).
 *  - salon_automation_rules: as 4 regras cadastradas, DESLIGADAS (upsert
 *    ignore-dup pela UNIQUE(organization_id,tipo) → idempotente por si só).
 *  - opportunity_scan_schedules: agenda do Radar (diária 08h UTC; is_active
 *    default true no schema). Roda a vazio até haver carteira (F6) — por design.
 *
 * Best-effort por design (igual a sendWelcomeWhatsApp): nunca lança nem derruba o
 * provisionamento PAGO, e não contamina o `ok` do resultado — um erro de
 * mobiliamento não pode transformar quem pagou em cliente que não entrou. Só é
 * chamada na PRIMEIRA ativação (org_created), então não duplica em retry/renovação.
 */
async function seedSalonDataForNewOrg(
  admin: SupabaseClient,
  organizationId: string,
): Promise<{ ok: boolean }> {
  let ok = true;

  // B5 — serviços
  try {
    const rows = SALON_SERVICE_TEMPLATE.map((nome) => ({
      organization_id: organizationId,
      nome,
      ativo: true,
    }));
    const { error } = await admin.from('servico_catalogo').insert(rows);
    if (error) {
      ok = false;
      console.warn('[cakto-provisioning] seed servico_catalogo:', error.message);
    }
  } catch (e: any) {
    ok = false;
    console.warn('[cakto-provisioning] seed servico_catalogo exception:', e?.message ?? String(e));
  }

  // B6 — automações (desligadas), idempotente via UNIQUE(organization_id,tipo)
  try {
    const rows = SALON_AUTOMATION_SEED.map((r) => ({
      organization_id: organizationId,
      tipo: r.tipo,
      enabled: true, // P9/CART: ligadas por default (kill-switch na UI de Automações)
      antecedencia_dias: r.antecedencia_dias,
    }));
    const { error } = await admin
      .from('salon_automation_rules')
      .upsert(rows, { onConflict: 'organization_id,tipo', ignoreDuplicates: true });
    if (error) {
      ok = false;
      console.warn('[cakto-provisioning] seed salon_automation_rules:', error.message);
    }
  } catch (e: any) {
    ok = false;
    console.warn('[cakto-provisioning] seed salon_automation_rules exception:', e?.message ?? String(e));
  }

  // B7 — agenda do Radar
  try {
    const { error } = await admin.from('opportunity_scan_schedules').insert({
      organization_id: organizationId,
      name: 'Radar Automático',
      cron_expression: '0 8 * * *',
    });
    if (error) {
      ok = false;
      console.warn('[cakto-provisioning] seed opportunity_scan_schedules:', error.message);
    }
  } catch (e: any) {
    ok = false;
    console.warn('[cakto-provisioning] seed opportunity_scan_schedules exception:', e?.message ?? String(e));
  }

  return { ok };
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

  // SÓ na primeira ativação (org recém-criada OU org demo promovida in-place).
  // Retry de webhook, renovação mensal e reprocesso manual reexecutam
  // provisionFromOrder e NÃO podem duplicar welcome/seeds (idempotência via gate
  // org_created). A org demo NUNCA foi semeada (D5) → promoted também dispara aqui.
  if (planRes.org_created || planRes.promoted) {
    // B5/B6/B7 — org nasce operacional: catálogo de serviços, automações
    // (desligadas) e agenda do Radar. Best-effort, nunca derruba o provisionamento.
    await seedSalonDataForNewOrg(admin, planRes.organization_id);

    // HANDOFF Duda→CS pós-compra (gated por ONBOARDING_HANDOFF_ENABLED, default
    // OFF): a conversa de VENDA da compradora passa pro agente de CS/implantação,
    // ganha o vínculo conversa↔org (provisioned_organization_id) que liga o modo
    // implantação do platform-sales-brain, E a Lia dispara o greeting proativo
    // (P2 · A4). Roda ANTES do welcome genérico DE PROPÓSITO: se a Lia greetou
    // (greeted=true), pulamos o welcome pra não dar boas-vindas EM DOBRO. Com a
    // flag OFF (produção hoje) o handoff é no-op → greeted=false → welcome roda
    // idêntico a antes. Non-fatal por design (nunca lança); try/catch de reforço.
    let greeted = false;
    try {
      const handoff = await handoffConversationToOnboarding(admin, {
        organizationId: planRes.organization_id,
        customerPhone: order.customer_phone ?? null,
        customerEmail: order.customer_email ?? null,
      });
      greeted = handoff.greeted === true;
      console.log('[cakto-provisioning] onboarding handoff:', JSON.stringify(handoff));
    } catch (e) {
      console.warn('[cakto-provisioning] onboarding handoff (non-fatal):', String(e).slice(0, 200));
    }

    // Boas-vindas WhatsApp genérica — SÓ quando a Lia NÃO greetou (flag OFF, ou
    // conversa da compradora não encontrada). Garante que a compradora nunca fica
    // sem nenhuma mensagem pós-compra. Non-fatal.
    if (!greeted) {
      await sendWelcomeWhatsApp(admin, {
        phone: order.customer_phone ?? null,
        fullName: order.customer_name ?? null,
        planName: plan?.name ?? null,
      });
    }
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
