-- ============================================================================
-- 20260823_platform_crm_parties.sql
-- Fase 2 — grafo party: um contato da casa, N produtos SaaS. Sem lente CNPJ.
-- ----------------------------------------------------------------------------
-- Procurei antes de criar (ausente no repo):
--   * migrations_platform_crm/*.sql — nenhum CREATE de party / parties /
--     platform_crm_contacts / persons
--   * grep party_id|platform_crm_contacts — só o plano v2
--   * glob *party* — 0 arquivos
-- Identidade de lead hoje = linha em platform_crm_leads (email/phone/name).
-- Sem grafo prévio → migration NOVA. Não misturar com o seed silencioso
-- da operação (arquivo à parte). Sem coluna de operação nesta migration.
--
-- Idempotente: IF NOT EXISTS + DROP POLICY IF EXISTS.
-- RLS = padrão vigente `_super_admin_only` (has_role super_admin), irmã de
-- 20260711_platform_crm_admin_monitored_products.sql.
-- product_id e party_id permanecem NULLABLE — sem NOT NULL.
-- Unique de (party, produto) é PARCIAL: WHERE product_id IS NOT NULL.
-- Aplicar via MCP apply_migration (migrations_platform_crm/ fica fora do db push).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_crm_parties (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  text NOT NULL,
  email         text,
  phone         text,
  company       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_crm_parties IS
  'Pessoa única da casa (HubSpot-style). Um party, N linhas SaaS via platform_crm_party_products. Sem operação/CNPJ nesta tabela.';

CREATE TABLE IF NOT EXISTS public.platform_crm_party_products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id    uuid NOT NULL REFERENCES public.platform_crm_parties(id) ON DELETE CASCADE,
  product_id  uuid REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  lead_id     uuid REFERENCES public.platform_crm_leads(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_crm_party_products IS
  'Vínculo party × produto SaaS. product_id nullable (legado). Unique só quando product_id IS NOT NULL — filtro de UI nunca inclui null.';
COMMENT ON COLUMN public.platform_crm_party_products.product_id IS
  'Produto SaaS do catálogo. Nullable de propósito — sem NOT NULL. Linhas com null não entram no recorte.';
COMMENT ON COLUMN public.platform_crm_party_products.lead_id IS
  'Lead desta linha (mesmo party, outro produto). SET NULL se o lead for apagado.';

CREATE INDEX IF NOT EXISTS idx_pcrm_party_products_party
  ON public.platform_crm_party_products (party_id);

CREATE INDEX IF NOT EXISTS idx_pcrm_party_products_product
  ON public.platform_crm_party_products (product_id)
  WHERE product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pcrm_party_products_party_product
  ON public.platform_crm_party_products (party_id, product_id)
  WHERE product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pcrm_party_products_lead
  ON public.platform_crm_party_products (lead_id)
  WHERE lead_id IS NOT NULL;

ALTER TABLE public.platform_crm_leads
  ADD COLUMN IF NOT EXISTS party_id uuid
  REFERENCES public.platform_crm_parties(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.platform_crm_leads.party_id IS
  'Pessoa da casa. Nullable — leads legados sem grafo continuam válidos. Sem NOT NULL.';

CREATE INDEX IF NOT EXISTS idx_platform_crm_leads_party_id
  ON public.platform_crm_leads (party_id)
  WHERE party_id IS NOT NULL;

-- ============================================================================
-- RLS — padrão vigente `_super_admin_only`
-- ============================================================================
ALTER TABLE public.platform_crm_parties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_crm_parties_super_admin_only" ON public.platform_crm_parties;
CREATE POLICY "platform_crm_parties_super_admin_only" ON public.platform_crm_parties
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

REVOKE ALL ON TABLE public.platform_crm_parties FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_crm_parties TO authenticated;
GRANT ALL ON public.platform_crm_parties TO service_role;

ALTER TABLE public.platform_crm_party_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_crm_party_products_super_admin_only" ON public.platform_crm_party_products;
CREATE POLICY "platform_crm_party_products_super_admin_only" ON public.platform_crm_party_products
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

REVOKE ALL ON TABLE public.platform_crm_party_products FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_crm_party_products TO authenticated;
GRANT ALL ON public.platform_crm_party_products TO service_role;

-- ============================================================================
-- CHECK (rodar pós-aplicação):
--
--   SELECT c.relrowsecurity
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND c.relname IN ('platform_crm_parties', 'platform_crm_party_products');
--   -- esperado: true, true
--
--   SELECT polname FROM pg_policy
--   WHERE polrelid IN (
--     'public.platform_crm_parties'::regclass,
--     'public.platform_crm_party_products'::regclass
--   );
--   -- esperado: *_super_admin_only em cada
--
--   SELECT is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'platform_crm_party_products'
--     AND column_name = 'product_id';
--   -- esperado: YES
--
--   SELECT is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'platform_crm_leads'
--     AND column_name = 'party_id';
--   -- esperado: YES
-- ============================================================================
