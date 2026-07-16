-- ============================================================================
-- ESTEIRA F3 — job pg_cron horário do demo-reaper (TTL 72h das orgs demo).
--
--   1. organizations.demo_warned_at timestamptz — idempotência do aviso T-24h.
--   2. cron horário (:17 p/ fugir do :00 thundering-herd) que bate a edge
--      demo-reaper com a service_role_key do vault (mesmo padrão do
--      nina-health-scan-daily). A edge faz T-24h (aviso) + T-0 (wipe).
--
-- Requer a edge demo-reaper JÁ deployada (o net.http_post falharia silencioso
-- senão — mas é aditivo/idempotente). Reaplicar re-agenda (unschedule guard).
-- ============================================================================

-- 1) marcador de aviso (aditivo)
alter table public.organizations
  add column if not exists demo_warned_at timestamptz;

comment on column public.organizations.demo_warned_at is
  'Esteira demo: quando o demo-reaper já avisou (T-24h) que a demo vai expirar. Idempotência do aviso.';

-- 2) (re)agenda o cron horário
do $$
begin
  perform cron.unschedule('demo-reaper-hourly');
exception when others then null; -- ainda não existe: ok
end $$;

select cron.schedule(
  'demo-reaper-hourly',
  '17 * * * *',
  $job$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/demo-reaper',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
