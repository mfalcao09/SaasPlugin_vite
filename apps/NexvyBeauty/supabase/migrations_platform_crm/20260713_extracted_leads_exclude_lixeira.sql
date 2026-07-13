-- ============================================================================
-- C9 — LIXEIRA / exclusão curatorial (LGPD-safe)
-- ----------------------------------------------------------------------------
-- Aplicada via apply_migration (2026-07-13). Este arquivo é o registro versionado.
--
-- Objetivo: depois de revisar os descartes, o super_admin confirma "isto é lixo".
-- Em vez de hoardear PII (esp. estrangeira — Portugal +351 etc, o que a LGPD manda
-- NÃO fazer), a UI:
--   1. marca excluded_at (some das telas normais → "Lixeira");
--   2. SANITIZA a PII do lead (nome/telefone/bio/raw viram null), mantendo só o
--      @handle + o segmento + excluded_at como tombstone mínimo;
--   3. grava o @handle em platform_crm_lead_excluded (só handle, sem PII) →
--      suppress-list: o webhook/import PULA quem já foi excluído (anti-recidiva).
--
-- Espelha o padrão de platform_crm_lead_optout (product-scoped, RLS super_admin,
-- UNIQUE por handle). Idempotente.
-- ============================================================================

ALTER TABLE public.platform_crm_extracted_leads
  ADD COLUMN IF NOT EXISTS excluded_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_extracted_leads_excluded
  ON public.platform_crm_extracted_leads (extraction_id, excluded_at);

CREATE TABLE IF NOT EXISTS public.platform_crm_lead_excluded (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  handle      text NOT NULL,
  excluded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  excluded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, handle)                -- 1 exclusão por @handle/produto
);
CREATE INDEX IF NOT EXISTS idx_lead_excluded_product_handle
  ON public.platform_crm_lead_excluded (product_id, handle);

ALTER TABLE public.platform_crm_lead_excluded ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_crm_lead_excluded_super_admin_only ON public.platform_crm_lead_excluded;
CREATE POLICY platform_crm_lead_excluded_super_admin_only ON public.platform_crm_lead_excluded
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
