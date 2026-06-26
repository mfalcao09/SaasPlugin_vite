-- Feature C — Meta do Mês (faturamento). Tabela DEDICADA (não reusa sales_goals
-- de CRM, que tem RLS por role admin/manager + shape de deals/produto). 1 meta por
-- org por mês (period_start = 1º dia do mês). RLS padrão de salão (org members).
create table if not exists public.salon_monthly_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  period_start date not null,                 -- 1º dia do mês (YYYY-MM-01)
  target_value numeric not null check (target_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, period_start)
);
create index if not exists idx_salon_monthly_goals_org on public.salon_monthly_goals(organization_id);

alter table public.salon_monthly_goals enable row level security;
create policy "org members manage salon_monthly_goals" on public.salon_monthly_goals
  for all using (organization_id = get_user_organization(auth.uid()))
  with check (organization_id = get_user_organization(auth.uid()));
