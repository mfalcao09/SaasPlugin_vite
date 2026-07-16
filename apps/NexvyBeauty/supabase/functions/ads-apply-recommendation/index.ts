// ads-apply-recommendation — aplicador HITL do NexvyAds (A2). Recebe
// { recommendation_id, confirm:true }, carrega a recomendação (que DEVE estar
// `approved`), traduz `proposed_action` numa mutação da Graph e registra tudo em
// ads_mutations_log (before/after/applied_by).
//
// GATED por ADS_MUTATIONS_ENABLED (default `false`):
//   • OFF (default) → DRY-RUN: NÃO chama a Graph. Loga a mutação que SERIA
//     enviada (status='success', graph_response={dry_run:true}), com o snapshot
//     atual em before_state; marca a rec como `applied`.
//   • ON (futuro)   → decifra o token da conexão (só em memória, NUNCA logado) e
//     faz o POST real na Graph API.
//
// Auth: super_admin (authenticatePlatformAgent), igual ads-sync. O `confirm:true`
// é um segundo gate humano explícito (evita apply acidental).
//
// Ações suportadas nesta versão: 'pause' (ad/adset/campaign) e 'update_budget'
// (daily_budget em centavos, adset/campaign). shift_budget chega como 'pause' do
// pior ad (ação concreta) — coberto por 'pause'.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// nível-alvo → (tabela, coluna uuid na rec)
const LEVEL_TABLE: Record<string, { table: string; uuidCol: 'ad_id' | 'adset_id' | 'campaign_id' }> = {
  ad: { table: 'ads_ads', uuidCol: 'ad_id' },
  adset: { table: 'ads_adsets', uuidCol: 'adset_id' },
  campaign: { table: 'ads_campaigns', uuidCol: 'campaign_id' },
};

/** Traduz proposed_action → parâmetros da Graph (SEM token). Retorna null se
 *  a ação não é suportada. */
