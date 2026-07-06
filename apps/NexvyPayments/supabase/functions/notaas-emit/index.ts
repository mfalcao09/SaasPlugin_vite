// notaas-emit — EMISSÃO de NFS-e das faturas via NotaAS (trilho fiscal) — C1.
//
// Peça de saída (outbound) do fluxo fiscal do módulo de COBRANÇA (NexvyPayments).
// Contrapartida do notaas-webhook (C2, inbound): esta função EMITE a NFS-e das
// faturas aprovadas via `POST /api/v1/emitir/batch` (assíncrono, 202 + batchId);
// o NotaAS processa e devolve o resultado por webhook (o C2 marca 'emitida' +
// absorve PDF/XML).
//
// CONTRATO (spec §3.2 C1):
//   * Emite em lote (≤100/lote; >100 => múltiplos POST — chunkItems).
//   * `referencia` = invoice (idempotência). NUNCA reenvia sem consultar status
//     por `referencia` primeiro (GET /invoices/:id/status por referencia). Toda a
//     lógica vive no núcleo puro `_shared/notaas-emit-core.ts` (emitInvoices).
//   * Grava a intenção no billing_outbox ANTES do POST (RPC billing_outbox_enqueue).
//   * Grava notaas_batch_id por fatura + marca status='emitindo' (webhook leva a
//     'emitida'). Propaga iss_retido/retencoes/código de serviço no payload
//     (montagem em `_shared/notaas-emit-payload.ts`).
//   * Key NotaAS lida do COFRE billing_credentials (provider='notaas',
//     decryptBillingSecret) — NUNCA do front/repo. Header `x-api-key` (report §26).
//
// AUTH (função de DINHEIRO => verify_jwt=true, default do gateway; NÃO há entrada
// em config.toml, que só lista webhooks públicos verify_jwt=false):
//   * requireCallerOrg resolve o org REAL do caller (nunca do body) e rejeita
//     cross-org (403) — anti-IDOR. Cron server-to-server usa a service_role key.
//
// MOLDE: billing-baixa-manual/index.ts (getServiceClient + requireCallerOrg +
// CORS/json), notaas-webhook/index.ts (leitura do cofre billing_credentials
// provider 'notaas' + decryptBillingSecret + service client). NÃO toca o core.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  requireCallerOrg,
  requireCallerOrgCorsHeaders,
} from '../_shared/require-caller-org.ts';
import { decryptBillingSecret } from '../_shared/billing-crypto.ts';
import {
  type EmitDeps,
  emitInvoices,
  type EmitTriple,
  type NotaasStatus,
} from '../_shared/notaas-emit-core.ts';
import type { NotaasEmitItem } from '../_shared/notaas-emit-payload.ts';

const DEFAULT_BASE_URL = 'https://platform.notaas.com.br/api/v1';

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...requireCallerOrgCorsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Lê a credencial NotaAS ativa do cofre (billing_credentials, provider='notaas').
 * Devolve a apiKey em claro (decifrada) + base URL (metadata.base_url ou default).
 * NUNCA loga a key. Retorna null se não houver credencial ativa.
 */
async function loadNotaasCredential(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
): Promise<{ apiKey: string; baseUrl: string } | null> {
  const { data: cred } = await supabase
    .from('billing_credentials')
    .select('cred_cifrada, metadata, status')
    .eq('organization_id', organizationId)
    .eq('provider', 'notaas')
    .eq('status', 'ativo')
    .limit(1)
    .maybeSingle();
  if (!cred?.cred_cifrada) return null;
  const apiKey = await decryptBillingSecret(cred.cred_cifrada as string);
  const meta = (cred.metadata ?? {}) as Record<string, unknown>;
  const baseUrl = typeof meta['base_url'] === 'string' && meta['base_url']
    ? String(meta['base_url']).replace(/\/+$/, '')
    : DEFAULT_BASE_URL;
  return { apiKey, baseUrl };
}

/**
 * Carrega as faturas emissíveis (status 'aprovada') da org + o tomador (payer) e o
 * contrato de cada uma, montando os EmitTriple. Org-scoped (anti-IDOR). Aceita uma
 * lista explícita de invoice_ids; se ausente, pega todas as 'aprovada' da org.
 */
