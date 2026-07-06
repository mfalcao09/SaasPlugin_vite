// billing-baixa-manual — BAIXA MANUAL de fatura (NexvyPayments) — Entregável E1.
//
// Operação de GESTÃO autenticada (não webhook público): o gestor concilia o
// extrato bancário no painel de inadimplência e dá baixa manual numa fatura que
// recebeu por fora do trilho C6 (transferência/dinheiro/PIX manual). Efeito:
//   - invoices.status -> 'paga'  (respeitando o trigger de imutabilidade C3)
//   - billing_events(tipo='paga', origem='manual', payload)  (trilha append-only)
//
// AUTH (defesa em profundidade):
//   * verify_jwt=true no gateway (default — NÃO há entrada em config.toml, que só
//     lista webhooks públicos verify_jwt=false). Todo caller chega autenticado.
//   * requireCallerOrg resolve o org REAL pelo perfil (NUNCA confia no body) e
//     rejeita cross-org (403) — anti-IDOR (molde _shared/require-caller-org.ts).
//
// CAMINHO DE PRODUÇÃO (atômico): chama a RPC `invoice_baixa_manual` (migration
// 20260706104500_baixa_manual.sql) — o UPDATE de status + o INSERT do evento numa
// só transação plpgsql. Se a RPC não existir no ambiente (ex.: deploy parcial),
// cai no fallback PostgREST equivalente `darBaixaManual` (_shared/billing-baixa.ts).
//
// Molde: notaas-webhook/index.ts (getServiceClient, estrutura Deno.serve, service
// client) + require-caller-org (auth/CORS/anti-IDOR). NÃO toca o core do Beauty.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  requireCallerOrg,
  requireCallerOrgCorsHeaders,
} from '../_shared/require-caller-org.ts';
import { darBaixaManual, type MeioPagamentoManual } from '../_shared/billing-baixa.ts';

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

const MEIOS_VALIDOS: ReadonlySet<string> = new Set([
  'pix',
  'transferencia',
  'dinheiro',
  'boleto',
  'cartao',
  'outro',
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...requireCallerOrgCorsHeaders, 'Content-Type': 'application/json' },
  });
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
    return json({ error: 'Corpo JSON inválido' }, 400);
  }

  const supabase = getServiceClient();

  // Auth + anti-IDOR: org REAL pelo perfil do caller (nunca do body).
  const { organizationId, userId, errorResponse } = await requireCallerOrg(req, supabase, {
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    body,
  });
  if (errorResponse) return errorResponse;
  if (!organizationId) return json({ error: 'Sem organização' }, 403);

  const invoiceId = body?.invoice_id;
  if (!invoiceId || typeof invoiceId !== 'string') {
    return json({ error: 'invoice_id obrigatório' }, 400);
  }

  const meio: MeioPagamentoManual = MEIOS_VALIDOS.has(body?.meio)
    ? (body.meio as MeioPagamentoManual)
    : 'outro';
  const valorPago =
    body?.valor_pago != null && Number.isFinite(Number(body.valor_pago))
      ? Number(body.valor_pago)
      : undefined;
  const observacao =
    typeof body?.observacao === 'string' ? body.observacao.slice(0, 1000) : undefined;
  const pagoEm = typeof body?.pago_em === 'string' ? body.pago_em : undefined;

  // 1) Caminho de produção: RPC atômica (update + evento na mesma tx, passa por C3).
  const { data: rpcData, error: rpcErr } = await supabase.rpc('invoice_baixa_manual', {
    p_invoice_id: invoiceId,
    p_valor_pago: valorPago ?? null,
    p_meio: meio,
    p_observacao: observacao ?? null,
    p_pago_em: pagoEm ?? new Date().toISOString(),
  });

  if (!rpcErr && rpcData) {
    const inv = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return json({
      success: true,
      via: 'rpc',
      invoice_id: inv?.id ?? invoiceId,
      status: inv?.status ?? 'paga',
      valor_pago: inv?.valor_pago ?? valorPago ?? null,
      pago_em: inv?.pago_em ?? pagoEm ?? null,
    });
  }

  // Erro de NEGÓCIO da RPC (fatura de outra org, status não-baixável): não cai no
  // fallback — reflete a mensagem. Só erro de "função inexistente" (deploy parcial)
  // deve cair no fallback PostgREST.
  const rpcMissing =
    rpcErr &&
    (String(rpcErr.code) === 'PGRST202' ||
      /could not find|does not exist|schema cache/i.test(rpcErr.message ?? ''));

  if (rpcErr && !rpcMissing) {
    console.error('[billing-baixa-manual] RPC falhou (negócio):', rpcErr.message);
    return json({ success: false, error: rpcErr.message }, 400);
  }

  // 2) Fallback PostgREST equivalente (não-transacional; falha segura).
  console.warn('[billing-baixa-manual] RPC indisponível, usando fallback PostgREST');
  const result = await darBaixaManual(supabase, organizationId, {
    invoiceId,
    valorPago,
    meio,
    observacao,
    pagoEm,
    operadorId: userId,
  });

  if (!result.success) {
    return json({ success: false, error: result.error }, 400);
  }
  return json({ success: true, via: 'postgrest', ...result.data });
});
