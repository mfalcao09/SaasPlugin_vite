-- ─────────────────────────────────────────────────────────────────────────────
-- 20260709_platform_cron_dispatch_scheduled.sql — A1.2 (agendamento de mensagens)
--
-- pg_cron do dispatcher da fila platform_crm_scheduled_messages: a cada minuto
-- chama a action `dispatch-scheduled` de platform-webchat-inbox.
--
-- MESMO padrão do 20260703_platform_crons_campaign_notif.sql (service_role via
-- vault; jobs idempotentes por nome — re-rodar atualiza, não duplica).
-- Pré-requisitos (iguais aos crons existentes, já ativos em prod):
--   * extensões pg_cron + pg_net ativas;
--   * secret 'service_role_key' no vault (vault.decrypted_secrets).
-- Guard verificado antes de ligar: a action é no-op quando não há pending
-- vencida (retorna {processed:0}) e o claim pending→sending é idempotente
-- entre ticks concorrentes.
-- ORDEM DE APLICAÇÃO: depois da migration da tabela
-- (20260709_platform_crm_scheduled_messages.sql) E do deploy da edge
-- platform-webchat-inbox com a action nova — antes disso o job responde
-- "Invalid action" (400) sem efeito colateral.
-- ─────────────────────────────────────────────────────────────────────────────

select cron.schedule('platform-dispatch-scheduled-messages', '* * * * *', $c1$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/platform-webchat-inbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"action":"dispatch-scheduled"}'::jsonb
  );
$c1$);
