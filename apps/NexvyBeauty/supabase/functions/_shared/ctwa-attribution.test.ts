// ctwa-attribution.test.ts — SMOKE do parse de atribuição CTWA (G1).
//
// Golden suite das funções PURAS de _shared/ctwa-attribution.ts. Prova, sem
// deploy e sem banco, as garantias do gap G1 do blueprint:
//   (1) mensagem vinda de anúncio (referral) rende ctwa_clid/source_id/headline;
//   (2) mensagem ORGÂNICA (sem referral) → null (caminho intocado, sem regressão);
//   (3) referral malformado (sem chave de atribuição) → null (não polui o CRM).
// Roda: deno test supabase/functions/_shared/ctwa-attribution.test.ts

import { ctwaAdSummary, ctwaUtm, parseCtwaReferral } from './ctwa-attribution.ts';

function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} — esperado ${e}, veio ${a}`);
}

// Fixture: mensagem CTWA completa (formato Cloud API).
const msgCtwa = {
  id: 'wamid.ABC',
  from: '5585999998888',
  type: 'text',
  text: { body: 'oi, vim do anúncio' },
  referral: {
    source_url: 'https://fb.me/xyz',
    source_id: '120210000000012345', // ad_id da Meta
    source_type: 'ad',
    headline: 'Tinha R$ 4.200 parados no meu WhatsApp',
    body: 'Descubra quanto tá parado no seu — de graça.',
    media_type: 'video',
    image_url: null,
    video_url: 'https://video.fb/abc',
    ctwa_clid: 'AbCdEf123456',
  },
};

// Fixture: mensagem ORGÂNICA (sem referral) — o caminho que NÃO pode regredir.
const msgOrganica = { id: 'wamid.ORG', from: '5511988887777', type: 'text', text: { body: 'oi' } };

Deno.test('parseCtwaReferral — anúncio: extrai todos os campos do referral', () => {
  const r = parseCtwaReferral(msgCtwa);
  eq(r?.ctwa_clid, 'AbCdEf123456', 'ctwa_clid');
  eq(r?.source_id, '120210000000012345', 'source_id (ad_id)');
  eq(r?.source_type, 'ad', 'source_type');
  eq(r?.headline, 'Tinha R$ 4.200 parados no meu WhatsApp', 'headline');
  eq(r?.body, 'Descubra quanto tá parado no seu — de graça.', 'body');
  eq(r?.media_type, 'video', 'media_type');
  eq(r?.video_url, 'https://video.fb/abc', 'video_url');
  eq(r?.image_url, null, 'image_url vazio → null');
  eq(typeof r?.raw, 'object', 'raw preserva o objeto inteiro');
});

Deno.test('parseCtwaReferral — orgânica (sem referral) → null (SEM regressão)', () => {
  eq(parseCtwaReferral(msgOrganica), null, 'mensagem normal não vira CTWA');
  eq(parseCtwaReferral(null), null, 'null → null');
  eq(parseCtwaReferral(undefined), null, 'undefined → null');
  eq(parseCtwaReferral({}), null, 'objeto vazio → null');
});

Deno.test('parseCtwaReferral — referral malformado (sem clid nem source_id) → null', () => {
  eq(parseCtwaReferral({ referral: { headline: 'só título, sem ids' } }), null, 'sem clid/source_id → null');
  eq(parseCtwaReferral({ referral: { ctwa_clid: 'x' } })?.ctwa_clid, 'x', 'só ctwa_clid é válido');
  eq(parseCtwaReferral({ referral: { source_id: 'ad1' } })?.source_id, 'ad1', 'só source_id é válido');
  eq(parseCtwaReferral({ referral: { ctwa_clid: '  ', source_id: '' } }), null, 'strings vazias → null');
});

Deno.test('ctwaUtm — mapeia referral → colunas flat da lead', () => {
  const utm = ctwaUtm(parseCtwaReferral(msgCtwa)!);
  eq(utm.utm_source, 'meta', 'utm_source=meta');
  eq(utm.utm_medium, 'ctwa', 'utm_medium=ctwa');
  eq(utm.utm_campaign, '120210000000012345', 'utm_campaign=ad_id');
  eq(utm.utm_content, 'ad', 'utm_content=source_type');
  eq(utm.utm_term, 'AbCdEf123456', 'utm_term=ctwa_clid');
});

Deno.test('ctwaAdSummary — resumo seguro do gancho pra Duda espelhar', () => {
  const s = ctwaAdSummary(parseCtwaReferral(msgCtwa));
  eq(s.includes('Tinha R$ 4.200'), true, 'inclui o headline');
  eq(ctwaAdSummary(null), '', 'null → string vazia');
  eq(ctwaAdSummary(parseCtwaReferral({ referral: { source_id: 'ad1', source_type: 'ad' } })), 'um ad', 'sem headline/body → tipo');
});
