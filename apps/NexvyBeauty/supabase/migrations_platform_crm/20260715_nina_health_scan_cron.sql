-- ─────────────────────────────────────────────────────────────────────────────
-- 20260715_nina_health_scan_cron.sql — P2 · PR-A · A3
--
-- pg_cron diário da NINA: 12:00 UTC = 09:00 BRT (Brasil sem DST desde 2019 —
-- horário de manhã, bom pra mensagem a cliente). Chama a edge nina-health-scan
-- com service_role (via vault), que varre contas em D-7 de renovação e aciona
-- a Nina. MESMO padrão de 20260709_platform_cron_dispatch_scheduled.sql.
--
-- Pré-requisitos (iguais aos crons já ativos em prod): extensões pg_cron + pg_net;
-- secret 'service_role_key' no vault (vault.decrypted_secrets).
--
-- SEGURO POR CONSTRUÇÃO: a edge nasce gated (NINA_HEALTH_SCAN_ENABLED != 'true'
-- → retorna {skipped:'flag_off'}). Enquanto a flag estiver OFF, este job roda
-- todo dia e é NO-OP (nenhuma cliente é abordada). Ligar a flag SÓ depois do
-- PR-B (modo retenção da Nina) estar em produção.
--
-- Idempotente por nome (cron.schedule reusa o nome → atualiza, não duplica).
-- Aplicar no deploy do PR-A (após o deploy da edge nina-health-scan).
-- ─────────────────────────────────────────────────────────────────────────────

select cron.schedule('nina-health-scan-daily', '0 12 * * *', $c1$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/nina-health-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
$c1$);
