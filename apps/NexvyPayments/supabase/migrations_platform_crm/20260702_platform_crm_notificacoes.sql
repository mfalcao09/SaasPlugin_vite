-- ============================================================
-- platform_crm — Secao "Notificacoes" (Central de Notificacoes)
-- Portada do CRM Vendus para o super-admin SINGLE-TENANT.
-- Schema TOTALMENTE ISOLADO / DESACOPLADO do tenant.
-- ============================================================
-- Regras de design (identicas ao 20260701_platform_crm_schema.sql):
--   * Prefixo obrigatorio: platform_crm_<nome>.
--   * Tenant-of-one => SEM organization_id em NENHUMA tabela.
--   * Pipeline/catalogo unico => SEM product_id em NENHUMA tabela.
--   * FKs internas SO apontam para platform_crm_* / auth.users.
--   * Refs de usuario (created_by, user_id, admin_user_id, approved_by...)
--     => uuid -> auth.users(id) (super-admins).
--   * Enum notification_type recriado como platform_crm_notification_type
--     (idempotente via DO-block).
--   * RLS super_admin-only em TODAS via public.has_role.
--   * Trigger updated_at reusa public.platform_crm_set_updated_at().
--   * Migration idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Helper de updated_at (idempotente; reusa o do schema base).
--    Recriado aqui para tornar esta migration auto-suficiente.
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
-- 0.1) Enum de tipo de notificacao (equivalente ao notification_type original)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'platform_crm_notification_type'
  ) THEN
    CREATE TYPE public.platform_crm_notification_type AS ENUM (
      'cadence',
      'urgency',
      'opportunity',
      'audit',
      'system'
    );
  END IF;
END$$;

-- ============================================================
-- 1) admin_notifications  => platform_crm_admin_notifications
--    (batch/historico de notificacoes disparadas pelo super-admin)
--    DROP: organization_id (FK organizations); created_by re-aponta auth.users.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Conteudo
  type public.platform_crm_notification_type DEFAULT 'system',
  title text NOT NULL,
  message text,
  action_url text,

  -- Escopo (userIds continua em scope_filters; product/squad viram genericos)
  scope text NOT NULL DEFAULT 'all'
    CHECK (scope IN ('all', 'product', 'squad', 'custom')),
  scope_filters jsonb DEFAULT '{}'::jsonb,

  -- Canais
  send_app boolean DEFAULT true,
  send_email boolean DEFAULT false,

  -- Estatisticas
  recipients_count integer DEFAULT 0,
  emails_sent integer DEFAULT 0,
  emails_failed integer DEFAULT 0,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_admin_notifications_created_at
  ON public.platform_crm_admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_crm_admin_notifications_created_by
  ON public.platform_crm_admin_notifications(created_by);

-- ============================================================
-- 2) notifications  => platform_crm_notifications
--    (notificacoes individuais in-app por usuario)
--    DROP: product_id (FK products do tenant, proibido).
--    admin_notification_id re-aponta para platform_crm_admin_notifications.
--    user_id => auth.users.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.platform_crm_notification_type
    NOT NULL DEFAULT 'system'::public.platform_crm_notification_type,
  title text NOT NULL,
  message text,
  action_url text,
  is_read boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  admin_notification_id uuid
    REFERENCES public.platform_crm_admin_notifications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_notifications_user
  ON public.platform_crm_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_notifications_user_unread
  ON public.platform_crm_notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_platform_crm_notifications_admin_notification
  ON public.platform_crm_notifications(admin_notification_id);

-- ============================================================
-- 3) auto_notification_settings => platform_crm_auto_notification_settings
--    (config de alertas automaticos + Agente Admin Executivo)
--    DROP: organization_id + UNIQUE(organization_id).
--    Singleton tenant-of-one: garantido por indice unico parcial (1 linha).
--    admin_user_id => auth.users. monitored_product_ids mantido como uuid[]
--    SEM FK (metadado solto, mesmo tratamento de agent_id no schema base).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_auto_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lead parado
  stalled_lead_enabled boolean DEFAULT true,
  stalled_lead_days integer DEFAULT 3,

  -- Meta atingida
  goal_achieved_enabled boolean DEFAULT true,

  -- Comissao aprovada
  commission_approved_enabled boolean DEFAULT true,

  -- Relatorio diario com IA
  daily_report_enabled boolean DEFAULT true,
  daily_report_hour integer DEFAULT 7,
  daily_report_send_email boolean DEFAULT true,

  -- Agente Admin Executivo
  admin_agent_enabled boolean DEFAULT false,
  admin_whatsapp_number text,
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  daily_summary_enabled boolean DEFAULT true,
  daily_summary_hour integer DEFAULT 8,
  weekly_report_enabled boolean DEFAULT true,
  weekly_report_dow integer DEFAULT 1,
  weekly_report_hour integer DEFAULT 8,
  realtime_alerts_enabled boolean DEFAULT true,
  alert_high_value_threshold numeric DEFAULT 10000,
  alert_unattended_minutes integer DEFAULT 15,
  alert_offline_minutes integer DEFAULT 30,
  alert_agent_error_threshold integer DEFAULT 3,
  alert_meeting_changes boolean DEFAULT true,
  alert_goal_achieved boolean DEFAULT true,

  -- Novos campos do Agente Admin Executivo
  monitored_product_ids uuid[] DEFAULT NULL,
  summary_kpis text[] DEFAULT ARRAY['leads_created','conversions','pipeline_total','meetings','overdue_tasks','top_sellers']::text[],
  weekly_include_comparison boolean DEFAULT true,
  alert_product_volume_spike boolean DEFAULT false,
  alert_product_volume_spike_pct integer DEFAULT 50,
  alert_critical_product_idle_hours integer DEFAULT 24,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
-- Singleton: no maximo 1 linha de settings na plataforma (era UNIQUE(organization_id)).
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_crm_auto_notification_settings_singleton
  ON public.platform_crm_auto_notification_settings((true));

-- ============================================================
-- 4) notification_logs => platform_crm_notification_logs
--    (dedup de disparo automatico por dia)
--    DROP: organization_id (FK organizations). user_id => auth.users.
--    notification_type continua text livre (nao usa o enum no original).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  reference_id uuid,
  reference_date date DEFAULT CURRENT_DATE,
  sent_at timestamptz DEFAULT now(),
  CONSTRAINT platform_crm_notification_logs_dedup_uniq
    UNIQUE (user_id, notification_type, reference_id, reference_date)
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_notification_logs_user
  ON public.platform_crm_notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_notification_logs_type
  ON public.platform_crm_notification_logs(notification_type);
CREATE INDEX IF NOT EXISTS idx_platform_crm_notification_logs_date
  ON public.platform_crm_notification_logs(reference_date);

-- ============================================================
-- 5) TRIGGERS de updated_at (idempotentes)
--    Apenas tabelas COM coluna updated_at:
--    platform_crm_auto_notification_settings.
-- ============================================================
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_auto_notification_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I;', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.platform_crm_set_updated_at();',
      t, t
    );
  END LOOP;
END$$;

-- ============================================================
-- 6) RLS — super_admin-only em TODAS as tabelas platform_crm_*
--    (helper public.has_role ja existe: SECURITY DEFINER sobre user_roles)
-- ============================================================
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_admin_notifications',
    'platform_crm_notifications',
    'platform_crm_auto_notification_settings',
    'platform_crm_notification_logs'
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
-- FIM — 4 tabelas platform_crm_* de notificacoes, RLS super_admin-only.
-- ============================================================
