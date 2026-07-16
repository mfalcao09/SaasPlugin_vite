-- ─────────────────────────────────────────────────────────────────────────────
-- 20260715_email_send_log_status_dry_run.sql
-- Amplia (aditiva) os status permitidos em public.email_send_log.
-- APLICADA via MCP apply_migration em 2026-07-15
-- (migration: email_send_log_status_add_dry_run_rate_limited). Registro versionado.
--
-- Contexto (sondagem go-live Resend 2026-07-15):
--   • 'dry_run'      — process-email-queue passa a rodar GATED na RESEND_API_KEY.
--                      Sem a chave (ou EMAIL_DRY_RUN=true) ele DRENA a fila e registra
--                      cada mensagem como 'dry_run', mas NÃO chama a Resend (não envia).
--                      Este status precisava ser aceito pelo CHECK.
--   • 'rate_limited' — o dispatcher já inseria este status no path 429 da Resend, mas ele
--                      NÃO constava no CHECK antigo → o insert quebraria na 1ª vez que a
--                      Resend limitasse. Fix latente incluído aqui (mesma linha do ARRAY).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.email_send_log drop constraint if exists email_send_log_status_check;
alter table public.email_send_log
  add constraint email_send_log_status_check
  check (status = any (array[
    'pending','sent','suppressed','failed','bounced','complained','dlq','rate_limited','dry_run'
  ]::text[]));
