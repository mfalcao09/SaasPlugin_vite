// ============================================================================
// Parser da fonte DJMS — Diário da Justiça de Mato Grosso do Sul (e-SAJ)
// parser_key: 'djms-esaj'   ·   modo_acesso: 'scrape'   (PRD v2.1 §5)
//
// Ver docs/DESCOBERTA-C0.8-esaj-tjms.md (com ERRATA).
//
// O reCAPTCHA do e-SAJ protege a CONSULTA AVANÇADA (busca por palavra-chave),
// que NÃO usamos. O download do caderno por data é GET aberto, sem sessão.
// Nenhum controle de acesso é contornado aqui.
//
// ESCOPO: apenas o Caderno 1 (Administrativo) — onde ficam os atos normativos
// do Tribunal. Cadernos 2/3 são judiciais e estão fora do escopo declarado do
// produto (§2.3); não são baixados.
// ============================================================================

export const SIGLA = 'DJMS';
export const PARSER_KEY = 'djms-esaj';
export const MODO_ACESSO = 'scrape';

const BASE = 'https://esaj.tjms.jus.br/cdje';

/** Caderno 1 = Administrativo. Ver §2 do doc de descoberta. */
export const CADERNO_ADMINISTRATIVO = 1;

export const USER_AGENT =
  'DiarioMonitor/0.1 (+contato: tecnologia@nexvy.tech) ingestao-institucional';

const zero = (n) => String(n).padStart(2, '0');

/** ISO 'AAAA-MM-DD' → 'DD/MM/AAAA' (formato que o e-SAJ espera). */
function paraFormatoESaj(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** Gera as N últimas datas ÚTEIS (seg–sex) a partir de `ate`, em ISO. */
export function datasUteis(quantidade, ate = new Date()) {
  const saida = [];
  const cursor = new Date(ate.getTime());
  while (saida.length < quantidade) {
    const dia = cursor.getDay();
    if (dia !== 0 && dia !== 6) {
      saida.push(
        `${cursor.getFullYear()}-${zero(cursor.getMonth() + 1)}-${zero(cursor.getDate())}`,
      );
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return saida;
}

/**
 * A resposta de getListaDeCadernos.do é um *object literal* JS, não JSON:
 * chaves sem aspas e strings com aspas simples. JSON.parse falha nela.
 * Normaliza antes de parsear — sem eval.
 */
export function parsearListaDeCadernos(texto) {
  const normalizado = texto
    .trim()
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')      // chaves
    .replace(/:\s*'([^']*)'/g, (_, v) => `: ${JSON.stringify(v)}`);    // strings
  return JSON.parse(normalizado);
}

/**
 * Descobre as edições disponíveis nas últimas datas úteis.
 * @param {{limite?: number, datas?: string[]}} opts  datas em ISO 'AAAA-MM-DD'
 */
export async function descobrir(opts = {}) {
  const { limite = 10 } = opts;
  const datas = opts.datas ?? datasUteis(limite);
  const edicoes = [];

  for (const iso of datas) {
    const url =
      `${BASE}/getListaDeCadernos.do?dtDiario=${encodeURIComponent(paraFormatoESaj(iso))}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, text/plain, */*' },
    });
    if (!resp.ok) continue;   // dia sem edição (feriado/recesso) → segue

    let cadernos;
    try {
      cadernos = parsearListaDeCadernos(await resp.text());
    } catch {
      continue;               // resposta inesperada: não inventa dado
    }

    const admin = cadernos.find((c) => Number(c.cdCaderno) === CADERNO_ADMINISTRATIVO);
    if (!admin) continue;

    edicoes.push({
      fonte: SIGLA,
      numero: String(admin.nuDiario),   // ex.: '5912' — vem da fonte, não derivado
      data_publicacao: iso,             // ISO AAAA-MM-DD
      caderno: CADERNO_ADMINISTRATIVO,
      volume: admin.cdVolume ?? null,
      suplemento: null,                 // o e-SAJ não expõe suplemento nesta rota
      url_original:
        `${BASE}/downloadCaderno.do?dtDiario=${encodeURIComponent(paraFormatoESaj(iso))}` +
        `&cdCaderno=${CADERNO_ADMINISTRATIVO}`,
    });
  }

  return edicoes.sort((a, b) => b.data_publicacao.localeCompare(a.data_publicacao));
}

/** Identificador estável — nome de fixture e chave natural de `edicoes`. */
export function identificador(ed) {
  return `${SIGLA}-${ed.data_publicacao}-${ed.numero}-CAD${ed.caderno}`;
}

/**
 * Baixa o PDF do caderno. Arquivo cru salvo ANTES de qualquer parsing.
 * O e-SAJ devolve `application/octet-stream`, então a validação é pela
 * assinatura do arquivo (%PDF), não pelo content-type.
 */
export async function baixar(edicao) {
  const resp = await fetch(edicao.url_original, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/pdf, application/octet-stream',
    },
  });
  if (!resp.ok) {
    throw new Error(`DJMS: download HTTP ${resp.status} — ${edicao.url_original}`);
  }
  const buffer = new Uint8Array(await resp.arrayBuffer());

  // %PDF = 37,80,68,70
  if (buffer.subarray(0, 4).join(',') !== '37,80,68,70') {
    throw new Error(`DJMS: conteúdo não é PDF (${buffer.byteLength} bytes)`);
  }
  return {
    buffer,
    bytes: buffer.byteLength,
    contentType: resp.headers.get('content-type') ?? '',
  };
}

/** Fase de extração — card C1.2, contra gabarito validado. */
export async function extrair() {
  throw new Error('DJMS.extrair(): não implementado — card C1.2 (exige gabarito validado)');
}

export default {
  SIGLA, PARSER_KEY, MODO_ACESSO,
  descobrir, identificador, baixar, extrair, datasUteis, parsearListaDeCadernos,
};
