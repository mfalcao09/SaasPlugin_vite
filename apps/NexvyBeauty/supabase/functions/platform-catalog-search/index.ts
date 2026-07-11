// platform-catalog-search — busca no CATÁLOGO de PLATAFORMA (super_admin)
//
// Porte 1:1 do `catalog-search` do CRM Vendus (lado org-scoped), desacoplado
// do tenant:
//   * Tabela: platform_crm_product_catalog_items. Gate SEMPRE por product_id
//     (nunca organization_id) — Product Hub é sempre escopado por produto.
//   * Auth: authenticatePlatformAgent (JWT do usuário super_admin OU
//     service_role+actorUserId no body) — mesmo padrão de
//     platform-webchat-inbox. Escrita/leitura SEMPRE via SERVICE_ROLE (RLS
//     não se aplica ao edge; gate em código).
//   * Lógica de busca: o original chama a RPC `search_catalog_smart`
//     (fulltext → fuzzy → alternatives → filter_only), que só existe para o
//     schema org-scoped (organization_id). NÃO há gêmea dessa RPC para
//     platform_crm_* (confirmado: nenhuma migration em
//     supabase/migrations_platform_crm/ cria uma `search_platform_catalog_smart`
//     nem habilita pg_trgm nessa tabela). Em vez de inventar uma RPC nova
//     (fora do escopo do porte — o pedido é só a EDGE, sem tocar
//     config.toml/migrations), a mesma cascata de estratégias é replicada
//     AQUI, em código, usando os recursos que a tabela JÁ tem:
//       1. fulltext  → .textSearch('search_vector', ...) (websearch, mesmo
//          dialeto 'portuguese' da coluna gerada da tabela).
//       2. fuzzy     → ILIKE em title/description quando o fulltext não
//          retorna nada (sem depender de pg_trgm, que não está confirmado
//          habilitado nesta tabela — ILIKE é o fallback mais fiel possível
//          sem tocar em schema).
//       3. alternatives → filtros (preço/tags/atributos) SEM o termo de
//          busca, quando o texto não bate em nada — mesmo papel do fallback
//          'alternatives' do original (comunica honestamente que não achou
//          exato, mas oferece opções próximas).
//       4. filter_only → sem texto algum, só os filtros.
//     match_score é sintético (1.0 fulltext, 0.6 fuzzy, 0.3 alternatives/
//     filter_only) já que não há rank de RPC — os thresholds e o CONTRATO de
//     saída (is_alternative_match/is_fuzzy_match/agent_hint) são idênticos
//     ao original, ponta a ponta.
//   * expandPriceRange: função-cópia EXATA do original (mesmos números).
//   * Shape de resposta: idêntico campo a campo ao catalog-search original.
//   * Caller: ainda NENHUM no código (o original é chamado por
//     webchat-bot/index.ts:3263,3278 via supabase.functions.invoke; o
//     equivalente do lado plataforma — platform-sales-brain/copilot —
//     ainda não tem essa chamada de tool; fora do escopo deste porte).

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

