-- ============================================================================
-- Suplemento é EDIÇÃO, não repetição
--
-- A migration 0002 criou `numero_suplemento` e `edicao_pai_id` para modelar os
-- suplementos do DO/MS — mas a UNIQUE (fonte_id, data_publicacao, numero)
-- herdada do schema inicial continuava proibindo exatamente o que aqueles
-- campos existiam para permitir. O schema previa e vetava a mesma coisa.
--
-- Sintoma real: carregar as 20 fixtures produzia 17 edições. DOMS 12228 de
-- 21/07 tem edição-pai + SUP1 + SUP2; as três colapsavam em uma, e os atos
-- publicados nos suplementos ficavam pendurados na edição errada.
--
-- NULLS NOT DISTINCT (PG 15+) é o que faz a regra valer também para a
-- edição-pai: sem isso, `numero_suplemento IS NULL` seria sempre distinto de
-- si mesmo e a edição normal poderia duplicar à vontade.
-- ============================================================================

alter table public.edicoes
  drop constraint if exists edicoes_fonte_id_data_publicacao_numero_key;

alter table public.edicoes
  add constraint edicoes_identidade_key
  unique nulls not distinct (fonte_id, data_publicacao, numero, numero_suplemento);

comment on constraint edicoes_identidade_key on public.edicoes is
  'Identidade da edicao: fonte + data + numero + suplemento (pai = suplemento nulo).';
