-- B4 / FASE 1 — infraestrutura da carga do legado.
-- Aplicada em prod como `b4_fase1_import_legado_infra`.
--
-- A Fase 0 provou que o histórico está no Postgres do Evolution (VPS) e que a API
-- `chat/findMessages` o serve sob demanda, com filtro por `key.remoteJid`. Então a
-- carga é banco-a-banco, repetível e reversível — sem reconexão, sem tiro único.
-- (Foi isto que matou a Fase 6 do plano.)

-- ── 1) Idempotência de mensagem OUTBOUND ────────────────────────────────────────
-- Já existia `webchat_messages_inbound_evolution_msg_uniq`, mas só para inbound. Sem
-- o simétrico, cada re-execução duplicaria toda mensagem que a dona enviou.
-- NOTA: ambos ficaram obsoletos pela migration `b4_fase1_indice_nao_parcial_on_conflict`,
-- que trocou a estratégia por uma coluna real + índice único não-parcial. Mantidos
-- porque são defesa em profundidade e não custam nada.
create unique index if not exists webchat_messages_outbound_evolution_msg_uniq
  on public.webchat_messages (conversation_id, ((metadata ->> 'evolution_message_id')))
  where direction = 'outbound' and (metadata ->> 'evolution_message_id') is not null;

-- ── 2) Fila de trabalho, um registro por CONTATO ────────────────────────────────
-- Itera contato a contato (não página global) porque: dá chunking natural dentro do
-- limite de tempo da edge function, é resumível no ponto exato onde parou, e o
-- progresso fica legível — "faltam N contatos" em vez de "faltam N páginas".
create table if not exists public.carteira_import_jobs (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid        not null references public.organizations(id) on delete cascade,
  instance_name        text        not null,
  remote_jid           text        not null,
  telefone_normalizado text,
  status               text        not null default 'pendente'
                       check (status in ('pendente','feito','erro','ignorado')),
  motivo_ignorado      text,
  mensagens_importadas integer     not null default 0,
  erro                 text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (organization_id, instance_name, remote_jid)
);

-- pegar o próximo lote é a query mais quente do carregador
create index if not exists idx_carteira_import_jobs_fila
  on public.carteira_import_jobs (organization_id, instance_name, status);

comment on table public.carteira_import_jobs is
  'Fila da carga do legado do WhatsApp, 1 linha por contato. Resumivel: o carregador processa os pendentes em lotes ate a fila zerar.';
comment on column public.carteira_import_jobs.motivo_ignorado is
  'Por que o contato nao entra na carteira: grupo (@g.us), lid (sem telefone) ou nao_br. Registrado em vez de silenciosamente pulado.';

-- Tabela de infraestrutura interna: só service_role toca.
alter table public.carteira_import_jobs enable row level security;
revoke all on public.carteira_import_jobs from public, anon, authenticated;
grant all on public.carteira_import_jobs to service_role;
