-- ─────────────────────────────────────────────────────────────────────────────
-- 20260710_platform_crm_sectors_product_id.sql — A1-schema (setor por produto)
-- Data: 2026-07-10 · AGUARDA APLICAÇÃO PELO DONO (revisão + apply via MCP).
--
-- Setores product-scoped: platform_crm_sectors ganha product_id OPCIONAL.
--   * NULL  = setor GLOBAL (comportamento atual — nada muda p/ dados existentes);
--   * uuid  = setor específico de um produto (platform_crm_products).
--
-- CONFERIDO ANTES (só cria o que falta):
--   * platform_crm_sector_members JÁ EXISTE (migration
--     20260702_platform_crm_setores.sql + types.ts) e é a fonte real de
--     membros do usePlatformCrmSectors (fetch direto na tabela + enriquecimento
--     via profiles) — NÃO é recriada aqui.
--   * platform_crm_sectors NÃO tem product_id em prod (types.ts) — o
--     20260702 dropou o scoping de propósito ("SEM product_id") e a A1 agora
--     o reintroduz como opcional.
--
-- ⚠️ NOTA de design (decisão de produto, não tomada aqui): a UNIQUE (name)
--   global do 20260702 CONTINUA valendo — dois produtos não podem ter setores
--   homônimos ("Suporte" do produto A e "Suporte" do produto B colidem). Se a
--   A1 quiser homônimos por produto, migrar a constraint para
--   UNIQUE (product_id, name) em migration própria (com tratamento dos NULLs).
--
-- RLS/GRANTs: herdados da própria platform_crm_sectors (super_admin-only) —
-- coluna nova não muda policies. Idempotente. ON DELETE SET NULL: apagar o
-- produto rebaixa o setor a global, não o destrói (histórico de conversas
-- aponta p/ sector_id).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.platform_crm_sectors
  ADD COLUMN IF NOT EXISTS product_id uuid NULL
  REFERENCES public.platform_crm_products(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.platform_crm_sectors.product_id IS
  'Produto dono do setor (platform_crm_products). NULL = setor global da plataforma (default; todos os setores pré-existentes). Apagar o produto rebaixa o setor a global (SET NULL).';

-- Filtro por produto no switcher/inbox (parcial: maioria dos setores é global).
CREATE INDEX IF NOT EXISTS idx_platform_crm_sectors_product
  ON public.platform_crm_sectors(product_id) WHERE product_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIM — 1 coluna opcional + 1 índice parcial. platform_crm_sector_members
-- intocada (já existia).
-- ─────────────────────────────────────────────────────────────────────────────
