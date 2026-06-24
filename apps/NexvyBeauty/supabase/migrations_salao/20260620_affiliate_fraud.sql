-- ============================================================================
-- Fase 3 — Antifraude de comissão de afiliado (aditivo; mantém idempotência atual)
-- Colunas/índices novos são ADITIVOS, idempotentes e nullable/defaulted -> não
-- quebram inserts existentes. Preenchidos por _shared/affiliate-commission.ts
-- (attributeAffiliateCommission) quando o provedor envia doc/IP do comprador.
-- ============================================================================

-- Sinais antifraude no comprador da venda (preenchidos quando disponíveis).
ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS buyer_document text,   -- CPF/CNPJ normalizado (só dígitos), quando o provedor envia
  ADD COLUMN IF NOT EXISTS buyer_ip text,         -- IP da venda/captura, quando disponível
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'clear'; -- clear | flagged
-- review_status='flagged' => comissão entra como 'pending' mas marcada p/ revisão humana
--   (NÃO bloqueia criação; super admin decide approve/cancel). Detalhes em metadata.fraud.

-- Índices p/ checagem de velocidade (mesmo afiliado / mesmo comprador em janela).
CREATE INDEX IF NOT EXISTS idx_aff_comm_aff_created
  ON public.affiliate_commissions(affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aff_comm_doc
  ON public.affiliate_commissions(buyer_document) WHERE buyer_document IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_aff_comm_ip
  ON public.affiliate_commissions(buyer_ip) WHERE buyer_ip IS NOT NULL;