async function loadTriples(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  invoiceIds?: string[],
): Promise<EmitTriple[]> {
  let q = supabase
    .from('invoices')
    .select(
      'id, organization_id, competencia, referencia, valor_total, valor_original, iss_retido, retencoes, metadata, payer_id, contract_id, status, nfse_status',
    )
    .eq('organization_id', organizationId);

  if (invoiceIds && invoiceIds.length > 0) {
    q = q.in('id', invoiceIds);
  } else {
    // Elegíveis por padrão: aprovadas (o gate de "sem nota" fica no núcleo, que
    // consulta status por referencia antes de emitir).
    q = q.eq('status', 'aprovada');
  }

  const { data: invoices, error } = await q;
  if (error) throw new Error(`falha ao carregar faturas: ${error.message}`);
  if (!invoices || invoices.length === 0) return [];

  const payerIds = [...new Set(invoices.map((i: any) => i.payer_id).filter(Boolean))];
  const contractIds = [...new Set(invoices.map((i: any) => i.contract_id).filter(Boolean))];

  const [{ data: payers }, { data: contracts }] = await Promise.all([
    supabase
      .from('payers')
      .select('id, nome, tipo_documento, documento, email, whatsapp, endereco')
      .eq('organization_id', organizationId)
      .in('id', payerIds.length ? payerIds : ['__none__']),
    supabase
      .from('contracts')
      .select('id, descricao, codigo_servico_nfse, aliquota_iss')
      .eq('organization_id', organizationId)
      .in('id', contractIds.length ? contractIds : ['__none__']),
  ]);

  const payerById = new Map((payers ?? []).map((p: any) => [p.id, p]));
  const contractById = new Map((contracts ?? []).map((c: any) => [c.id, c]));

  const triples: EmitTriple[] = [];
  for (const inv of invoices) {
    const payer = payerById.get((inv as any).payer_id);
    const contract = contractById.get((inv as any).contract_id);
    if (!payer || !contract) continue; // sem tomador/contrato não há como emitir
    triples.push({ invoice: inv as any, payer: payer as any, contract: contract as any });
  }
  return triples;
}

