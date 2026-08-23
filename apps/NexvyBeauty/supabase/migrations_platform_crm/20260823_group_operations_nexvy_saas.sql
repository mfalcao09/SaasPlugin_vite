-- ============================================================================
-- 20260823_group_operations_nexvy_saas.sql
-- Fase 3 — preparação silenciosa (branded house v2). ZERO UI / ZERO switcher.
-- ----------------------------------------------------------------------------
-- Procurei antes de criar (ausente no repo):
--   * migrations_platform_crm/*.sql — nenhum group_operations, group_legal_entities
--     nem platform_crm_products.operation_id
--   * types.ts (platform_crm_products) — sem operation_id
--   * grep group_operations|group_legal_entities|operation_id — só o plano v2
--
-- CNPJ: dígitos oficiais existem em copy legal (legalContent.ts / Termos),
-- NÃO neste seed. Coluna document fica NULL. Identidade da linha = slug
-- `nexvy-saas`. Plano listava group_operations / group_legal_entities como
-- nomes alternativos; N=1 → uma tabela (esta). A linha É a legal entity.
--
-- Idempotente: IF NOT EXISTS + ON CONFLICT DO NOTHING + DROP POLICY IF EXISTS.
-- RLS = padrão vigente `_super_admin_only` (has_role super_admin), irmã de
-- 20260711_platform_crm_admin_monitored_products.sql.
-- Aplicar via MCP apply_migration (migrations_platform_crm/ fica fora do db push).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.group_operations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL,
  name            text NOT NULL,
  operation_type  text NOT NULL DEFAULT 'saas',
  document        text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_operations_slug_unique UNIQUE (slug),
  CONSTRAINT group_operations_type_check
    CHECK (operation_type IN ('saas', 'real_estate', 'franchise'))
);

COMMENT ON TABLE public.group_operations IS
  'Operação / entidade da casa (N=1 hoje: nexvy-saas). Sem UI de switcher até existir a 2ª linha. document = CNPJ futuro, nullable — seed não grava dígitos.';
COMMENT ON COLUMN public.group_operations.slug IS
  'Identidade estável. Seed: nexvy-saas. Não usar dígitos de documento como slug.';
COMMENT ON COLUMN public.group_operations.operation_type IS
  'saas | real_estate | franchise. Produtos SaaS atuais vivem dentro de saas.';
COMMENT ON COLUMN public.group_operations.document IS
  'CNPJ/documento da operação. NULL no seed (placeholder = slug). Preencher depois sem reescrever o slug.';

INSERT INTO public.group_operations (slug, name, operation_type)
VALUES ('nexvy-saas', 'Nexvy SaaS', 'saas')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.platform_crm_products
  ADD COLUMN IF NOT EXISTS operation_id uuid
  REFERENCES public.group_operations(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.platform_crm_products.operation_id IS
  'Operação dona do produto SaaS. FK opcional (nullable). Backfill: todos os produtos existentes → nexvy-saas. Sem NOT NULL para não quebrar inserts legados.';

CREATE INDEX IF NOT EXISTS idx_platform_crm_products_operation_id
  ON public.platform_crm_products (operation_id);

UPDATE public.platform_crm_products
SET operation_id = (SELECT id FROM public.group_operations WHERE slug = 'nexvy-saas' LIMIT 1)
WHERE operation_id IS NULL;

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.group_operations WHERE slug = 'nexvy-saas' LIMIT 1;
  IF v_id IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.platform_crm_products ALTER COLUMN operation_id SET DEFAULT %L::uuid',
      v_id
    );
  END IF;
END $$;

-- ============================================================================
-- RLS — padrão vigente `_super_admin_only`
-- ============================================================================
ALTER TABLE public.group_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "group_operations_super_admin_only" ON public.group_operations;
CREATE POLICY "group_operations_super_admin_only" ON public.group_operations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

REVOKE ALL ON TABLE public.group_operations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_operations TO authenticated;
GRANT ALL ON public.group_operations TO service_role;

-- ============================================================================
-- CHECK (rodar pós-aplicação — pass = 1 entity e 0 produtos sem operation_id):
--
--   SELECT count(*) AS entities
--   FROM public.group_operations;
--   -- esperado: 1
--
--   SELECT slug, operation_type, document IS NULL AS document_null
--   FROM public.group_operations;
--   -- esperado: nexvy-saas | saas | true
--
--   SELECT count(*) AS products_missing_operation
--   FROM public.platform_crm_products
--   WHERE operation_id IS NULL;
--   -- esperado: 0
--
--   SELECT p.slug, o.slug AS operation_slug
--   FROM public.platform_crm_products p
--   JOIN public.group_operations o ON o.id = p.operation_id;
--
--   SELECT c.relrowsecurity
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relname = 'group_operations';
--   -- esperado: true
--
--   SELECT polname FROM pg_policy
--   WHERE polrelid = 'public.group_operations'::regclass;
--   -- esperado: group_operations_super_admin_only
-- ============================================================================
