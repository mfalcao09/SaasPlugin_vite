-- ============================================================================
-- cakto_orders: chave única resistente a NULL (escopo platform)
-- ----------------------------------------------------------------------------
-- BUG: o upsert em cakto_orders usa onConflict='scope,organization_id,cakto_id'
--   (supabase/functions/cakto-webhook/index.ts:120, cakto-proxy/index.ts:195,
--    doppus-webhook/index.ts:524). Para pedidos de escopo 'platform',
--   organization_id é NULL. Num índice único PADRÃO do Postgres, NULL != NULL:
--   cada reentrega/re-teste do webhook com o MESMO cakto_id INSERE uma linha
--   nova em vez de atualizar. Comprovado: 2 linhas com cakto_id b62bc7ef após
--   2 testes (pedido platform).
--
-- CORREÇÃO: recriar a chave única como UNIQUE NULLS NOT DISTINCT (PG15+), que
--   trata NULLs como IGUAIS na arbitragem. Assim o par
--   (scope='platform', organization_id=NULL, cakto_id=X) passa a colidir e o
--   ON CONFLICT do PostgREST atualiza a linha existente.
--
--   Por que NULLS NOT DISTINCT e não as alternativas:
--     - sentinel em organization_id  -> violaria a FK cakto_orders_organization_id_fkey
--                                        (não existe org com o UUID sentinela).
--     - índice parcial + WHERE        -> supabase-js/PostgREST não anexa o predicado
--                                        WHERE ao ON CONFLICT; a inferência de índice
--                                        parcial falharia.
--     - índice funcional COALESCE(..) -> onConflict do supabase-js só aceita nomes
--                                        de coluna crus, não expressões.
--   NULLS NOT DISTINCT mantém organization_id NULL (nenhuma leitura depende de
--   IS NULL — os reads filtram por scope), zero mudança no TS, e conserta as 3
--   functions de uma vez.
--
-- Ordem obrigatória: (0) exigir PG>=15  (1) deduplicar linhas já criadas
--   (o índice único mais estrito FALHA se houver duplicata)  (2) derrubar a
--   chave antiga  (3) criar a nova.
-- Idempotente: re-run é seguro (dedup no-op, drop/add condicionais).
-- ============================================================================

-- (0) Gate de versão: NULLS NOT DISTINCT exige PostgreSQL >= 15.
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION 'cakto_orders unique fix requer PostgreSQL >= 15 (NULLS NOT DISTINCT). Versao atual: %', current_setting('server_version');
  END IF;
END $$;

-- (1) Deduplicação das linhas já duplicadas.
--   Agrupa por (scope, COALESCE(org_id, sentinel), cakto_id) — o COALESCE é SÓ
--   para agrupar; nenhum sentinel é gravado. Mantém a MELHOR linha por grupo:
--   1º a que tem product_id resolvido, 2º a paga mais recente, 3º a fisicamente
--   mais nova (ctid). As demais são removidas.
DELETE FROM public.cakto_orders a
USING (
  SELECT ctid,
         row_number() OVER (
           PARTITION BY scope,
                        COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        cakto_id
           ORDER BY (product_id IS NOT NULL) DESC,
                    paid_at DESC NULLS LAST,
                    ctid DESC
         ) AS rn
  FROM public.cakto_orders
) dup
WHERE a.ctid = dup.ctid
  AND dup.rn > 1;

-- (2) Derruba QUALQUER unique (constraint OU índice puro) sobre exatamente
--     (scope, organization_id, cakto_id) — nome descoberto dinamicamente, já que
--     a definição vive no banco (não há CREATE TABLE nas migrations locais).
DO $$
DECLARE
  v_name text;
BEGIN
  -- 2a. unique constraints
  FOR v_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.cakto_orders'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['cakto_id','organization_id','scope']::text[]
  LOOP
    EXECUTE format('ALTER TABLE public.cakto_orders DROP CONSTRAINT %I', v_name);
  END LOOP;

  -- 2b. unique indexes não vinculados a constraint
  FOR v_name IN
    SELECT i.relname
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    WHERE x.indrelid = 'public.cakto_orders'::regclass
      AND x.indisunique
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid)
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
        WHERE k.attnum <> 0
      ) = ARRAY['cakto_id','organization_id','scope']::text[]
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', v_name);
  END LOOP;
END $$;

-- (3) Cria a nova chave única com NULLS NOT DISTINCT.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cakto_orders'::regclass
      AND conname = 'cakto_orders_scope_org_cakto_key'
  ) THEN
    ALTER TABLE public.cakto_orders
      ADD CONSTRAINT cakto_orders_scope_org_cakto_key
      UNIQUE NULLS NOT DISTINCT (scope, organization_id, cakto_id);
  END IF;
END $$;
