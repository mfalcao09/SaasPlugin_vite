// notaas-webhook — receptor inbound dos webhooks do NotaAS (trilho fiscal NFS-e)
// para o módulo de COBRANÇA (NexvyPayments). Entregável C2.
//
// Peça do fluxo fiscal: o billing-dispatch-worker emite a NFS-e via NotaAS de
// forma ASSÍNCRONA (o NotaAS processa e devolve o resultado por webhook). Este
// receptor é o retorno: marca `invoices.nfse_status='emitida'` quando a nota é
// emitida e absorve os documentos (PDF/XML) quando ficam prontos.
//
// Contratos (spec §3.2 C2):
//   * POST público (config.toml verify_jwt=false). Auth REAL = HMAC-SHA256
//     timing-safe do header `X-Notaas-Signature` sobre o corpo CRU, validado
//     ANTES de qualquer processamento. Inválida ⇒ 401 (nunca processa).
//   * Idempotência por `X-Notaas-Delivery`: ledger notaas_webhook_deliveries com
//     UNIQUE(org, delivery_id). O UPSERT ignoreDuplicates é o dedup atômico —
//     re-entrega do NotaAS não re-executa o efeito.
//   * `nfse.issued`         → invoices.nfse_status='emitida' (+ ids/números).
//   * `nfse.documents_ready`→ absorve pdf/xml urls; pode chegar 2× (partial→
//     complete) e é idempotente (UPDATE por url é naturalmente re-aplicável).
//   * Erro de PROCESSAMENTO loga e devolve 200 (o NotaAS re-entrega em não-200 e
//     retry não conserta bug; o ledger de delivery protege contra duplicação).
//     SÓ falha de AUTENTICAÇÃO devolve 4xx.
//
// Molde: `platform-meta-whatsapp-webhook/index.ts` (webhook público HMAC + dedup
// por id de entrega + service_client + resposta 200-em-erro-de-processamento).
// Cofre: `_shared/billing-crypto.ts` (decrypt do secret do provider 'notaas').
// HMAC puro/testável: `_shared/notaas-webhook-verify.ts`.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptBillingSecret } from '../_shared/billing-crypto.ts';
import { verifyNotaasSignature } from '../_shared/notaas-webhook-verify.ts';

type Json = Record<string, unknown>;

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/** `.../notaas-webhook/{organization_id}` → organization_id (escopa o tenant). */
function orgIdFromPath(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return last && last !== 'notaas-webhook' ? last : null;
}

/** Localiza a fatura-alvo do evento pela ordem: notaas_invoice_id → referencia →
 *  id direto. Sempre escopado por org (nunca cruza tenant). Non-fatal: devolve
 *  null se nenhum identificador casar (o evento é registrado no ledger mesmo assim). */
async function resolveInvoiceId(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  data: Json,
): Promise<string | null> {
  const notaasInvoiceId = (data['invoice_id'] ?? data['notaas_invoice_id']) as string | undefined;
  const referencia = (data['referencia'] ?? data['reference'] ?? data['external_id']) as
    | string
    | undefined;
  const invoiceUuid = (data['nexvy_invoice_id'] ?? data['metadata_invoice_id']) as
    | string
    | undefined;

  // 1) por notaas_invoice_id (o id do lado NotaAS gravado na emissão).
  if (notaasInvoiceId) {
    const { data: row } = await supabase
      .from('invoices')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('notaas_invoice_id', notaasInvoiceId)
      .limit(1)
      .maybeSingle();
    if (row?.id) return row.id as string;
  }
  // 2) por referencia (chave de idempotência de emissão, única por org).
  if (referencia) {
    const { data: row } = await supabase
      .from('invoices')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('referencia', referencia)
      .limit(1)
      .maybeSingle();
    if (row?.id) return row.id as string;
  }
  // 3) por id interno direto (quando o NotaAS ecoa nosso uuid no metadata).
  if (invoiceUuid) {
    const { data: row } = await supabase
      .from('invoices')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', invoiceUuid)
      .limit(1)
      .maybeSingle();
    if (row?.id) return row.id as string;
  }
  return null;
}

