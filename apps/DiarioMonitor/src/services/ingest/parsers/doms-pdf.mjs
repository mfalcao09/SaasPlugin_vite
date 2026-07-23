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

// Domínio real dos PDFs — usado tanto no fallback de regex quanto para
// validar as URLs extraídas do payload RSC (defesa contra objeto malformado
// apontando para fora do portal oficial).
const DOMINIO_ARQUIVO = 'https://assets.imprensaoficial.ms.gov.br/';

// ----------------------------------------------------------------------------
// Caminho principal: ler os objetos JSON do payload RSC do Next.js.
//
// O índice (`https://www.diariooficial.ms.gov.br/`) é Next.js/App Router e
// devolve, embutido no HTML, o payload React Server Components com os
// registros estruturados da edição (docs/FONTES-endpoints-e-extracao.md §5):
//
//   {"id":49697,"descricao":"Diário Oficial Eletrônico n. 12.229",
//    "dataPublicacao":"22/07/2026 07:30:00","nomeArquivo":"DO12229_22_07_2026",
//    "numero":12229,"dataInclusao":"21/07/2026 08:29:58","suspenso":false,
//    "caminhoArquivo":"https://assets.imprensaoficial.ms.gov.br/…/DO12229_…pdf"}
//
// Suplementos trazem ainda "diarioId" (aponta a edição-mãe pelo id_fonte
// dela) e "numeroSuplemento". O RSC pode embutir esse JSON cru ou escapado
// dentro de uma string JS (`self.__next_f.push([1,"...\"id\":49697..."])`) —
// tentamos as duas formas antes de desistir do objeto.
// ----------------------------------------------------------------------------

// Bloco "flat" (sem chaves aninhadas) — todo campo dos registros do índice é
// string/number/boolean, então não há necessidade de um parser de chaves
// balanceadas: basta casar de `{` até o primeiro `}` não escapado.
const RE_OBJETO_CANDIDATO = /\{(?:[^{}\\]|\\.)*\}/g;

