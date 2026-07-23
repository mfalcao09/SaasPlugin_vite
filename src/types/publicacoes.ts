// ============================================================================
// Contrato de dados da tela de Publicações (card C1.4a) — PRD v2.1 §7.2.3
//
// Este arquivo é o CONTRATO entre a camada de dados (src/lib, src/hooks,
// src/services, src/types) e a futura camada de apresentação (card C1.4b).
// Componente NUNCA faz query direta ao Supabase — consome hook/service, e
// hook/service NUNCA importam nada de src/components ou src/pages.
// ============================================================================

/**
 * Como o campo chegou ao acervo. Espelha `atos.origem_extracao` (migration
 * `20260723000001_schema_inicial.sql`).
 *
 * 'api' | 'xml'   — fonte estruturada: confiança 1.0 por definição (§5.4).
 * 'ia'            — extraído por modelo a partir de scrape/PDF; pode cair
 *                    em revisão se um campo obrigatório vier nulo.
 * 'humano'        — corrigido/confirmado manualmente por um revisor.
 */
export type OrigemExtracao = 'api' | 'xml' | 'ia' | 'humano';

/**
 * Espelha `atos.status`.
 *
 * 'ok'        — pronto para aparecer em listas e disparos.
 * 'revisao'   — extração duvidosa (campo obrigatório ausente); aguarda a
 *               Fila de Revisão (card C1.3). NUNCA deve aparecer em lista
 *               de disparo nem na consulta padrão de Publicações — essa
 *               trava é aplicada em `buscarPublicacoes`/`contarPublicacoes`
 *               (src/services/publicacoes.mjs), não pela RLS: o acervo de
 *               atos é de leitura compartilhada para qualquer autenticado
 *               (a Fila de Revisão também lê `atos`, só que filtrando o
 *               status oposto — por isso a trava não pode viver no banco).
 * 'descartado' — revisado e rejeitado (não é norma, é ruído de extração).
 */
export type StatusAto = 'ok' | 'revisao' | 'descartado';

/**
 * Espelha 1:1 a tabela `public.atos` (só os campos relevantes para a tela
 * de Publicações — `texto_bruto` fica de fora por ser conteúdo bruto de
 * suporte à extração, não um campo de exibição/filtro).
 */
export interface Ato {
  readonly id: string;
  readonly tipo: string | null;
  readonly numero: string | null;
  readonly ano: number | null;
  readonly orgao_emissor: string | null;
  readonly ementa: string | null;
  /** ISO AAAA-MM-DD. Data do ato em si (pode ser anterior à publicação). */
  readonly data_ato: string | null;
  /** ISO AAAA-MM-DD. Sempre presente — é a data de publicação na fonte. */
  readonly data_publicacao: string;
  readonly pagina: string | null;
  readonly url_original: string | null;
  readonly origem_extracao: OrigemExtracao;
  /** 0.00–1.00. Fontes api/xml sempre 1.00 (o trigger da migration garante). */
  readonly confianca_extracao: number | null;
  readonly status: StatusAto;
}

/**
 * `Ato` acrescido dos dados da edição e da fonte de origem — resultado de
 * `obterPublicacao(id)`, que faz o join. Nomes prefixados (`edicao_*`,
 * `fonte_*`) porque é assim que a linha volta do SQL (join simples, sem
 * aninhamento) — reformatar em objeto aninhado é decisão da apresentação
 * (C1.4b), não da camada de dados.
 */
export interface AtoDetalhado extends Ato {
  readonly edicao_id: string;
  readonly edicao_numero: string | null;
  readonly edicao_data_publicacao: string;
  readonly edicao_url_original: string;
  readonly fonte_id: string;
  readonly fonte_nome: string;
  readonly fonte_sigla: string;
}

/** Linha de `fontesDisponiveis()` — popula o select de fonte na tela. */
export interface FonteResumo {
  readonly id: string;
  readonly nome: string;
  readonly sigla: string;
}

/**
 * Filtros da tela de Publicações. Todos os campos são opcionais — filtro
 * ausente = sem restrição naquele critério.
 *
 * `status` exclui deliberadamente 'revisao' NO TIPO (não só em runtime):
 * quem monta um filtro para esta tela não consegue nem COMPILAR um pedido
 * de status='revisao' por engano. A Fila de Revisão (card C1.3) é uma tela
 * e um hook à parte, com seu próprio filtro — não reaproveita este tipo.
 */
export interface FiltroPublicacoes {
  /** Busca livre — vira `websearch_to_tsquery('portuguese', termo)`. Aceita
   *  aspas ("frase exata"), `-termo` (exclui) e `OR` (união), como um
   *  buscador comum. */
  readonly termo?: string;
  /** Sigla da fonte (`fontes_diarios.sigla`), ex.: 'DOMS', 'DJMS'. */
  readonly fonteSigla?: string;
  readonly tipo?: string;
  /** ISO AAAA-MM-DD, inclusive. */
  readonly periodoDe?: string;
  /** ISO AAAA-MM-DD, inclusive. */
  readonly periodoAte?: string;
  readonly status?: Exclude<StatusAto, 'revisao'>;
  /** 1-based. Ausente/inválido = 1 (ver `normalizarPaginacao` no service). */
  readonly pagina?: number;
  /** Ausente/inválido = padrão do service; acima do teto é sempre truncado. */
  readonly porPagina?: number;
}

/** Envelope de paginação genérico — usado por qualquer listagem paginada. */
export interface ResultadoPaginado<T> {
  readonly itens: readonly T[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
}

/**
 * Consulta SQL parametrizada GERADA pelo service — nunca executada por ele.
 *
 * POR QUE o service devolve isto em vez de já trazer os dados: este app não
 * tem, hoje, nenhum driver/cliente de banco no bundle do frontend (nem
 * `@supabase/supabase-js` está instalado, nem existe `src/lib/supabase.ts`
 * — conferido antes de escrever este contrato). Os próprios scripts de
 * ingestão do projeto (`scripts/ingest.mjs`) seguem o mesmo princípio:
 * emitem SQL puro em vez de embutir um driver Postgres. `ConsultaSQL`
 * mantém `publicacoes.mjs` "JS ESM puro, sem dependências" ao pé da letra,
 * e deixa a decisão de TRANSPORTE (Edge Function via fetch, RPC, etc. —
 * exigida pela Seção 11.1: frontend nunca fala direto com serviço interno)
 * para quem instancia o hook, sem acoplar a camada de dados a uma decisão
 * de infra que ainda não foi tomada.
 */
export interface ConsultaSQL {
  readonly texto: string;
  readonly parametros: readonly (string | number | null)[];
}

/**
 * Função que sabe EXECUTAR uma `ConsultaSQL` e devolver as linhas cruas.
 * `usePublicacoes` recebe um executor já pronto (injeção de dependência) —
 * o hook não sabe, e não precisa saber, se por trás existe uma Edge
 * Function, uma RPC do Supabase ou um mock de teste.
 */
export type ExecutorConsulta = (
  consulta: ConsultaSQL,
  opcoes?: { readonly signal?: AbortSignal },
) => Promise<readonly Record<string, unknown>[]>;
