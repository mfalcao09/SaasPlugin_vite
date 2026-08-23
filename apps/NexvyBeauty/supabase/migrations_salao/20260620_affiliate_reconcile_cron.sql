-- ============================================================================
-- Fase 5 — Reconciliador de comissões AGENDADO (pg_cron + pg_net)
-- Backstop automático: chama a Edge Function `cakto-affiliate-reconcile` 6x/dia,
-- recuperando comissões que o webhook em tempo real tenha perdido (idempotente).
--
-- RISCO (histórico 720d126): o commit original embutia um JWT anon hardcoded
-- no SQL. NÃO versionar o segredo. Auth segue o padrão do repo
-- (20260716_demo_reaper_cron / 20260722_a2_a7): vault.decrypted_secrets
-- name = 'service_role_key'. NÃO aplicar em produção neste P0.
--
-- Horários em UTC (servidor UTC; cron.timezone = GMT). Brasil = UTC-3 (sem DST).
--   05:00 BRT = 08:00 UTC | 09:00 = 12:00 | 12:00 = 15:00
--   15:00 BRT = 18:00 UTC | 18:00 = 21:00 | 21:30 = 00:30 (+1 dia)
--
-- cron.schedule é idempotente (upsert por jobname).
-- Extensões pg_cron + pg_net já habilitadas no projeto.
-- ============================================================================

select cron.schedule(
  'affiliate-reconcile-0500-brt',
  '0 8 * * *',
  $cmd$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/cakto-affiliate-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
select cron.schedule(
  'affiliate-reconcile-0900-brt',
  '0 12 * * *',
  $cmd$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/cakto-affiliate-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
select cron.schedule(
  'affiliate-reconcile-1200-brt',
  '0 15 * * *',
  $cmd$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/cakto-affiliate-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
select cron.schedule(
  'affiliate-reconcile-1500-brt',
  '0 18 * * *',
  $cmd$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/cakto-affiliate-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
select cron.schedule(
  'affiliate-reconcile-1800-brt',
  '0 21 * * *',
  $cmd$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/cakto-affiliate-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
select cron.schedule(
  'affiliate-reconcile-2130-brt',
  '30 0 * * *',
  $cmd$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/cakto-affiliate-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $cmd$
);

-- Para remover (rollback): select cron.unschedule('affiliate-reconcile-0500-brt'); (repetir p/ cada jobname)
