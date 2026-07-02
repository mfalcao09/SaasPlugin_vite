-- ============================================================
-- platform_crm — Seção WEBHOOKS (CRM Vendus) DESACOPLADA para o
-- super-admin single-tenant (NexvyBeauty). Schema ISOLADO do tenant.
-- ============================================================
-- Regras de design (mesmo padrão de 20260701_platform_crm_schema.sql):
--   * Prefixo obrigatório: platform_crm_<nome>.
--   * Tenant-of-one => SEM organization_id em NENHUMA tabela.
--   * Pipeline/produto único => SEM product_id / product-scoping.
--   * FKs internas SÓ para platform_crm_* / auth.users.
--     - webhooks.created_by            -> auth.users(id)
--     - webhook_logs.lead_id           -> platform_crm_leads(id)
--   * RLS super_admin-only via public.has_role(auth.uid(),'super_admin'::app_role).
--   * updated_at reusa public.platform_crm_set_updated_at() (idempotente).
--   * Enums do original (status/method) => text + CHECK (sem criar enum).
--   * Migration idempotente (CREATE ... IF NOT EXISTS, DO-blocks).
-- ============================================================

-- ------------------------------------------------------------
-- 0) Helper de updated_at (idempotente; já existe no schema base,
--    recriado por segurança caso esta migration rode isolada)
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

-- ============================================================
-- 1) WEBHOOKS (tabela principal)
--    Dropados por desacoplamento: organization_id, product_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação
  name text NOT NULL,
  slug text NOT NULL,
  description text,

  -- Status
  is_active boolean DEFAULT false,
  is_test_mode boolean DEFAULT true,

  -- Segurança (opcional)
  secret_key text,
  allowed_ips text[],

  -- Configuração de ações (JSONB array)
  actions jsonb DEFAULT '[]'::jsonb,

  -- Mapeamento de campos de identificação
  identification_config jsonb DEFAULT '{}'::jsonb,

  -- Métricas
  requests_count integer DEFAULT 0,
  requests_this_month integer DEFAULT 0,
  last_request_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- slug único GLOBAL (pipeline único => sem escopo por org)
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_crm_webhooks_slug
  ON public.platform_crm_webhooks(slug);
CREATE INDEX IF NOT EXISTS idx_platform_crm_webhooks_is_active
  ON public.platform_crm_webhooks(is_active);

-- ============================================================
-- 2) WEBHOOK_LOGS (logs de requisições)
--    lead_id: FK do tenant (leads) => re-apontada p/ platform_crm_leads.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL
    REFERENCES public.platform_crm_webhooks(id) ON DELETE CASCADE,

  -- Dados da requisição
  request_method text NOT NULL,
  request_headers jsonb,
  request_body jsonb,
  request_ip text,

  -- Campos parseados
  parsed_fields jsonb,

  -- Resultado
  status text DEFAULT 'pending'::text,
  actions_executed jsonb DEFAULT '[]'::jsonb,
  error_message text,

  -- Entidade criada/atualizada (CRM da plataforma)
  lead_id uuid REFERENCES public.platform_crm_leads(id) ON DELETE SET NULL,

  -- Tempo de processamento
  processing_time_ms integer,

  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_webhook_logs_webhook
  ON public.platform_crm_webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_webhook_logs_created
  ON public.platform_crm_webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_crm_webhook_logs_status
  ON public.platform_crm_webhook_logs(status);

-- ============================================================
-- 3) WEBHOOK_SAMPLE_REQUESTS (requisições de exemplo)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_webhook_sample_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL
    REFERENCES public.platform_crm_webhooks(id) ON DELETE CASCADE,

  name text,
  request_body jsonb NOT NULL,
  extracted_fields jsonb NOT NULL,

  is_default boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_webhook_samples_webhook
  ON public.platform_crm_webhook_sample_requests(webhook_id);

-- ============================================================
-- 4) FUNÇÕES portadas (contadores) — sem org/product scope
-- ============================================================
CREATE OR REPLACE FUNCTION public.platform_crm_increment_webhook_requests(p_webhook_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.platform_crm_webhooks
  SET
    requests_count = requests_count + 1,
    requests_this_month = requests_this_month + 1,
    last_request_at = now()
  WHERE id = p_webhook_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_crm_reset_monthly_webhook_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.platform_crm_webhooks SET requests_this_month = 0;
END;
$$;

-- ============================================================
-- 5) TRIGGER updated_at (só platform_crm_webhooks tem updated_at)
-- ============================================================
DROP TRIGGER IF EXISTS trg_platform_crm_webhooks_updated_at
  ON public.platform_crm_webhooks;
CREATE TRIGGER trg_platform_crm_webhooks_updated_at
  BEFORE UPDATE ON public.platform_crm_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.platform_crm_set_updated_at();

-- ============================================================
-- 6) RLS — super_admin-only em TODAS as tabelas desta seção
--    (helper public.has_role já existe: SECURITY DEFINER sobre user_roles)
-- ============================================================
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_webhooks',
    'platform_crm_webhook_logs',
    'platform_crm_webhook_sample_requests'
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
-- FIM — 3 tabelas platform_crm_webhook* isoladas, RLS super_admin-only.
-- ============================================================
