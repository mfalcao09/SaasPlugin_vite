-- ============================================================
-- platform_crm — Seção "Setores" DESACOPLADA para o super-admin (single-tenant)
-- Origem: sectors + sector_members (CRM Vendus, multi-tenant).
-- Regras de design (não relaxar):
--   * Prefixo obrigatório: platform_crm_<nome>.
--   * Tenant-of-one => SEM organization_id em NENHUMA tabela.
--   * SEM product_id / product-scoping.
--   * Refs de usuário (created_by, user_id) => uuid -> auth.users(id).
--   * FKs internas SÓ apontam para platform_crm_* / auth.users.
--   * Enum próprio prefixado, criado idempotentemente via DO-block.
--   * RLS super_admin-only via public.has_role(auth.uid(),'super_admin'::app_role).
--   * Trigger updated_at reusa public.platform_crm_set_updated_at().
--   * Migration idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Helper de updated_at próprio (idempotente; não conflita com o global)
--    (já pode existir se o schema principal platform_crm foi aplicado)
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
-- 1) Enum de estratégia de rotação (desacoplado / prefixado)
--    Original: public.sector_rotation_strategy
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'platform_crm_sector_rotation_strategy'
  ) THEN
    CREATE TYPE public.platform_crm_sector_rotation_strategy
      AS ENUM ('round_robin', 'least_busy', 'random');
  END IF;
END$$;

-- ============================================================
-- 2) SETORES  (platform_crm_sectors)
--    Colunas dropadas por desacoplamento: organization_id, is_default.
--    UNIQUE (organization_id, name) => UNIQUE (name) (namespace global).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text DEFAULT '#3B82F6'::text,
  icon text DEFAULT 'Building2'::text,
  description text,
  bot_order integer DEFAULT 0,
  greeting_message text,
  farewell_message text,
  auto_close_ticket boolean DEFAULT false,
  enable_scheduling boolean DEFAULT false,
  rotation_enabled boolean DEFAULT false,
  rotation_strategy public.platform_crm_sector_rotation_strategy DEFAULT 'round_robin',
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_sectors_name_uniq UNIQUE (name)
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_sectors_active
  ON public.platform_crm_sectors(is_active);
CREATE INDEX IF NOT EXISTS idx_platform_crm_sectors_order
  ON public.platform_crm_sectors(bot_order);

-- ============================================================
-- 3) MEMBROS DO SETOR  (platform_crm_sector_members)
--    user_id: original FK -> profiles(id) (tenant) => agora auth.users(id).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_sector_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id uuid NOT NULL
    REFERENCES public.platform_crm_sectors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_sector_members_sector_user_uniq UNIQUE (sector_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_sector_members_sector
  ON public.platform_crm_sector_members(sector_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_sector_members_user
  ON public.platform_crm_sector_members(user_id);

-- ============================================================
-- 4) Trigger updated_at (só platform_crm_sectors tem updated_at)
-- ============================================================
DROP TRIGGER IF EXISTS trg_platform_crm_sectors_updated_at
  ON public.platform_crm_sectors;
CREATE TRIGGER trg_platform_crm_sectors_updated_at
  BEFORE UPDATE ON public.platform_crm_sectors
  FOR EACH ROW EXECUTE FUNCTION public.platform_crm_set_updated_at();

-- ============================================================
-- 5) RLS super_admin-only + GRANTs (mesmo padrão do schema principal)
-- ============================================================
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_sectors',
    'platform_crm_sector_members'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_super_admin_only" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_super_admin_only" ON public.%I '
      'FOR ALL TO authenticated '
      'USING (public.has_role(auth.uid(), ''super_admin''::app_role)) '
      'WITH CHECK (public.has_role(auth.uid(), ''super_admin''::app_role));',
      t, t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
  END LOOP;
END$$;

-- ============================================================
-- FIM — 2 tabelas platform_crm_* (setores) isoladas, RLS super_admin-only.
-- ============================================================
