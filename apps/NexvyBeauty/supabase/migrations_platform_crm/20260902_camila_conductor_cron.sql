-- 20260902_camila_conductor_cron.sql
--
-- pg_cron 1/min → platform-camila-conductor.
-- SEGURO: dry-run default ON + ALLOW_LIVE default OFF → classifica, 0 WA.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'platform-camila-conductor'
  ) THEN
    PERFORM cron.schedule(
      'platform-camila-conductor',
      '* * * * *',
      $c1$
      SELECT net.http_post(
        url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/platform-camila-conductor',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
        ),
        body := '{}'::jsonb
      );
      $c1$
    );
  END IF;
END $$;
