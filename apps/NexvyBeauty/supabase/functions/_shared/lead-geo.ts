// _shared/lead-geo.ts — Camadas de qualificação GEO + IDIOMA para o C9 (Instagram-first).
//
// Problema que resolve: a busca por keyword no IG traz o MUNDO (Polônia, Itália,
// Portugal…) e ruído de ICP. Estas primitivas separam o salão BR-de-beleza:
//   • classifyPhone  → decide a geografia do telefone SEM forjar +55
//                      (o normalizePhoneBR antigo prepend-a 55 em qualquer número
//                       de 10-11 dígitos → transformava Polônia/Itália em BR falso).
//   • detectBioLanguage → peneira grossa LUSÓFONA (mata não-português confiante).
//   • resolveGeoCountry → peneira fina BR (businessAddress / facebookPage / DDI / DDD).
//
// Nada aqui loga PII — só classifica.

// ── DDDs válidos no Brasil (Anatel) ─────────────────────────────────────────
const BR_DDD = new Set<number>([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

// DDIs estrangeiros reconhecidos (lusófonos primeiro — são o "desempate" que o
// idioma NÃO faz). Ordem por comprimento (match do mais específico primeiro).
const FOREIGN_DDI = [
  '351', // Portugal
  '244', // Angola
  '258', // Moçambique
  '238', // Cabo Verde
  '245', // Guiné-Bissau
  '239', // São Tomé e Príncipe
  '670', // Timor-Leste
  '971', '966', '972', '852', '853',
  '44', '48', '39', '34', '49', '33', '31', '32', '30', '40',
  '52', '54', '56', '57', '58',
  '64', '81', '82', '86', '90', '63', '62', '60', '66',
  '1', '7',
];

export type PhoneGeo = {
  e164: string | null; // BR: 55+DDD+9+8 (13 díg) ou 55+DDD+8 (12); estrangeiro: dígitos crus; null se lixo
  is_br: boolean;      // true SÓ quando plausivelmente brasileiro
  country: string | null; // 'BR' | DDI estrangeiro (ex '351') | null (indeterminado)
};

// Normaliza a parte NACIONAL brasileira (sem DDI) para DDD + (9) + 8 dígitos.
function normalizeBrNational(nat: string): string {
  let d = nat;
  if (d.length === 10) {
    const ddd = d.substring(0, 2);
    const rest = d.substring(2); // 8 dígitos
    // celular sem o 9: insere quando o assinante começa em 6-9.
    if (/^[6-9]/.test(rest)) d = ddd + '9' + rest;
  }
  return d; // 10 (fixo) ou 11 (celular)
}

/**
 * Classifica um telefone bruto decidindo a GEOGRAFIA — sem coagir a +55.
 * @param raw      substring do telefone (com pontuação/+/parênteses)
 * @param fromDDI  true quando a fonte garante DDI (link wa.me — spec exige país)
 */
export function classifyPhone(raw: string, fromDDI: boolean): PhoneGeo {
  const hadPlus = /^\s*(?:\+|00)/.test(raw);
  const d = String(raw).replace(/\D/g, '').replace(/^0+/, '');
  if (d.length < 8) return { e164: null, is_br: false, country: null };

  const explicitDDI = hadPlus || fromDDI;

  // A) DDI brasileiro explícito (55 + 12/13 díg) e DDD válido.
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const nat = d.substring(2);
    const ddd = parseInt(nat.substring(0, 2), 10);
    if (BR_DDD.has(ddd)) return { e164: '55' + normalizeBrNational(nat), is_br: true, country: 'BR' };
    // "55" na frente mas DDD inválido → não é BR de verdade.
    return { e164: d, is_br: false, country: null };
  }

  // B) DDI estrangeiro explícito → NÃO é BR (não força 55).
  if (explicitDDI) {
    for (const code of FOREIGN_DDI) {
      if (d.startsWith(code)) return { e164: d, is_br: false, country: code };
    }
    // Tem DDI mas não reconheço o código → estrangeiro indeterminado.
    return { e164: d, is_br: false, country: null };
  }

  // C) Sem DDI → número NACIONAL. Só é BR se o DDD for válido.
  if (d.length === 10 || d.length === 11) {
    const ddd = parseInt(d.substring(0, 2), 10);
    if (BR_DDD.has(ddd)) return { e164: '55' + normalizeBrNational(d), is_br: true, country: 'BR' };
    // DDD inválido e sem DDI → não dá pra afirmar BR; descarta.
    return { e164: null, is_br: false, country: null };
  }

  return { e164: null, is_br: false, country: null };
}

// wa.me / api.whatsapp.com → o número traz DDI por especificação.
const WA_LINK_RE =
  /(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=|whatsapp\.com\/send\/?\?phone=)(\+?\d[\d]{7,15})/gi;
// Telefone solto no texto (com/sem DDI/DDD/pontuação). O "+" é capturado no [0].
const LOOSE_PHONE_RE = /(\+?\d[\d\s().-]{7,18}\d)/g;

export type BestPhone = {
  telefone: string | null;   // E.164 BR quando is_br; senão null
  is_br: boolean;
  country: string | null;    // 'BR' | DDI estrangeiro | null
  phone_any: string | null;  // qualquer número achado (p/ dedup futuro c/ Maps), BR ou não
};

/**
 * Varre vários textos (bio + TODOS os links) e escolhe o melhor telefone.
 * Prioriza: (1) link wa.me BR, (2) número BR no texto, (3) qualquer número (não-BR)
 * só para `phone_any` (dedup) — mas `telefone`/`is_br` refletem só o caso brasileiro.
 */
export function extractBestPhone(texts: Array<string | null | undefined>): BestPhone {
  let firstAny: PhoneGeo | null = null;

  // 1) links wa.me primeiro (sinal mais forte de WhatsApp real).
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(WA_LINK_RE)) {
      const g = classifyPhone(m[1], true);
      if (g.is_br && g.e164) return { telefone: g.e164, is_br: true, country: 'BR', phone_any: g.e164 };
      if (!firstAny && g.e164) firstAny = g;
    }
  }
  // 2) número BR solto no texto.
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(LOOSE_PHONE_RE)) {
      const digits = m[0].replace(/\D/g, '');
      if (digits.length < 10) continue; // descarta ruído (datas, preços)
      const g = classifyPhone(m[0], false);
      if (g.is_br && g.e164) return { telefone: g.e164, is_br: true, country: 'BR', phone_any: g.e164 };
      if (!firstAny && g.e164) firstAny = g;
    }
  }
  return {
    telefone: null,
    is_br: false,
    country: firstAny?.country ?? null,
    phone_any: firstAny?.e164 ?? null,
  };
}

