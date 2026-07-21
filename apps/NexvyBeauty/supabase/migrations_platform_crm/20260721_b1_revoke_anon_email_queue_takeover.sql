-- ─────────────────────────────────────────────────────────────────────────────
-- 20260721_b1_revoke_anon_email_queue_takeover.sql
-- APLICADA via MCP apply_migration em 2026-07-21 11:55 UTC
-- (migration: b1_revoke_anon_email_queue_takeover). Este arquivo é o registro
-- versionado — sem ele a mudança vira drift: existe em produção e não no código.
--
-- ACHADO B1 da auditoria de prontidão GO LIVE (tasks/AUDITORIA-GO-LIVE-2026-07-21.md).
--
-- O QUE ESTAVA ABERTO
-- As 4 funções da fila de e-mail eram SECURITY DEFINER e EXECUTÁVEIS POR `anon`.
-- `anon` é a chave pública que vai no bundle do front — qualquer visitante a tem.
-- Consequência encadeada:
--   1. `read_email_batch` → ler a fila, que carrega o LINK DE RECUPERAÇÃO DE SENHA
--      → tomar a conta de qualquer usuário, inclusive super_admin;
--   2. `enqueue_email`    → enfileirar e-mail saindo de @nexvybeauty.com.br (phishing
--                           com o domínio legítimo, passando por SPF/DKIM);
--   3. `delete_email`     → apagar o e-mail de acesso de quem acabou de comprar.
--
-- `register_human_seller` entrou junto: SECURITY DEFINER sem gate nenhum, com
-- `ON CONFLICT (lower(email)) DO UPDATE ... user_id = COALESCE(...)`. Um anônimo
-- podia criar afiliado 'active', sequestrar o user_id de um afiliado existente e
-- reivindicar ref_code — desvio de comissão.
--
-- CAUSA-RAIZ (importante — é sistêmica, não pontual)
-- Nenhuma migration concedeu isso explicitamente. A migration de origem
-- (20260714_email_queue_infra_e_cron.sql) só cria filas e cron, sem GRANT.
-- O privilégio vem do DEFAULT DO POSTGRES: `CREATE FUNCTION` concede EXECUTE a
-- PUBLIC, e no Supabase `anon` herda PUBLIC. Toda função criada sem REVOKE
-- explícito nasce anon-executável.
-- Por isso o advisor acusa 98 de 104 funções SECURITY DEFINER nessa condição:
-- é UMA omissão repetida 98 vezes. A varredura da classe é o card B2.
--
-- POR QUE É SEGURO
-- Nenhum caller usa anon/JWT. Os 6 chamadores são edge functions com
-- SERVICE_ROLE_KEY: process-email-queue, send-transactional-email, auth-email-hook,
-- _shared/post-sale-engine, process-post-sale-scheduled,
-- platform-process-post-sale-scheduled. No front existem apenas os TIPOS gerados
-- em src/integrations/supabase/types.ts — nenhuma chamada real.
--
-- PROVA COLHIDA APÓS APLICAR
--   · has_function_privilege('anon', ...)          → false nas 5
--   · has_function_privilege('authenticated', ...) → false nas 5
--   · has_function_privilege('service_role', ...)  → true  nas 5
--   · process-email-queue: HTTP 200 às 11:56:00 e 11:57:00 UTC (pós-revoke)
--   · filas pgmq sem acúmulo: q_auth_emails=0, q_transactional_emails=0
--
-- O loop por regprocedure cobre eventuais sobrecargas de assinatura.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'read_email_batch','enqueue_email','delete_email','move_to_dlq',
        'register_human_seller'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    -- explícito: o cron/edge continua drenando a fila
    execute format('grant execute on function %s to service_role', r.sig);
    raise notice 'B1: revogado anon/authenticated em %', r.sig;
  end loop;
end $$;
