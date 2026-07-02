-- ============================================================
-- platform_crm — Seção "Respostas Rápidas" (Quick Replies)
-- Desacoplada / isolada do tenant para o super-admin single-tenant.
-- ============================================================
-- Regras de design (não relaxar):
--   * Prefixo obrigatório: platform_crm_<nome>.
--   * Dado GLOBAL da plataforma (tenant-of-one) => SEM organization_id.
--   * SEM product_id / product-scoping.
--   * FKs internas SÓ para platform_crm_* / auth.users (jamais organizations
--     ou profiles do tenant).
--   * RLS super_admin-only via public.has_role (FOR ALL, USING+WITH CHECK).
--   * GRANTs para authenticated + service_role.
--   * Trigger updated_at reusando public.platform_crm_set_updated_at().
--   * Sem enums (category/is_active são text/boolean no original).
--   * Migration idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Helper de updated_at (idempotente; garante existência caso esta
--    migration rode isolada, antes do schema base platform_crm).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_crm_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 1) Tabela quick_replies desacoplada
--    (SEM organization_id; created_by -> auth.users em vez de profiles)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_crm_quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'general'::text,
  title text NOT NULL,
  content text NOT NULL,
  shortcut text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice de categoria (útil; o original também indexava organization_id,
-- removido por desacoplamento).
CREATE INDEX IF NOT EXISTS idx_platform_crm_quick_replies_category
  ON public.platform_crm_quick_replies(category);
CREATE INDEX IF NOT EXISTS idx_platform_crm_quick_replies_active
  ON public.platform_crm_quick_replies(is_active);

-- ------------------------------------------------------------
-- 2) Trigger de updated_at (idempotente)
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_platform_crm_quick_replies_updated_at
  ON public.platform_crm_quick_replies;
CREATE TRIGGER trg_platform_crm_quick_replies_updated_at
  BEFORE UPDATE ON public.platform_crm_quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.platform_crm_set_updated_at();

-- ------------------------------------------------------------
-- 3) RLS — super_admin-only (helper public.has_role já existe)
-- ------------------------------------------------------------
ALTER TABLE public.platform_crm_quick_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_crm_quick_replies_super_admin_only"
  ON public.platform_crm_quick_replies;
CREATE POLICY "platform_crm_quick_replies_super_admin_only"
  ON public.platform_crm_quick_replies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_crm_quick_replies TO authenticated;
GRANT ALL ON public.platform_crm_quick_replies TO service_role;

-- ============================================================
-- FIM — 1 tabela platform_crm_quick_replies isolada, RLS super_admin-only.
-- ============================================================