// ── Detecção de idioma (peneira grossa lusófona, com TOLERÂNCIA) ─────────────
// Marcadores fortes por idioma. PT é intencionalmente amplo (Brasil E Portugal —
// a separação BR-vs-PT é trabalho do GEO, não do idioma).
const PT_WORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'com', 'para', 'por', 'seu', 'sua', 'você', 'nós',
  'atendimento', 'beleza', 'cabelo', 'cabelos', 'unhas', 'sobrancelha', 'sobrancelhas',
  'agende', 'agenda', 'agendamento', 'horário', 'horarios', 'marque', 'marcar',
  'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo', 'rua', 'avenida',
  'estética', 'estetica', 'cabeleireira', 'cabeleireiro', 'maquiagem', 'depilação',
  'atendemos', 'clientes', 'nossa', 'nosso', 'aqui', 'realçar', 'tratamentos', 'saúde',
]);
const PL_WORDS = new Set(['w', 'na', 'dla', 'godzin', 'rezerwuj', 'paznokcie', 'włosy', 'twojego', 'oraz', 'się', 'jest', 'stworzone', 'miejsce', 'usługi']);
const IT_WORDS = new Set(['per', 'prenota', 'ora', 'unghie', 'capelli', 'bellezza', 'via', 'della', 'professionale', 'nostro', 'servizi']);
const EN_WORDS = new Set(['the', 'your', 'we', 'book', 'welcome', 'world', 'share', 'help', 'you', 'every', 'stylish', 'ideas', 'tips', 'trends', 'perfect', 'and']);
const NL_WORDS = new Set(['voor', 'jou', 'eigen', 'binnen', 'geen', 'van', 'het', 'een', 'vrij', 'blijft', 'zitten', 'kwaliteit']);

const PT_DIACRITICS = /[ãõáéíóúâêôàç]/i;
const PL_DIACRITICS = /[ąęłżźćńś]/i;

export type BioLang = 'pt' | 'other' | 'indeterminate';

