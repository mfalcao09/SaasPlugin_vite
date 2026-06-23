-- Next-Best-Action generativo: sugestões de IA por lead (acao + mensagem pronta).
-- Edge fn: supabase/functions/lead-nba. Aplicada live 2026-06-22 via Supabase MCP.
create table if not exists public.lead_nba_sugestao (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  acao text not null,
  motivo text,
  prioridade text not null default 'media' check (prioridade in ('alta','media','baixa')),
  canal_sugerido text,
  mensagem_sugerida text,
  status text not null default 'pendente' check (status in ('pendente','aplicada','descartada')),
  model text,
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_nba_org_lead on public.lead_nba_sugestao(organization_id, lead_id, status);
create index if not exists idx_lead_nba_created on public.lead_nba_sugestao(created_at desc);

alter table public.lead_nba_sugestao enable row level security;

drop policy if exists "nba_select_org" on public.lead_nba_sugestao;
create policy "nba_select_org" on public.lead_nba_sugestao
  for select to authenticated
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "nba_update_org" on public.lead_nba_sugestao;
create policy "nba_update_org" on public.lead_nba_sugestao
  for update to authenticated
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