interface SearchBody {
  product_id: string;
  query?: string;
  filters?: {
    price_min?: number;
    price_max?: number;
    attribute_filters?: Record<string, any>;
    tags?: string[];
  };
  limit?: number;
  actorUserId?: string;
  created_by?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Expande filtros de preço quando o usuário menciona um valor exato.
 * Ex: cliente diz "13.5 milhões" → busca entre 11.5M e 15.5M (±15%).
 * Isso evita zero resultados quando o catálogo tem item próximo mas não exato.
 * CÓPIA FIEL do original (mesmos números/lógica — só o nome do arquivo mudou).
 */
function expandPriceRange(
  filters: SearchBody['filters'],
): { price_min?: number; price_max?: number } {
  if (!filters) return {};
  let { price_min, price_max } = filters;

  // Se min e max são iguais (busca exata), expande ±15%
  if (
    price_min != null &&
    price_max != null &&
    Math.abs(price_min - price_max) < 0.01
  ) {
    const center = price_min;
    const spread = center * 0.15;
    price_min = center - spread;
    price_max = center + spread;
  } else if (price_min != null && price_max == null) {
    // Só min: aceita até 30% acima
    price_max = price_min * 1.3;
  } else if (price_max != null && price_min == null) {
    // Só max: aceita a partir de 30% abaixo
    price_min = price_max * 0.7;
  }

  return { price_min, price_max };
}

/** Row bruto de platform_crm_product_catalog_items (colunas usadas aqui). */
interface CatalogItemRow {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  url: string | null;
  thumbnail_url: string | null;
  images: string[] | null;
  attributes: Record<string, any> | null;
  tags: string[] | null;
  videos: string[] | null;
  documents: Array<Record<string, any>> | null;
}

type MatchStrategy = 'fulltext' | 'fuzzy' | 'alternatives' | 'filter_only';

/** Aplica os filtros de preço/tags comuns a QUALQUER estratégia. */
function applyCommonFilters(
  qb: any,
  productId: string,
  filters: { price_min?: number; price_max?: number; tags?: string[] | null },
) {
  let q = qb.eq('product_id', productId).eq('is_active', true);
  if (filters.price_min != null) q = q.gte('price', filters.price_min);
  if (filters.price_max != null) q = q.lte('price', filters.price_max);
  if (filters.tags && filters.tags.length > 0) q = q.overlaps('tags', filters.tags);
  return q;
}

/**
 * Filtro de attribute_filters em memória (jsonb attributes) — igual ao
 * espírito do p_attribute_filters da RPC original: cada chave/valor do filtro
 * precisa casar com o attributes do item (comparação frouxa por string, pois
 * o valor pode vir number/string do front).
 */
function matchesAttributeFilters(
  attributes: Record<string, any> | null,
  attributeFilters: Record<string, any> | null | undefined,
): boolean {
  if (!attributeFilters || Object.keys(attributeFilters).length === 0) return true;
  if (!attributes) return false;
  return Object.entries(attributeFilters).every(([key, value]) => {
    const itemValue = attributes[key];
    if (itemValue == null) return false;
    return String(itemValue).toLowerCase() === String(value).toLowerCase();
  });
}

/**
 * Cascata fulltext → fuzzy → alternatives → filter_only, replicando a RPC
 * `search_catalog_smart` em código (ver comentário de topo do arquivo).
 */
async function searchCatalogSmart(
  supabase: any,
  opts: {
    productId: string;
    query: string | null;
    priceMin?: number;
    priceMax?: number;
    tags?: string[] | null;
    attributeFilters?: Record<string, any> | null;
    limit: number;
  },
): Promise<{ rows: CatalogItemRow[]; strategy: MatchStrategy | null; error: string | null }> {
  const trimmedQuery = (opts.query ?? '').trim();

  // 1) fulltext — .textSearch no search_vector gerado da tabela (dialeto
  //    'portuguese', mesmo idioma da coluna gerada).
  if (trimmedQuery) {
    const { data, error } = await applyCommonFilters(
      supabase.from('platform_crm_product_catalog_items').select('*'),
      opts.productId,
      { price_min: opts.priceMin, price_max: opts.priceMax, tags: opts.tags },
    )
      .textSearch('search_vector', trimmedQuery, { type: 'websearch', config: 'portuguese' })
      .limit(opts.limit * 3); // folga extra pro filtro de atributos em memória

    if (error) return { rows: [], strategy: null, error: error.message };

    const filtered = ((data as CatalogItemRow[]) ?? []).filter((it) =>
      matchesAttributeFilters(it.attributes, opts.attributeFilters),
    );
    if (filtered.length > 0) {
      return { rows: filtered.slice(0, opts.limit), strategy: 'fulltext', error: null };
    }
  }

  // 2) fuzzy — ILIKE em title/description quando o fulltext não achou nada
  //    (sem depender de pg_trgm, não confirmado nesta tabela).
  if (trimmedQuery) {
    const likeTerm = `%${trimmedQuery}%`;
    const { data, error } = await applyCommonFilters(
      supabase.from('platform_crm_product_catalog_items').select('*'),
      opts.productId,
      { price_min: opts.priceMin, price_max: opts.priceMax, tags: opts.tags },
    )
      .or(`title.ilike.${likeTerm},description.ilike.${likeTerm}`)
      .limit(opts.limit * 3);

    if (error) return { rows: [], strategy: null, error: error.message };

    const filtered = ((data as CatalogItemRow[]) ?? []).filter((it) =>
      matchesAttributeFilters(it.attributes, opts.attributeFilters),
    );
    if (filtered.length > 0) {
      return { rows: filtered.slice(0, opts.limit), strategy: 'fuzzy', error: null };
    }
  }

  // 3) alternatives — mesmos filtros (preço/tags/atributos), SEM o termo de
  //    busca: honesto sobre não ter achado o item exato, mas oferece opções
  //    próximas dentro do escopo pedido.
  if (trimmedQuery) {
    const { data, error } = await applyCommonFilters(
      supabase.from('platform_crm_product_catalog_items').select('*'),
      opts.productId,
      { price_min: opts.priceMin, price_max: opts.priceMax, tags: opts.tags },
    )
      .order('created_at', { ascending: false })
      .limit(opts.limit * 3);

    if (error) return { rows: [], strategy: null, error: error.message };

    const filtered = ((data as CatalogItemRow[]) ?? []).filter((it) =>
      matchesAttributeFilters(it.attributes, opts.attributeFilters),
    );
    if (filtered.length > 0) {
      return { rows: filtered.slice(0, opts.limit), strategy: 'alternatives', error: null };
    }
  }

  // 4) filter_only — sem query nenhuma (ou query vazia desde o início): só
  //    os filtros de preço/tags/atributos.
  const { data, error } = await applyCommonFilters(
    supabase.from('platform_crm_product_catalog_items').select('*'),
    opts.productId,
    { price_min: opts.priceMin, price_max: opts.priceMax, tags: opts.tags },
  )
    .order('created_at', { ascending: false })
    .limit(opts.limit * 3);

  if (error) return { rows: [], strategy: null, error: error.message };

  const filtered = ((data as CatalogItemRow[]) ?? []).filter((it) =>
    matchesAttributeFilters(it.attributes, opts.attributeFilters),
  );
  return {
    rows: filtered.slice(0, opts.limit),
    strategy: filtered.length > 0 ? 'filter_only' : null,
    error: null,
  };
}

/** Score sintético por estratégia — não há rank de RPC aqui (ver topo do arquivo). */
const MATCH_SCORE_BY_STRATEGY: Record<MatchStrategy, number> = {
  fulltext: 1.0,
  fuzzy: 0.6,
  alternatives: 0.3,
  filter_only: 0.3,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = (await req.json().catch(() => ({}))) as SearchBody;

    const { user, errorResponse } = await authenticatePlatformAgent(
      req,
      supabase,
      serviceRoleKey,
      body,
    );
    if (errorResponse) return errorResponse;
    if (!user) return json({ error: 'Invalid token' }, 401);

    if (!body.product_id) {
      return json({ error: 'product_id required' }, 400);
    }

    const limit = Math.min(Math.max(body.limit ?? 5, 1), 10);
    const expandedPrice = expandPriceRange(body.filters);

    const { rows, strategy, error } = await searchCatalogSmart(supabase, {
      productId: body.product_id,
      query: body.query?.trim() || null,
      priceMin: expandedPrice.price_min,
      priceMax: expandedPrice.price_max,
      tags: body.filters?.tags ?? null,
      attributeFilters: body.filters?.attribute_filters ?? null,
      limit,
    });

    if (error) {
      console.error('[platform-catalog-search] search error:', error);
      return json({ error }, 500);
    }

    const matchScore = strategy ? MATCH_SCORE_BY_STRATEGY[strategy] : null;

    const items = rows.map((it) => {
      const videos = Array.isArray(it.videos) ? it.videos : [];
      const documents = Array.isArray(it.documents) ? it.documents : [];
      return {
        id: it.id,
        title: it.title,
        price: it.price,
        currency: it.currency,
        url: it.url,
        thumbnail_url: it.thumbnail_url,
        summary: it.description?.slice(0, 200) ?? null,
        key_attributes: it.attributes ?? {},
        tags: it.tags ?? [],
        image_count: Array.isArray(it.images) ? it.images.length : 0,
        video_count: videos.length,
        document_count: documents.length,
        has_video: videos.length > 0,
        has_document: documents.length > 0,
        document_names: documents.map((d: any) => d?.name).filter(Boolean),
        match_score: matchScore,
        match_strategy: strategy, // 'fulltext' | 'fuzzy' | 'alternatives' | 'filter_only'
      };
    });

    // Detecta se o resultado é fallback de alternativas (para o agente comunicar honestamente)
    const isAlternativeMatch = items.length > 0 && strategy === 'alternatives';
    const isFuzzyMatch = items.length > 0 && strategy === 'fuzzy';

    return json({
      success: true,
      items,
      count: items.length,
      is_alternative_match: isAlternativeMatch,
      is_fuzzy_match: isFuzzyMatch,
      // Mensagem que o agente pode usar literalmente quando não achou exato
      agent_hint: isAlternativeMatch
        ? "Não encontrei exatamente o que o cliente pediu, mas tenho essas opções similares. Apresente como alternativas, sem dizer 'não tenho'."
        : isFuzzyMatch
          ? 'Encontrei estas opções aproximadas (pode ter sido erro de digitação do cliente). Confirme se é o que ele queria.'
          : null,
    });
  } catch (err: any) {
    console.error('[platform-catalog-search] exception:', err);
    return json({ error: err.message }, 500);
  }
});
