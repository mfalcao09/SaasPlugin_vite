// platform-catalog-import-csv — Import de catálogo via CSV do CRM de PLATAFORMA (super_admin)
//
// Porte 1:1 do `catalog-import-csv` do CRM Vendus (tenant), desacoplado da
// organização:
//   * Tabela: platform_crm_product_catalog_items (SEM organization_id — o
//     escopo é product_id, obrigatório e vindo de platform_crm_products).
//   * Auth: `authenticatePlatformAgent` (Bearer JWT super_admin OU
//     SERVICE_ROLE+actorUserId no body) — o original não tinha auth (edge
//     tenant antigo cru); aqui o gate super_admin é OBRIGATÓRIO (RLS de
//     platform_crm_* é super_admin-only, e o edge roda com SERVICE_ROLE que
//     ignora RLS — o gate em código é quem protege).
//   * Itens já vêm parseados do frontend (CSV/XLSX) — a edge só valida e
//     insere em lote (mesma forma do original: insert simples, sem upsert —
//     não existe UNIQUE(product_id, external_id) na tabela alvo, então um
//     onConflict/upsert aqui quebraria em runtime; ver ESPECIFICO no bilhete
//     do porte vs. schema real).
//
// NÃO portado (não existe no original): nada — cópia fiel 1:1.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface ImportBody {
  product_id: string;
  actorUserId?: string;
  created_by?: string;
  // Array de itens já parseados no frontend (CSV/XLSX) — 1:1 com o original.
  items: Array<{
    title: string;
    description?: string;
    price?: number | null;
    url?: string;
    thumbnail_url?: string;
    images?: string[];
    tags?: string[];
    attributes?: Record<string, any>;
    external_id?: string;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let bodyParsed: any = {};
    try {
      bodyParsed = await req.clone().json();
    } catch (_) {
      /* no body or invalid json */
    }
    const body = bodyParsed as ImportBody;

    const { user, errorResponse } = await authenticatePlatformAgent(
      req,
      supabase,
      supabaseKey,
      bodyParsed,
    );
    if (errorResponse) return errorResponse;
    if (!user) return json({ error: 'Invalid token' }, 401);

    if (!body.product_id || !Array.isArray(body.items) || body.items.length === 0) {
      return json({ error: 'product_id and items required' }, 400);
    }

    const rows = body.items.slice(0, 1000).map((it) => ({
      product_id: body.product_id,
      title: it.title,
      description: it.description ?? null,
      price: it.price ?? null,
      currency: 'BRL',
      url: it.url ?? null,
      thumbnail_url: it.thumbnail_url ?? null,
      images: it.images ?? [],
      tags: it.tags ?? [],
      attributes: it.attributes ?? {},
      external_id: it.external_id ?? null,
      source_type: 'csv',
    }));

    const { data, error } = await supabase
      .from('platform_crm_product_catalog_items')
      .insert(rows)
      .select('id');

    if (error) {
      console.error('[platform-catalog-import-csv] error:', error);
      return json({ error: error.message }, 500);
    }

    return json({ success: true, inserted: data?.length ?? 0 });
  } catch (err: any) {
    console.error('[platform-catalog-import-csv] exception:', err);
    return json({ error: err.message }, 500);
  }
});
