-- ============================================================================
-- ESTEIRA F1 — rate-limit DURÁVEL do endpoint público demo-start (R4).
--
-- O único rate-limit que existe hoje (platform-form-submit) é in-memory e morre
-- no cold start / não cruza instâncias — insuficiente para um endpoint público
-- que cria org + (potencialmente) instância Evolution. Esta tabela dá um gate
-- determinístico por IP e por telefone.
--
-- Só o service_role (a edge demo-start) escreve/lê. RLS ligada sem policy =
-- ninguém além do service_role acessa.
-- ============================================================================
create table if not exists public.demo_start_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text,
  phone text,
  created_at timestamptz not null default now()
);

create index if not exists idx_demo_start_attempts_phone
  on public.demo_start_attempts (phone, created_at desc);
create index if not exists idx_demo_start_attempts_ip
  on public.demo_start_attempts (ip, created_at desc);

alter table public.demo_start_attempts enable row level security;
grant select, insert, delete on public.demo_start_attempts to service_role;

comment on table public.demo_start_attempts is
  'Esteira demo: tentativas de demo-start p/ rate-limit durável (IP + telefone). Prunável pelo demo-reaper.';
