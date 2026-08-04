// cakto-webhooks-inspect — READ-ONLY. Lista os webhooks configurados na conta
// Cakto (via API pública) e cruza com os produtos reais do platform_plans para
// responder, SEM comprar nada: cada produto que vendemos tem um webhook ATIVO
// apontando para a nossa URL de ingestão?
//
// Invocação: service_role (mesmo caminho dos crons, via vault). NÃO tem efeito
// colateral — só GET na API Cakto + SELECT no banco. Segredos são mascarados.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { ensureCaktoToken, caktoListWebhooks, caktoGet } from '../_shared/cakto-client.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// Valida que o Bearer é a service key. O projeto usa a chave NOVA (sb_secret_,
// não-JWT) no vault — então comparamos com a própria SERVICE_KEY do ambiente da
// função (que o Supabase injeta). Fallback: JWT legado com role=service_role.
function authOk(auth: string | null, serviceKey: string): boolean {
  if (!auth?.startsWith('Bearer ')) return false;
  const tok = auth.slice(7).trim();
  if (serviceKey && tok === serviceKey) return true; // sb_secret_ (novo) == env
  try {
    const payload = JSON.parse(atob(tok.split('.')[1])); // JWT legado
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

const shortEvents = (evs: any[]): string[] =>
  (evs ?? []).map((e) => (typeof e === 'string' ? e : e?.name ?? e?.id ?? '?')).map(String);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!authOk(req.headers.get('Authorization'), SERVICE_KEY)) return json({ error: 'service_role required' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // 1) credencial platform
    const { data: cred } = await admin
      .from('cakto_credentials')
      .select('*')
      .eq('scope', 'platform')
      .maybeSingle();
    if (!cred) return json({ error: 'sem credencial platform em cakto_credentials' }, 400);
    if (!cred.client_secret) return json({ error: 'credencial sem client_secret' }, 400);

    // 2) token + lista de webhooks
    let token: string;
    try {
      token = await ensureCaktoToken(admin, cred);
    } catch (e) {
      return json({ error: 'falha ao autenticar na Cakto', detail: String(e).slice(0, 300) }, 502);
    }

    let webhooks;
    try {
      webhooks = await caktoListWebhooks(token);
    } catch (e) {
      const msg = String(e);
      const scopeHint = /\[403\]/.test(msg)
        ? 'A credencial pode não ter o escopo de webhooks — regenerar no painel Cakto incluindo webhooks.'
        : undefined;
      return json({ error: 'falha ao listar webhooks', detail: msg.slice(0, 300), scopeHint }, 502);
    }

    // 3) produtos reais que vendemos
    const { data: planos } = await admin
      .from('platform_plans')
      .select('slug, cakto_product_id, is_public, is_active')
      .not('cakto_product_id', 'is', null);

    // 4) cruza: cada produto real -> webhooks ativos que o cobrem
    const webhookViews = (webhooks ?? []).map((w: any) => ({
      id: w.id,
      status: w.status,
      name: w.name,
      url: w.url, // URL não é segredo — queremos vê-la inteira
      product_ids: (w.products ?? []).map((p: any) => String(p.id ?? p)),
      events: shortEvents(w.events),
    }));

    const NOSSA_URL_FRAGMENTO = 'cakto-webhook';
    const cobertura = (planos ?? []).map((pl: any) => {
      const cobrindo = webhookViews.filter(
        (w) => w.product_ids.includes(String(pl.cakto_product_id)) && w.status === 'active',
      );
      const apontandoPraNos = cobrindo.filter((w) => w.url.includes(NOSSA_URL_FRAGMENTO));
      return {
        plano: pl.slug,
        cakto_product_id: pl.cakto_product_id,
        vende_ao_publico: pl.is_public && pl.is_active,
        webhooks_ativos_cobrindo: cobrindo.length,
        aponta_pra_nossa_url: apontandoPraNos.length > 0,
        urls: cobrindo.map((w) => w.url),
        veredito:
          apontandoPraNos.length > 0
            ? 'OK — webhook ativo apontando para a nossa ingestao'
            : cobrindo.length > 0
            ? 'ATENCAO — tem webhook, mas NAO aponta para a nossa URL'
            : 'FALTA — nenhum webhook ativo cobre este produto',
      };
    });

    // webhooks "curinga" (sem produto específico = cobrem todos os produtos)
    const curinga = webhookViews.filter((w) => w.product_ids.length === 0 && w.status === 'active');

    // 5) TRIAL real das ofertas de cada produto (fonte da verdade p/ "o dinheiro
    //    entra hoje?"). A Cakto é quem manda — nosso platform_plans.trial_days é só
    //    metadado. trial_days>0 numa oferta ativa = venda não vira caixa imediato.
    const ofertas: any[] = [];
    for (const pl of planos ?? []) {
      try {
        const data: any = await caktoGet(token, `/public_api/offers/?product=${encodeURIComponent(pl.cakto_product_id)}`);
        const results = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        for (const o of results) {
          ofertas.push({
            plano: pl.slug,
            oferta_slug: o.id,
            nome: o.name,
            preco: o.price,
            status: o.status,
            trial_days: o.trial_days ?? 0,
            tem_trial: Number(o.trial_days ?? 0) > 0,
          });
        }
      } catch (e) {
        ofertas.push({ plano: pl.slug, erro: String(e).slice(0, 150) });
      }
    }
    const ofertas_com_trial = ofertas.filter((o) => o.tem_trial);

    return json({
      ok: true,
      total_webhooks: webhookViews.length,
      credencial_scopes: cred.scopes,
      cobertura_por_produto: cobertura,
      webhooks_curinga_sem_produto: curinga,
      todos_webhooks: webhookViews,
      ofertas,
      alerta_trial: ofertas_com_trial.length > 0
        ? `${ofertas_com_trial.length} oferta(s) COM trial — venda não vira caixa imediato`
        : 'nenhuma oferta com trial — pagamento vira caixa na hora',
    });
  } catch (e) {
    return json({ error: String(e).slice(0, 400) }, 500);
  }
});