/** Detecta o idioma da bio: 'pt' | 'other' (não-PT confiante) | 'indeterminate'. */
export function detectBioLanguage(text: string | null | undefined): BioLang {
  if (!text) return 'indeterminate';
  // Remove URLs, e emoji/símbolos (mantém letras latinas + diacríticos).
  const cleaned = text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .toLowerCase();
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length < 4) return 'indeterminate'; // curta demais / só emoji → passa (tolerância)

  let pt = 0, pl = 0, it = 0, en = 0, nl = 0;
  for (const w of words) {
    if (PT_WORDS.has(w)) pt++;
    if (PL_WORDS.has(w)) pl++;
    if (IT_WORDS.has(w)) it++;
    if (EN_WORDS.has(w)) en++;
    if (NL_WORDS.has(w)) nl++;
  }
  if (PT_DIACRITICS.test(text)) pt += 2;
  if (PL_DIACRITICS.test(text)) pl += 3; // diacrítico polonês é sinal fortíssimo de não-PT

  const other = Math.max(pl, it, en, nl);
  if (pt > 0 && pt >= other) return 'pt';
  if (other >= 2 && other > pt) return 'other';
  return 'indeterminate';
}

// ── Resolvedor de país (peneira fina → Brasil) ──────────────────────────────
export type GeoResolution = {
  country: string | null;     // 'BR' | DDI | país textual | null
  is_brazil: boolean;
  explicit_foreign: boolean;  // true quando há sinal estrangeiro EXPLÍCITO (≠ "sem sinal")
  signals: string[];          // quais sinais bateram (auditoria)
};

const BR_ADDRESS_HINTS = /(brasil|brazil)/i;
// Nome de país estrangeiro no endereço = sinal NEGATIVO forte (o city_name do
// actor traz o país nos estrangeiros: "Poznan, Poland", "Palermo, Italy"…).
const FOREIGN_COUNTRY = /(poland|polska|italy|italia|portugal|spain|espa[ñn]a|france|francia|netherlands|nederland|germany|deutschland|united kingdom|\buk\b|ireland|irlanda|angola|mo[çc]ambique|mozambique|cabo verde)/i;

/**
 * Combina os sinais de geografia disponíveis no item do IG + o telefone já
 * classificado. É BRASIL quando qualquer sinal forte aponta BR e nenhum aponta
 * estrangeiro com mais força.
 */
export function resolveGeoCountry(item: any, phone: BestPhone): GeoResolution {
  const signals: string[] = [];
  let brVotes = 0;
  let foreignVotes = 0;

  // 1) Telefone (DDI/DDD) — forte.
  if (phone.is_br) { brVotes++; signals.push('phone:+55'); }
  else if (phone.country) { foreignVotes++; signals.push(`phone:${phone.country}`); }

  // 2) facebookPage.country — forte quando presente.
  const fbCountry = String(item?.facebookPage?.country ?? '').trim().toUpperCase();
  if (fbCountry) {
    if (fbCountry === 'BR' || fbCountry === 'BRAZIL' || fbCountry === 'BRASIL') { brVotes += 2; signals.push('fb:BR'); }
    else { foreignVotes += 2; signals.push(`fb:${fbCountry}`); }
  }

  // 3) businessAddress — cidade/CEP quando presentes.
  const addr = item?.businessAddress ?? {};
  const zip = String(addr?.zip_code ?? '').replace(/\D/g, '');
  const cityBlob = `${addr?.city_name ?? ''} ${addr?.street_address ?? ''}`;
  if (FOREIGN_COUNTRY.test(cityBlob)) { foreignVotes += 2; signals.push('addr:foreign'); }
  else if (BR_ADDRESS_HINTS.test(cityBlob)) { brVotes++; signals.push('addr:BR'); }
  // CEP brasileiro tem 8 dígitos; Portugal usa 7 (NNNN-NNN), Polônia 5 (NN-NNN).
  if (zip.length === 8) { brVotes++; signals.push('zip:8'); }

  const is_brazil = brVotes > 0 && brVotes >= foreignVotes;
  const explicit_foreign = foreignVotes > 0 && !is_brazil;
  const country = is_brazil ? 'BR' : (phone.country ?? (fbCountry || null));
  return { country, is_brazil, explicit_foreign, signals };
}

// ── ICP (é salão/beleza? mata concessionária, salão-de-chá, etc.) ────────────
// Categoria claramente NÃO-beleza → reprova de cara.
const NONBEAUTY_CAT = /(car dealership|autom|ve[íi]c|vehicle|dealership|restaurant|food|real estate|imobil|hotel)/i;
// Categoria explicitamente de beleza → aprova.
const BEAUTY_CAT = /(hair|nail|beauty|salon|sal[aã]o|cosmetic|barber|spa|est[eé]tic|manicur|makeup|wax|skin|lash|brow)/i;
// Termo de beleza no texto livre (bio/nome/categoria) → aprova por conteúdo.
const BEAUTY_TERMS = /(sal[aã]o|salon|cabelo|cabeleire|hair|unhas?|nail|manicur|pedicur|est[eé]tic|beauty|beleza|lash|c[íi]lios|sobrancelha|brow|maquiag|makeup|depila[cç]|wax|podolog|barbe|alongamento|micropigment|design de sobrancelha|hidrata|progressiva|alisamento|mechas|balayage|esmalt|colora[cçt]|capilar|penteado|cut[íi]cula|selagem|botox capilar)/i;

