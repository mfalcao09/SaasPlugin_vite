-- ============================================================================
-- ESTEIRA F1 — modo demo + TTL da org provisória.
--
-- O wizard público por token (onboarding_submissions + /implantacao/:token) já
-- existe; a esteira reusa esse fluxo com mode='demo'. A org demo é uma
-- organizations com plan_status='demo' e um TTL (demo_expires_at). A conversão
-- (cakto-plan-provisioning) troca plan_status='demo'->'active' e zera o TTL —
-- a promoção in-place, sem retrabalho.
--
-- Tudo ADITIVO:
--   1. onboarding_submissions.mode CHECK += 'demo' (DROP+ADD idempotente — o
--      CHECK antigo rejeitaria 'demo').
--   2. organizations.demo_expires_at timestamptz NULL (criação + 72h; a
--      promoção seta NULL; o demo-reaper usa < now()).
--   3. índice parcial p/ o reaper varrer só as demos vencidas.
-- ============================================================================

-- 1) mode CHECK += 'demo' (idempotente: localiza o CHECK de `mode` pelo conteúdo,
--    dropa e recria com 'demo'. Reexecutar reencontra o novo e recria igual.)
do $$
declare cn text;
begin
  select conname into cn
    from pg_constraint
   where conrelid = 'public.onboarding_submissions'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%mode%'
     and pg_get_constraintdef(oid) ilike '%first_access%';
  if cn is not null then
    execute format('alter table public.onboarding_submissions drop constraint %I', cn);
  end if;
end $$;

alter table public.onboarding_submissions
  add constraint onboarding_submissions_mode_check
  check (mode = any (array['link', 'first_access', 'demo']));

-- 2) TTL da org demo (NULL = não é demo / já promovida)
alter table public.organizations
  add column if not exists demo_expires_at timestamptz;

comment on column public.organizations.demo_expires_at is
  'Esteira demo: expira em criação+72h. Promoção (cakto) seta NULL. demo-reaper apaga quando < now() (guard plan_status=demo).';

-- 3) Índice parcial p/ o reaper (só as demos vencidas)
create index if not exists idx_organizations_demo_expires
  on public.organizations (demo_expires_at)
  where plan_status = 'demo';
