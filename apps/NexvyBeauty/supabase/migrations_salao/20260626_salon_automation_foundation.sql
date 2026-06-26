-- Feature B (Receitas de Automação de Salão) — fundação. Mecanismo DEDICADO,
-- separado do tag_automations de pagamento (zero risco ao fluxo de dinheiro).
-- Regras nascem DESLIGADAS (enabled=false) — nada dispara sozinho até o owner ligar.

create table if not exists public.salon_automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  tipo text not null check (tipo in ('aniversario','pacote_vencendo','agendamento_24h','retorno_inativo')),
  enabled boolean not null default false,
  template text,                                  -- mensagem (com {nome}); null = usa o padrão
  antecedencia_dias integer not null default 3,   -- pacote_vencendo: dias antes; retorno_inativo: dias inativo
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, tipo)
);
create index if not exists idx_salon_auto_rules_org on public.salon_automation_rules(organization_id);

create table if not exists public.salon_automation_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  tipo text not null,
  cliente_id uuid,
  cliente_nome text,
  telefone text,
  mensagem text,
  ref text not null,                              -- chave de idempotência (ex: aniversario:<cid>:<YYYY-MM>)
  status text not null default 'sent' check (status in ('sent','failed','skipped','dry_run')),
  created_at timestamptz not null default now()
);
create index if not exists idx_salon_auto_log_org on public.salon_automation_log(organization_id, tipo, created_at desc);
-- Idempotência: o MESMO evento (ref) não dispara 2x por org. dry_run/failed não bloqueiam.
create unique index if not exists uq_salon_auto_log_sent_ref
  on public.salon_automation_log(organization_id, ref) where status = 'sent';

alter table public.salon_automation_rules enable row level security;
alter table public.salon_automation_log enable row level security;

-- Owner gerencia as próprias regras (mesmo padrão das outras tabelas de salão).
create policy "org members manage salon_automation_rules" on public.salon_automation_rules
  for all using (organization_id = get_user_organization(auth.uid()))
  with check (organization_id = get_user_organization(auth.uid()));
-- Owner LÊ o próprio log; a escrita é feita pelo cron/edge (service role, bypassa RLS).
create policy "org members read salon_automation_log" on public.salon_automation_log
  for select using (organization_id = get_user_organization(auth.uid()));
