// ============================================================================
// Parser da fonte DOMS — Diário Oficial do Estado de Mato Grosso do Sul
// parser_key: 'doms-pdf'   ·   modo_acesso: 'scrape'   (PRD v2.1 §5.1)
//
// CONTRATO (§5.1) — todo parser exporta:
//   descobrir(opts)          -> Promise<Edicao[]>   fase de ingestão  (C0.4)
//   baixar(edicao)           -> Promise<{buffer}>   download cru      (C0.4)
//   extrair(edicao, buffer)  -> Resultado           fase de extração  (C1.2)
//
// Adicionar uma fonte nova = criar um módulo destes + 1 linha em
// `fontes_diarios`. NENHUM arquivo existente é editado.
// ============================================================================

export const SIGLA = 'DOMS';
export const PARSER_KEY = 'doms-pdf';
export const MODO_ACESSO = 'scrape';

const INDICE = 'https://www.diariooficial.ms.gov.br/';

// User-Agent identificado: a trava nº 1 do PRD exige acesso rastreável e
// educado a portal público. Nada de mascarar o cliente.
export const USER_AGENT =
  'DiarioMonitor/0.1 (+contato: tecnologia@nexvy.tech) ingestao-institucional';

// Uma data pode ter MAIS DE UMA edição (ex.: 2026-07-20 → DO12226 e DO12227)
// e cada edição pode ter suplementos (_SUP_1, _SUP_2). Derivar o número a
// partir da data perderia suplementos silenciosamente — daí o índice ser
// obrigatório. Ver §5.1 do PRD.
const RE_PDF =
  /https:\/\/assets\.imprensaoficial\.ms\.gov\.br\/public\/prd\/Diario%20Oficial\/(\d{4})\/(\d{2})\/(\d{2})\/DO(\d+)_\d{2}_\d{2}_\d{4}(?:_SUP_(\d+))?\.pdf/g;

/**
 * Lê o índice público e devolve as edições disponíveis.
 * @param {{limite?: number, desde?: string}} opts  desde = 'AAAA-MM-DD'
 * @returns {Promise<Array<{fonte:string,numero:string,data_publicacao:string,
 *                          suplemento:number|null,url_original:string}>>}
 */
export async function descobrir(opts = {}) {
  const { limite = 50, desde = null } = opts;

  const resp = await fetch(INDICE, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error(`DOMS: índice respondeu HTTP ${resp.status}`);

  const html = await resp.text();
  const vistos = new Set();
  const edicoes = [];

  for (const m of html.matchAll(RE_PDF)) {
    const [url, ano, mes, dia, numero, sup] = m;
    if (vistos.has(url)) continue;
    vistos.add(url);

    const data = `${ano}-${mes}-${dia}`;
    if (desde && data < desde) continue;

    edicoes.push({
      fonte: SIGLA,
      numero,                                 // '12229'
      data_publicacao: data,                  // ISO AAAA-MM-DD
      suplemento: sup ? Number(sup) : null,   // null = edição principal
      url_original: url,
    });
  }

  // Mais recente primeiro; principal antes dos suplementos do mesmo dia.
  edicoes.sort(
    (a, b) =>
      b.data_publicacao.localeCompare(a.data_publicacao) ||
      Number(a.suplemento ?? -1) - Number(b.suplemento ?? -1),
  );

  return edicoes.slice(0, limite);
}

/**
 * Identificador estável da edição — nome da fixture e chave natural de
 * `edicoes(fonte_id, data_publicacao, numero)`.
 */
export function identificador(ed) {
  return ed.suplemento
    ? `${SIGLA}-${ed.data_publicacao}-${ed.numero}-SUP${ed.suplemento}`
    : `${SIGLA}-${ed.data_publicacao}-${ed.numero}`;
}

/**
 * Baixa o PDF cru. O arquivo é salvo ANTES de qualquer parsing: se a extração
 * falhar, reprocessa do disco sem rebaixar do portal (anexo do PRD).
 * @returns {Promise<{buffer:Uint8Array, bytes:number, contentType:string}>}
 */
export async function baixar(edicao) {
  const resp = await fetch(edicao.url_original, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf' },
    redirect: 'follow',
  });
  if (!resp.ok) {
    throw new Error(`DOMS: download HTTP ${resp.status} — ${edicao.url_original}`);
  }
  const buffer = new Uint8Array(await resp.arrayBuffer());
  const contentType = resp.headers.get('content-type') ?? '';

  // %PDF = 37,80,68,70 — valida o conteúdo, não só o content-type.
  const assinatura = buffer.subarray(0, 4).join(',');
  if (!contentType.includes('pdf') && assinatura !== '37,80,68,70') {
    throw new Error(`DOMS: conteúdo não é PDF (content-type=${contentType})`);
  }
  return { buffer, bytes: buffer.byteLength, contentType };
}

/**
 * Fase de extração — implementada no card C1.2, contra gabarito validado.
 * Declarada aqui para fixar o contrato do §5.1.
 */
export async function extrair() {
  throw new Error(
    'DOMS.extrair(): não implementado — card C1.2 (exige gabarito validado, HITL-1)',
  );
}

export default { SIGLA, PARSER_KEY, MODO_ACESSO, descobrir, identificador, baixar, extrair };
