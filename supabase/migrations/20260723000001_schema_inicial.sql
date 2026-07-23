-- ============================================================================
-- DiárioMonitor — Schema inicial (card C0.3)
-- PRD: _indice-planos/PRD-DIARIOMONITOR-TJMS-v2-2026-07-22.md §4
--
-- Princípio estrutural (§3 do PRD): ATO ≠ NORMA
--   · ato   = evento publicado, IMUTÁVEL, é evidência        → append-only
--   · norma = objeto jurídico VIVO, versionado, com vigência → mutável
--
-- Multi-tenant: RLS por instituicao_id nas tabelas de tenant.
-- Datas: date = AAAA-MM-DD · carimbos = timestamptz ISO-8601.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. TENANT E ACESSO
-- ============================================================================

create table public.instituicoes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cnpj        text unique,
  esfera      text check (esfera in ('judiciario','executivo','legislativo','privado')),
  uf          char(2),
  plano       text not null default 'piloto',
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table public.instituicoes is 'Tenant: cada instituição assinante do DiárioMonitor.';

create table public.usuarios (
  id              uuid primary key default gen_random_uuid(),
  auth_id         uuid unique references auth.users(id) on delete cascade,
  instituicao_id  uuid not null references public.instituicoes(id) on delete cascade,
  nome            text not null,
  email           text not null,
  -- 'revisor' é distinto de 'gestor': quem aprova relação normativa não é
  -- necessariamente quem monta lista de disparo (separação de alçada, §4.1)
  perfil          text not null default 'visualizador'
                  check (perfil in ('admin','gestor','revisor','visualizador')),
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (instituicao_id, email)
);
create index on public.usuarios (instituicao_id);

-- Helper SECURITY DEFINER: resolve a instituição do usuário logado sem
-- recursão de RLS (a policy de `usuarios` não pode consultar `usuarios`).
create or replace function public.instituicao_do_usuario()
returns uuid language sql stable security definer set search_path = public as $$
  select instituicao_id from public.usuarios where auth_id = auth.uid() limit 1;
$$;

create or replace function public.perfil_do_usuario()
returns text language sql stable security definer set search_path = public as $$
  select perfil from public.usuarios where auth_id = auth.uid() limit 1;
$$;

-- ============================================================================
-- 2. INGESTÃO — imutável, append-only
-- ============================================================================

create table public.fontes_diarios (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  sigla        text not null unique,
  url_base     text not null,
  esfera       text check (esfera in ('judiciario','executivo','legislativo')),
  poder        text,
  uf           char(2),
  -- hierarquia de acesso (§5.4): api > xml > scrape. IA só onde não há estrutura.
  modo_acesso  text not null check (modo_acesso in ('api','xml','scrape')),
  parser_key   text not null,
  cron_expr    text,
  config_json  jsonb not null default '{}'::jsonb,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now()
);
comment on column public.fontes_diarios.parser_key is
  'Chave do módulo de parser. Adicionar fonte = 1 linha aqui + 1 módulo novo. Zero edição de arquivo existente (§5.1).';

create table public.edicoes (
  id               uuid primary key default gen_random_uuid(),
  fonte_id         uuid not null references public.fontes_diarios(id) on delete restrict,
  numero           text,
  data_publicacao  date not null,
  url_original     text not null,
  arquivo_path     text,   -- PDF/XML cru no Storage, salvo ANTES do parsing
  hash_sha256      text,   -- integridade + dedup + âncora de fixidez (RDC-Arq, §8.1)
  status           text not null default 'baixada'
                   check (status in ('baixada','extraida','falha','reprocessar')),
  tentativas       int not null default 0,
  erro_ultimo      text,
  capturada_em     timestamptz not null default now(),
  unique (fonte_id, data_publicacao, numero)
);
create index on public.edicoes (fonte_id, data_publicacao desc);
create index on public.edicoes (status) where status in ('falha','reprocessar');
comment on column public.edicoes.hash_sha256 is
  'Âncora de fixidez da camada de preservação (F3). Entra no schema desde F0 por isso.';

