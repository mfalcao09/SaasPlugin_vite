// leads-import-prospectagram-csv — "Prospectagram (CSV)" (Prospecção Ativa, super_admin).
//
// O CSV NÃO SOBE PARA CÁ. O navegador lê o export do Prospectagram, conserta o arquivo
// (que não escapa vírgula — parse ancorado nas duas pontas, ver
// `prospeccao/prospectagram-csv.ts`) e manda para cá LOTES de registros JÁ
// NORMALIZADOS. Aqui só acontece o que é do servidor: dedup GLOBAL, a busca do dia e
// o insert.
//
// POR QUE NÃO TEM APIFY: diferente do vídeo e do colar-handles, o registro do
// Prospectagram JÁ VEM ENRIQUECIDO (telefone, e-mail, seguidores, verificado). Não há
// o que enriquecer nem webhook para esperar — a ingestão é SÍNCRONA e termina no
// insert. Por isso esta edge insere direto em `platform_crm_extracted_leads`, papel
// que nas outras fontes é do webhook do Apify.
//
// CONTRATOS (2026-07-19), os mesmos das outras fontes:
//   • dedup GLOBAL por @handle antes de inserir (leads + opt-out + lixeira);
//   • 1 busca por (fonte, data) — `Prospectagram (CSV) <dia>`; se já existir a do dia,
//     faz APPEND (é o que permite mandar ~25 mil linhas em ~100 lotes);
//   • `segment` É gravado aqui porque isto é INGESTÃO (nascimento do lead), via o
//     MESMO `qualifyLead` das outras fontes — nunca uma regra paralela;
//   • a aba com/link/sem WhatsApp é DERIVADA no read (`classifyWhatsapp`); esta edge
//     NÃO grava coluna de aba nem faz split físico de busca;
//   • `approved_at` NUNCA é setado na ingestão (a curadoria é do Marcelo).
//
// Auth: super_admin (authenticatePlatformAgent) — verify_jwt default (não entra no
// config.toml). Product-scoped, ZERO organization_id.
// Segurança (§11): SERVICE_ROLE só aqui dentro; nunca logar PII (só contagens).
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import {
  HANDLE_RE,
  sanitizeInstagramHandle,
  buildLeadCard,
  qualifyLead,
} from '../_shared/apify-leads.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Teto por REQUISIÇÃO (não por importação): o arquivo inteiro chega em vários lotes.
// Dimensionado pelo `.in()` do dedup — 500 handles por consulta é folgado no Postgres.
const MAX_RECORDS_PER_BATCH = 500;

/** Um registro já normalizado pelo navegador (espelha `ProspectagramRecord`). */
interface CsvRecord {
  username: string;
  full_name: string | null;
  descricao: string | null;
  posts: number | null;
  following: number | null;
  followers: number | null;
  whatsapp: string | null;
  email: string | null;
  external_url: string | null;
  is_private: boolean;
  is_verified: boolean;
}

/**
 * Data local (America/Sao_Paulo) YYYY-MM-DD. O CSV não tem coluna de data: a leva é
 * marcada pela data do UPLOAD, e quem a define é o SERVIDOR (não o relógio do cliente).
 */
function saoPauloDay(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date()); // en-CA → YYYY-MM-DD
}

/**
 * Traduz o registro do CSV para o formato de item do apify/instagram-scraper.
 *
 * Isto existe para NÃO haver uma segunda regra de normalização no sistema: quem decide
 * telefone-BR, ICP, idioma, GEO e segmento continua sendo o `buildLeadCard`/`qualifyLead`
 * do `_shared` — o mesmo do vídeo e do colar-handles. O Prospectagram só fala outro
 * dialeto; a TRADUÇÃO é aqui, a DECISÃO continua lá.
 *
 * Nota honesta: o export do Prospectagram NÃO tem coluna de bio. Com `biography` nulo,
 * o ICP julga só pelo nome do perfil — menos sinal do que as outras fontes têm. O efeito
 * disso está medido e registrado no PR.
 */
