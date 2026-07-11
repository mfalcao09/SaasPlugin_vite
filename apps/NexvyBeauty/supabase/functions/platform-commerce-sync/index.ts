// platform-commerce-sync — sincroniza os PLANOS PÚBLICOS (public_plans) com um
// Product Catalog do Meta Commerce, para que os cards nativos de catálogo do
// WhatsApp/Instagram (product message / generic template) sempre reflitam o
// que está publicado no gestão — SEM gap quando o preço/nome muda.
//
// ─── O QUE É ONE-TIME (passo humano na Meta, feito ANTES de ligar esta edge) ──
//   1. Criar o Product Catalog:
//        POST /{business_id}/owned_product_catalogs  (business_id 1331611869008138)
//        → precisa de token com `catalog_management` + `business_management`.
//      Guardar o catalog_id retornado em:
//        platform_settings.meta_commerce_catalog_id
//   2. Vincular o catálogo à WABA (para product messages no WhatsApp):
//        POST /{waba_id}/product_catalogs  { catalog_id }   (waba_id 976904392005535)
//      (Alternativa via Business Manager UI → WhatsApp Manager → Catálogo.)
//   Detalhes completos em CARDS-NATIVOS-COMMERCE-2026-07-11.md.
//
// ─── O QUE É CONTÍNUO (esta edge, action `sync`) ──────────────────────────────
//   UPSERT idempotente dos planos no catálogo via Graph `POST /{catalog_id}/batch`
//   (method UPDATE = create-or-update por retailer_id). retailer_id ESTÁVEL =
//   `plan-<slug>` — nunca muda, então re-sincronizar um plano editado ATUALIZA
//   o mesmo item (não duplica). Remoção é DELETE explícito só quando o plano
//   sai de público (action ainda não implementada — ver TODO no fim).
//
// ─── COMO LIGAR O SYNC AUTOMÁTICO (fecha o gap na origem, sem polling) ────────
//   Padrão dos crons da casa: trigger no UPDATE/INSERT de platform_plans que
//   dispara esta edge via pg_net. SQL de referência (NÃO aplicado aqui — é passo
//   de migration, documentado em CARDS-NATIVOS-COMMERCE-2026-07-11.md):
//
//     create extension if not exists pg_net;
//     create or replace function public.trg_commerce_sync_on_plan_change()
//     returns trigger language plpgsql security definer as $$
//     begin
//       perform net.http_post(
//         url     := current_setting('app.settings.functions_url') || '/platform-commerce-sync',
//         headers := jsonb_build_object(
//                      'Content-Type','application/json',
//                      'Authorization','Bearer ' || current_setting('app.settings.service_role_key')),
//         body    := jsonb_build_object('action','sync','actorUserId', <super_admin_uuid>)
//       );
//       return coalesce(new, old);
//     end $$;
//     create trigger commerce_sync_after_plan_change
//       after insert or update of name, price_monthly, checkout_url on public.platform_plans
//       for each row execute function public.trg_commerce_sync_on_plan_change();
//
//   Debounce opcional: cron a cada 5min chamando `sync` (idempotente, custo baixo)
//   cobre qualquer trigger perdido. Trigger = tempo-real; cron = rede de segurança.
//
// ─── AUTH ─────────────────────────────────────────────────────────────────────
//   Mesmo gate das demais platform-* : authenticatePlatformAgent (super_admin via
//   JWT, OU service_role key + actorUserId no body — o caminho do trigger/cron).
//
// ─── CREDENCIAIS ──────────────────────────────────────────────────────────────
//   Token e ids seguem o padrão meta da casa: connection ativa em
//   platform_crm_whatsapp_meta_connections (access_token_encrypted → decryptSecret).
//   catalog_id vem de platform_settings.meta_commerce_catalog_id.
//   ⚠️ O token do Catalog PRECISA ter `catalog_management`. O token WhatsApp da
//      connection PODE não ter esse escopo — ver seção "Permissões" do doc; se a
//      Graph responder (#200) permissão insuficiente, o erro sai ESTRUTURADO e o
//      passo humano é gerar/instalar um system-user token com catalog_management.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { GRAPH_BASE } from '../_shared/meta-graph.ts';

const DEFAULT_CURRENCY = 'BRL';
const RETAILER_PREFIX = 'plan-';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jsonError(error: string, message: string, status: number, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, error, message, ...extra }, status);
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PublicPlan {
  name: string | null;
  slug: string | null;
  price_monthly: number | null;
  checkout_url: string | null;
}

