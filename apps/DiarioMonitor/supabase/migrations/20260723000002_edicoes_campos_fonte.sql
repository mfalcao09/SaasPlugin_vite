-- ============================================================================
-- DiárioMonitor — Campos de fonte do DO/MS em `edicoes` (card avulso, pós-C0.3)
-- Doc:  docs/FONTES-endpoints-e-extracao.md §5 ("DO/MS — campos novos a incorporar")
--
-- O índice do DO/MS (Next.js, payload RSC) devolve registros estruturados que
-- hoje são parcialmente perdidos — o parser só lê a URL do PDF via regex.
-- Esta migration incorpora ao schema o que a fonte já expõe, sem inventar
-- nenhum campo que ela não tenha.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas novas em `edicoes`
-- ----------------------------------------------------------------------------

alter table public.edicoes
  add column id_fonte           text,
  add column suspenso           boolean not null default false,
  add column edicao_pai_id      uuid references public.edicoes(id) on delete set null,
  add column numero_suplemento  int,
  add column descricao          text,
  add column data_inclusao      timestamptz;

comment on column public.edicoes.id_fonte is
  'Id da edição na origem (ex.: "49697" no DO/MS). Chave estável externa — '
  'sobrevive a mudanças de numeração e permite reconciliar reprocessamentos '
  'sem depender de (data_publicacao, numero).';

comment on column public.edicoes.suspenso is
  'CRÍTICO (docs/FONTES-endpoints-e-extracao.md §5): edição marcada suspensa '
  'pela própria fonte não pode gerar ato vigente nem entrar em boletim. '
  'Default false porque a imensa maioria das edições nunca é suspensa — a '
  'aplicação deve consultar a view public.edicoes_vigentes, nunca esta tabela '
  'diretamente, para qualquer fluxo de leitura de atos/boletim.';

comment on column public.edicoes.edicao_pai_id is
  'Vínculo suplemento → edição-mãe, derivado do campo "diarioId" da fonte. '
  'Antes desta migration esse vínculo era inferido do nome do arquivo '
  '(ex.: DO12229_..._SUP_1), o que é frágil; agora é uma FK real dentro da '
  'própria tabela. Nulo para edições principais.';

comment on column public.edicoes.numero_suplemento is
  'Campo "numeroSuplemento" da fonte (ex.: 1, 2, …). Nulo para edições '
  'principais — só suplementos o preenchem, sempre em conjunto com '
  'edicao_pai_id.';

comment on column public.edicoes.descricao is
  'Rótulo textual da edição na fonte (ex.: "Diário Oficial Eletrônico n. '
  '12.229" ou, em suplemento, "Suplemento I DOE n. 12228 - SAD - Diárias"). '
  'Não é derivado — vem pronto do campo "descricao" do payload.';

comment on column public.edicoes.data_inclusao is
  'Campo "dataInclusao" da fonte: quando a edição entrou no sistema de '
  'origem. É DIFERENTE de data_publicacao — a fonte pode incluir uma edição '
  'um dia depois de publicá-la, ou reincluir a mesma data_publicacao com um '
  'novo id_fonte (republicação). Sem este campo essa diferença é invisível.';

-- Índice parcial: toda consulta de aplicação (fila de revisão, boletim,
-- listagem de atos) filtra "suspenso = false" — este índice serve
-- exatamente essa forma de consulta sem carregar as linhas suspensas
-- (minoria, mas o índice completo seria desperdício nelas).
create index idx_edicoes_vigentes_fonte_data
  on public.edicoes (fonte_id, data_publicacao desc)
  where suspenso = false;

-- Suporta o join edição-mãe → suplementos sem seq scan.
create index idx_edicoes_pai on public.edicoes (edicao_pai_id)
  where edicao_pai_id is not null;

-- ----------------------------------------------------------------------------
-- 2. View pública: é ESTA que a aplicação consulta, não `edicoes` direto.
-- ----------------------------------------------------------------------------

create view public.edicoes_vigentes
  with (security_invoker = true)
  as
  select *
    from public.edicoes
   where suspenso = false;

comment on view public.edicoes_vigentes is
  'Ponto único de leitura de edições para a aplicação (fila de revisão, '
  'boletim, qualquer consulta de atos). Filtra suspenso = false — nenhum '
  'código de aplicação deve consultar public.edicoes diretamente para exibir '
  'ou processar atos, sob risco de gerar boletim a partir de edição suspensa '
  'pela própria fonte (docs/FONTES-endpoints-e-extracao.md §5). '
  'security_invoker=true: a view herda as RLS policies da tabela base para '
  'quem a consulta, em vez de rodar com o privilégio de quem a criou.';
