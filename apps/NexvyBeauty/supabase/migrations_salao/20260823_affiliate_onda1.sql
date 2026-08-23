-- ============================================================================
-- Onda 1 — hold, cupom próprio, cliques, funil, inscrição pending, rates por plano
-- Aditivo. NÃO liga o programa oficial de afiliados da Cakto.
-- NÃO aplicar o cron de reconcile nesta onda.
-- ============================================================================

-- 1. Colunas primeiro (funções abaixo leem coupon_code / hold_until)
ALTER TABLE public.affiliate_links
  ADD COLUMN IF NOT EXISTS coupon_code text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_links_coupon
  ON public.affiliate_links (lower(coupon_code))
  WHERE coupon_code IS NOT NULL AND length(trim(coupon_code)) > 0;

ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS hold_until timestamptz,
  ADD COLUMN IF NOT EXISTS plan_slug text;

-- 2. Clique atômico (page-load anônimo + capture-lead)
CREATE OR REPLACE FUNCTION public.record_affiliate_click(p_ref text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_ref IS NULL OR length(trim(p_ref)) = 0 THEN
    RETURN NULL;
  END IF;
  UPDATE public.affiliate_links
     SET clicks = clicks + 1
   WHERE lower(ref_code) = lower(trim(p_ref))
   RETURNING affiliate_id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_affiliate_click(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_affiliate_click(text) TO anon, authenticated, service_role;

-- 3. Resolve ref → cupom (sem PII) para o hop LP→Cakto ?coupon=
CREATE OR REPLACE FUNCTION public.resolve_affiliate_link(p_ref text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'affiliate_id', affiliate_id,
    'coupon_code', coupon_code,
    'ref_code', ref_code
  )
  FROM public.affiliate_links
  WHERE lower(ref_code) = lower(trim(p_ref))
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.resolve_affiliate_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_affiliate_link(text) TO anon, authenticated, service_role;

-- 4. Comissão por plano (override do % do afiliado)
CREATE TABLE IF NOT EXISTS public.affiliate_plan_rates (
  plan_slug text PRIMARY KEY,
  commission_pct numeric NOT NULL CHECK (commission_pct > 0),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.affiliate_plan_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "super admin manage affiliate_plan_rates" ON public.affiliate_plan_rates;
CREATE POLICY "super admin manage affiliate_plan_rates" ON public.affiliate_plan_rates
  FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
GRANT ALL ON public.affiliate_plan_rates TO authenticated, service_role;

-- 5. Funil sem PII do comprador (SECURITY DEFINER, só a linha do afiliado logado)
CREATE OR REPLACE FUNCTION public.affiliate_my_funnel()
RETURNS TABLE(
  clicks bigint,
  leads bigint,
  checkouts bigint,
  paid bigint,
  refunds bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE((SELECT SUM(l.clicks)::bigint FROM public.affiliate_links l WHERE l.affiliate_id = a.id), 0),
    (SELECT COUNT(*)::bigint FROM public.sales_leads sl WHERE sl.affiliate_id = a.id),
    (SELECT COUNT(*)::bigint FROM public.affiliate_commissions c WHERE c.affiliate_id = a.id),
    (SELECT COUNT(*)::bigint FROM public.affiliate_commissions c
      WHERE c.affiliate_id = a.id AND c.status IN ('pending', 'approved', 'paid')),
    (SELECT COUNT(*)::bigint FROM public.affiliate_commissions c
      WHERE c.affiliate_id = a.id AND c.status = 'cancelled'
        AND (c.metadata->>'clawback_reason') IS NOT NULL)
  FROM public.affiliates a
  WHERE a.user_id = auth.uid()
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.affiliate_my_funnel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.affiliate_my_funnel() TO authenticated, service_role;
