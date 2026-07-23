// ============================================================================
// Parser da fonte CNJ — Atos Normativos do Conselho Nacional de Justiça
// parser_key: 'cnj-atos'   ·   modo_acesso: 'api'   (PRD v2.1 §5)
//
// A MELHOR FONTE DO SISTEMA. A API pública do CNJ não entrega apenas o ato:
// entrega SITUAÇÃO (vigência), TEXTO CONSOLIDADO e RELAÇÕES entre normas —
// ou seja, o MAN-01 inteiro, já modelado pela própria fonte.
//
// Consequências:
//   1. Espelhar, não derivar: origem_extracao='api', confiança 1.0, sem IA.
//   2. O CNJ vira GABARITO AUTOMÁTICO do motor de relação normativa (C2.2):
//      centenas de pares ato→altera/revoga→ato, corretos e datados, de graça.
//
// Sem autenticação. Rate limit 60 req/min (headers x-ratelimit-*).
// ============================================================================

export const SIGLA = 'CNJ';
export const PARSER_KEY = 'cnj-atos';
export const MODO_ACESSO = 'api';

const API = 'https://atos.cnj.jus.br/api/atos';
const DETALHE = 'https://atos.cnj.jus.br/atos/detalhar';
const POR_PAGINA = 100; // máximo aceito pela API
const PAUSA_MS = 1100;  // 60 req/min → ~1 req/s, com folga

export const USER_AGENT =
  'DiarioMonitor/0.1 (+contato: tecnologia@nexvy.tech) ingestao-institucional';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/** Remove tags e entidades — o CNJ devolve ementa e texto em HTML. */
export function semTags(s) {
  return (
    s
      ?.replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&ordm;|&deg;/g, 'º')
      .replace(/\s+/g, ' ')
      .trim() || null
  );
}

/**
 * Deduz o TIPO da relação a partir do verbo que abre a ementa.
 *
 * A API separa duas informações: `url_legislacao` diz QUAIS atos são
 * referenciados; a ementa diz O QUE a relação é. O verbo inicial é
 * padronizado pelo CNJ ("Altera a…", "Revoga a…"), o que torna a dedução
 * determinística — mas só quando o padrão casa.
 *
 * Sem casamento claro devolve null: o ato entra SEM relação, em vez de entrar
 * com relação errada. Silêncio é preferível a invenção (§6.2).
 *
 * @returns {'altera'|'revoga'|'revoga_parcialmente'|'regulamenta'|'suspende'|null}
 */
export function tipoDaRelacao(ementa) {
  const t = semTags(ementa)?.toLowerCase() ?? '';
  if (/^revoga\s+parcialmente|^revoga(?:m|-se)?\s+.*\bparcial/.test(t)) return 'revoga_parcialmente';
  if (/^revoga(m|-se|\s)/.test(t)) return 'revoga';
  if (/^altera(m|-se|\s)/.test(t)) return 'altera';
  if (/^regulamenta(m|\s)/.test(t)) return 'regulamenta';
  if (/^suspende(m|\s)/.test(t)) return 'suspende';
  return null;
}

/** Extrai os atos referenciados no HTML de `url_legislacao`. */
export function referencias(urlLegislacao) {
  const html = urlLegislacao ?? '';
  const saida = [];
  const re = /href="[^"]*\/atos\/detalhar\/(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    saida.push({ id_fonte: m[1], rotulo: semTags(m[2]) });
  }
  return saida;
}


/**
 * Extrai (tipo, número, ano) de um rótulo de ato em texto livre.
 * Aceita as duas grafias que o CNJ usa:
 *   "Portaria n. 158, de 22 de outubro de 2019"   (rótulo do link)
 *   "Portaria Presidência nº 158/2019"            (ementa)
 */
export function identificarAto(texto) {
  const t = semTags(texto) ?? '';
  const m = /^\s*([A-Za-zÀ-ÿ ]+?)\s*n[ºo°.]*\s*([\d.]+)/i.exec(t);
  if (!m) return null;
  const tipo = m[1].trim().toLowerCase().split(/\s+/)[0]; // 'portaria', 'recomendação'…
  const numero = m[2].replace(/\./g, '');
  const ano = /\/(\d{4})|de\s+\d{1,2}\s+de\s+\w+\s+de\s+(\d{4})|\b(\d{4})\b/.exec(t);
  return { tipo, numero, ano: ano ? (ano[1] || ano[2] || ano[3]) : null };
}

/**
 * O ato referenciado é REALMENTE o alvo do verbo da ementa?
 *
 * `url_legislacao` lista TODOS os atos mencionados no texto — inclusive os
 * apenas citados. Atribuir o verbo a todos cria relação falsa: uma norma que
 * a ementa só menciona apareceria como "alterada". Como a relação entra com
 * proposta_por='fonte' e confiança 1.0, passaria sem escrutínio humano.
 *
 * Só há relação quando tipo + número (e ano, quando disponível) coincidem
 * entre o rótulo do link e o ato nomeado logo após o verbo da ementa.
 */
