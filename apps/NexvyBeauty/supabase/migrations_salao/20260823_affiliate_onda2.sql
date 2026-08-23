-- ============================================================================
-- Onda 2 — dono indica dono (crédito ou PIX), estágio, WhatsApp, co-sell stub.
-- Aditivo. Continua programa de PLATAFORMA (não módulo do salão / Onda 3).
-- NÃO liga o programa oficial de afiliados da Cakto.
-- ============================================================================

ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payout_preference text NOT NULL DEFAULT 'pix';

ALTER TABLE public.affiliates DROP CONSTRAINT IF EXISTS affiliates_payout_preference_chk;
ALTER TABLE public.affiliates
  ADD CONSTRAINT affiliates_payout_preference_chk
  CHECK (payout_preference IN ('pix', 'subscription_credit'));

CREATE INDEX IF NOT EXISTS idx_affiliates_organization
  ON public.affiliates (organization_id)
  WHERE organization_id IS NOT NULL;

ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS payout_method text,
  ADD COLUMN IF NOT EXISTS split_kind text,
  ADD COLUMN IF NOT EXISTS closer_user_id uuid,
  ADD COLUMN IF NOT EXISTS credit_id uuid;

ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS affiliate_funnel_stage text,
  ADD COLUMN IF NOT EXISTS co_sell boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS co_sell_meeting_at timestamptz,
  ADD COLUMN IF NOT EXISTS co_sell_closer_user_id uuid;

CREATE TABLE IF NOT EXISTS public.affiliate_subscription_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  commission_id uuid REFERENCES public.affiliate_commissions(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  days_applied integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  applied_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_aff_credits_commission
  ON public.affiliate_subscription_credits (commission_id)
  WHERE commission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_aff_credits_aff
  ON public.affiliate_subscription_credits (affiliate_id, status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_commissions_credit_id_fkey'
  ) THEN
    ALTER TABLE public.affiliate_commissions
      ADD CONSTRAINT affiliate_commissions_credit_id_fkey
      FOREIGN KEY (credit_id) REFERENCES public.affiliate_subscription_credits(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.affiliate_whatsapp_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  lead_id uuid,
  event text NOT NULL,
  stage text,
  sent_at timestamptz DEFAULT now(),
  provider_ref text
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_aff_wa_notice_event
  ON public.affiliate_whatsapp_notices (affiliate_id, COALESCE(lead_id, '00000000-0000-0000-0000-000000000000'::uuid), event);

ALTER TABLE public.affiliate_subscription_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_whatsapp_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super admin manage affiliate_subscription_credits" ON public.affiliate_subscription_credits;
CREATE POLICY "super admin manage affiliate_subscription_credits" ON public.affiliate_subscription_credits
  FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "affiliate reads own credits" ON public.affiliate_subscription_credits;
CREATE POLICY "affiliate reads own credits" ON public.affiliate_subscription_credits
  FOR SELECT USING (affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "super admin manage affiliate_whatsapp_notices" ON public.affiliate_whatsapp_notices;
CREATE POLICY "super admin manage affiliate_whatsapp_notices" ON public.affiliate_whatsapp_notices
  FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "affiliate reads own wa notices" ON public.affiliate_whatsapp_notices;
CREATE POLICY "affiliate reads own wa notices" ON public.affiliate_whatsapp_notices
  FOR SELECT USING (affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid()));

GRANT ALL ON public.affiliate_subscription_credits TO authenticated, service_role;
GRANT ALL ON public.affiliate_whatsapp_notices TO authenticated, service_role;

-- Funil por lead, sem PII do comprador (nem e-mail, nome, telefone, CPF).
CREATE OR REPLACE FUNCTION public.affiliate_my_lead_stages()
RETURNS TABLE(
  stage text,
  updated_at timestamptz,
  co_sell boolean,
  meeting_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(sl.affiliate_funnel_stage, 'captured'),
    COALESCE(sl.updated_at, sl.created_at),
    COALESCE(sl.co_sell, false),
    sl.co_sell_meeting_at
  FROM public.sales_leads sl
  JOIN public.affiliates a ON a.id = sl.affiliate_id
  WHERE a.user_id = auth.uid()
  ORDER BY COALESCE(sl.updated_at, sl.created_at) DESC
  LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.affiliate_my_lead_stages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.affiliate_my_lead_stages() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.affiliate_set_payout_preference(p_preference text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pref text;
BEGIN
  v_pref := lower(trim(p_preference));
  IF v_pref NOT IN ('pix', 'subscription_credit') THEN
    RAISE EXCEPTION 'payout_preference inválido';
  END IF;
  UPDATE public.affiliates
     SET payout_preference = v_pref, updated_at = now()
   WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'afiliado não encontrado';
  END IF;
  RETURN v_pref;
END;
$$;
REVOKE ALL ON FUNCTION public.affiliate_set_payout_preference(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.affiliate_set_payout_preference(text) TO authenticated, service_role;