export type IcpVerdict = { pass: boolean; reason: string };

/** Decide se o perfil é do ICP (salão/beleza). Exige SINAL POSITIVO de beleza. */
export function matchBeautyIcp(
  category: string | null | undefined,
  bio: string | null | undefined,
  name: string | null | undefined,
): IcpVerdict {
  const cat = category ?? '';
  if (NONBEAUTY_CAT.test(cat)) return { pass: false, reason: 'cat:nonbeauty' };
  if (BEAUTY_CAT.test(cat)) return { pass: true, reason: 'cat:beauty' };
  const blob = `${category ?? ''} ${bio ?? ''} ${name ?? ''}`;
  if (BEAUTY_TERMS.test(blob)) return { pass: true, reason: 'term:beauty' };
  return { pass: false, reason: 'no-beauty-signal' };
}

// ── INFOPRODUTO (curso/mentoria de beleza) → segmento afiliado, não salão ─────
// Sinais fortes de que o perfil VENDE conhecimento (é potencial afiliado com
// audiência), não presta serviço de salão. Conservador p/ não rotular salão como
// afiliado (ambos são mantidos, mas roteiam a funis diferentes).
const INFOPRODUTO_TERMS =
  /(\bcursos?\b|mentoria|\bmentora\b|te ensino|aprenda a|m[ée]todo\b|forma[cç][aã]o\b|alunas? formad|profissionais formad|\+\s?\d[\d.]*\s?(mil\s)?(alunas|profissionais)|torne-se|seja uma|masterclass|imers[aã]o|treinamento online)/i;
const INFOPRODUTO_LINK =
  /(kiwify|hotmart|eduzz|monetizze|kajabi|braip|ticto|cademi|greenn|sunize|pay\.kiwify|checkout)/i;

/** Detecta perfil de infoproduto (curso/mentoria de beleza). */
export function detectInfoproduto(
  bio: string | null | undefined,
  name: string | null | undefined,
  website: string | null | undefined,
): boolean {
  const blob = `${bio ?? ''} ${name ?? ''}`;
  if (INFOPRODUTO_TERMS.test(blob)) return true;
  if (website && INFOPRODUTO_LINK.test(website)) return true;
  return false;
}

// ── Classificador de SEGMENTO (ICP evoluiu de gate → classificador) ──────────
export type LeadSegment = 'salao_cliente' | 'afiliado_infoproduto' | 'revisao' | 'descarte';

export type SegmentResult = { segment: LeadSegment; qualified: boolean };

/**
 * Roteia o lead para 1 dos 4 baldes. `qualified` = pronto p/ contato de VENDA
 * (só salao_cliente com contato BR). Afiliado é MANTIDO mas não é "qualified de
 * venda" (funil de recrutamento, ativado quando o programa estiver 100% no código).
 * "Corta nada dentro do mercado BR-beleza": o beleza-sem-confirmação vira `revisao`,
 * não descarte. Descarte = só o que é claramente fora do mercado.
 */
export function classifyLeadSegment(opts: {
  icp: IcpVerdict;
  langPass: boolean;
  geo: GeoResolution;
  hasPhone: boolean;
  isInfoproduto: boolean;
}): SegmentResult {
  const { icp, langPass, geo, hasPhone, isInfoproduto } = opts;

  // 1) Fora do mercado (idioma não-PT confiante OU geografia estrangeira explícita).
  if (!langPass) return { segment: 'descarte', qualified: false };
  if (geo.explicit_foreign) return { segment: 'descarte', qualified: false };

  // 2) Infoproduto de beleza (BR/indeterminado) → afiliado (mantido; ativado depois).
  if (isInfoproduto) return { segment: 'afiliado_infoproduto', qualified: false };

  // 3) Sem sinal de beleza e sem ser infoproduto → fora do ICP → descarte.
  if (!icp.pass) return { segment: 'descarte', qualified: false };

  // 4) Beleza no universo BR: salão-cliente PRONTO precisa de BR confirmado + contato.
  if (geo.is_brazil && hasPhone) return { segment: 'salao_cliente', qualified: true };

  // 5) Beleza mas faltou confirmar BR ou contato → não descarta, TRIAGEM.
  return { segment: 'revisao', qualified: false };
}
