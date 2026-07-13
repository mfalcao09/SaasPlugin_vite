// _shared/apify-leads.ts
//
// Helpers do motor C9 (extração de leads Instagram-first). Compartilhado entre
// `leads-extraction-start` (dispara o run) e `leads-extraction-webhook` (baixa o
// dataset e normaliza o card).
//
// Actor escolhido: apify/instagram-scraper (id shu8hvrXbJbY3Eb9W) — oficial Apify,
// 99.6% sucesso, PAY_PER_EVENT (~US$0.0027/result FREE → US$0.0005 DIAMOND).
// Busca perfis por PALAVRA-CHAVE (search + searchType='user') e devolve os detalhes
// do perfil (resultsType='details': biography, followersCount, externalUrl, verified,
// private, businessCategoryName...). Verificado via Apify MCP em 2026-07-12.
//
// Segurança: APIFY_TOKEN só vive em env (Function secret), NUNCA no frontend.
// Nunca logar PII (nome/telefone/bio) — só contagens.

import {
  extractBestPhone,
  detectBioLanguage,
  resolveGeoCountry,
  matchBeautyIcp,
  detectInfoproduto,
  classifyLeadSegment,
  type BioLang,
  type IcpVerdict,
  type LeadSegment,
} from './lead-geo.ts';

export const APIFY_API_BASE = 'https://api.apify.com/v2';

// apify/instagram-scraper — keyword → profile details.
export const IG_ACTOR_ID = 'shu8hvrXbJbY3Eb9W';

export function getApifyToken(): string {
  const t = Deno.env.get('APIFY_TOKEN');
  if (!t) throw new Error('APIFY_TOKEN not configured');
  return t;
}

// ── Apify REST ───────────────────────────────────────────────────────────────

export interface IgActorInput {
  search: string;
  searchType: 'user';
  resultsType: 'details';
  searchLimit: number;
}

export interface StartRunResult {
  runId: string;
  datasetId: string | null;
  status: string | null;
}

/**
 * Dispara o run do actor de forma ASSÍNCRONA (POST /v2/acts/<id>/runs) e registra
 * um webhook ad-hoc (base64 do array JSON) para SUCCEEDED/FAILED/TIMED_OUT/ABORTED
 * apontando para `webhookUrl`. Retorna o run id + dataset default.
 * Docs: https://docs.apify.com/integrations/webhooks/ad-hoc-webhooks
 */
