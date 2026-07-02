-- ============================================================
-- platform_crm — seção "horarios" (Horários de funcionamento)
-- Origem: BusinessHoursManager.tsx + useBusinessHours.ts (CRM Vendus).
-- Tabelas originais: business_hours, business_holidays.
-- DESACOPLADO pro super-admin single-tenant (tenant-of-one):
--   * Prefixo obrigatório platform_crm_<nome>.
--   * SEM organization_id em NENHUMA tabela (dado GLOBAL da plataforma).
--   * business_hours era config ÚNICA por org (organization_id UNIQUE) =>
--     vira config ÚNICA global via coluna singleton UNIQUE (força 1 linha;
--     substitui o onConflict:'organization_id' do upsert do hook).
--   * FKs internas só para platform_crm_* / auth.users (nenhuma pra tenant).
--   * RLS super_admin-only via public.has_role. Migration idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Helper de updated_at (reusa o mesmo do schema platform_crm; idempotente)
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
-- 1) business_hours -> platform_crm_business_hours
--    (config ÚNICA global; singleton UNIQUE garante linha única)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_crm_business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Substitui o organization_id UNIQUE original: garante 1 única linha global.
  -- Upsert no cliente deve usar onConflict:'singleton'.
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  schedule jsonb NOT NULL DEFAULT jsonb_build_object(
    'mon', jsonb_build_array(jsonb_build_object('start','09:00','end','18:00')),
    'tue', jsonb_build_array(jsonb_build_object('start','09:00','end','18:00')),
    'wed', jsonb_build_array(jsonb_build_object('start','09:00','end','18:00')),
    'thu', jsonb_build_array(jsonb_build_object('start','09:00','end','18:00')),
    'fri', jsonb_build_array(jsonb_build_object('start','09:00','end','18:00')),
    'sat', jsonb_build_array(),
    'sun', jsonb_build_array()
  ),
  out_of_hours_message text NOT NULL DEFAULT 'Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve.',
  out_of_hours_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_business_hours_singleton_chk CHECK (singleton = true)
);

-- ------------------------------------------------------------
-- 2) business_holidays -> platform_crm_business_holidays
--    (SEM organization_id; unique passa a ser só a data)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_crm_business_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_business_holidays_date_uniq UNIQUE (date)
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_business_holidays_date
  ON public.platform_crm_business_holidays(date);

-- ============================================================
-- 3) TRIGGER de updated_at (só business_hours tem updated_at)
-- ============================================================
DROP TRIGGER IF EXISTS trg_platform_crm_business_hours_updated_at
  ON public.platform_crm_business_hours;
CREATE TRIGGER trg_platform_crm_business_hours_updated_at
  BEFORE UPDATE ON public.platform_crm_business_hours
  FOR EACH ROW EXECUTE FUNCTION public.platform_crm_set_updated_at();

-- ============================================================
-- 4) RLS — super_admin-only (helper public.has_role já existe)
-- ============================================================
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_business_hours',
    'platform_crm_business_holidays'
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
-- FIM — 2 tabelas platform_crm_* (horarios), RLS super_admin-only.
-- ============================================================