create table public.atos (
  id                  uuid primary key default gen_random_uuid(),
  edicao_id           uuid not null references public.edicoes(id) on delete restrict,
  fonte_id            uuid not null references public.fontes_diarios(id) on delete restrict,
  tipo                text,
  numero              text,
  ano                 int,
  orgao_emissor       text,
  ementa              text,
  texto_bruto         text,
  data_ato            date,
  data_publicacao     date not null,
  pagina              text,
  url_original        text,
  conteudo_ts         tsvector,
  confianca_extracao  numeric(3,2),
  -- auditoria essencial: "este campo veio da fonte oficial ou de um modelo?"
  origem_extracao     text not null check (origem_extracao in ('api','xml','ia','humano')),
  status              text not null default 'ok'
                      check (status in ('ok','revisao','descartado')),
  created_at          timestamptz not null default now()
);
create index on public.atos (fonte_id, data_publicacao desc);
create index on public.atos (status) where status = 'revisao';
create index on public.atos using gin (conteudo_ts);

-- Campo ausente é null, nunca inventado → cai na fila de revisão (§6.2, trava 2).
-- Fonte estruturada (api/xml) NÃO passa por revisão: confiança 1.0 por definição (§5.4).
create or replace function public.atos_indexar_e_triar()
returns trigger language plpgsql as $$
begin
  new.conteudo_ts :=
    setweight(to_tsvector('portuguese', coalesce(new.ementa, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(new.texto_bruto, '')), 'B');

  if new.origem_extracao in ('api','xml') then
    new.confianca_extracao := coalesce(new.confianca_extracao, 1.00);
  elsif new.origem_extracao = 'ia'
        and (new.numero is null or new.tipo is null or new.data_ato is null) then
    new.status := 'revisao';
  end if;
  return new;
end $$;

create trigger trg_atos_indexar_e_triar
  before insert or update on public.atos
  for each row execute function public.atos_indexar_e_triar();

-- ============================================================================
-- 3. ACERVO NORMATIVO — mutável, versionado (o MAN-01)
-- ============================================================================

create table public.normas (
  id                    uuid primary key default gen_random_uuid(),
  instituicao_id        uuid not null references public.instituicoes(id) on delete cascade,
  tipo                  text not null,
  numero                text not null,
  ano                   int not null,
  orgao_emissor         text not null,
  ementa                text,
  situacao              text not null default 'vigente'
                        check (situacao in ('vigente','revogada','revogada_parcialmente',
                                            'alterada','suspensa','sem_eficacia')),
  data_inicio_vigencia  date,
  data_fim_vigencia     date,
  ato_origem_id         uuid references public.atos(id) on delete set null,
  versao_atual_id       uuid,   -- FK adicionada após norma_versoes (dependência circular)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (instituicao_id, tipo, numero, ano, orgao_emissor)
);
create index on public.normas (instituicao_id, situacao);

create table public.norma_versoes (
  id               uuid primary key default gen_random_uuid(),
  norma_id         uuid not null references public.normas(id) on delete cascade,
  versao           int not null,
  texto_compilado  text,
  texto_html       text,
  vigente_de       date,
  vigente_ate      date,
  ato_causador_id  uuid references public.atos(id) on delete set null,
  aprovada_por     uuid references public.usuarios(id) on delete set null,
  aprovada_em      timestamptz,
  created_at       timestamptz not null default now(),
  unique (norma_id, versao)
);
create index on public.norma_versoes (norma_id, versao desc);

alter table public.normas
  add constraint normas_versao_atual_fk
  foreign key (versao_atual_id) references public.norma_versoes(id) on delete set null;

create table public.norma_relacoes (
  id                uuid primary key default gen_random_uuid(),
  instituicao_id    uuid not null references public.instituicoes(id) on delete cascade,
  ato_origem_id     uuid not null references public.atos(id) on delete cascade,
  norma_destino_id  uuid not null references public.normas(id) on delete cascade,
  tipo              text not null
                    check (tipo in ('cria','altera','revoga','revoga_parcialmente',
                                    'regulamenta','suspende','repristina')),
  dispositivo       text,   -- ex.: 'art. 5º, §2º'
  proposta_por      text not null default 'ia' check (proposta_por in ('ia','humano')),
  confianca         numeric(3,2),
  -- CORAÇÃO DO CONTROLE DE QUALIDADE (§4.3): a IA propõe, o humano dispõe.
  -- Nenhum caminho de código altera normas.situacao sem aprovação registrada.
  status            text not null default 'proposta'
                    check (status in ('proposta','aprovada','rejeitada')),
  revisada_por      uuid references public.usuarios(id) on delete set null,
  revisada_em       timestamptz,
  observacao        text,
  created_at        timestamptz not null default now()
);
create index on public.norma_relacoes (instituicao_id, status) where status = 'proposta';
create index on public.norma_relacoes (norma_destino_id);

-- ============================================================================
-- 4. DISTRIBUIÇÃO (o MAN-02)
-- ============================================================================

create table public.listas_disparo (
  id              uuid primary key default gen_random_uuid(),
  instituicao_id  uuid not null references public.instituicoes(id) on delete cascade,
  nome            text not null,
  filtros_json    jsonb not null default '{}'::jsonb,
  frequencia      text not null default 'manual'
                  check (frequencia in ('manual','diaria','semanal')),
  template_id     text,
  criado_por      uuid references public.usuarios(id) on delete set null,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now()
);
create index on public.listas_disparo (instituicao_id) where ativo;

-- Tabela própria (não campo texto): LGPD exige opt-out datado, e o titular
-- precisa existir como entidade para exercer direitos (§4.4).
create table public.destinatarios (
  id         uuid primary key default gen_random_uuid(),
  lista_id   uuid not null references public.listas_disparo(id) on delete cascade,
  nome       text,
  email      text not null,
  ativo      boolean not null default true,
  optin_em   timestamptz not null default now(),
  optout_em  timestamptz,
  unique (lista_id, email)
);
create index on public.destinatarios (lista_id) where ativo;

create table public.envios (
  id                   uuid primary key default gen_random_uuid(),
  lista_id             uuid not null references public.listas_disparo(id) on delete cascade,
  destinatario_id      uuid references public.destinatarios(id) on delete set null,
  atos_ids             jsonb not null default '[]'::jsonb,  -- prova de que a norma foi comunicada
  normas_ids           jsonb not null default '[]'::jsonb,
  status               text not null default 'pendente'
                       check (status in ('pendente','enviado','entregue','aberto','falhou')),
  provider_message_id  text,
  erro                 text,
  enviado_em           timestamptz,
  evento_em            timestamptz,
  created_at           timestamptz not null default now()
);
create index on public.envios (lista_id, created_at desc);
create index on public.envios (status);

-- ============================================================================
-- 5. GOVERNANÇA — append-only
-- ============================================================================

create table public.auditoria (
  id              bigserial primary key,
  instituicao_id  uuid references public.instituicoes(id) on delete set null,
  usuario_id      uuid references public.usuarios(id) on delete set null,
  entidade        text not null,
  entidade_id     text not null,
  acao            text not null,
  valor_anterior  jsonb,
  valor_novo      jsonb,
  em              timestamptz not null default now()
);
create index on public.auditoria (instituicao_id, em desc);
create index on public.auditoria (entidade, entidade_id);

-- Guarda permanente (Res. CNJ 324/2020 art. 30, IV): nenhum caminho de
-- aplicação altera ou apaga evidência.
revoke update, delete on public.auditoria from public;
revoke update, delete on public.atos      from public;
revoke update, delete on public.edicoes   from public;

-- Fila de revisão (§4.5): relações aguardando aprovação do revisor.
-- Atos duvidosos são consultados por `status='revisao'` diretamente — o acervo
-- de atos é compartilhado entre tenants (o diário é público), logo não é
-- tenant-scoped e não entra nesta view.
create view public.fila_revisao_relacoes as
  select r.id, r.instituicao_id, r.tipo, r.dispositivo, r.confianca,
         r.ato_origem_id, r.norma_destino_id, r.created_at
    from public.norma_relacoes r
   where r.status = 'proposta';

-- ============================================================================
-- 6. RLS — isolamento multi-tenant
-- ============================================================================

alter table public.instituicoes   enable row level security;
alter table public.usuarios       enable row level security;
alter table public.normas         enable row level security;
alter table public.norma_versoes  enable row level security;
alter table public.norma_relacoes enable row level security;
alter table public.listas_disparo enable row level security;
alter table public.destinatarios  enable row level security;
alter table public.envios         enable row level security;
alter table public.auditoria      enable row level security;

-- Ingestão = acervo público compartilhado: leitura para autenticados,
-- escrita apenas por service_role (Edge Functions), que ignora RLS.
alter table public.fontes_diarios enable row level security;
alter table public.edicoes        enable row level security;
alter table public.atos           enable row level security;

create policy inst_self on public.instituicoes
  for select using (id = public.instituicao_do_usuario());

create policy usuarios_tenant on public.usuarios
  for select using (instituicao_id = public.instituicao_do_usuario());

create policy normas_tenant on public.normas
  for all using (instituicao_id = public.instituicao_do_usuario())
  with check (instituicao_id = public.instituicao_do_usuario());

create policy norma_versoes_tenant on public.norma_versoes
  for all using (exists (
    select 1 from public.normas n
     where n.id = norma_versoes.norma_id
       and n.instituicao_id = public.instituicao_do_usuario()));

create policy norma_relacoes_tenant on public.norma_relacoes
  for all using (instituicao_id = public.instituicao_do_usuario())
  with check (instituicao_id = public.instituicao_do_usuario());

create policy listas_tenant on public.listas_disparo
  for all using (instituicao_id = public.instituicao_do_usuario())
  with check (instituicao_id = public.instituicao_do_usuario());

create policy destinatarios_tenant on public.destinatarios
  for all using (exists (
    select 1 from public.listas_disparo l
     where l.id = destinatarios.lista_id
       and l.instituicao_id = public.instituicao_do_usuario()));

create policy envios_tenant on public.envios
  for all using (exists (
    select 1 from public.listas_disparo l
     where l.id = envios.lista_id
       and l.instituicao_id = public.instituicao_do_usuario()));

create policy auditoria_tenant on public.auditoria
  for select using (instituicao_id = public.instituicao_do_usuario());

create policy fontes_leitura  on public.fontes_diarios for select using (auth.uid() is not null);
create policy edicoes_leitura on public.edicoes        for select using (auth.uid() is not null);
create policy atos_leitura    on public.atos           for select using (auth.uid() is not null);

-- ============================================================================
-- 7. SEED — 6 fontes reais (§5) + 2 instituições sintéticas para o gate de RLS
-- ============================================================================

insert into public.fontes_diarios (nome, sigla, url_base, esfera, poder, uf, modo_acesso, parser_key, cron_expr) values
  ('Diário Oficial do Estado de MS', 'DOMS', 'https://assets.imprensaoficial.ms.gov.br',    'executivo',  'executivo',  'MS', 'scrape', 'doms-pdf',   '0 9 * * 1-5'),
  ('Diário Oficial da União',        'DOU',  'https://inlabs.in.gov.br',                    'executivo',  'executivo',  null, 'xml',    'dou-inlabs', '0 8 * * 1-6'),
  ('Diário da Justiça de MS',        'DJMS', 'https://esaj.tjms.jus.br/cdje',               'judiciario', 'judiciario', 'MS', 'scrape', 'djms-esaj',  '0 10 * * 1-5'),
  ('Atos Normativos do CNJ',         'CNJ',  'https://atos.cnj.jus.br',                     'judiciario', 'judiciario', null, 'scrape', 'cnj-atos',   '0 11 * * 1-5'),
  ('Atos Normativos do STF',         'STF',  'https://www.stf.jus.br/portal/atonormativo',  'judiciario', 'judiciario', null, 'scrape', 'stf-atos',   '0 12 * * 1-5'),
  ('Atos Normativos do STJ',         'STJ',  'https://transparencia.stj.jus.br',            'judiciario', 'judiciario', null, 'scrape', 'stj-atos',   '0 13 * * 1-5');

insert into public.instituicoes (id, nome, cnpj, esfera, uf, plano) values
  ('11111111-1111-1111-1111-111111111111', 'Tribunal de Teste A', '00000000000191', 'judiciario', 'MS', 'piloto'),
  ('22222222-2222-2222-2222-222222222222', 'Tribunal de Teste B', '00000000000272', 'judiciario', 'SP', 'piloto');
