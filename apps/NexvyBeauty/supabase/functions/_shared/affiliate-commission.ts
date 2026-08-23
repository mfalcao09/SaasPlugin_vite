// Atribuição de comissão de afiliado — camada PRÓPRIA, provider-agnóstica.
//
// A fonte de verdade do afiliado é `sales_leads.affiliate_id`, gravado na CAPTURA
// (antes do checkout) por `capture-lead`, que resolve `?ref=` via `resolve_affiliate_ref`.
// Aqui, no evento de venda PAGA, casamos o comprador pelo e-mail → lead → afiliado e
// criamos a comissão de forma IDEMPOTENTE. Funciona com qualquer provedor de pagamento
// (Cakto hoje, PSP próprio depois) — o meio de pagamento é só um adaptador.

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// --- Política antifraude (Fase 3) -------------------------------------------
const VELOCITY_WINDOW_MS = 10 * 60 * 1000; // janela de 10 min p/ checagens de velocidade
const VELOCITY_MAX_SAME_BUYER = 1;         // mesmo comprador+afiliado na janela -> bloqueia (skip)
const VELOCITY_MAX_AFFILIATE = 20;         // > N vendas do mesmo afiliado na janela -> flag (não bloqueia)

export interface AttributeArgs {
  customerEmail: string | null | undefined;
  /** Chave de idempotência: id do pedido (first_sale) ou do ciclo de cobrança (recurring). */
  orderRef: string;
  /** Valor BRUTO da venda em BRL (reais). */
  amountReais: number | null | undefined;
  organizationId?: string | null;
  kind?: 'first_sale' | 'recurring';
  // --- NOVOS (Fase 3) — todos opcionais (retrocompatível) ---
  /** CPF/CNPJ do comprador; será normalizado p/ dígitos. */
  buyerDocument?: string | null;
  /** IP da venda/captura, quando disponível. */
  buyerIp?: string | null;
}

export interface AttributeResult {
  created: boolean;
  skipped?: string;
  commissionId?: string;
  affiliateId?: string;
  /** NOVO (Fase 3): criada porém marcada p/ revisão humana (review_status='flagged'). */
  flagged?: boolean;
}

/** Linha mínima de comissão usada nas checagens de velocidade (Fase 3). */
interface CommissionRow {
  affiliate_id?: string | null;
  buyer_document?: string | null;
  buyer_ip?: string | null;
  created_at?: string | null;
  metadata?: { customer_email?: string | null } | null;
}

/** Normaliza CPF/CNPJ para apenas dígitos. */
function normalizeDocument(doc: string | null | undefined): string {
  return (doc ?? '').replace(/\D+/g, '');
}

/**
 * Cria a comissão de afiliado para uma venda paga, se houver afiliado atribuído ao lead.
 * Nunca lança por "não atribuído" — só lança em erro inesperado de banco (deixa o caller logar).
 * O caller DEVE chamar dentro de try/catch para não impactar o fluxo de provisionamento.
 */