interface MetaConnection {
  id: string;
  waba_id: string | null;
  access_token_encrypted: string | null;
  status: string;
}

/** Item no formato do endpoint clássico /{catalog_id}/batch (method UPDATE = upsert). */
interface CatalogBatchRequest {
  method: 'UPDATE' | 'DELETE';
  retailer_id: string;
  data?: {
    name: string;
    // price em MENOR unidade da moeda (centavos), inteiro — contrato do /batch.
    price: number;
    currency: string;
    url: string;
    image_url?: string;
    availability: 'in stock' | 'out of stock';
    condition: 'new';
    brand?: string;
    description?: string;
  };
}

// ─── Resolução de credenciais ──────────────────────────────────────────────────

async function resolveActiveConnection(
  supabase: any,
  connectionId: string | null,
): Promise<{ conn: MetaConnection | null; reason: string | null }> {
  const cols = 'id, waba_id, access_token_encrypted, status';
  const q = supabase.from('platform_crm_whatsapp_meta_connections').select(cols);
  const { data, error } = connectionId
    ? await q.eq('id', connectionId).maybeSingle()
    : await q.eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.error('[platform-commerce-sync] connection fetch error:', error.message);
    return { conn: null, reason: 'connection_lookup_failed' };
  }
  if (!data) return { conn: null, reason: connectionId ? 'connection_not_found' : 'no_active_connection' };
  if (data.status !== 'active') return { conn: null, reason: `connection_status_${data.status}` };
  return { conn: data as MetaConnection, reason: null };
}

async function getCatalogId(supabase: any): Promise<{ catalogId: string | null; defaultImage: string | null }> {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('meta_commerce_catalog_id, meta_commerce_default_image_url')
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[platform-commerce-sync] platform_settings error:', error.message);
    return { catalogId: null, defaultImage: null };
  }
  return {
    catalogId: (data?.meta_commerce_catalog_id as string | null) ?? null,
    defaultImage: (data?.meta_commerce_default_image_url as string | null) ?? null,
  };
}

// ─── Montagem dos itens ─────────────────────────────────────────────────────────

/** slug → retailer_id estável. Nunca muda para um plano existente. */
function retailerIdForSlug(slug: string): string {
  return `${RETAILER_PREFIX}${slug}`;
}

/**
 * Converte um plano público num request de UPSERT do catálogo.
 * Retorna null (com motivo) quando falta dado obrigatório da Meta — o item é
 * PULADO com aviso estruturado, nunca envia um produto inválido que a Graph
 * rejeitaria em bloco.
 */
function planToBatchRequest(
  plan: PublicPlan,
  defaultImage: string | null,
): { request: CatalogBatchRequest | null; skipped: { slug: string | null; reason: string } | null } {
  const slug = plan.slug ? String(plan.slug).trim() : '';
  if (!slug) return { request: null, skipped: { slug: plan.slug, reason: 'missing_slug' } };
  if (!plan.checkout_url) return { request: null, skipped: { slug, reason: 'missing_checkout_url' } };
  const price = Number(plan.price_monthly);
  if (!Number.isFinite(price) || price <= 0) {
    return { request: null, skipped: { slug, reason: 'invalid_price' } };
  }
  const image = defaultImage ?? undefined;
  const request: CatalogBatchRequest = {
    method: 'UPDATE',
    retailer_id: retailerIdForSlug(slug),
    data: {
      name: String(plan.name ?? slug),
      price: Math.round(price * 100), // reais → centavos
      currency: DEFAULT_CURRENCY,
      url: String(plan.checkout_url),
      ...(image ? { image_url: image } : {}),
      availability: 'in stock',
      condition: 'new',
      brand: 'Nexvy',
      description: `Plano ${String(plan.name ?? slug)} — assinatura mensal.`,
    },
  };
  return { request, skipped: null };
}

// ─── Entrega no Graph ────────────────────────────────────────────────────────────

interface GraphBatchResult {
  ok: boolean;
  status: number;
  handles: unknown;
  error: { message: string; code: number | null; subcode: number | null; fbtrace_id: string | null } | null;
}

