// ============================================================================
// Camada de DADOS de Publicações (card C1.4a) — PRD v2.1 §7.2.3
//
// Contrato completo em `src/types/publicacoes.ts` — este módulo é JS ESM
// puro, zero `import` de pacote externo, só GERA `ConsultaSQL` (texto +
// parâmetros posicionais $1, $2...). Quem EXECUTA a consulta é decisão de
// quem instancia o hook (ver `ConsultaSQL`/`ExecutorConsulta` no contrato).
//
// POR QUE gerar SQL em vez de já buscar os dados: este app não tem, hoje,
// nenhum driver/cliente de banco no bundle do frontend — nem
// `@supabase/supabase-js` está instalado (conferido em package.json antes
// de escrever este arquivo), nem existe `src/lib/supabase.ts`. Os próprios
// scripts de ingestão do projeto (`scripts/ingest.mjs`, linha 13: "Emite o
// SQL de INSERT em stdout — sem depender de driver Postgres") já seguem
// essa convenção. Este módulo aplica o mesmo princípio à leitura.
//
// POR QUE websearch_to_tsquery (nunca plainto_tsquery): o usuário digita a
// busca livre como faria num buscador comum — aspas para frase exata
// ("processo seletivo"), "-termo" pra excluir, "OR" pra unir. plainto_tsquery
// ignora esses operadores e trata tudo como AND de palavras soltas; isso
// quebraria a expectativa de quem já usa qualquer motor de busca do dia a
// dia. websearch_to_tsquery é o único dos quatro (plainto/phraseto/to/
// websearch_to_tsquery) que interpreta a sintaxe do usuário sem lançar erro
// de sintaxe em entrada malformada — ele degrada graciosamente.
//
// POR QUE ts_rank importa: sem ordenar por relevância, uma busca por
// "portaria" devolveria os atos mais RECENTES que contêm a palavra, não os
// mais RELEVANTES — um ato cuja EMENTA bate o termo deveria vir antes de um
// que só bate uma vez perdido no meio do texto bruto. O peso já foi setado
// no trigger `atos_indexar_e_triar` da migration (setweight A=ementa,
// B=texto_bruto), então `ts_rank(conteudo_ts, tsquery)` já reflete isso —
// não precisamos recalcular peso aqui.
// ============================================================================

const PADRAO_POR_PAGINA = 20;
const TETO_POR_PAGINA = 100;

// Trava dura (não só de tipo — ver ConsultaSQL/StatusAto no contrato): a
// Fila de Revisão também lê `atos`, então a exclusão de 'revisao' não pode
// viver na RLS (compartilhada por leitura). Fica embutida em toda consulta
// "padrão de publicações", incondicionalmente — mesmo que o chamador não
// passe nenhum filtro de status.
const EXCLUIR_REVISAO = "atos.status <> 'revisao'";

/**
 * Normaliza página/porPágina. Exportada porque o hook precisa saber os
 * valores REALMENTE aplicados (o service pode truncar `porPagina`) para
 * preencher `ResultadoPaginado.pagina/porPagina` sem duplicar esta lógica.
 * @param {number|undefined} pagina
 * @param {number|undefined} porPagina
 * @returns {{pagina:number, porPagina:number}}
 */
export function normalizarPaginacao(pagina, porPagina) {
  const paginaValida = Number.isInteger(pagina) && pagina > 0 ? pagina : 1;
  const porPaginaValida =
    Number.isInteger(porPagina) && porPagina > 0
      ? Math.min(porPagina, TETO_POR_PAGINA)
      : PADRAO_POR_PAGINA;
  return { pagina: paginaValida, porPagina: porPaginaValida };
}

/**
 * Cláusula WHERE + parâmetros comuns a busca e contagem. Fica em função
 * própria para GARANTIR que `buscarPublicacoes` e `contarPublicacoes` nunca
 * divirjam — se divergissem, total e páginas ficariam inconsistentes.
 * `termo`, quando presente, é sempre o primeiro parâmetro empilhado (a
 * ordenação por rank em `buscarPublicacoes` depende disso: reaproveita $1).
 * @param {import('../types/publicacoes.ts').FiltroPublicacoes} filtros
 */
function montarFiltros(filtros = {}) {
  const condicoes = [EXCLUIR_REVISAO];
  const parametros = [];
  const termo = typeof filtros.termo === 'string' ? filtros.termo.trim() : '';

  if (termo !== '') {
    parametros.push(termo);
    condicoes.push(`atos.conteudo_ts @@ websearch_to_tsquery('portuguese', $${parametros.length})`);
  }
  if (filtros.fonteSigla) {
    parametros.push(filtros.fonteSigla);
    condicoes.push(
      `exists (select 1 from public.fontes_diarios f where f.id = atos.fonte_id and f.sigla = $${parametros.length})`,
    );
  }
  if (filtros.tipo) {
    parametros.push(filtros.tipo);
    condicoes.push(`atos.tipo = $${parametros.length}`);
  }
  if (filtros.periodoDe) {
    parametros.push(filtros.periodoDe);
    condicoes.push(`atos.data_publicacao >= $${parametros.length}`);
  }
  if (filtros.periodoAte) {
    parametros.push(filtros.periodoAte);
    condicoes.push(`atos.data_publicacao <= $${parametros.length}`);
  }
  if (filtros.status) {
    parametros.push(filtros.status);
    condicoes.push(`atos.status = $${parametros.length}`);
  }

  return { where: condicoes.join('\n   and '), parametros, temTermo: termo !== '' };
}

