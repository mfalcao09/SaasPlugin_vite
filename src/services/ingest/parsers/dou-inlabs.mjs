// ============================================================================
// Parser da fonte DOU — Diário Oficial da União, via INLABS
// parser_key: 'dou-inlabs'   ·   modo_acesso: 'xml'   (PRD v2.1 §5)
//
// PROCEDÊNCIA: o protocolo (endpoints, headers, sequência de login/download)
// foi observado nos scripts oficiais publicados pela Imprensa Nacional em
// github.com/Imprensa-Nacional/inlabs. Aquele repositório NÃO declara licença
// — logo nenhum código de lá foi copiado. Esta é uma implementação
// independente do mesmo protocolo, que é fato técnico, não expressão autoral.
//
// DIFERENÇA CRÍTICA PARA AS DEMAIS FONTES: o DOU entrega XML com `artType`
// (tipo do ato) já preenchido pelo publicador. Logo `extrair()` é
// DETERMINÍSTICO — sem IA, sem fila de revisão, confiança 1.0 (§5.4).
// ============================================================================

import { createHash } from 'node:crypto';

export const SIGLA = 'DOU';
export const PARSER_KEY = 'dou-inlabs';
export const MODO_ACESSO = 'xml';

const BASE = 'https://inlabs.in.gov.br';
const URL_LOGIN = `${BASE}/logar.php`;
const URL_INDEX = `${BASE}/index.php`;

// Header literal exigido pelo serviço nas requisições autenticadas.
// É o hex ASCII de "script"; sem ele o download falha.
const HEADER_ORIGEM = '736372697074';

export const USER_AGENT =
  'DiarioMonitor/0.1 (+contato: tecnologia@nexvy.tech) ingestao-institucional';

/** Seções do DOU. Sufixo `E` = edição extra. */
export const SECOES = ['DO1', 'DO2', 'DO3', 'DO1E', 'DO2E', 'DO3E'];

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------

/**
 * Autentica e devolve o valor do cookie de sessão.
 * Credenciais SEMPRE de variável de ambiente — nunca hardcoded, nunca em log.
 * @returns {Promise<string>} valor de inlabs_session_cookie
 */
export async function autenticar({
  email = process.env.INLABS_EMAIL,
  senha = process.env.INLABS_SENHA,
} = {}) {
  if (!email || !senha) {
    throw new Error(
      'INLABS: credenciais ausentes. Defina INLABS_EMAIL e INLABS_SENHA ' +
        '(cadastro gratuito em https://inlabs.in.gov.br/acessar.php).',
    );
  }

  const resp = await fetch(URL_LOGIN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      origem: HEADER_ORIGEM,
    },
    body: new URLSearchParams({ email, password: senha }).toString(),
    redirect: 'manual', // o cookie vem no 302; seguir o redirect o descartaria
  });

  const cookies = resp.headers.getSetCookie?.() ?? [];
  const sessao = cookies
    .map((c) => /(?:^|;\s*)inlabs_session_cookie=([^;]+)/.exec(c)?.[1])
    .find(Boolean);

  if (!sessao) {
    // Nunca ecoar credencial na mensagem de erro.
    throw new Error(
      `INLABS: falha de autenticação (HTTP ${resp.status}) — ` +
        'cookie inlabs_session_cookie não retornado. Verifique as credenciais.',
    );
  }
  return sessao;
}

const cabecalhoAutenticado = (sessao) => ({
  'User-Agent': USER_AGENT,
  Cookie: `inlabs_session_cookie=${sessao}`,
  origem: HEADER_ORIGEM,
});

// ---------------------------------------------------------------------------
// Descoberta
// ---------------------------------------------------------------------------

/**
 * Lista as seções efetivamente publicadas numa data.
 *
 * A rota `index.php?p=<data>` devolve HTML com os ZIPs disponíveis. Consultar
 * o índice evita tentar as 6 seções às cegas: edições extras (DO1E…) só
 * existem em alguns dias, e pedir o inexistente gera 404 desnecessário.
 *
 * @param {{data?: string, sessao?: string}} opts  data = 'AAAA-MM-DD'
 */
