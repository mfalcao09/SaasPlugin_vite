-- ============================================================================
-- Atribuição de vendedor/afiliado no pedido Cakto (camada PRÓPRIA)
-- ----------------------------------------------------------------------------
-- Origem do dado: o checkout_url da Cakto aceita ?src=<seller> (parâmetro de
-- rastreamento repassado ao webhook). O webhook grava TODO o corpo em
-- cakto_orders.raw_payload; estas colunas materializam a atribuição de forma
-- consultável, sem depender de parse do JSON a cada query.
--
--   seller_ref   -> valor cru do src (order.src / trackingParameters.src / ...)
--                   capturado defensivamente no mapper (mapCaktoOrderForUpsert
--                   em supabase/functions/_shared/cakto-client.ts). O campo
--                   exato do payload Cakto ainda não é confirmado — cobrimos os
--                   candidatos conhecidos.
--   affiliate_id -> resolvido a partir de seller_ref via RPC resolve_affiliate_ref
--                   (public.affiliate_links.ref_code -> affiliates.id) no
--                   webhook (supabase/functions/cakto-webhook/index.ts), antes
--                   do upsert. Ver migrations_salao/20260619_affiliates_tracking.sql (§5).
--
-- Consumidor: supabase/functions/cakto-webhook/index.ts:96
--   admin.from('cakto_orders').upsert(row, ...) persiste ambas as colunas.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. Não altera dados existentes.
-- ============================================================================

ALTER TABLE public.cakto_orders
  ADD COLUMN IF NOT EXISTS seller_ref   text,
  ADD COLUMN IF NOT EXISTS affiliate_id uuid;

-- FK best-effort: só cria se ainda não existir (evita erro em re-run).
-- ON DELETE SET NULL preserva o pedido histórico mesmo se o afiliado for removido.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cakto_orders_affiliate_id_fkey'
  ) THEN
    ALTER TABLE public.cakto_orders
      ADD CONSTRAINT cakto_orders_affiliate_id_fkey
      FOREIGN KEY (affiliate_id) REFERENCES public.affiliates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Índice p/ relatórios de comissão por afiliado.
CREATE INDEX IF NOT EXISTS idx_cakto_orders_affiliate ON public.cakto_orders(affiliate_id);
