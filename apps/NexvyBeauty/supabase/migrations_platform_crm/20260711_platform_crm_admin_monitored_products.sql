-- ============================================================================
-- AdminExecutivePanel — config "produtos monitorados" do Agente Admin (product-scoped)
-- ----------------------------------------------------------------------------
-- Religa o painel executivo do Agente Admin no CRM de PLATAFORMA
-- (src/components/superadmin/crm/agents/AdminExecutivePanel.tsx, hoje stub
-- "Painel Executivo em breve"). O painel org-scoped da fonte Bizon persistia os
-- "produtos sob acompanhamento" em `auto_notification_settings.monitored_product_ids`
-- (array na tabela de notificações da ORG). Na plataforma NÃO existe twin de
-- auto_notification_settings (o platform-auto-notifications cobre leads estagnados
-- e metas, não o relatório executivo), então modela-se o vínculo como uma tabela
-- de junção normalizada, product-scoped pura:
--
--   platform_crm_admin_monitored_products = "este Agente Admin vigia estes produtos".
--
-- Convenção da camada platform_crm_*: SEM organization_id (single-plataforma,
-- super_admin-only). admin_agent_id = FK → platform_crm_product_agents(id) (o
-- agente do tipo 'admin'); product_id = FK → platform_crm_products(id). UNIQUE
-- evita duplicar o mesmo vínculo. Sem nenhuma linha para um agente = o relatório
-- executivo agrega TODOS os produtos (mesmo default do painel org-scoped: "Vazio =
-- todos os produtos").
--
-- RLS = padrão vigente `_super_admin_only` (has_role super_admin), idêntico às
-- gêmeas do lote F4 e à platform_crm_agent_connections. Idempotente:
-- CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS.
--
-- STATUS: ESCRITA-NÃO-APLICADA (aplicar via MCP apply_migration numa próxima onda).
-- Os hooks usam `(supabase as any)` até a regeneração dos tipos pós-migration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_crm_admin_monitored_products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_agent_id  uuid NOT NULL REFERENCES public.platform_crm_product_agents(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_admin_monitored_products_unique
    UNIQUE (admin_agent_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_pcrm_admin_monitored_agent
  ON public.platform_crm_admin_monitored_products(admin_agent_id);
CREATE INDEX IF NOT EXISTS idx_pcrm_admin_monitored_product
  ON public.platform_crm_admin_monitored_products(product_id);

COMMENT ON TABLE public.platform_crm_admin_monitored_products IS
  'Produtos sob acompanhamento de um Agente Admin (product-scoped, sem organization_id). Alimenta o relatório executivo on-demand (platform-admin-executive-report). Sem linha = agente vigia todos os produtos.';

-- ============================================================================
-- RLS — padrão vigente `_super_admin_only`
-- ============================================================================
ALTER TABLE public.platform_crm_admin_monitored_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_crm_admin_monitored_products_super_admin_only" ON public.platform_crm_admin_monitored_products;
CREATE POLICY "platform_crm_admin_monitored_products_super_admin_only" ON public.platform_crm_admin_monitored_products
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_crm_admin_monitored_products TO authenticated;
GRANT ALL ON public.platform_crm_admin_monitored_products TO service_role;

-- ============================================================================
-- CHECK (rodar pós-aplicação):
--   • pg_tables.rowsecurity = true para platform_crm_admin_monitored_products
--   • pg_policies: 1 policy `_super_admin_only` FOR ALL
--   • 2º INSERT do mesmo (admin_agent_id, product_id) → viola UNIQUE (esperado)
--   • DELETE do agente em platform_crm_product_agents → CASCADE remove os vínculos
--   • DELETE do produto em platform_crm_products → CASCADE remove os vínculos
-- ============================================================================
