// _shared/ctwa-attribution.ts — parse do bloco `referral` que a Meta anexa à 1ª
// mensagem quando o lead vem de um anúncio Click-to-WhatsApp (CTWA).
//
// Funções PURAS: não tocam banco nem rede → unit-testáveis isoladamente, no
// mesmo espírito de agent-routing.ts (a captura de atribuição é o loop de sinal
// que faz o Ads otimizar — merece golden suite própria). O WRITER (grava lead /
// ads_attribution / jornada) vive no webhook, que tem o service client.
//
// Formato do referral (WhatsApp Cloud API, mensagem vinda de CTWA):
//   referral: { source_url, source_id, source_type, headline, body, media_type,
//               image_url, video_url, ctwa_clid }
//   — source_id é o ad_id da Meta; ctwa_clid é o click id (chave de atribuição).

export interface CtwaReferral {
  ctwa_clid: string | null;
  source_id: string | null; // ad_id da Meta
  source_type: string | null; // 'ad' | 'post'
  source_url: string | null;
  headline: string | null;
  body: string | null;
  media_type: string | null; // 'image' | 'video'
  image_url: string | null;
  video_url: string | null;
  raw: Record<string, unknown>;
}

const str = (v: unknown): string | null => {
  if (typeof v === 'string') {
    const t = v.trim();
    return t ? t : null;
  }
  return null;
};

/** Extrai o `referral` de uma mensagem da Cloud API. Retorna null quando a
 *  mensagem NÃO veio de anúncio (sem referral OU sem chave de atribuição) — o
 *  caminho orgânico segue 100% intocado. */
export function parseCtwaReferral(msg: Record<string, unknown> | null | undefined): CtwaReferral | null {
  if (!msg || typeof msg !== 'object') return null;
  const r = (msg as Record<string, unknown>)['referral'];
  if (!r || typeof r !== 'object') return null;
  const ref = r as Record<string, unknown>;
  // Referral CTWA legítimo tem ao menos ctwa_clid OU source_id (o ad_id).
  const ctwa_clid = str(ref['ctwa_clid']);
  const source_id = str(ref['source_id']);
  if (!ctwa_clid && !source_id) return null;
  return {
    ctwa_clid,
    source_id,
    source_type: str(ref['source_type']),
    source_url: str(ref['source_url']),
    headline: str(ref['headline']),
    body: str(ref['body']),
    media_type: str(ref['media_type']),
    image_url: str(ref['image_url']),
    video_url: str(ref['video_url']),
    raw: ref,
  };
}

/** UTM planos derivados do referral, p/ as colunas flat da lead (segmentação e
 *  relatório rápido no CRM). O dado RICO vai em lead.metadata.referral +
 *  ads_attribution; aqui só o suficiente pra filtrar. */
export function ctwaUtm(ref: CtwaReferral): Record<string, string> {
  const utm: Record<string, string> = { utm_source: 'meta', utm_medium: 'ctwa' };
  if (ref.source_id) utm.utm_campaign = ref.source_id; // ad_id da Meta
  if (ref.source_type) utm.utm_content = ref.source_type;
  if (ref.ctwa_clid) utm.utm_term = ref.ctwa_clid;
  return utm;
}

/** A Duda (MODO INBOUND) espelha o gancho do anúncio. Devolve um resumo curto e
 *  seguro do referral pra injetar no system prompt do brain — sem despejar o
 *  jsonb cru no LLM. Vazio → nada a espelhar. */
export function ctwaAdSummary(ref: CtwaReferral | null): string {
  if (!ref) return '';
  const parts: string[] = [];
  if (ref.headline) parts.push(`título "${ref.headline}"`);
  if (ref.body) parts.push(`texto "${ref.body}"`);
  if (!parts.length && ref.source_type) parts.push(`um ${ref.source_type}`);
  return parts.join(' · ');
}
