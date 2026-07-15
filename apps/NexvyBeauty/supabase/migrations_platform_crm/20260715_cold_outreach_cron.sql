-- ============================================================================
-- 20260715_cold_outreach_cron.sql — CRON do tick do cold outreach (ATIVAÇÃO)
--
-- Agenda o pg_cron que chama a action `tick` de platform-cold-outreach a cada
-- minuto. MESMO padrão do 20260703_platform_crons_campaign_notif.sql
-- (service_role via vault; idempotente por nome).
--
-- ⚠️ ESTE É UM PASSO DE ATIVAÇÃO — aplicar SÓ quando o Marcelo for ligar o
-- pipeline. É SEGURO mas desnecessário antes disso:
--   • O tick é NO-OP enquanto não houver campanha com status 'active'/'warming'.
--   • Mesmo com campanha ativa, o envio é DUPLO-GATED (dry_run + COLD_OUTREACH_ENABLED);
--     em dry-run o tick só simula (log + fila), não envia nada.
-- Pré-requisitos: pg_cron + pg_net ativos; secret 'service_role_key' no vault;
--   edge platform-cold-outreach JÁ deployado (senão o POST responde 401/404 sem
--   efeito colateral).
-- Para DESLIGAR: select cron.unschedule('platform-cold-outreach-tick');
-- ============================================================================

select cron.schedule('platform-cold-outreach-tick', '* * * * *', $c1$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/platform-cold-outreach',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"action":"tick"}'::jsonb
  );
$c1$);

-- Fim 20260715_cold_outreach_cron.sql
