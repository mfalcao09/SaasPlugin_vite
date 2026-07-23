-- ============================================================================
-- Proveniência: separar HEURÍSTICA de IA (§5.4 do PRD)
--
-- A pré-anotação (C1.1a) extrai por expressão regular determinística sobre o
-- PDF. Registrá-la como 'ia' seria proveniência falsa — e num sistema cujo
-- valor é a cadeia de custódia do ato normativo (Res. CNJ 324/2020 art. 40,
-- CONARQ 51/2023), proveniência falsa é defeito, não detalhe.
--
-- Confiabilidade é a mesma classe de 'ia' (precisa de olho humano), então a
-- triagem é idêntica; o que muda é o que fica registrado sobre a origem.
-- ============================================================================

alter table public.atos drop constraint if exists atos_origem_extracao_check;
alter table public.atos add constraint atos_origem_extracao_check
  check (origem_extracao in ('api', 'xml', 'ia', 'heuristica', 'humano'));

create or replace function public.atos_indexar_e_triar()
returns trigger language plpgsql as $$
begin
  new.conteudo_ts :=
    setweight(to_tsvector('portuguese', coalesce(new.ementa, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(new.texto_bruto, '')), 'B');

  if new.origem_extracao in ('api','xml') then
    -- Fonte estruturada: o campo veio pronto da origem, não foi inferido.
    new.confianca_extracao := coalesce(new.confianca_extracao, 1.00);
  elsif new.origem_extracao in ('ia','heuristica')
        and (new.numero is null or new.tipo is null or new.data_ato is null) then
    -- Inferência com lacuna em campo identificador não entra no acervo sozinha.
    new.status := 'revisao';
  end if;
  return new;
end $$;