export async function attributeAffiliateCommission(
  admin: SupabaseClient,
  args: AttributeArgs,
): Promise<AttributeResult> {
  const email = (args.customerEmail ?? '').trim().toLowerCase();
  const orderRef = (args.orderRef ?? '').trim();
  const kind = args.kind ?? 'first_sale';
  const doc = normalizeDocument(args.buyerDocument);
  const ip = (args.buyerIp ?? '').trim();

  if (!orderRef) return { created: false, skipped: 'missing order_ref' };
  if (!email) return { created: false, skipped: 'missing customer_email' };

  // 1) Casa o comprador com o lead que tenha afiliado atribuído (último-clique).
  const { data: lead } = await admin
    .from('sales_leads')
    .select('id, affiliate_id')
    .eq('email', email)
    .not('affiliate_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lead?.affiliate_id) return { created: false, skipped: 'no affiliate lead for email' };

  // 2) Carrega o afiliado (status + % + e-mail para o guard de auto-compra).
  const { data: affiliate } = await admin
    .from('affiliates')
    .select('id, email, status, commission_pct')
    .eq('id', lead.affiliate_id)
    .maybeSingle();

  if (!affiliate) return { created: false, skipped: 'affiliate not found' };
  if (affiliate.status !== 'active') return { created: false, skipped: `affiliate ${affiliate.status}`, affiliateId: affiliate.id };

  // 3) Antifraude de auto-compra (afiliado comprando da própria indicação).
  if ((affiliate.email ?? '').trim().toLowerCase() === email) {
    return { created: false, skipped: 'self-purchase blocked', affiliateId: affiliate.id };
  }

  // --- Antifraude de velocidade / IP compartilhado (Fase 3) ------------------
  // Janela recente de comissões; a partir dela derivamos todos os sinais.
  const windowStartIso = new Date(Date.now() - VELOCITY_WINDOW_MS).toISOString();
  const { data: recentRaw } = await admin
    .from('affiliate_commissions')
    .select('affiliate_id, buyer_document, buyer_ip, created_at, metadata')
    .gte('created_at', windowStartIso);
  const recent: CommissionRow[] = Array.isArray(recentRaw) ? (recentRaw as CommissionRow[]) : [];

  const fraudReasons: string[] = [];
  let flagged = false;

  // 3c) Velocidade — mesmo comprador + mesmo afiliado na janela: BLOQUEIA (skip).
  //     "Mesmo comprador" = mesmo buyer_document (quando disponível) OU mesmo e-mail (metadata).
  const sameBuyerSameAffiliate = recent.filter((c) => {
    if (c.affiliate_id !== affiliate.id) return false;
    const cDoc = normalizeDocument(c.buyer_document);
    const docMatch = doc.length > 0 && cDoc.length > 0 && cDoc === doc;
    const emailMatch = (c.metadata?.customer_email ?? '').trim().toLowerCase() === email;
    return docMatch || emailMatch;
  }).length;
  if (sameBuyerSameAffiliate >= VELOCITY_MAX_SAME_BUYER) {
    return { created: false, skipped: 'velocity: repeat buyer in window', affiliateId: affiliate.id };
  }

  // 3d) Velocidade — volume do afiliado na janela: NÃO bloqueia, marca flag.
  const affiliateVolume = recent.filter((c) => c.affiliate_id === affiliate.id).length;
  if (affiliateVolume > VELOCITY_MAX_AFFILIATE) {
    flagged = true;
    fraudReasons.push(`affiliate_velocity:${affiliateVolume}_in_${VELOCITY_WINDOW_MS / 60000}min`);
  }

  // 3e) IP compartilhado entre AFILIADOS DIFERENTES na janela: NÃO bloqueia, marca flag.
  if (ip) {
    const ipCrossAffiliate = recent.some((c) => c.buyer_ip === ip && c.affiliate_id !== affiliate.id);
    if (ipCrossAffiliate) {
      flagged = true;
      fraudReasons.push('ip_shared_cross_affiliate');
    }
  }

  // 4) Calcula a comissão: amount(reais) × pct(%) = comissão em centavos.
  const amount = Number(args.amountReais);
  const pct = Number(affiliate.commission_pct);
  if (!Number.isFinite(amount) || amount <= 0) return { created: false, skipped: 'no amount', affiliateId: affiliate.id };
  if (!Number.isFinite(pct) || pct <= 0) return { created: false, skipped: 'commission_pct=0', affiliateId: affiliate.id };
  const amountCents = Math.round(amount * pct);

  // 5) Cria a comissão (idempotente por idempotency_key = orderRef; unique index no banco).
  //    Comissão `flagged` permanece status:'pending' + review_status:'flagged' (não cria status novo).
  const { data: inserted, error } = await admin
    .from('affiliate_commissions')
    .insert({
      affiliate_id: affiliate.id,
      lead_id: lead.id,
      order_ref: orderRef,
      organization_id: args.organizationId ?? null,
      amount_cents: amountCents,
      pct_applied: pct,
      currency: 'BRL',
      status: 'pending',
      idempotency_key: orderRef,
      buyer_document: doc || null,
      buyer_ip: ip || null,
      review_status: flagged ? 'flagged' : 'clear',
      metadata: { kind, customer_email: email, ...(flagged ? { fraud: fraudReasons } : {}) },
    })
    .select('id')
    .single();

  if (error) {
    // 23505 = unique_violation → reentrega do webhook; comissão já existe (idempotente).
    if ((error as { code?: string }).code === '23505') {
      return { created: false, skipped: 'duplicate (idempotent)', affiliateId: affiliate.id };
    }
    throw error;
  }

  return { created: true, commissionId: inserted?.id, affiliateId: affiliate.id, flagged };
}
