-- ============================================================================
-- CORREÇÃO DE SEGURANÇA — vazamento cross-tenant via view
--
-- ACHADO (2026-07-23, durante o card C1.3): a view `fila_revisao_relacoes`,
-- criada na migration 20260723000001, devolvia linhas de TODOS os tenants
-- para um usuário autenticado de um único tenant.
--
-- CAUSA: no PostgreSQL, uma view executa com os privilégios do seu DONO, não
-- de quem consulta. Como o dono (quem roda a migration) não está sujeito às
-- policies de RLS, a view as ignora — mesmo com RLS correta e habilitada na
-- tabela base. É o padrão que o linter do Supabase reporta como
-- "Security Definer View".
--
-- PROVA (Postgres 18, role `authenticated` do tenant A, dentro de transação):
--     select count(*) from norma_relacoes where status='proposta'  -> 1  correto
--     select count(*) from fila_revisao_relacoes                   -> 2  VAZAMENTO
--
-- POR QUE PASSOU DESPERCEBIDO: o gate de isolamento (C0.3) testava apenas
-- TABELAS. View não é tabela — e um gate só protege a superfície que mede.
-- O teste correspondente entra em tests/rls.test.sql nesta mesma entrega,
-- para tornar a regressão impossível.
--
-- CORREÇÃO: `security_invoker = on` faz a view herdar as policies de quem
-- consulta — o comportamento esperado num sistema multi-tenant.
-- ============================================================================

alter view public.fila_revisao_relacoes set (security_invoker = on);

comment on view public.fila_revisao_relacoes is
  'Relações normativas aguardando aprovação humana (status=proposta). '
  'security_invoker=on é OBRIGATÓRIO: sem isso a view ignora a RLS de '
  'norma_relacoes e expõe dados de outros tenants. Ver migration 0003.';

-- ----------------------------------------------------------------------------
-- Trava preventiva: toda view NOVA em `public` que exponha tabela com RLS
-- precisa declarar security_invoker. Esta função deixa o gate verificar isso
-- automaticamente, em vez de depender de alguém lembrar na revisão de código.
-- ----------------------------------------------------------------------------
create or replace function public.views_sem_security_invoker()
returns table (view_name text)
language sql
stable
as $$
  select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'v'
     and n.nspname = 'public'
     and coalesce(
           (select option_value
              from pg_options_to_table(c.reloptions)
             where option_name = 'security_invoker'),
           'false'
         ) not in ('true', 'on')
$$;

comment on function public.views_sem_security_invoker() is
  'Lista as views de public que NÃO declaram security_invoker. O gate de RLS '
  'exige resultado vazio: view sem security_invoker é porta lateral para '
  'vazamento cross-tenant.';
