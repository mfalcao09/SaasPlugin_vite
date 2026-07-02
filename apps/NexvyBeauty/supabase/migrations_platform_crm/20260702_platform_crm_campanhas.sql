-- ============================================================
-- platform_crm — SECAO "CAMPANHAS" (Campanhas Inteligentes)
-- Desacoplada / isolada do tenant para o super-admin single-tenant.
-- ============================================================
-- Regras de design (mesmas do schema base platform_crm):
--   * Prefixo obrigatorio: platform_crm_<nome>.
--   * Tenant-of-one => SEM organization_id em NENHUMA tabela.
--   * Pipeline unico => SEM product_id / product-scoping.
--   * FKs internas SO apontam para platform_crm_* / auth.users.
--     (leads -> platform_crm_leads, context -> platform_crm_campaign_contexts,
--      post_cadence -> platform_crm_cadences quando existir).
--   * Refs de tenant que nao tem par isolado (agent_id, instance_id,
--     conversation_id, outreach_queue_id, reengagement_template_id,
--     meta_template_config, instance_distribution) => mantidas como
--     uuid/jsonb SOLTOS (sem FK), pra nao acoplar ao tenant.
--   * Original usa apenas CHECK (text) — sem pg enums; mantemos CHECK.
--   * RLS super_admin-only via public.has_role. Idempotente.
--   * updated_at reusa public.platform_crm_set_updated_at() (do schema base).
-- ============================================================

-- ------------------------------------------------------------
-- 0) Helper de updated_at (idempotente; identico ao do schema base,
--    replicado aqui pra migration ser auto-suficiente).
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
-- 1) campaign_contexts  (Biblioteca de Contextos)
--    Dropado: organization_id.  category mantido (add posterior).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_campaign_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  objective text,
  tone text,
  cta text,
  instructions text NOT NULL,
  category text,
  usage_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2) campaigns
--    Dropado: organization_id.
--    agent_id / instance_distribution / meta_template_config =>
--      soltos (referenciam agentes/instancias/templates do tenant).
--    tags_on_response => uuid[] solto (referenciava lead_tags do tenant;
--      no isolado poderia apontar platform_crm_lead_tags, mas mantido
--      como array solto igual ao original — sem FK em array no PG).
--    post_cadence_id => FK diferida p/ platform_crm_cadences (DO-block).
--    status CHECK ja com 'preparing' (add posterior consolidado).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  channel text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'draft',
  agent_id uuid,                      -- solto: agente IA do tenant
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  exclusion_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  contexts jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_distribution text NOT NULL DEFAULT 'random',
  instance_strategy text NOT NULL DEFAULT 'all',
  instance_distribution jsonb NOT NULL DEFAULT '[]'::jsonb,  -- solto: instancias do tenant
  speed_preset text NOT NULL DEFAULT 'recommended',
  speed_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule_type text NOT NULL DEFAULT 'now',
  scheduled_at timestamptz,
  recurrence jsonb,
  post_response_actions jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags_on_response uuid[] NOT NULL DEFAULT '{}',  -- solto: ids de platform_crm_lead_tags (sem FK em array)
  meta_template_config jsonb,          -- solto: template Meta WhatsApp do tenant
  post_cadence_id uuid,                -- FK diferida -> platform_crm_cadences (DO-block abaixo)
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_campaigns_status_chk
    CHECK (status IN ('draft','preparing','active','paused','completed','cancelled')),
  CONSTRAINT platform_crm_campaigns_channel_chk
    CHECK (channel IN ('whatsapp')),
  CONSTRAINT platform_crm_campaigns_speed_preset_chk
    CHECK (speed_preset IN ('safe','recommended','fast','aggressive','custom')),
  CONSTRAINT platform_crm_campaigns_schedule_type_chk
    CHECK (schedule_type IN ('now','scheduled','recurring')),
  CONSTRAINT platform_crm_campaigns_context_dist_chk
    CHECK (context_distribution IN ('random','sequential','weighted')),
  CONSTRAINT platform_crm_campaigns_instance_strategy_chk
    CHECK (instance_strategy IN ('all','rotation','manual'))
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_campaigns_status
  ON public.platform_crm_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_platform_crm_campaigns_agent
  ON public.platform_crm_campaigns(agent_id);