export async function startIgActorRun(
  input: IgActorInput,
  webhookUrl: string,
  token: string,
): Promise<StartRunResult> {
  const webhooks = [
    {
      eventTypes: [
        'ACTOR.RUN.SUCCEEDED',
        'ACTOR.RUN.FAILED',
        'ACTOR.RUN.TIMED_OUT',
        'ACTOR.RUN.ABORTED',
      ],
      requestUrl: webhookUrl,
    },
  ];
  const webhooksB64 = btoa(JSON.stringify(webhooks));
  const url =
    `${APIFY_API_BASE}/acts/${IG_ACTOR_ID}/runs` +
    `?token=${encodeURIComponent(token)}&webhooks=${encodeURIComponent(webhooksB64)}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const bodyText = await resp.text();
  if (!resp.ok) {
    throw new Error(`Apify run start failed (${resp.status}): ${bodyText.slice(0, 300)}`);
  }
  let parsed: any;
  try {
    parsed = JSON.parse(bodyText);
  } catch (_) {
    throw new Error('Apify run start: resposta não-JSON');
  }
  const data = parsed?.data ?? {};
  if (!data.id) throw new Error('Apify run start: sem run id na resposta');
  return {
    runId: String(data.id),
    datasetId: data.defaultDatasetId ? String(data.defaultDatasetId) : null,
    status: data.status ? String(data.status) : null,
  };
}

/** Baixa os itens do dataset de um run (GET /v2/datasets/<id>/items). */
export async function fetchDatasetItems(datasetId: string, token: string): Promise<any[]> {
  const url =
    `${APIFY_API_BASE}/datasets/${encodeURIComponent(datasetId)}/items` +
    `?clean=true&format=json&token=${encodeURIComponent(token)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Apify dataset fetch failed (${resp.status}): ${t.slice(0, 300)}`);
  }
  const items = await resp.json();
  return Array.isArray(items) ? items : [];
}

// ── Normalização do card (espelha o card do prospectagram) ──────────────────

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// CNPJ: 00.000.000/0000-00 (com ou sem máscara).
const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const firstString = (...vals: unknown[]): string | null => {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
};
const firstBool = (...vals: unknown[]): boolean | null => {
  for (const v of vals) {
    if (typeof v === 'boolean') return v;
  }
  return null;
};

export interface LeadCard {
  handle: string | null;
  name: string | null;
  primeiro_nome: string | null;
  seguidores: number | null;
  seguindo: number | null;
  posts: number | null;
  telefone: string | null;
  whatsapp_link: string | null;
  email: string | null;
  instagram_url: string | null;
  website: string | null;
  categoria: string | null;
  cnpj: { value: string; source: string } | null;
  is_verified: boolean | null;
  is_private: boolean | null;
  bio: string | null;
  is_business: boolean | null;
  phone_is_br: boolean;        // true quando o telefone é plausivelmente brasileiro
  phone_country: string | null; // 'BR' | DDI estrangeiro | null
}

/**
 * Mapeia um item bruto do apify/instagram-scraper (resultsType=details) para o
 * card do prospectagram. Defensivo quanto a variação de nomes de campo (o actor
 * não publica outputSchema; nomes canônicos IG: username/fullName/biography/
 * followersCount/followsCount/postsCount/externalUrl/verified/private/
 * isBusinessAccount/businessCategoryName). Extrai telefone/email/cnpj do BIO
 * + website + campos de contato de negócio quando presentes.
 */
export function buildLeadCard(item: any): LeadCard {
  const handleRaw = firstString(item?.username, item?.ownerUsername, item?.handle);
  const handle = handleRaw ? handleRaw.replace(/^@/, '') : null;

  const name = firstString(item?.fullName, item?.full_name, item?.name);
  const primeiro_nome = name ? name.split(/\s+/)[0] : null;

  const bio = firstString(item?.biography, item?.bio, item?.description);

  // TODOS os links externos (varredura de telefone/wa.me — não só o [0]).
  const externalUrlsArr: string[] = Array.isArray(item?.externalUrls)
    ? item.externalUrls
        .map((u: any) => (typeof u === 'string' ? u : u?.url))
        .filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
    : [];
  const allLinks: string[] = [
    item?.externalUrl,
    item?.external_url,
    item?.website,
    item?.externalUrlShimmed,
    ...externalUrlsArr,
  ].filter((x: unknown): x is string => typeof x === 'string' && x.length > 0);

  const website = firstString(
    item?.externalUrl,
    item?.external_url,
    item?.website,
    externalUrlsArr[0] ?? null,
  );

  const instagram_url = firstString(item?.url, item?.profileUrl) ||
    (handle ? `https://www.instagram.com/${handle}/` : null);

  const categoria = firstString(
    item?.businessCategoryName,
    item?.categoryName,
    item?.category,
  );

  const is_verified = firstBool(item?.verified, item?.isVerified, item?.is_verified);
  const is_private = firstBool(item?.private, item?.isPrivate, item?.is_private);
  const businessFlag = firstBool(item?.isBusinessAccount, item?.is_business_account);
  const is_business = businessFlag !== null ? businessFlag : (categoria !== null ? true : null);

  // Telefone: contato de negócio + BIO + TODOS os links. classifyPhone decide a
  // geografia SEM forjar +55 (Polônia/Itália não viram BR falso; wa.me priorizado).
  const bizPhone = firstString(
    item?.businessPhoneNumber,
    item?.public_phone_number,
    item?.contactPhoneNumber,
    item?.phone,
  );
  const phone = extractBestPhone([bizPhone, bio, ...allLinks]);
  const telefone = phone.telefone;

  // Email: campo de negócio, senão do BIO.
  const bizEmail = firstString(item?.businessEmail, item?.public_email, item?.email);
  const emailFromBio = bio ? (bio.match(EMAIL_RE)?.[0] ?? null) : null;
  const email = bizEmail || emailFromBio;

  // CNPJ: procura no BIO (dado público que salão às vezes expõe).
  let cnpj: { value: string; source: string } | null = null;
  const cnpjMatch = bio ? bio.match(CNPJ_RE) : null;
  if (cnpjMatch) cnpj = { value: cnpjMatch[0], source: 'bio' };

  return {
    handle,
    name,
    primeiro_nome,
    seguidores: num(item?.followersCount ?? item?.followers ?? item?.followersCountNum),
    seguindo: num(item?.followsCount ?? item?.following ?? item?.followingCount),
    posts: num(item?.postsCount ?? item?.mediaCount ?? item?.igtvVideoCount),
    telefone,
    whatsapp_link: telefone ? `https://wa.me/${telefone}` : null,
    email,
    instagram_url,
    website,
    categoria,
    cnpj,
    is_verified,
    is_private,
    bio,
    is_business,
    phone_is_br: phone.is_br,
    phone_country: phone.country,
  };
}

// ── Qualificação por camadas (C9 F1) ────────────────────────────────────────
// AND das 4 camadas: ICP (beleza) · idioma (lusófono, tolerante) · GEO (Brasil) ·
// telefone acionável. Guarda o veredito de cada camada p/ auditar precisão.
// Limiar de SEMENTE (is_seed) — hub de beleza com audiência p/ minerar (Nível 3).
// Start conservador (anti-explosão da recursão); baixa pós-governador de orçamento.
const SEED_FOLLOWERS_MIN = 50_000;

export type LeadQualification = {
  qualified: boolean;          // pronto p/ contato de VENDA (só salao_cliente)
  segment: LeadSegment;        // salao_cliente | afiliado_infoproduto | revisao | descarte
  is_seed: boolean;            // hub de beleza (≥50k seg.) → dispara mineração do Nível 3
  is_infoproduto: boolean;
  phone_is_br: boolean;
  geo_country: string | null;
  bio_lang: BioLang;
  filter_verdicts: {
    icp: IcpVerdict;
    lang: { verdict: BioLang; pass: boolean };
    geo: { is_brazil: boolean; explicit_foreign: boolean; signals: string[] };
    phone: { has_br_phone: boolean };
    infoproduto: boolean;
  };
};

export function qualifyLead(item: any, card: LeadCard): LeadQualification {
  const icp = matchBeautyIcp(card.categoria, card.bio, card.name);
  const lang = detectBioLanguage(card.bio);
  const langPass = lang === 'pt' || lang === 'indeterminate'; // tolerância: só não-PT confiante cai
  const geo = resolveGeoCountry(item, {
    telefone: card.telefone,
    is_br: card.phone_is_br,
    country: card.phone_country,
    phone_any: card.telefone,
  });
  const phonePass = !!card.telefone;
  const isInfoproduto = detectInfoproduto(card.bio, card.name, card.website);
  const seg = classifyLeadSegment({ icp, langPass, geo, hasPhone: phonePass, isInfoproduto });
  // Semente: hub de beleza com audiência (≥50k) e dentro do mercado (não descarte).
  const isSeed = (card.seguidores ?? 0) >= SEED_FOLLOWERS_MIN && seg.segment !== 'descarte';
  return {
    qualified: seg.qualified,
    segment: seg.segment,
    is_seed: isSeed,
    is_infoproduto: isInfoproduto,
    phone_is_br: card.phone_is_br,
    geo_country: geo.country,
    bio_lang: lang,
    filter_verdicts: {
      icp,
      lang: { verdict: lang, pass: langPass },
      geo: { is_brazil: geo.is_brazil, explicit_foreign: geo.explicit_foreign, signals: geo.signals },
      phone: { has_br_phone: phonePass },
      infoproduto: isInfoproduto,
    },
  };
}
