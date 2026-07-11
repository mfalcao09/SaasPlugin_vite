-- ─────────────────────────────────────────────────────────────────────────────
-- 20260710_platform_crm_connections_product_id.sql — A1.3 (cascateamento produto→canais)
--
-- ENTREGA 2: cada conexão de canal pertence a UM produto do grupo. Adiciona
-- product_id nas 3 tabelas de conexão da plataforma, permitindo filtrar conexões
-- (e por transitividade as conversas, via as FKs da ENTREGA 1) por produto.
--
-- Aditivo/idempotente. ON DELETE SET NULL: apagar um produto não apaga a conexão
-- (fica órfã aguardando reatribuição), coerente com o padrão "apagar X não apaga
-- Y" já usado no schema (sector_id, lead_id, assigned_to).
--
-- NOTA DE DESIGN — product-scoping é INTENCIONAL aqui.
--   O header original (20260701_platform_crm_schema.sql) dizia "SEM product_id".
--   Essa regra foi SUPERSEDED pela evolução E1/D3 (plataforma multiproduto):
--   platform_crm_conversations, _deals, _tasks JÁ carregam product_id em prod.
--   Estas conexões passam a ser product-scoped pelo mesmo motivo. NÃO é violação.
--
-- Tabelas de conexão (criadas fora do repo, via MCP; pré-existem em prod).
-- platform_crm_products(id) é o alvo do FK (tabela de produtos do grupo, já existe).
-- RLS: herdada de cada tabela de conexão (super_admin only). GRANTs idem.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) WhatsApp Cloud (Meta oficial)
ALTER TABLE public.platform_crm_whatsapp_meta_connections
  ADD COLUMN IF NOT EXISTS product_id uuid NULL
  REFERENCES public.platform_crm_products(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.platform_crm_whatsapp_meta_connections.product_id IS
  'Produto do grupo (platform_crm_products) dono desta conexão WhatsApp Cloud. NULL = não atribuída.';
CREATE INDEX IF NOT EXISTS idx_platform_crm_wa_meta_conn_product
  ON public.platform_crm_whatsapp_meta_connections(product_id) WHERE product_id IS NOT NULL;

-- 2) WhatsApp Evolution (não-oficial)
ALTER TABLE public.platform_crm_evolution_instances
  ADD COLUMN IF NOT EXISTS product_id uuid NULL
  REFERENCES public.platform_crm_products(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.platform_crm_evolution_instances.product_id IS
  'Produto do grupo (platform_crm_products) dono desta instância Evolution. NULL = não atribuída.';
CREATE INDEX IF NOT EXISTS idx_platform_crm_evolution_inst_product
  ON public.platform_crm_evolution_instances(product_id) WHERE product_id IS NOT NULL;

-- 3) Instagram Direct
ALTER TABLE public.platform_crm_instagram_connections
  ADD COLUMN IF NOT EXISTS product_id uuid NULL
  REFERENCES public.platform_crm_products(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.platform_crm_instagram_connections.product_id IS
  'Produto do grupo (platform_crm_products) dono desta conexão Instagram. NULL = não atribuída.';
CREATE INDEX IF NOT EXISTS idx_platform_crm_instagram_conn_product
  ON public.platform_crm_instagram_connections(product_id) WHERE product_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIM — product_id + índice nas 3 tabelas de conexão. Aditivo.
-- ─────────────────────────────────────────────────────────────────────────────