-- FK diferida campaigns.post_cadence_id -> platform_crm_cadences
-- (a tabela vem do schema base; guardamos existencia de ambas).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_crm_cadences'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_crm_campaigns_post_cadence_id_fkey'
  ) THEN
    ALTER TABLE public.platform_crm_campaigns
      ADD CONSTRAINT platform_crm_campaigns_post_cadence_id_fkey
      FOREIGN KEY (post_cadence_id)
      REFERENCES public.platform_crm_cadences(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ============================================================
-- 3) campaign_targets
--    Dropado: organization_id.
--    lead_id => FK platform_crm_leads.  context_id => FK contexts isolado.
--    instance_id / conversation_id / outreach_queue_id => soltos (tenant).
--    connection_type CHECK consolidado do add posterior.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_campaign_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL
    REFERENCES public.platform_crm_campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL
    REFERENCES public.platform_crm_leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  context_used text,
  context_id uuid
    REFERENCES public.platform_crm_campaign_contexts(id) ON DELETE SET NULL,
  instance_id uuid,                    -- solto: instancia de envio do tenant
  connection_type text NOT NULL DEFAULT 'evolution',
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  conversation_id uuid,                -- solto: conversa do tenant
  outreach_queue_id uuid,              -- solto: fila de outreach do tenant
  error text,
  responded_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_campaign_targets_status_chk
    CHECK (status IN ('queued','sending','sent','failed','skipped','responded','cancelled')),
  CONSTRAINT platform_crm_campaign_targets_connection_type_chk
    CHECK (connection_type IN ('evolution','meta_whatsapp')),
  CONSTRAINT platform_crm_campaign_targets_unique UNIQUE (campaign_id, lead_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_campaign_targets_dispatch
  ON public.platform_crm_campaign_targets(status, scheduled_for) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_platform_crm_campaign_targets_campaign
  ON public.platform_crm_campaign_targets(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_platform_crm_campaign_targets_lead
  ON public.platform_crm_campaign_targets(lead_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_campaign_targets_conversation
  ON public.platform_crm_campaign_targets(conversation_id) WHERE conversation_id IS NOT NULL;

-- ============================================================
-- 4) campaign_preparation_jobs
--    Dropado: organization_id (e sua FK -> organizations do tenant).
--    campaign_id => FK campaigns isolado.  lead_ids => uuid[] solto.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_campaign_preparation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL
    REFERENCES public.platform_crm_campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed')),
  total_contacts integer NOT NULL DEFAULT 0,
  processed_contacts integer NOT NULL DEFAULT 0,
  batch_size integer NOT NULL DEFAULT 500,
  cursor integer NOT NULL DEFAULT 0,
  lead_ids uuid[] NOT NULL DEFAULT '{}',  -- ids de platform_crm_leads (sem FK em array)
  campaign_snapshot jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_cpj_pending
  ON public.platform_crm_campaign_preparation_jobs(created_at)
  WHERE status IN ('pending','running');
CREATE INDEX IF NOT EXISTS idx_platform_crm_cpj_campaign
  ON public.platform_crm_campaign_preparation_jobs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_cpj_status
  ON public.platform_crm_campaign_preparation_jobs(status);

-- ============================================================
-- 5) TRIGGERS updated_at (idempotentes) — tabelas com updated_at.
--    campaign_targets NAO tem updated_at (so created_at) => fora.
-- ============================================================
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_campaign_contexts',
    'platform_crm_campaigns',
    'platform_crm_campaign_preparation_jobs'
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
-- 6) RLS — super_admin-only em TODAS (helper public.has_role ja existe).
-- ============================================================
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_campaign_contexts',
    'platform_crm_campaigns',
    'platform_crm_campaign_targets',
    'platform_crm_campaign_preparation_jobs'
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
-- FIM — 4 tabelas platform_crm_* da secao Campanhas, RLS super_admin-only.
-- ============================================================
