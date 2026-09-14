-- ============================================================================
-- 20260914_rls_p0_lock_backup_tables.sql
--
-- P0 auditoria RLS: 16 tabelas bkp/_arquivo/tmp em public SEM RLS, com
-- GRANT total a anon+authenticated (chave anon no frontend = vazamento).
-- Evidência: _arquivo_clientes_meuteste1_20260801 com ~84k linhas (PII).
--
-- Correção (dados preservados — sem DROP):
--   1) REVOKE ALL FROM anon, authenticated
--   2) ENABLE ROW LEVEL SECURITY (0 policies client = deny-all)
--
-- P1:
--   - help_article_feedback: SELECT só do próprio user (não qual=true)
--   - REVOKE SELECT ON profiles FROM anon (higiene; RLS já negava linhas)
--
-- Check binário:
--   has_table_privilege('anon', <tabela>, 'SELECT') = false p/ as 16
--   relrowsecurity = true p/ as 16
--   policy SELECT help_article_feedback NÃO é qual=true
-- ============================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    '_arquivo_carteira_propostas_meuteste1_20260801',
    '_arquivo_clientes_meuteste1_20260801',
    'bkp_agents_pre_pr3_20260804',
    'bkp_agents_pre_prompt_20260805',
    'bkp_agents_pre_promptv2_20260805',
    'bkp_agents_pre_promptv3_20260805',
    'bkp_agents_pre_promptv4_20260806',
    'bkp_conversa_teste_20260806',
    'bkp_duda_prompt_20260806',
    'bkp_duda_prompt_20260806_12min',
    'bkp_org_demo_mbruno_20260806',
    'bkp_orgs_is_test_20260806',
    'bkp_produto_kb_20260806',
    'bkp_produto_kb_20260806_passos',
    'bkp_submission_demo_20260806',
    'tmp_eval_runs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE NOTICE 'skip missing table %', t;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- Sem policies para anon/authenticated => negação total via API.
    -- service_role (BYPASSRLS) e superuser seguem acessando se necessário.
  END LOOP;
END $$;

-- P1: feedback de ajuda — não vazar leituras cross-user
DROP POLICY IF EXISTS "Users view all feedback" ON public.help_article_feedback;
CREATE POLICY "Users view own feedback"
  ON public.help_article_feedback
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- P1: anon não precisa de SELECT privilege em profiles
REVOKE SELECT ON TABLE public.profiles FROM anon;