function toApifyLikeItem(rec: CsvRecord): Record<string, unknown> {
  return {
    username: rec.username,
    fullName: rec.full_name,
    biography: null,                    // o CSV não exporta bio
    followersCount: rec.followers,
    followsCount: rec.following,
    postsCount: rec.posts,
    businessPhoneNumber: rec.whatsapp,  // extractBestPhone decide se é BR discável
    businessEmail: rec.email,
    externalUrl: rec.external_url,
    verified: rec.is_verified,
    private: rec.is_private,
    url: `https://www.instagram.com/${rec.username}/`,
    // Provenância: qual busca do Prospectagram trouxe o lead. Fica só no `raw`
    // (auditoria); não alimenta nenhuma decisão de qualificação.
    _prospectagram: { descricao: rec.descricao, via: 'csv' },
  };
}

/** find-or-create da busca do dia (idempotente por product_id + label). */
async function findOrCreateBucket(
  sb: any, productId: string, label: string, extra: Record<string, unknown>,
): Promise<string> {
  const { data: existing } = await sb
    .from('platform_crm_lead_extractions')
    .select('id')
    .eq('product_id', productId)
    .contains('keywords', [label])
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created, error } = await sb
    .from('platform_crm_lead_extractions')
    .insert({
      product_id: productId,
      keywords: [label],
      source: 'instagram',
      status: 'running',
      ...extra,
    })
    .select('id').single();
  if (error || !created) throw new Error(`bucket "${label}": ${error?.message ?? 'insert falhou'}`);
  return created.id as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  const { user, errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
  if (errorResponse) return errorResponse;

  // ── Input (§11.3) ──────────────────────────────────────────────────────────
  const productId = String(body?.product_id ?? '').trim();
  if (!UUID_RE.test(productId)) return json({ error: 'product_id invalido (UUID)' }, 400);

  // `final` fecha a busca do dia (status 'done'); os lotes do meio a deixam 'running'.
  const isFinal = body?.final === true;

  const rawRecords: unknown[] = Array.isArray(body?.records) ? body.records : [];
  if (rawRecords.length === 0) return json({ error: 'records[] vazio' }, 400);
  if (rawRecords.length > MAX_RECORDS_PER_BATCH) {
    return json({ error: `lote acima de ${MAX_RECORDS_PER_BATCH} registros — divida` }, 400);
  }

  // Revalida o @handle no servidor (o front não é autoridade) e dedup DENTRO do lote.
  const byHandle = new Map<string, CsvRecord>();
  let malformed = 0;
  for (const raw of rawRecords) {
    const r = (raw ?? {}) as Partial<CsvRecord>;
    const username = sanitizeInstagramHandle(r?.username);
    if (!username || !HANDLE_RE.test(username)) { malformed++; continue; }
    byHandle.set(username, {
      username,
      full_name: typeof r.full_name === 'string' ? r.full_name : null,
      descricao: typeof r.descricao === 'string' ? r.descricao : null,
      posts: typeof r.posts === 'number' ? r.posts : null,
      following: typeof r.following === 'number' ? r.following : null,
      followers: typeof r.followers === 'number' ? r.followers : null,
      whatsapp: typeof r.whatsapp === 'string' ? r.whatsapp : null,
      email: typeof r.email === 'string' ? r.email : null,
      external_url: typeof r.external_url === 'string' ? r.external_url : null,
      is_private: r.is_private === true,
      is_verified: r.is_verified === true,
    });
  }
  if (byHandle.size === 0) return json({ error: 'nenhum @handle valido no lote' }, 400);

  // Produto existe? (falha cedo — sem busca órfã)
  const { data: product } = await sb
    .from('platform_crm_products').select('id').eq('id', productId).maybeSingle();
  if (!product) return json({ error: 'produto nao encontrado' }, 404);

  // ── Dedup GLOBAL por @handle (leads já na base + opt-out + lixeira) ────────
  const candidates = [...byHandle.keys()];
  const known = new Set<string>();
  for (const table of ['platform_crm_extracted_leads', 'platform_crm_lead_optout', 'platform_crm_lead_excluded']) {
    const { data } = await sb.from(table).select('handle').eq('product_id', productId).in('handle', candidates);
    for (const row of (data ?? [])) {
      const h = row?.handle ? String(row.handle).replace(/^@/, '').toLowerCase() : null;
      if (h) known.add(h);
    }
  }
  const fresh = candidates.filter((h) => !known.has(h));
  const duplicates = candidates.length - fresh.length;

  const day = saoPauloDay();
  // 1 busca por (fonte, data). O prefixo "Prospectagram" é o que faz o `leadSourceOf`
  // (front) classificar a FONTE do lead — não mude sem mudar lá.
  const label = `Prospectagram (CSV) ${day}`;

  // Lote 100% duplicado e não-final: não precisa nem tocar na busca.
  if (fresh.length === 0 && !isFinal) {
    return json({
      ok: true, day, label, received: rawRecords.length, malformed,
      inserted: 0, duplicates, total: null,
    });
  }

  let bucketId: string;
  try {
    bucketId = await findOrCreateBucket(sb, productId, label, {
      apify_actor_id: null,             // sem Apify: o dado já vem enriquecido
      requested_by: user?.id ?? null,
      params: { via: 'leads-import-prospectagram-csv', day },
    });
  } catch (e) {
    return json({ error: `falha ao criar a busca do dia: ${String((e as Error).message).slice(0, 200)}` }, 500);
  }

  // ── Monta as linhas (mesma normalização/qualificação das outras fontes) ────
  const rows = fresh.map((handle) => {
    const rec = byHandle.get(handle)!;
    const item = toApifyLikeItem(rec);
    const card = buildLeadCard(item);
    const q = qualifyLead(item, card);
    return {
      extraction_id: bucketId,
      product_id: productId,
      handle: card.handle,
      name: card.name,
      primeiro_nome: card.primeiro_nome,
      seguidores: card.seguidores,
      seguindo: card.seguindo,
      posts: card.posts,
      telefone: card.telefone,
      whatsapp_link: card.whatsapp_link,
      email: card.email,
      instagram_url: card.instagram_url,
      website: card.website,
      categoria: card.categoria,
      cnpj: card.cnpj,
      is_verified: card.is_verified,
      is_private: card.is_private,
      bio: card.bio,
      palavras_chave: [label],
      is_business: card.is_business,
      lgpd_basis: 'art7_par4_publico',
      finalidade: 'audiencia_ads',
      qualified: q.qualified,
      segment: q.segment,
      is_seed: q.is_seed,
      is_infoproduto: q.is_infoproduto,
      phone_is_br: q.phone_is_br,
      geo_country: q.geo_country,
      bio_lang: q.bio_lang,
      filter_verdicts: q.filter_verdicts,
      raw: item,
      // approved_at NÃO entra aqui de propósito: ingestão não aprova lead.
    };
  });

  if (rows.length > 0) {
    const { error: upErr } = await sb
      .from('platform_crm_extracted_leads')
      .upsert(rows, { onConflict: 'extraction_id,handle' });
    if (upErr) {
      console.error('[leads-import-prospectagram-csv] upsert:', upErr.message);
      await sb.from('platform_crm_lead_extractions')
        .update({ status: 'error', last_error: `upsert: ${upErr.message}`.slice(0, 500) })
        .eq('id', bucketId);
      return json({ error: `falha ao inserir os leads: ${upErr.message}`, extraction_id: bucketId }, 500);
    }
  }

  // Recontagem real da busca (idempotente com append de vários lotes no mesmo dia).
  const { count } = await sb
    .from('platform_crm_extracted_leads')
    .select('*', { count: 'exact', head: true })
    .eq('extraction_id', bucketId)
    .is('excluded_at', null);
  const total = count ?? 0;

  await sb.from('platform_crm_lead_extractions')
    .update({ status: isFinal ? 'done' : 'running', total_found: total, last_error: null })
    .eq('id', bucketId);

  console.log(
    `[leads-import-prospectagram-csv] bucket=${bucketId} day=${day} received=${rawRecords.length} malformed=${malformed} inserted=${rows.length} dup=${duplicates} total=${total} final=${isFinal}`,
  );
  return json({
    ok: true, day, label, extraction_id: bucketId,
    received: rawRecords.length, malformed,
    inserted: rows.length, duplicates, total,
  });
});
