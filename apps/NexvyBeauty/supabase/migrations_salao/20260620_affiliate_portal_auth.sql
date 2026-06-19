-- ============================================================================
-- Fase 4 — Portal self-service do afiliado (auth por vínculo affiliates.user_id)
-- O afiliado autentica via Supabase Auth normal; o "papel" é a EXISTÊNCIA de uma
-- linha affiliates com user_id = auth.uid() (não usa user_roles / app_role enum).
-- RLS de leitura self já existe em 20260619_affiliates_tracking.sql.
-- Tudo aqui é ADITIVO e IDEMPOTENTE.
-- ============================================================================

-- 1. Índice para o lookup self (RLS 'affiliate reads self' filtra por user_id).
CREATE INDEX IF NOT EXISTS idx_affiliates_user_id ON public.affiliates(user_id);

-- 2. View de resumo de comissões por afiliado (read-only; herda RLS das tabelas base
--    via security_invoker → o afiliado só enxerga a própria linha; super admin vê tudo).
CREATE OR REPLACE VIEW public.affiliate_commission_summary
WITH (security_invoker = true) AS
SELECT
  a.id                                                                  AS affiliate_id,
  a.user_id                                                             AS user_id,
  COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'pending'),   0)::bigint AS pending_cents,
  COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'approved'),  0)::bigint AS approved_cents,
  COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'paid'),      0)::bigint AS paid_cents,
  COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'cancelled'), 0)::bigint AS cancelled_cents,
  COUNT(c.id)                                                          AS commissions_count
FROM public.affiliates a
LEFT JOIN public.affiliate_commissions c ON c.affiliate_id = a.id
GROUP BY a.id, a.user_id;

GRANT SELECT ON public.affiliate_commission_summary TO authenticated, service_role;

-- 3. RPC self-service: o afiliado logado resolve o PRÓPRIO affiliate_id (sem expor a tabela).
CREATE OR REPLACE FUNCTION public.current_affiliate_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.affiliates WHERE user_id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.current_affiliate_id() TO authenticated;
