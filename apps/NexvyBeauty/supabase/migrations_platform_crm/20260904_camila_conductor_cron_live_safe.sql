-- 20260904_camila_conductor_cron_live_safe.sql
-- Liga live no cron COM body dry_run:false, mas o edge tem:
--   MAX_WAKES_PER_TICK=1, cooldown 2h, allowlist 5, auto_reply noop.
-- Idempotente: unschedule + schedule.

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'platform-camila-conductor';

SELECT cron.schedule(
  'platform-camila-conductor',
  '* * * * *',
  $c1$
  SELECT net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/platform-camila-conductor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"dry_run":false}'::jsonb
  );
  $c1$
);

-- Marca wake recente na Jeissiane (wake manual 2026-09-04) p/ cooldown 2h não re-disparar agora.
UPDATE public.platform_crm_conversations
SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'camila_last_wake_at', '2026-09-04T11:28:35.000Z'
)
WHERE id = 'db870f09-54d1-4e1b-a221-6af8fb24788f';
