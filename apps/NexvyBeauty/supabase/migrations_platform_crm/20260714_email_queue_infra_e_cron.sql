-- ─────────────────────────────────────────────────────────────────────────────
-- 20260714_email_queue_infra_e_cron.sql — infra da fila de e-mail + cron dispatcher
-- APLICADA via MCP apply_migration em 2026-07-14 (migrations: email_queue_infra,
-- cron_process_email_queue). Este arquivo é o registro versionado.
--
-- Contexto (sondagem Resend 2026-07-13): a fila 'transactional_emails' existia,
-- mas (a) auth-email-hook enfileira em 'auth_emails' (inexistente → auth e-mails
-- quebravam); (b) as DLQs não existiam (falha só logava); (c) email_send_state
-- esperava seed id=1 (sem ela o backoff de rate-limit era no-op); (d) NÃO havia
-- cron consumindo a fila → e-mail NUNCA saía (TTL 60min → expirava).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Filas pgmq faltantes
select pgmq.create('auth_emails');
select pgmq.create('transactional_emails_dlq');
select pgmq.create('auth_emails_dlq');

-- 2. Seed do estado do dispatcher (backoff de rate-limit)
insert into public.email_send_state (id) values (1) on conflict (id) do nothing;

-- 3. Cron do dispatcher (a cada minuto). process-email-queue EXIGE role=service_role
--    (anon = 401) → padrão vault (mesmo dos jobs 19-22 do projeto).
select cron.schedule('process-email-queue', '* * * * *', $c$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
$c$);
