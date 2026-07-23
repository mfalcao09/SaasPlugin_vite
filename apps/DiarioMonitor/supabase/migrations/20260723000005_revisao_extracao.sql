-- ============================================================================
-- Julgamento humano da EXTRAÇÃO (cards C1.1b / C1.3)
--
-- Por que tabela separada, e não uma coluna em `atos`:
--
--   1. `atos` é APPEND-ONLY para o role da aplicação (revoke update/delete).
--      O ato publicado é evidência: uma vez capturado, não se altera. Guardar
--      o julgamento nele exigiria reabrir UPDATE no acervo — trocar uma
--      garantia de preservação por conveniência de escrita.
--
--   2. O julgamento é um fato sobre a EXTRAÇÃO, não sobre o ato. "Este recorte
--      corresponde ao que foi publicado?" é pergunta sobre o nosso trabalho.
--
--   3. `atos` e `edicoes` são acervo PÚBLICO compartilhado (não têm
--      instituicao_id, como `fontes_diarios`). Já o julgamento é por-tenant:
--      duas instituições podem divergir sobre o mesmo recorte, e cada uma
--      responde pelo próprio acervo normativo. Daí instituicao_id aqui.
-- ============================================================================

create table if not exists public.revisao_extracao (
  id              uuid primary key default gen_random_uuid(),
  ato_id          uuid not null references public.atos(id) on delete cascade,
  instituicao_id  uuid not null references public.instituicoes(id) on delete cascade,
  decisao         text not null check (decisao in ('ok', 'descartado')),
  observacao      text,
  decidido_por    uuid not null references public.usuarios(id),
  decidido_em     timestamptz not null default now(),
  -- Um julgamento por ato por instituição. Rejulgar sobrescreve (upsert),
  -- não empilha: o que vale é a decisão vigente.
  unique (ato_id, instituicao_id)
);

comment on table public.revisao_extracao is
  'Decisao humana sobre a qualidade da extracao de um ato. Nao altera o ato.';

create index if not exists revisao_extracao_ato_idx
  on public.revisao_extracao (ato_id);
create index if not exists revisao_extracao_tenant_idx
  on public.revisao_extracao (instituicao_id, decidido_em desc);

-- ---------------------------------------------------------------------------
-- Fecho da edição: só existe quando TODOS os atos daquela edição foram
-- julgados. É o que transforma a pré-anotação heurística em gabarito.
-- ---------------------------------------------------------------------------
create table if not exists public.validacao_edicao (
  id              uuid primary key default gen_random_uuid(),
  edicao_id       uuid not null references public.edicoes(id) on delete cascade,
  instituicao_id  uuid not null references public.instituicoes(id) on delete cascade,
  total_atos      integer not null,
  mantidos        integer not null,
  descartados     integer not null,
  validado_por    uuid not null references public.usuarios(id),
  validado_em     timestamptz not null default now(),
  unique (edicao_id, instituicao_id)
);

comment on table public.validacao_edicao is
  'Edicao conferida ponta a ponta por uma pessoa. Base do gabarito (C1.1b).';

-- ---------------------------------------------------------------------------
-- RLS — mesmo padrão das demais tabelas por-tenant (listas_disparo, normas):
-- USING e WITH CHECK, para que ler e escrever fora do próprio tenant falhem.
-- ---------------------------------------------------------------------------
alter table public.revisao_extracao enable row level security;
alter table public.validacao_edicao enable row level security;

drop policy if exists revisao_extracao_tenant on public.revisao_extracao;
create policy revisao_extracao_tenant on public.revisao_extracao
  using      (instituicao_id = public.instituicao_do_usuario())
  with check (instituicao_id = public.instituicao_do_usuario());

drop policy if exists validacao_edicao_tenant on public.validacao_edicao;
create policy validacao_edicao_tenant on public.validacao_edicao
  using      (instituicao_id = public.instituicao_do_usuario())
  with check (instituicao_id = public.instituicao_do_usuario());
