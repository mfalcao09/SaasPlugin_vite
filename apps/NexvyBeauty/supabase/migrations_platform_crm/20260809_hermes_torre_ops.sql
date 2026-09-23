-- ═══════════════════════════════════════════════════════════════════════════
-- HERMES TORRE — fila de ops gestao ↔ Hermes (prospecção ativa Camila)
-- 2026-08-09
--
-- Hermes NÃO é o cérebro de conversa. Esta tabela é o hub de orquestração:
-- a UI gestao cria intenções; o Hermes na VPS faz poll e devolve status/resumo.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.platform_crm_hermes_ops (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  kind text not null,
  status text not null default 'queued',
  source text not null default 'gestao',
  correlation_id text not null default encode(gen_random_bytes(8), 'hex'),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_text text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_crm_hermes_ops_kind_chk check (
    kind = any (array[
      'propose_list',
      'request_dry_run_report',
      'request_preflight',
      'post_watch_event',
      'ack'
    ])
  ),
  constraint platform_crm_hermes_ops_status_chk check (
    status = any (array[
      'queued',
      'claimed',
      'done',
      'failed',
      'cancelled'
    ])
  ),
  constraint platform_crm_hermes_ops_source_chk check (
    source = any (array['gestao', 'hermes', 'system'])
  )
);

create index if not exists platform_crm_hermes_ops_poll_idx
  on public.platform_crm_hermes_ops (status, created_at)
  where status in ('queued', 'claimed');

create index if not exists platform_crm_hermes_ops_product_created_idx
  on public.platform_crm_hermes_ops (product_id, created_at desc);

create index if not exists platform_crm_hermes_ops_correlation_idx
  on public.platform_crm_hermes_ops (correlation_id);

comment on table public.platform_crm_hermes_ops is
  'Intenções e resultados da torre Hermes (orquestração Camila). Não armazena segredos.';

alter table public.platform_crm_hermes_ops enable row level security;

drop policy if exists hermes_ops_super_admin_all on public.platform_crm_hermes_ops;
create policy hermes_ops_super_admin_all
  on public.platform_crm_hermes_ops
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'super_admin'
    )
  );
