-- L2-L3 (LOTE P4) — pg_cron dos dispatchers OUTBOUND do CRM de PLATAFORMA.
-- Aplicado em prod via MCP execute_sql em 2026-07-03 (projeto fzhlbwhdejumkyqosuvq).
-- Guards VERIFICADOS antes de ligar (crons AO VIVO, mas dormentes ate configurar):
--   * platform-campaign-dispatcher: early-return 'no_active_campaigns' + idempotencia
--     (claim fair-share + status='queued'); grava envio em platform_crm_conversations.
--   * platform-auto-notifications: so dispara settings *_enabled + dedup 'already
--     notified today'; grava em platform_crm_notifications (alerta ao super-admin).
-- Estado no momento do deploy: active_campaigns=0, notif_settings_on=0 => no-op.
-- Mesmo padrao (service_role via vault) do platform-cadence-tick (jobid 19).
-- cron.schedule e idempotente por nome (re-rodar atualiza, nao duplica).

select cron.schedule('platform-campaign-dispatcher', '* * * * *', $c1$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/platform-campaign-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
$c1$);

select cron.schedule('platform-auto-notifications', '*/15 * * * *', $c2$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/platform-auto-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
$c2$);