export function referenciaEhAlvo(rotuloLink, ementa) {
  const alvoEmenta = identificarAto(
    (semTags(ementa) ?? '').replace(/^(altera|revoga|regulamenta|suspende)[a-z-]*\s+(a|o|as|os)?\s*/i, ''),
  );
  const alvoLink = identificarAto(rotuloLink);
  if (!alvoEmenta || !alvoLink) return false;
  if (alvoEmenta.tipo !== alvoLink.tipo) return false;
  if (alvoEmenta.numero !== alvoLink.numero) return false;
  if (alvoEmenta.ano && alvoLink.ano && alvoEmenta.ano !== alvoLink.ano) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Descoberta — para API, um "pacote" é uma página de resultados
// ---------------------------------------------------------------------------

async function buscar(params) {
  const url = `${API}?${new URLSearchParams(params).toString()}`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (resp.status === 429) throw new Error('CNJ: rate limit atingido (60 req/min)');
  if (!resp.ok) throw new Error(`CNJ: HTTP ${resp.status} em ${url}`);
  return resp.json();
}

/**
 * Descobre os "pacotes" a ingerir. Diferente das demais fontes, o CNJ não tem
 * edição em PDF — o pacote é uma página da API, para uma data ou um ano.
 *
 * @param {{data?: string, ano?: number}} opts  data = 'AAAA-MM-DD'
 */
export async function descobrir(opts = {}) {
  const { data, ano } = opts;
  if (!data && !ano) throw new Error('CNJ.descobrir: informe { data } ou { ano }');

  const filtro = data ? { dat_publicacao_ato: data } : { ano: String(ano) };
  const primeira = await buscar({ ...filtro, perPage: String(POR_PAGINA), page: '1' });

  const total = Number(primeira.total ?? 0);
  const ultima = Number(primeira.last_page ?? 1);
  if (total === 0) return [];

  return Array.from({ length: ultima }, (_, i) => ({
    fonte: SIGLA,
    numero: String(i + 1),
    data_publicacao: data ?? `${ano}-01-01`,
    pagina: i + 1,
    total,
    filtro,
    url_original:
      `${API}?` +
      new URLSearchParams({ ...filtro, perPage: String(POR_PAGINA), page: String(i + 1) }),
  }));
}

export function identificador(ed) {
  const chave = ed.filtro?.dat_publicacao_ato ?? ed.filtro?.ano ?? ed.data_publicacao;
  return `${SIGLA}-${chave}-p${ed.pagina}`;
}

/** "Baixar", para API, é obter o JSON da página. */
export async function baixar(pacote) {
  await dormir(PAUSA_MS);
  const json = await buscar({
    ...pacote.filtro,
    perPage: String(POR_PAGINA),
    page: String(pacote.pagina),
  });
  const bruto = JSON.stringify(json);
  return { json, buffer: new TextEncoder().encode(bruto), bytes: bruto.length };
}

// ---------------------------------------------------------------------------
// Extração — DETERMINÍSTICA, sem IA
// ---------------------------------------------------------------------------

/**
 * Converte a resposta da API em atos + relações declaradas pela fonte.
 * @returns {{atos: object[], relacoes: object[], avisos: string[]}}
 */
export function extrairDeJson(json) {
  const atos = [];
  const relacoes = [];
  const avisos = [];

  for (const a of json?.data ?? []) {
    const ementa = semTags(a.ementa);
    const ano = Number(String(a.data_publicacao ?? '').slice(0, 4)) || null;

    atos.push({
      id_fonte: String(a.id),
      url_fonte: `${DETALHE}/${a.id}`,
      tipo: a.tipo ?? null,
      numero: a.numero != null ? String(a.numero) : null,
      ano,
      orgao_emissor: a.orgao_origem_ato?.dsc_orgao_origem ?? 'CNJ',
      ementa,
      data_publicacao: a.data_publicacao ?? null,
      // O CNJ mantém a vigência — espelhamos o valor bruto (migration 0004).
      situacao_fonte: a.situacao ?? null,
      texto_compilado: semTags(a.url_txt_compilado),
      fonte_publicacao: a.fonte ?? null, // ex.: 'DJe/CNJ n. 169/2026, p. 5'
      origem_extracao: 'api',
      confianca_extracao: 1.0,
    });

    // Relações DECLARADAS pela fonte — não inferidas por nós.
    const tipoRel = tipoDaRelacao(a.ementa);
    for (const ref of referencias(a.url_legislacao)) {
      if (!tipoRel) {
        avisos.push(
          `ato ${a.id} referencia ${ref.id_fonte} mas o verbo da ementa não foi ` +
            'reconhecido — relação NÃO criada (preferível a criar errada)',
        );
        continue;
      }
      // url_legislacao lista TODOS os atos mencionados, não só o alvo do verbo.
      if (!referenciaEhAlvo(ref.rotulo, a.ementa)) {
        avisos.push(
          `ato ${a.id} menciona ${ref.id_fonte} (${ref.rotulo}) sem ser o alvo do ` +
            'verbo — tratado como CITAÇÃO, não relação',
        );
        continue;
      }
      relacoes.push({
        ato_origem_id_fonte: String(a.id),
        norma_destino_id_fonte: ref.id_fonte,
        norma_destino_rotulo: ref.rotulo,
        tipo: tipoRel,
        proposta_por: 'fonte', // o CNJ declarou; não é palpite de modelo
        confianca: 1.0,
        evidencia: ementa,
      });
    }
  }

  return { atos, relacoes, avisos };
}

/** Contrato §5.1. */
export async function extrair(pacote, json) {
  const alvo = json ?? (await baixar(pacote)).json;
  const r = extrairDeJson(alvo);
  return { ...r, metadados: { fonte: SIGLA, pagina: pacote?.pagina } };
}

export default {
  SIGLA, PARSER_KEY, MODO_ACESSO,
  descobrir, identificador, baixar, extrair, extrairDeJson,
  tipoDaRelacao, referencias, semTags, identificarAto, referenciaEhAlvo,
};