/** nfse.issued → nfse_status='emitida' + números/ids do NotaAS. Idempotente:
 *  re-aplicar o mesmo UPDATE é inócuo (mesmos valores). Trilha em billing_events. */
async function handleNfseIssued(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  invoiceId: string,
  data: Json,
): Promise<void> {
  const patch: Json = {
    nfse_status: 'emitida',
    updated_at: new Date().toISOString(),
  };
  if (data['notaas_invoice_id'] ?? data['invoice_id']) {
    patch['notaas_invoice_id'] = String(data['notaas_invoice_id'] ?? data['invoice_id']);
  }
  if (data['ch_nfse'] ?? data['chave']) patch['notaas_ch_nfse'] = String(data['ch_nfse'] ?? data['chave']);
  if (data['numero'] ?? data['nfse_numero']) patch['notaas_numero'] = String(data['numero'] ?? data['nfse_numero']);

  const { error } = await supabase
    .from('invoices')
    .update(patch)
    .eq('organization_id', organizationId)
    .eq('id', invoiceId);
  if (error) {
    console.error('[notaas-webhook] update nfse_status=emitida falhou:', error.message);
    throw error;
  }

  await supabase.from('billing_events').insert({
    organization_id: organizationId,
    invoice_id: invoiceId,
    tipo: 'nfse_emitida',
    origem: 'notaas-webhook',
    payload: { notaas: data },
  });
}

/** nfse.documents_ready → absorve pdf/xml urls disponíveis. Pode chegar 2×
 *  (partial: só PDF; complete: PDF+XML). Idempotente e tolerante a chegada
 *  parcial: só grava a url que veio; a 2ª entrega complementa sem quebrar. */
