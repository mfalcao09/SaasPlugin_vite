-- ============================================================================
-- Fase 5 — Payout de comissões (provider-agnóstico). Lote (batch) + itens.
-- Idempotente. Marcação de comissões 'approved' → 'paid' acontece na edge fn.
-- ============================================================================

-- Lote de pagamento (1 lote agrupa 1+ afiliados; cada item = 1 afiliado).
CREATE TABLE IF NOT EXISTS public.payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'draft',     -- draft | processing | completed | failed
  provider text NOT NULL DEFAULT 'manual',  -- manual | asaas | efi | ...
  total_cents bigint NOT NULL DEFAULT 0,
  items_count integer NOT NULL DEFAULT 0,
  created_by uuid,                          -- super admin que gerou
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin manage payout_batches" ON public.payout_batches
  FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

-- Item do lote: 1 afiliado, agregando N comissões.
CREATE TABLE IF NOT EXISTS public.payout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.payout_batches(id) ON DELETE CASCADE,
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL DEFAULT 0,
  pix_key text,                             -- snapshot do PIX no momento do lote
  commission_ids uuid[] NOT NULL DEFAULT '{}', -- comissões cobertas por este item
  status text NOT NULL DEFAULT 'pending',   -- pending | paid | failed
  provider_ref text,                        -- id da transação no provedor (ou confirmação manual)
  paid_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payout_items_batch ON public.payout_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_payout_items_aff ON public.payout_items(affiliate_id);
ALTER TABLE public.payout_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin manage payout_items" ON public.payout_items
  FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
-- afiliado vê seus próprios pagamentos (read-only)
CREATE POLICY "affiliate reads own payouts" ON public.payout_items
  FOR SELECT USING (affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid()));

-- Vínculo idempotente comissão → item (uma comissão entra em no máximo 1 item pago).
ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS payout_item_id uuid REFERENCES public.payout_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_aff_comm_payout_item ON public.affiliate_commissions(payout_item_id);

GRANT ALL ON public.payout_batches TO authenticated, service_role;
GRANT ALL ON public.payout_items   TO authenticated, service_role;