/** Constrói as EmitDeps reais (fetch NotaAS + service client). */
function makeEmitDeps(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  apiKey: string,
  baseUrl: string,
): EmitDeps {
  const headers = { 'x-api-key': apiKey, 'Content-Type': 'application/json' };

  return {
    // GET status por referencia. O report não documenta lookup direto por
    // referencia via GET; usamos o NOSSO lado como fonte-de-verdade do vínculo:
    // se a fatura JÁ tem notaas_invoice_id/batch/nfse_status emitida, a nota
    // existe (não reenviar). Havendo notaas_invoice_id, confirmamos no NotaAS.
    async getStatusByReferencia(referencia: string): Promise<NotaasStatus> {
      const { data: inv } = await supabase
        .from('invoices')
        .select('id, notaas_invoice_id, notaas_batch_id, nfse_status')
        .eq('organization_id', organizationId)
        .eq('referencia', referencia)
        .limit(1)
        .maybeSingle();
      if (!inv) return { found: false };
      const anyInv = inv as any;
      // Já emitida/em emissão do nosso lado: nota existe -> não reenviar.
      if (anyInv.notaas_invoice_id) {
        // Confirma no NotaAS (best-effort). Falha de rede não muda o veredito
        // "existe" (temos o id gravado); só enriquece o status.
        let status: string | undefined;
        try {
          const r = await fetch(`${baseUrl}/invoices/${anyInv.notaas_invoice_id}/status`, { headers });
          if (r.ok) status = String((await r.json())?.status ?? '');
        } catch (_) { /* mantém found=true pelo id local */ }
        return {
          found: true,
          invoiceId: anyInv.notaas_invoice_id,
          batchId: anyInv.notaas_batch_id ?? undefined,
          status,
        };
      }
      // Tem batchId (ou nfse já emitida) mas ainda sem invoice_id: a nota já foi
      // submetida -> não reenviar; o webhook C2 completará o vínculo.
      if (anyInv.notaas_batch_id || anyInv.nfse_status === 'emitida') {
        return {
          found: true,
          batchId: anyInv.notaas_batch_id ?? undefined,
          status: anyInv.nfse_status ?? 'processing',
        };
      }
      return { found: false };
    },

    async postBatch(items: NotaasEmitItem[]) {
      try {
        const r = await fetch(`${baseUrl}/emitir/batch`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ items }),
        });
        const txt = await r.text();
        let respBody: any = {};
        try { respBody = txt ? JSON.parse(txt) : {}; } catch (_) { /* body não-JSON */ }
        if (!r.ok) {
          return { ok: false, status: r.status, error: respBody?.error ?? respBody?.message ?? txt.slice(0, 300) };
        }
        return { ok: true, status: r.status, batchId: respBody?.batchId ?? respBody?.batch_id };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },

    async enqueueOutbox(referencia: string, invoiceId: string, extra?: Record<string, unknown>) {
      const { error } = await supabase.rpc('billing_outbox_enqueue', {
        payload: {
          organization_id: organizationId,
          invoice_id: invoiceId,
          referencia,
          provider: 'notaas',
          ...(extra ?? {}),
        },
      });
      if (error) throw new Error(error.message);
    },

    async markEmitting(invoiceId: string) {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'emitindo', nfse_status: 'pendente', updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .eq('id', invoiceId);
      if (error) throw new Error(error.message);
    },

    async recordBatchId(invoiceId: string, batchId: string, notaasInvoiceId?: string) {
      const patch: Record<string, unknown> = { notaas_batch_id: batchId, updated_at: new Date().toISOString() };
      if (notaasInvoiceId) patch.notaas_invoice_id = notaasInvoiceId;
      const { error } = await supabase
        .from('invoices')
        .update(patch)
        .eq('organization_id', organizationId)
        .eq('id', invoiceId);
      if (error) throw new Error(error.message);
    },

    async reconcileExisting(invoiceId: string, st: NotaasStatus) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (st.invoiceId) patch.notaas_invoice_id = st.invoiceId;
      if (st.batchId) patch.notaas_batch_id = st.batchId;
      if (Object.keys(patch).length === 1) return; // nada novo a gravar
      await supabase
        .from('invoices')
        .update(patch)
        .eq('organization_id', organizationId)
        .eq('id', invoiceId);
    },

    logError(msg, err) {
      console.error(msg, err instanceof Error ? err.message : err);
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: requireCallerOrgCorsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const supabase = getServiceClient();

  // Auth + anti-IDOR: org REAL pelo perfil do caller (nunca do body). Cron usa
  // a service_role key (atua em nome de actorUserId/created_by).
  const { organizationId, errorResponse } = await requireCallerOrg(req, supabase, {
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    body,
  });
  if (errorResponse) return errorResponse;
  if (!organizationId) return json({ error: 'Sem organização' }, 403);

  // Key NotaAS do COFRE (nunca do front/repo).
  let cred: { apiKey: string; baseUrl: string } | null;
  try {
    cred = await loadNotaasCredential(supabase, organizationId);
  } catch (e) {
    console.error('[notaas-emit] falha ao ler credencial do cofre:', e instanceof Error ? e.message : e);
    return json({ error: 'Falha ao ler credencial NotaAS' }, 500);
  }
  if (!cred) {
    return json({ error: 'Credencial NotaAS não configurada para esta organização' }, 412);
  }

  const invoiceIds: string[] | undefined = Array.isArray(body?.invoice_ids)
    ? body.invoice_ids.filter((x: unknown) => typeof x === 'string')
    : undefined;

  let triples: EmitTriple[];
  try {
    triples = await loadTriples(supabase, organizationId, invoiceIds);
  } catch (e) {
    console.error('[notaas-emit] loadTriples falhou:', e instanceof Error ? e.message : e);
    return json({ error: 'Falha ao carregar faturas' }, 500);
  }

  if (triples.length === 0) {
    return json({ success: true, total: 0, emitted: 0, message: 'Nenhuma fatura elegível para emissão.' });
  }

  const deps = makeEmitDeps(supabase, organizationId, cred.apiKey, cred.baseUrl);
  const result = await emitInvoices(deps, triples);

  return json({ success: true, ...result });
});