async function handleDocumentsReady(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  invoiceId: string,
  data: Json,
): Promise<void> {
  const patch: Json = { updated_at: new Date().toISOString() };
  const pdf = (data['pdf_url'] ?? data['pdf_nfse_url'] ?? data['danfse_url']) as string | undefined;
  const xml = (data['xml_url'] ?? data['xml_nfse_url']) as string | undefined;
  if (pdf) patch['pdf_nfse_url'] = String(pdf);
  if (xml) patch['xml_nfse_url'] = String(xml);

  // Nada de documento no payload: nada a fazer (entrega parcial vazia é inócua).
  if (!pdf && !xml) return;

  const { error } = await supabase
    .from('invoices')
    .update(patch)
    .eq('organization_id', organizationId)
    .eq('id', invoiceId);
  if (error) {
    console.error('[notaas-webhook] update documentos NFS-e falhou:', error.message);
    throw error;
  }

  await supabase.from('billing_events').insert({
    organization_id: organizationId,
    invoice_id: invoiceId,
    tipo: 'nfse_documentos',
    origem: 'notaas-webhook',
    payload: { pdf: pdf ?? null, xml: xml ?? null },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const url = new URL(req.url);
  const organizationId = orgIdFromPath(url);
  if (!organizationId) return new Response('missing organization id', { status: 404 });

  const supabase = getServiceClient();

  // ── 1. Corpo CRU + header de assinatura ANTES de tudo (não parsear ainda) ──
  const rawBody = await req.text();
  const signature = req.headers.get('x-notaas-signature');
  const deliveryId = req.headers.get('x-notaas-delivery') ?? '';

  // ── 2. Secret do cofre (provider 'notaas' da org) e validação HMAC ─────────
  const { data: cred } = await supabase
    .from('billing_credentials')
    .select('cred_cifrada, status')
    .eq('organization_id', organizationId)
    .eq('provider', 'notaas')
    .eq('status', 'ativo')
    .limit(1)
    .maybeSingle();
  if (!cred?.cred_cifrada) {
    // Sem credencial NotaAS ativa: não há como autenticar → rejeita (não 200).
    console.warn('[notaas-webhook] sem credencial notaas ativa para a org — descartando');
    return new Response('unknown organization credential', { status: 401 });
  }

  let ok = false;
  try {
    const secret = await decryptBillingSecret(cred.cred_cifrada as string);
    ok = await verifyNotaasSignature(secret, rawBody, signature);
  } catch (e) {
    console.error('[notaas-webhook] falha ao validar assinatura:', e);
    return new Response('signature validation error', { status: 401 });
  }
  if (!ok) {
    console.warn('[notaas-webhook] assinatura inválida — descartando');
    return new Response('invalid signature', { status: 401 });
  }

  // ── 3. Dedup por X-Notaas-Delivery (atômico via UNIQUE + ON CONFLICT) ──────
  // O NotaAS re-entrega em não-200; o ledger garante efeito 1×. Sem o header não
  // há como deduplicar de forma confiável — o provedor SEMPRE o envia; sua
  // ausência = requisição malformada (400, ainda no perímetro de autenticação).
  if (!deliveryId) {
    console.warn('[notaas-webhook] X-Notaas-Delivery ausente — descartando');
    return new Response('missing delivery id', { status: 400 });
  }

  // JSON só depois de autenticado. Corpo inválido: 200 (não re-entregar bug).
  let payload: Json;
  try {
    payload = JSON.parse(rawBody) as Json;
  } catch {
    return new Response(JSON.stringify({ ok: true, ignored: 'bad json' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const eventType = String(payload['event'] ?? payload['type'] ?? '');
  const data = (payload['data'] ?? payload) as Json;

  // Resolve a fatura já aqui (para gravar o vínculo no ledger de dedup).
  let invoiceId: string | null = null;
  try {
    invoiceId = await resolveInvoiceId(supabase, organizationId, data);
  } catch (e) {
    console.error('[notaas-webhook] resolveInvoiceId (non-fatal):', e);
  }

  // UPSERT no ledger com ignoreDuplicates. 0 linhas devolvidas ⇒ conflito ⇒ já
  // processado ⇒ 200 sem efeito (dedup atômico, à prova de corrida).
  const { data: ledgerRows, error: ledgerErr } = await supabase
    .from('notaas_webhook_deliveries')
    .upsert(
      {
        organization_id: organizationId,
        delivery_id: deliveryId,
        event_type: eventType || null,
        invoice_id: invoiceId,
      },
      { onConflict: 'organization_id,delivery_id', ignoreDuplicates: true },
    )
    .select('id');
  if (ledgerErr) {
    console.error('[notaas-webhook] ledger insert error:', ledgerErr.message);
    // Falha de infra ao gravar o ledger: NÃO processa (risco de duplicar). Um
    // 503 pede retry do NotaAS (200 esconderia a falha).
    return new Response('ledger unavailable', { status: 503 });
  }
  const isNewDelivery = Array.isArray(ledgerRows) && ledgerRows.length > 0;
  if (!isNewDelivery) {
    // Re-entrega da MESMA delivery: dedup — não re-executa o efeito.
    console.log('[notaas-webhook] delivery repetida (dedup):', deliveryId);
    return new Response(JSON.stringify({ ok: true, deduped: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── 4. Efeito do evento (idempotente por natureza) ─────────────────────────
  try {
    if (!invoiceId) {
      // Evento válido, mas sem fatura correspondente (ex.: emitida por fora).
      // Registrado no ledger; nada a atualizar. Não é erro do NotaAS.
      console.warn('[notaas-webhook] evento sem fatura correspondente:', eventType);
    } else if (eventType === 'nfse.issued') {
      await handleNfseIssued(supabase, organizationId, invoiceId, data);
    } else if (eventType === 'nfse.documents_ready') {
      await handleDocumentsReady(supabase, organizationId, invoiceId, data);
    } else {
      console.log('[notaas-webhook] evento não tratado (ignorado):', eventType);
    }
  } catch (e) {
    // Nunca 5xx por bug de processamento: o NotaAS re-entregaria e o ledger já
    // marcou esta delivery como processada (não re-executaria de qualquer forma).
    console.error('[notaas-webhook] processing error:', e);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
