-- ─────────────────────────────────────────────────────────────────────────────
-- 20260710_platform_crm_campaigns_product_id.sql — A1.3 (campanha por produto)
--
-- Ordem Marcelo (2026-07-10, verbatim): "Quero campanha por produto, aplique o
-- necessário." Coluna product_id em platform_crm_campaigns + índice parcial.
-- NULL = campanha do grupo todo (comportamento anterior preservado).
-- APLICADA em prod 2026-07-10 via apply_migration — este arquivo é o espelho.
-- Consumidor: filtro do seletor de produto global (PlatformProductContext) no
-- PlatformCrmCampaignsManager (era TODO-inerte; passa a ATIVO).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.platform_crm_campaigns
  ADD COLUMN IF NOT EXISTS product_id uuid NULL
  REFERENCES public.platform_crm_products(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.platform_crm_campaigns.product_id IS
  'Produto (SaaS do grupo) alvo da campanha. NULL = campanha do grupo todo. Filtrado pelo seletor de produto global (A1.3).';

CREATE INDEX IF NOT EXISTS idx_platform_crm_campaigns_product
  ON public.platform_crm_campaigns(product_id) WHERE product_id IS NOT NULL;
