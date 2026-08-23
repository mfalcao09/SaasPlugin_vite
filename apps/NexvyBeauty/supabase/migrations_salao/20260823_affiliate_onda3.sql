-- ============================================================================
-- Onda 3 — motor de indicação como módulo do SALÃO (cliente indica amiga).
-- Aditivo. Discriminador program = platform | tenant.
-- O salão paga do próprio faturamento. NÃO misturar com o programa NexvyBeauty.
-- NÃO ligar split nativo da Cakto. NÃO aplicar em prod nesta onda (SQL versionado só).
-- ============================================================================

ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS program text NOT NULL DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS owner_organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS referrer_cliente_id uuid;

ALTER TABLE public.affiliates DROP CONSTRAINT IF EXISTS affiliates_program_chk;
ALTER TABLE public.affiliates
  ADD CONSTRAINT affiliates_program_chk
  CHECK (program IN ('platform', 'tenant'));

CREATE INDEX IF NOT EXISTS idx_affiliates_program_owner
  ON public.affiliates (program, owner_organization_id)
  WHERE owner_organization_id IS NOT NULL;

DROP INDEX IF EXISTS idx_affiliates_email;
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliates_email_platform
  ON public.affiliates (lower(email))
  WHERE program = 'platform';

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliates_tenant_cliente
  ON public.affiliates (owner_organization_id, referrer_cliente_id)
  WHERE program = 'tenant' AND referrer_cliente_id IS NOT NULL;

ALTER TABLE public.affiliate_links
  ADD COLUMN IF NOT EXISTS program text NOT NULL DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS owner_organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS program text NOT NULL DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS owner_organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_aff_comm_program_owner
  ON public.affiliate_commissions (program, owner_organization_id, status);

CREATE TABLE IF NOT EXISTS public.tenant_referral_programs (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  commission_pct numeric NOT NULL DEFAULT 10
    CHECK (commission_pct > 0 AND commission_pct <= 50),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tenant_referral_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super admin manage tenant_referral_programs" ON public.tenant_referral_programs;
CREATE POLICY "super admin manage tenant_referral_programs" ON public.tenant_referral_programs
  FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "tenant manages own referral program" ON public.tenant_referral_programs;
CREATE POLICY "tenant manages own referral program" ON public.tenant_referral_programs
  FOR ALL
  USING (
    organization_id IN (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid())
  );

GRANT ALL ON public.tenant_referral_programs TO authenticated, service_role;

DROP POLICY IF EXISTS "tenant reads own program affiliates" ON public.affiliates;
CREATE POLICY "tenant reads own program affiliates" ON public.affiliates
  FOR SELECT USING (
    program = 'tenant'
    AND owner_organization_id IN (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "tenant reads own program links" ON public.affiliate_links;
CREATE POLICY "tenant reads own program links" ON public.affiliate_links
  FOR SELECT USING (
    program = 'tenant'
    AND owner_organization_id IN (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "tenant reads own program commissions" ON public.affiliate_commissions;
CREATE POLICY "tenant reads own program commissions" ON public.affiliate_commissions
  FOR SELECT USING (
    program = 'tenant'
    AND owner_organization_id IN (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- Plataforma: ?ref= da LP Nexvy não resolve link de cliente do salão.
CREATE OR REPLACE FUNCTION public.resolve_affiliate_ref(p_ref text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT l.affiliate_id
  FROM public.affiliate_links l
  JOIN public.affiliates a ON a.id = l.affiliate_id
  WHERE lower(l.ref_code) = lower(p_ref)
    AND COALESCE(a.program, 'platform') = 'platform'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.tenant_referral_public_stats(p_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_aff uuid;
  v_clicks bigint;
  v_pending bigint;
  v_approved bigint;
  v_paid bigint;
  v_cancelled bigint;
BEGIN
  IF p_ref IS NULL OR length(trim(p_ref)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT l.affiliate_id, l.clicks
    INTO v_aff, v_clicks
  FROM public.affiliate_links l
  JOIN public.affiliates a ON a.id = l.affiliate_id
  WHERE lower(l.ref_code) = lower(trim(p_ref))
    AND a.program = 'tenant'
  LIMIT 1;

  IF v_aff IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE c.status = 'pending'),
    COUNT(*) FILTER (WHERE c.status = 'approved'),
    COUNT(*) FILTER (WHERE c.status = 'paid'),
    COUNT(*) FILTER (WHERE c.status = 'cancelled')
  INTO v_pending, v_approved, v_paid, v_cancelled
  FROM public.affiliate_commissions c
  WHERE c.affiliate_id = v_aff
    AND c.program = 'tenant';

  -- Sem PII: nem e-mail, telefone, nome, CPF da amiga ou do comprador.
  RETURN jsonb_build_object(
    'clicks', COALESCE(v_clicks, 0),
    'conversions', COALESCE(v_pending, 0) + COALESCE(v_approved, 0) + COALESCE(v_paid, 0),
    'pending_count', COALESCE(v_pending, 0),
    'approved_count', COALESCE(v_approved, 0),
    'paid_count', COALESCE(v_paid, 0),
    'cancelled_count', COALESCE(v_cancelled, 0),
    'program', 'tenant'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_referral_public_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_referral_public_stats(text) TO anon, authenticated, service_role;

-- Resumo e "afiliado logado" da plataforma não misturam comissão do salão.
CREATE OR REPLACE VIEW public.affiliate_commission_summary
WITH (security_invoker = true) AS
SELECT
  a.id AS affiliate_id,
  a.user_id AS user_id,
  COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'pending'), 0)::bigint AS pending_cents,
  COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'approved'), 0)::bigint AS approved_cents,
  COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'paid'), 0)::bigint AS paid_cents,
  COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'cancelled'), 0)::bigint AS cancelled_cents,
  COUNT(c.id) AS commissions_count
FROM public.affiliates a
LEFT JOIN public.affiliate_commissions c
  ON c.affiliate_id = a.id
 AND COALESCE(c.program, 'platform') = 'platform'
WHERE COALESCE(a.program, 'platform') = 'platform'
GROUP BY a.id, a.user_id;

CREATE OR REPLACE FUNCTION public.current_affiliate_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.affiliates
  WHERE user_id = auth.uid()
    AND COALESCE(program, 'platform') = 'platform'
  LIMIT 1;
$$;