async function sendCatalogBatch(
  catalogId: string,
  token: string,
  requests: CatalogBatchRequest[],
): Promise<GraphBatchResult> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${catalogId}/batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests, allow_upsert: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const g = data?.error ?? {};
      return {
        ok: false,
        status: res.status,
        handles: null,
        error: {
          message: String(g?.message ?? `graph ${res.status}`).slice(0, 300),
          code: typeof g?.code === 'number' ? g.code : null,
          subcode: typeof g?.error_subcode === 'number' ? g.error_subcode : null,
          fbtrace_id: g?.fbtrace_id ? String(g.fbtrace_id) : null,
        },
      };
    }
    return { ok: true, status: res.status, handles: data?.handles ?? data ?? null, error: null };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      handles: null,
      error: { message: String(e).slice(0, 300), code: null, subcode: null, fbtrace_id: null },
    };
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError('method_not_allowed', 'method not allowed', 405);

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

    const body = await req.json().catch(() => ({}));

    const { user, errorResponse } = await authenticatePlatformAgent(req, supabase, serviceRoleKey, body);
    if (errorResponse) return errorResponse;
    if (!user) return jsonError('invalid_token', 'Invalid token', 401);

    const action = body?.action ? String(body.action) : 'sync';
    if (action !== 'sync' && action !== 'waba-status' && action !== 'link-waba') {
      return jsonError(
        'unsupported_action',
        `ação '${action}' não suportada (use 'sync', 'waba-status' ou 'link-waba')`,
        400,
      );
    }

    // ── waba-status / link-waba: o vínculo catálogo↔WABA é PRÉ-REQUISITO do
    //    product message (card nativo). Sem ele a Cloud API recusa o interactive
    //    type=product. `waba-status` é read-only (GET); `link-waba` faz o POST
    //    one-time — idempotente (re-vincular o mesmo catálogo não duplica).
    if (action === 'waba-status' || action === 'link-waba') {
      const { catalogId } = await getCatalogId(supabase);
      if (!catalogId) {
        return jsonError('catalog_not_configured', 'platform_settings.meta_commerce_catalog_id ausente', 422);
      }
      const resolved = await resolveActiveConnection(supabase, body?.connection_id ? String(body.connection_id) : null);
      if (!resolved.conn?.waba_id) {
        return jsonError(resolved.reason ?? 'no_waba', 'conexão Meta ativa sem waba_id', 422);
      }
      const wabaId = resolved.conn.waba_id;
      const envTok = Deno.env.get('META_COMMERCE_TOKEN')?.trim() || null;
      let tok: string;
      try {
        tok = envTok ?? await decryptSecret(resolved.conn.access_token_encrypted!);
      } catch (e) {
        console.error('[platform-commerce-sync] token decrypt failed:', String(e).slice(0, 200));
        return jsonError('token_decrypt_failed', 'falha ao decriptar o token da conexão', 500);
      }

      if (action === 'link-waba') {
        const res = await fetch(`${GRAPH_BASE}/${wabaId}/product_catalogs`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ catalog_id: catalogId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const g = data?.error ?? {};
          return jsonError('link_waba_failed', String(g?.message ?? `graph ${res.status}`).slice(0, 300), 422, {
            code: g?.code ?? null, subcode: g?.error_subcode ?? null,
            fbtrace_id: g?.fbtrace_id ?? null, http_status: res.status,
            waba_id: wabaId, catalog_id: catalogId,
          });
        }
        return json({ ok: true, action, waba_id: wabaId, catalog_id: catalogId, result: data });
      }

      // waba-status
      const res = await fetch(
        `${GRAPH_BASE}/${wabaId}/product_catalogs?fields=id,name`,
        { headers: { Authorization: `Bearer ${tok}` } },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const g = data?.error ?? {};
        return jsonError('waba_status_failed', String(g?.message ?? `graph ${res.status}`).slice(0, 300), 422, {
          code: g?.code ?? null, subcode: g?.error_subcode ?? null,
          fbtrace_id: g?.fbtrace_id ?? null, http_status: res.status,
          waba_id: wabaId, catalog_id: catalogId,
        });
      }
      const catalogs = Array.isArray(data?.data) ? data.data : [];
      const linked = catalogs.some((c: any) => String(c?.id) === String(catalogId));
      return json({
        ok: true, action, waba_id: wabaId, catalog_id: catalogId,
        linked, linked_catalogs: catalogs,
      });
    }

    const dryRun = body?.dryRun === true;
    const connectionIdInput = body?.connection_id ? String(body.connection_id) : null;

    // 1) catalog_id (one-time, criado na Meta) precisa existir
    const { catalogId, defaultImage } = await getCatalogId(supabase);
    if (!catalogId) {
      return jsonError(
        'catalog_not_configured',
        'platform_settings.meta_commerce_catalog_id ausente — crie o Product Catalog na Meta (passo one-time) e grave o id antes de sincronizar',
        422,
      );
    }

    // 2) token do catálogo — prioriza o SECRET DEDICADO (system-user token com
    //    catalog_management), isolado do token de mensagens do WhatsApp. Sem o
    //    secret, cai no token da connection Meta ativa (compat legado). O batch
    //    de catálogo só precisa de catalog_id + token; a WABA connection não é
    //    necessária quando o secret está presente.
    const envToken = Deno.env.get('META_COMMERCE_TOKEN')?.trim() || null;
    let conn: MetaConnection | null = null;
    if (!envToken) {
      const resolved = await resolveActiveConnection(supabase, connectionIdInput);
      if (!resolved.conn) {
        return jsonError(
          resolved.reason ?? 'no_active_connection',
          'Sem META_COMMERCE_TOKEN e nenhuma conexão Meta ativa disponível',
          resolved.reason === 'connection_not_found' ? 404 : 422,
        );
      }
      if (!resolved.conn.access_token_encrypted) {
        return jsonError('connection_incomplete', 'conexão sem access_token', 422);
      }
      conn = resolved.conn;
    }

    // 3) planos públicos (verdade da origem)
    const { data: plansData, error: plansErr } = await supabase
      .from('public_plans')
      .select('name, slug, price_monthly, checkout_url')
      .order('price_monthly', { ascending: true });
    if (plansErr) {
      console.error('[platform-commerce-sync] public_plans error:', plansErr.message);
      return jsonError('plans_lookup_failed', 'falha ao carregar public_plans', 500);
    }
    const plans = (plansData as PublicPlan[] | null) ?? [];

    // 4) monta requests + coleta skips estruturados
    const requests: CatalogBatchRequest[] = [];
    const skipped: Array<{ slug: string | null; reason: string }> = [];
    for (const p of plans) {
      const { request, skipped: skip } = planToBatchRequest(p, defaultImage);
      if (request) requests.push(request);
      else if (skip) skipped.push(skip);
    }

    const summary = {
      catalog_id: catalogId,
      connection_id: envToken ? 'env:META_COMMERCE_TOKEN' : conn!.id,
      plans_total: plans.length,
      to_upsert: requests.map((r) => r.retailer_id),
      skipped,
    };

    if (dryRun) {
      return json({ ok: true, dryRun: true, ...summary, requests });
    }
    if (requests.length === 0) {
      return json({ ok: true, dryRun: false, ...summary, note: 'nenhum plano elegível para upsert' });
    }

    // 5) token + entrega — secret dedicado (uso direto) OU token da connection (decrypt)
    let token: string;
    if (envToken) {
      token = envToken;
    } else {
      try {
        token = await decryptSecret(conn!.access_token_encrypted!);
      } catch (e) {
        console.error('[platform-commerce-sync] token decrypt failed:', String(e).slice(0, 200));
        return jsonError('token_decrypt_failed', 'falha ao decriptar o token da conexão', 500);
      }
    }

    const result = await sendCatalogBatch(catalogId, token, requests);
    if (!result.ok) {
      console.error('[platform-commerce-sync] batch upsert falhou:', JSON.stringify({ ...summary, error: result.error }));
      return jsonError('catalog_batch_failed', result.error?.message ?? 'batch falhou', 422, {
        code: result.error?.code ?? null,
        subcode: result.error?.subcode ?? null,
        fbtrace_id: result.error?.fbtrace_id ?? null,
        http_status: result.status,
        ...summary,
      });
    }

    return json({ ok: true, dryRun: false, ...summary, upserted: requests.length, handles: result.handles });
  } catch (e) {
    console.error('[platform-commerce-sync] exception:', e);
    return jsonError('internal_error', e instanceof Error ? e.message : String(e), 500);
  }
});

// TODO (próxima onda, fora deste groundwork):
//  - action 'prune': DELETE dos retailer_id `plan-*` que não estão mais em
//    public_plans (plano despublicado) — fecha o gap na direção da REMOÇÃO.
//  - reconciliação: GET /{catalog_id}/products?fields=retailer_id para diff real
//    antes do batch (hoje o UPDATE já é upsert idempotente, mas o diff daria
//    observabilidade de quantos foram criados vs atualizados).