export async function descobrir(opts = {}) {
  const { data = new Date().toISOString().slice(0, 10) } = opts;
  const sessao = opts.sessao ?? (await autenticar());

  const resp = await fetch(`${URL_INDEX}?p=${data}`, {
    headers: cabecalhoAutenticado(sessao),
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error(`INLABS: índice HTTP ${resp.status} para ${data}`);

  const html = await resp.text();
  const vistos = new Set();
  const edicoes = [];

  for (const m of html.matchAll(/([0-9]{4}-[0-9]{2}-[0-9]{2})-(DO[123]E?)\.zip/g)) {
    const [arquivo, dataArq, secao] = m;
    if (vistos.has(arquivo)) continue;
    vistos.add(arquivo);

    edicoes.push({
      fonte: SIGLA,
      numero: secao,          // o DOU não usa nº sequencial de edição por dia
      secao,
      data_publicacao: dataArq,
      suplemento: secao.endsWith('E') ? 1 : null,
      arquivo,
      url_original: `${URL_INDEX}?p=${dataArq}&dl=${arquivo}`,
    });
  }

  edicoes.sort((a, b) => a.secao.localeCompare(b.secao));
  return edicoes;
}

export function identificador(ed) {
  return `${SIGLA}-${ed.data_publicacao}-${ed.secao}`;
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * Baixa o ZIP da seção. Salvo cru antes de qualquer parsing (anexo do PRD).
 * @returns {Promise<{buffer:Uint8Array, bytes:number, hash:string}>}
 */
export async function baixar(edicao, opts = {}) {
  const sessao = opts.sessao ?? (await autenticar());

  const resp = await fetch(edicao.url_original, {
    headers: cabecalhoAutenticado(sessao),
    redirect: 'follow',
  });

  // 404 é resposta legítima: aquela seção não saiu naquele dia.
  if (resp.status === 404) {
    throw new Error(
      `INLABS: seção ${edicao.secao} não publicada em ${edicao.data_publicacao}`,
    );
  }
  if (!resp.ok) throw new Error(`INLABS: download HTTP ${resp.status} — ${edicao.arquivo}`);

  const buffer = new Uint8Array(await resp.arrayBuffer());

  // 'PK' = 0x50 0x4B — assinatura ZIP. Valida o conteúdo, não só o header.
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error(
      `INLABS: conteúdo não é ZIP (provável sessão expirada ou HTML de erro) — ${edicao.arquivo}`,
    );
  }

  return {
    buffer,
    bytes: buffer.byteLength,
    hash: createHash('sha256').update(buffer).digest('hex'),
  };
}

// ---------------------------------------------------------------------------
// Extração — DETERMINÍSTICA, sem IA
// ---------------------------------------------------------------------------

const semTags = (s) =>
  s
    ?.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim() || null;

const atributo = (tag, nome) => new RegExp(`${nome}="([^"]*)"`).exec(tag)?.[1]?.trim() || null;

const conteudoTag = (xml, nome) => {
  const m = new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`).exec(xml);
  if (!m) return null;
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(m[1]);
  return (cdata ? cdata[1] : m[1]).trim() || null;
};

/** 'DD/MM/AAAA' → 'AAAA-MM-DD'. Retorna null se não casar o padrão. */
export function dataParaISO(br) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br?.trim() ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Extrai atos de UM arquivo XML de matéria do DOU.
 *
 * Mapeamento: artType→tipo · Identifica→título (e nº) · pubDate→data ·
 * artCategory→órgão · Ementa→ementa · Texto→texto_bruto.
 *
 * Como `artType` vem do publicador, não há inferência: origem_extracao='xml'
 * e confianca_extracao=1.0 (§5.4). Campo ausente permanece null — nunca
 * inventado (§6.2).
 *
 * @param {string} xml conteúdo de um XML do ZIP
 * @returns {{atos: object[], avisos: string[]}}
 */
export function extrairDeXml(xml) {
  const atos = [];
  const avisos = [];

  for (const bloco of xml.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)) {
    const [, attrs, corpo] = bloco;

    const identifica = semTags(conteudoTag(corpo, 'Identifica'));
    // "PORTARIA Nº 321, DE 15 DE JULHO DE 2026" → "321"
    const numero =
      /n[ºo°]?\s*([\d.]+)/i.exec(identifica ?? '')?.[1]?.replace(/\./g, '') ?? null;
    const pubDate = atributo(attrs, 'pubDate');
    const dataISO = dataParaISO(pubDate);

    if (pubDate && !dataISO) avisos.push(`pubDate fora do padrão DD/MM/AAAA: ${pubDate}`);

    atos.push({
      id_fonte: atributo(attrs, 'id'),
      id_materia: atributo(attrs, 'idMateria'),
      secao: atributo(attrs, 'pubName'),
      tipo: atributo(attrs, 'artType'), // ← vem do publicador, sem IA
      numero,
      titulo: identifica,
      orgao_emissor: atributo(attrs, 'artCategory'),
      data_publicacao: dataISO,
      pagina: atributo(attrs, 'numberPage'),
      edicao: atributo(attrs, 'editionNumber'),
      url_original: atributo(attrs, 'pdfPage'),
      ementa: semTags(conteudoTag(corpo, 'Ementa')),
      texto_bruto: semTags(conteudoTag(corpo, 'Texto')),
      origem_extracao: 'xml',
      confianca_extracao: 1.0,
    });
  }

  return { atos, avisos };
}

/**
 * Contrato §5.1. Recebe os XMLs já extraídos do ZIP e devolve os atos.
 * A descompactação fica no runner; aqui ficam contrato e parsing — que é a
 * parte testável offline, contra fixture.
 */
export async function extrair(edicao, arquivosXml) {
  if (!Array.isArray(arquivosXml)) {
    throw new Error(
      'DOU.extrair(edicao, arquivosXml): passe os XMLs já extraídos do ZIP ' +
        '(o runner descompacta; este módulo apenas parseia).',
    );
  }
  const atos = [];
  const avisos = [];
  for (const xml of arquivosXml) {
    const r = extrairDeXml(xml);
    atos.push(...r.atos);
    avisos.push(...r.avisos);
  }
  return { atos, metadados: { fonte: SIGLA, secao: edicao?.secao }, avisos };
}

export default {
  SIGLA, PARSER_KEY, MODO_ACESSO, SECOES,
  autenticar, descobrir, identificador, baixar, extrair, extrairDeXml, dataParaISO,
};
