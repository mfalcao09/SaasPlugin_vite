-- =====================================================================
-- ONDA 3 — Web Push: tabela de subscriptions + RLS (port CBA->NX)
-- project: fzhlbwhdejumkyqosuvq. Aplicado live 2026-06-23 via Supabase MCP.
-- VAPID NÃO vai aqui — vive em Supabase secrets (VAPID_PUBLIC/PRIVATE/SUBJECT).
-- Prefs de notificação reusam user_notification_settings (push_enabled +
-- notify_appointments), já per-user no schema vivo.
-- =====================================================================
create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  ativo           boolean not null default true,
  ultimo_erro     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint push_subscriptions_user_endpoint_uniq unique (user_id, endpoint)
);

create index if not exists push_subscriptions_org_idx
  on public.push_subscriptions (organization_id) where ativo;
create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id) where ativo;

create or replace function public.tg_push_subscriptions_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_push_subscriptions_updated_at on public.push_subscriptions;
create trigger trg_push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function public.tg_push_subscriptions_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select
  using (user_id = auth.uid() or public.is_super_admin(auth.uid()));
drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions for insert
  with check (user_id = auth.uid());
drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions for update
  using (user_id = auth.uid() or public.is_super_admin(auth.uid()))
  with check (user_id = auth.uid() or public.is_super_admin(auth.uid()));
drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions for delete
  using (user_id = auth.uid() or public.is_super_admin(auth.uid()));