const COLUNAS_ATO = [
  'atos.id',
  'atos.tipo',
  'atos.numero',
  'atos.ano',
  'atos.orgao_emissor',
  'atos.ementa',
  'atos.data_ato',
  'atos.data_publicacao',
  'atos.pagina',
  'atos.url_original',
  'atos.origem_extracao',
  'atos.confianca_extracao',
  'atos.status',
];

/**
 * Gera a consulta paginada de publicações. Ordena por `ts_rank` quando há
 * termo de busca (mais relevante primeiro, empate por data mais recente);
 * sem termo, ordena por `data_publicacao desc`.
 * @param {import('../types/publicacoes.ts').FiltroPublicacoes} [filtros]
 * @returns {import('../types/publicacoes.ts').ConsultaSQL}
 */
export function buscarPublicacoes(filtros = {}) {
  const { where, parametros, temTermo } = montarFiltros(filtros);
  const { pagina, porPagina } = normalizarPaginacao(filtros.pagina, filtros.porPagina);

  // `termo`, quando presente, é sempre $1 (ver contrato de montarFiltros) —
  // por isso a ordenação por rank pode reaproveitar $1 com segurança aqui.
  const ordem = temTermo
    ? "ts_rank(atos.conteudo_ts, websearch_to_tsquery('portuguese', $1)) desc, atos.data_publicacao desc"
    : 'atos.data_publicacao desc';

  const parametrosFinais = [...parametros, porPagina, (pagina - 1) * porPagina];
  const posLimite = parametrosFinais.length - 1;
  const posOffset = parametrosFinais.length;

  const texto =
    `select ${COLUNAS_ATO.join(', ')}\n` +
    `  from public.atos\n` +
    ` where ${where}\n` +
    ` order by ${ordem}\n` +
    ` limit $${posLimite} offset $${posOffset}`;

  return { texto, parametros: parametrosFinais };
}

/**
 * Gera a consulta de contagem — mesmos filtros de `buscarPublicacoes`,
 * sem paginação, para alimentar `ResultadoPaginado.total`.
 * @param {import('../types/publicacoes.ts').FiltroPublicacoes} [filtros]
 * @returns {import('../types/publicacoes.ts').ConsultaSQL}
 */
export function contarPublicacoes(filtros = {}) {
  const { where, parametros } = montarFiltros(filtros);
  const texto = `select count(*)::int as total\n  from public.atos\n where ${where}`;
  return { texto, parametros };
}

/**
 * Gera a consulta de um ato com os dados da edição e da fonte (join) —
 * tela de detalhe. Não aplica a trava de `status<>'revisao'`: um ato em
 * revisão ainda pode ser aberto individualmente (ex.: a partir da própria
 * Fila de Revisão), só não aparece nas LISTAS de Publicações.
 * @param {string} id
 * @returns {import('../types/publicacoes.ts').ConsultaSQL}
 */
export function obterPublicacao(id) {
  const texto = [
    `select ${COLUNAS_ATO.join(', ')},`,
    '       edicoes.id as edicao_id,',
    '       edicoes.numero as edicao_numero,',
    '       edicoes.data_publicacao as edicao_data_publicacao,',
    '       edicoes.url_original as edicao_url_original,',
    '       fontes_diarios.id as fonte_id,',
    '       fontes_diarios.nome as fonte_nome,',
    '       fontes_diarios.sigla as fonte_sigla',
    '  from public.atos',
    '  join public.edicoes on edicoes.id = atos.edicao_id',
    '  join public.fontes_diarios on fontes_diarios.id = atos.fonte_id',
    ' where atos.id = $1',
  ].join('\n');
  return { texto, parametros: [id] };
}

/**
 * Gera a consulta de tipos distintos já vistos no acervo — popula o select
 * "Tipo" da tela. Ignora atos em revisão (tipo pode ter vindo errado/vazio
 * de uma extração duvidosa; não faz sentido oferecer como opção de filtro).
 * @returns {import('../types/publicacoes.ts').ConsultaSQL}
 */
export function tiposDisponiveis() {
  const texto = [
    'select distinct tipo',
    '  from public.atos',
    " where tipo is not null and status <> 'revisao'",
    ' order by tipo',
  ].join('\n');
  return { texto, parametros: [] };
}

/**
 * Gera a consulta de fontes ativas — popula o select "Fonte" da tela.
 * @returns {import('../types/publicacoes.ts').ConsultaSQL}
 */
export function fontesDisponiveis() {
  const texto = [
    'select id, nome, sigla',
    '  from public.fontes_diarios',
    ' where ativo = true',
    ' order by nome',
  ].join('\n');
  return { texto, parametros: [] };
}