function buildGraphMutation(pa: any): { params: Record<string, string>; afterState: Record<string, unknown> } | null {
  const action = String(pa?.action ?? '');
  if (action === 'pause') {
    return { params: { status: 'PAUSED' }, afterState: { status: 'PAUSED', effective_status: 'PAUSED' } };
  }
  if (action === 'update_budget') {
    const to = Number(pa?.to);
    if (!Number.isFinite(to) || to <= 0) return null;
    const minor = String(Math.round(to)); // centavos inteiros — contrato da Graph
    return { params: { daily_budget: minor }, afterState: { daily_budget: Math.round(to) } };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  const { user, errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
  if (errorResponse) return errorResponse;
  const appliedBy = user?.id ?? null;

  // Segundo gate humano: exige confirm:true.
  if (body?.confirm !== true) return json({ error: 'confirm:true obrigatorio' }, 400);

  const recommendationId = String(body?.recommendation_id ?? '').trim();
  if (!recommendationId || !UUID_RE.test(recommendationId)) {
    return json({ error: 'recommendation_id invalido (esperado UUID)' }, 400);
  }

  // ── 1) Carrega a recomendação; PRECISA estar approved ──────────────────────
  const { data: rec, error: recErr } = await sb
    .from('ads_recommendations')
    .select('id, product_id, account_id, campaign_id, adset_id, ad_id, kind, status, proposed_action, applied_mutation_id')
    .eq('id', recommendationId)
    .maybeSingle();
  if (recErr) return json({ error: recErr.message }, 500);
  if (!rec) return json({ error: 'recomendacao nao encontrada' }, 404);
  if (rec.status !== 'approved') {
    return json({ error: `recomendacao precisa estar approved (esta: ${rec.status})` }, 409);
  }

  const pa = rec.proposed_action ?? {};
  const targetLevel = String(pa?.target_level ?? '');
  const targetExternalId = String(pa?.target_external_id ?? '');
  const levelMeta = LEVEL_TABLE[targetLevel];
  if (!levelMeta || !targetExternalId) {
    return json({ error: 'proposed_action sem target_level/target_external_id validos' }, 422);
  }

  const mutation = buildGraphMutation(pa);
  if (!mutation) return json({ error: `acao nao suportada: ${pa?.action}` }, 422);

  // ── 2) Snapshot atual (before_state) — por uuid se houver, senão external id ─
  const uuid = rec[levelMeta.uuidCol];
  let beforeQuery = sb.from(levelMeta.table).select('external_id, status, effective_status, daily_budget');
  beforeQuery = uuid
    ? beforeQuery.eq('id', uuid)
    : beforeQuery.eq('account_id', rec.account_id).eq('external_id', targetExternalId);
  const { data: beforeRow } = await beforeQuery.maybeSingle();
  const beforeState = beforeRow
    ? { status: beforeRow.status ?? null, effective_status: beforeRow.effective_status ?? null, daily_budget: beforeRow.daily_budget ?? null }
    : null;

  // ── 3) Resolve conexão (p/ token no modo live e p/ auditoria do log) ───────
  let connectionId: string | null = null;
  let tokenEncrypted: string | null = null;
  if (rec.account_id) {
    const { data: acc } = await sb.from('ads_accounts').select('connection_id').eq('id', rec.account_id).maybeSingle();
    connectionId = acc?.connection_id ?? null;
    if (connectionId) {
      const { data: conn } = await sb
        .from('ads_platform_connections')
        .select('access_token_encrypted, status')
        .eq('id', connectionId)
        .maybeSingle();
      tokenEncrypted = conn?.access_token_encrypted ?? null;
    }
  }

  const live = (Deno.env.get('ADS_MUTATIONS_ENABLED') ?? '').toLowerCase() === 'true';

  // ── 4) Registra a mutação (pending) ANTES de agir — auditoria completa ─────
  const { data: logRow, error: logErr } = await sb
    .from('ads_mutations_log')
    .insert({
      product_id: rec.product_id,
      recommendation_id: rec.id,
      account_id: rec.account_id,
      connection_id: connectionId,
      target_level: targetLevel,
      target_external_id: targetExternalId,
      action: String(pa.action),
      payload: mutation.params, // parâmetros que SERIAM/foram enviados (SEM token)
      before_state: beforeState,
      status: 'pending',
    })
    .select('id')
    .single();
  if (logErr) return json({ error: `falha ao criar log de mutacao: ${logErr.message}` }, 500);
  const mutationId = logRow.id;
  const recId = rec.id; // capturado p/ uso dentro do closure (narrowing não atravessa)

  // Marca rec como applied (aponta pro log) — vale p/ dry-run e live-ok.
  async function markApplied() {
    await sb
      .from('ads_recommendations')
      .update({
        status: 'applied',
        applied_mutation_id: mutationId,
        reviewed_by: appliedBy,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', recId);
  }

  // ── 5a) DRY-RUN (gate OFF): NÃO toca a Graph ───────────────────────────────
  if (!live) {
    await sb
      .from('ads_mutations_log')
      .update({ status: 'success', graph_response: { dry_run: true }, after_state: mutation.afterState, applied_by: appliedBy })
      .eq('id', mutationId);
    await markApplied();
    return json({ ok: true, mode: 'dry_run', mutation_id: mutationId, recommendation_id: rec.id, status: 'applied' });
  }

  // ── 5b) LIVE (gate ON): decifra token (só em memória) e faz o POST real ────
  if (!tokenEncrypted) {
    await sb
      .from('ads_mutations_log')
      .update({ status: 'error', error: 'conexao sem token (refaca o OAuth)', applied_by: appliedBy })
      .eq('id', mutationId);
    return json({ ok: false, mode: 'live', mutation_id: mutationId, error: 'conexao sem token' }, 200);
  }

  let token: string;
  try {
    token = await decryptSecret(tokenEncrypted); // NUNCA logar / nunca sai do servidor
  } catch (_e) {
    await sb
      .from('ads_mutations_log')
      .update({ status: 'error', error: 'falha ao decifrar token', applied_by: appliedBy })
      .eq('id', mutationId);
    return json({ ok: false, mode: 'live', mutation_id: mutationId, error: 'falha ao decifrar token' }, 200);
  }

  try {
    // POST /{node} form-urlencoded; token vai no header (graphFetch), fora do body.
    const params = new URLSearchParams(mutation.params);
    const graphResp = await graphFetch<Record<string, unknown>>(`/${targetExternalId}`, token, { method: 'POST', body: params });
    await sb
      .from('ads_mutations_log')
      .update({ status: 'success', graph_response: graphResp ?? { success: true }, after_state: mutation.afterState, applied_by: appliedBy })
      .eq('id', mutationId);
    await markApplied();
    return json({ ok: true, mode: 'live', mutation_id: mutationId, recommendation_id: rec.id, status: 'applied' });
  } catch (e) {
    const ge = e as GraphError;
    const msg = ge?.graph?.message ?? String((e as Error).message ?? e);
    await sb
      .from('ads_mutations_log')
      .update({ status: 'error', error: msg.slice(0, 500), graph_response: ge?.graph ?? null, applied_by: appliedBy })
      .eq('id', mutationId);
    // rec permanece `approved` (não aplicada) p/ nova tentativa.
    return json({ ok: false, mode: 'live', mutation_id: mutationId, error: msg }, 200);
  }
});