function tentarParsearObjeto(bruto) {
  try {
    return JSON.parse(bruto);
  } catch {
    // Fallback: o payload pode estar escapado como string JS
    // (\" em vez de ", \\ em vez de \) — desescapa um nível e tenta de novo.
    try {
      return JSON.parse(bruto.replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
    } catch {
      return null;
    }
  }
}

/** "DD/MM/AAAA HH:mm:ss" -> "AAAA-MM-DD" (só a data, para `data_publicacao`). */
function converterSoData(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(str ?? ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * "DD/MM/AAAA HH:mm:ss" -> "AAAA-MM-DDTHH:mm:ss" (ISO, sem timezone).
 * A fonte não informa fuso horário — decisão de modelagem: gravamos o
 * horário local tal como a fonte o expõe, sem inventar um offset.
 */
// Mato Grosso do Sul opera em UTC-04:00 o ano inteiro (o horário de verão
// brasileiro foi extinto pelo Decreto 9.772/2019 — não há troca sazonal).
const FUSO_MS = '-04:00';

/**
 * "21/07/2026 08:29:58" → "2026-07-21T08:29:58-04:00"
 *
 * O offset é EXPLÍCITO de propósito. A fonte publica horário local de MS sem
 * fuso; gravar esse valor "solto" numa coluna timestamptz faz o Postgres
 * aplicar o fuso da sessão — tipicamente UTC no servidor. O resultado seria
 * um deslocamento de 4 horas e, para publicações noturnas, a DATA erraria em
 * um dia inteiro (21/07 22:30 em MS = 22/07 02:30 em UTC).
 */
function converterDataHora(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(String(str ?? ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}${FUSO_MS}` : null;
}

/**
 * Extrai do HTML os objetos do payload RSC que descrevem edições
 * (identificados pela presença do campo `dataPublicacao`), deduplicados
 * por `id`.
 */
function extrairObjetosPayload(html) {
  const vistos = new Set();
  const objetos = [];
  for (const bruto of html.match(RE_OBJETO_CANDIDATO) ?? []) {
    if (!bruto.includes('dataPublicacao')) continue;
    const obj = tentarParsearObjeto(bruto);
    if (!obj || obj.id === undefined || obj.id === null || !obj.dataPublicacao) continue;
    const chave = String(obj.id);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    objetos.push(obj);
  }
  return objetos;
}

/** Converte 1 objeto do payload no formato de edição do contrato §5.1. */
function converterObjetoParaEdicao(obj) {
  const data_publicacao = converterSoData(obj.dataPublicacao);
  const url_original = typeof obj.caminhoArquivo === 'string' ? obj.caminhoArquivo : null;
  if (!data_publicacao || !url_original || !url_original.startsWith(DOMINIO_ARQUIVO)) {
    return null; // objeto malformado ou fora do domínio oficial — descartado, não inventado
  }
  const numeroSuplemento =
    typeof obj.numeroSuplemento === 'number' ? obj.numeroSuplemento : null;

  return {
    fonte: SIGLA,
    numero: String(obj.numero ?? ''),
    data_publicacao,                 // ISO AAAA-MM-DD
    suplemento: numeroSuplemento,    // nome de campo legado (consumido por scripts/ingest*.mjs)
    url_original,

    // ---- campos novos da fonte (docs/FONTES-endpoints-e-extracao.md §5) ----
    id_fonte: String(obj.id),
    suspenso: Boolean(obj.suspenso),
    descricao: typeof obj.descricao === 'string' ? obj.descricao : null,
    data_inclusao: converterDataHora(obj.dataInclusao),
    numero_suplemento: numeroSuplemento,
    // id_fonte da edição-mãe (não o uuid interno — resolvido no insert em
    // `edicoes`, que é quem sabe o uuid correspondente a este id_fonte).
    edicao_pai_id_fonte:
      obj.diarioId !== undefined && obj.diarioId !== null ? String(obj.diarioId) : null,
  };
}

// ----------------------------------------------------------------------------
// Fallback: regex sobre a URL do PDF (comportamento original do parser).
// Usado só quando o payload RSC não devolve nenhum objeto reconhecível —
// ex.: a fonte mudou de formato e a extração estruturada quebrou. Não tem os
// campos novos (a URL sozinha não os carrega), mas mantém a ingestão viva.
// ----------------------------------------------------------------------------
const RE_PDF =
  /https:\/\/assets\.imprensaoficial\.ms\.gov\.br\/public\/prd\/Diario%20Oficial\/(\d{4})\/(\d{2})\/(\d{2})\/DO(\d+)_\d{2}_\d{2}_\d{4}(?:_SUP_(\d+))?\.pdf/g;

function extrairViaFallbackUrl(html) {
  const vistos = new Set();
  const edicoes = [];
  for (const m of html.matchAll(RE_PDF)) {
    const [url, ano, mes, dia, numero, sup] = m;
    if (vistos.has(url)) continue;
    vistos.add(url);

    edicoes.push({
      fonte: SIGLA,
      numero,
      data_publicacao: `${ano}-${mes}-${dia}`,
      suplemento: sup ? Number(sup) : null,
      url_original: url,
      // campos novos ausentes neste caminho — não inventados (regra do PRD)
      id_fonte: null,
      suspenso: false,
      descricao: null,
      data_inclusao: null,
      numero_suplemento: sup ? Number(sup) : null,
      edicao_pai_id_fonte: null,
    });
  }
  return edicoes;
}

/**
 * Lê o índice público e devolve as edições disponíveis.
 * @param {{limite?: number, desde?: string}} opts  desde = 'AAAA-MM-DD'
 * @returns {Promise<Array<{fonte:string,numero:string,data_publicacao:string,
 *   suplemento:number|null,url_original:string,id_fonte:string|null,
 *   suspenso:boolean,descricao:string|null,data_inclusao:string|null,
 *   numero_suplemento:number|null,edicao_pai_id_fonte:string|null}>>}
 */
export async function descobrir(opts = {}) {
  const { limite = 50, desde = null } = opts;

  const resp = await fetch(INDICE, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error(`DOMS: índice respondeu HTTP ${resp.status}`);

  const html = await resp.text();

  const objetos = extrairObjetosPayload(html);
  const viaPayload = objetos
    .map(converterObjetoParaEdicao)
    .filter((e) => e !== null);

  // Só cai no fallback se a extração estruturada não achou NADA — se achou
  // alguns objetos válidos, é o formato normal e confiamos nele.
  const edicoes = viaPayload.length > 0 ? viaPayload : extrairViaFallbackUrl(html);

  const vistos = new Set();
  const unicas = [];
  for (const ed of edicoes) {
    if (vistos.has(ed.url_original)) continue;
    vistos.add(ed.url_original);
    if (desde && ed.data_publicacao < desde) continue;
    unicas.push(ed);
  }

  // Mais recente primeiro; principal antes dos suplementos do mesmo dia.
  unicas.sort(
    (a, b) =>
      b.data_publicacao.localeCompare(a.data_publicacao) ||
      Number(a.suplemento ?? -1) - Number(b.suplemento ?? -1),
  );

  return unicas.slice(0, limite);
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
