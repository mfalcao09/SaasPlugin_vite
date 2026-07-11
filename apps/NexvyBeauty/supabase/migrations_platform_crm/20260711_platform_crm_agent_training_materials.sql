-- ============================================================================
-- P2.A-0 — 10ª GÊMEA do HUB DO PRODUTO: platform_crm_agent_training_materials
-- ----------------------------------------------------------------------------
-- Fecha o lote §🅱/§3 do DELTA-PORTABILIDADE-100. As 9 primeiras gêmeas de
-- conteúdo (knowledge_sources, materials, training_videos, objections,
-- catalog_items, ctas, post_sale_event_actions+logs, email_templates) já foram
-- criadas e PROVADAS em `20260706_platform_crm_product_hub_tables.sql` (E1/D3 F4,
-- commit 1795ca4). FALTAVA esta: o "Treino do agente" (upload de material para a
-- base de conhecimento do agente), documentada como pendência explícita no stub
-- `src/components/superadmin/crm/agents/AgentTrainingSection.tsx`:
--   "Falta: (a) tabela platform_crm_agent_training_materials (twin sem organization_id)".
--
-- Espelha 1:1 a org-scoped `public.agent_training_materials` (16 colunas),
-- trocando organization_id (NOT NULL, dropado) por product_id (NOT NULL). A
-- origem é HÍBRIDA (já tinha product_id + agent_id ao lado de organization_id);
-- a gêmea é product-scoped pura. Colunas/CHECKs/FKs VERIFICADOS contra o schema
-- REAL do remoto (fzhlbwhdejumkyqosuvq) via MCP em 2026-07-11.
--
-- Convenção da camada platform_crm_*: SEM organization_id (product-scoped,
-- single-plataforma). product_id = NOT NULL → platform_crm_products(id) CASCADE.
-- FKs re-apontadas para as gêmeas platform_crm_* (produtos e agentes de produto).
--
-- RLS = padrão vigente `_super_admin_only` (has_role super_admin), idêntico às
-- 9 irmãs do lote F4. Idempotente: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS.
-- ESCOPO P2.A-0: só schema. Hooks/Edge de ingestão/embedding = P2.A-1+.
-- ============================================================================

-- ─── 10. agent_training_materials (Treino do agente) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_crm_agent_training_materials (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid NOT NULL REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  agent_id           uuid REFERENCES public.platform_crm_product_agents(id) ON DELETE CASCADE,
  title              text NOT NULL,
  material_type      text NOT NULL CHECK (material_type IN ('pdf','video','text','website')),
  category           text NOT NULL DEFAULT 'general' CHECK (category IN ('sales_techniques','communication','objections','closing','prospecting','negotiation','general')),
  description        text,
  file_url           text,
  extracted_content  text,
  is_active          boolean DEFAULT true,
  processing_status  text DEFAULT 'pending' CHECK (processing_status IN ('pending','processing','completed','failed')),
  processing_error   text,
  created_by         uuid,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcrm_agent_training_materials_product ON public.platform_crm_agent_training_materials(product_id);
CREATE INDEX IF NOT EXISTS idx_pcrm_agent_training_materials_agent   ON public.platform_crm_agent_training_materials(agent_id);

-- ============================================================================
-- RLS — padrão vigente `_super_admin_only` (idêntico às 9 irmãs do lote F4)
-- ============================================================================
ALTER TABLE public.platform_crm_agent_training_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_crm_agent_training_materials_super_admin_only" ON public.platform_crm_agent_training_materials;
CREATE POLICY "platform_crm_agent_training_materials_super_admin_only" ON public.platform_crm_agent_training_materials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_crm_agent_training_materials TO authenticated;
GRANT ALL ON public.platform_crm_agent_training_materials TO service_role;

-- ============================================================================
-- CHECK (rodar pós-aplicação):
--   • pg_tables.rowsecurity = true para platform_crm_agent_training_materials
--   • pg_policies: 1 policy `_super_admin_only` FOR ALL
--   • paridade: 16 colunas na origem − organization_id = 15 na gêmea
-- ============================================================================
