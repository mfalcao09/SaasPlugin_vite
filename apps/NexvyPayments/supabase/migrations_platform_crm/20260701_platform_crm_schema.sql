-- ============================================================
-- platform_crm — CRM de venda de SaaS do SUPER-ADMIN (NexvyBeauty)
-- Schema TOTALMENTE ISOLADO / DESACOPLADO do tenant.
-- ============================================================
-- Regras de design (não relaxar):
--   * Prefixo obrigatório: platform_crm_<nome>.
--   * Dado GLOBAL da plataforma (tenant-of-one) => SEM organization_id
--     em NENHUMA tabela.
--   * Pipeline ÚNICO => SEM product_id / product-scoping em NENHUMA tabela.
--   * FKs internas SÓ apontam para tabelas platform_crm_* (jamais para
--     leads/deals/pipeline_stages do tenant — proibido tocar essas).
--   * Refs de usuário (assigned_to, sdr_id, closer_id, seller_id, user_id,
--     created_by, leader_id, ...) => uuid -> auth.users(id) (super-admins).
--   * Enums reusados quando o nome bate no banco destino
--     (lead_temperature, task_status, task_priority JÁ EXISTEM).
--   * RLS em TODAS: acesso exclusivo a super_admin via public.has_role.
--   * Migration idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Helper de updated_at próprio (idempotente; não conflita com o global)
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
-- 1) PIPELINE ÚNICO
-- ============================================================

-- 1.1) pipeline_stages (SEM product_id; pipeline único da plataforma)
CREATE TABLE IF NOT EXISTS public.platform_crm_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text DEFAULT '#6B7280'::text,
  order_index integer NOT NULL DEFAULT 0,
  is_won boolean DEFAULT false,
  is_lost boolean DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_pipeline_stages_order
  ON public.platform_crm_pipeline_stages(order_index);

-- 1.2) stage_values (referenciava product => agora só a stage)
CREATE TABLE IF NOT EXISTS public.platform_crm_stage_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL
    REFERENCES public.platform_crm_pipeline_stages(id) ON DELETE CASCADE,
  expected_value numeric DEFAULT 0,
  probability_percent numeric DEFAULT 0
    CHECK (probability_percent >= 0 AND probability_percent <= 100),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT platform_crm_stage_values_stage_uniq UNIQUE (stage_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_stage_values_stage
  ON public.platform_crm_stage_values(stage_id);

-- ============================================================
-- 2) LEADS + relacionados
-- ============================================================

-- 2.1) leads (SEM organization_id, SEM product_id; current_stage_id -> pipeline único)
CREATE TABLE IF NOT EXISTS public.platform_crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_stage_id uuid
    REFERENCES public.platform_crm_pipeline_stages(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  "position" text,
  source text,
  temperature lead_temperature DEFAULT 'warm'::lead_temperature,
  cadence_day integer DEFAULT 1,
  last_contact_at timestamptz,
  next_action text,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  lead_origin text,
  lead_channel text,
  referrer_url text,
  landing_page text,
  squad_id uuid,            -- FK adicionada após criação de squads (abaixo)
  previous_assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  transferred_at timestamptz,
  transferred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  transfer_reason text,
  expected_close_date date,
  deal_value numeric DEFAULT 0,
  bant_budget text,
  bant_authority text,
  bant_need text,
  bant_timing text,
  sdr_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_leads_current_stage
  ON public.platform_crm_leads(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_leads_assigned_to
  ON public.platform_crm_leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_platform_crm_leads_created_at
  ON public.platform_crm_leads(created_at);

-- 2.2) lead_stage_history
CREATE TABLE IF NOT EXISTS public.platform_crm_lead_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL
    REFERENCES public.platform_crm_leads(id) ON DELETE CASCADE,
  stage_id uuid
    REFERENCES public.platform_crm_pipeline_stages(id) ON DELETE SET NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  exited_at timestamptz,
  days_in_stage integer
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_lead_stage_history_lead
  ON public.platform_crm_lead_stage_history(lead_id);

-- 2.3) lead_notes
CREATE TABLE IF NOT EXISTS public.platform_crm_lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL
    REFERENCES public.platform_crm_leads(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  role_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_lead_notes_lead
  ON public.platform_crm_lead_notes(lead_id);

-- ============================================================
-- 3) TAGS
-- ============================================================

-- 3.1) lead_tags (SEM organization_id)
CREATE TABLE IF NOT EXISTS public.platform_crm_lead_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1'::text,
  description text,
  is_automatic boolean NOT NULL DEFAULT false,
  is_lifecycle_status boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.2) lead_tag_assignments
CREATE TABLE IF NOT EXISTS public.platform_crm_lead_tag_assignments (
  lead_id uuid NOT NULL
    REFERENCES public.platform_crm_leads(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL
    REFERENCES public.platform_crm_lead_tags(id) ON DELETE CASCADE,
  applied_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual'::text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, tag_id)
);

-- 3.3) tag_automations (SEM organization_id, SEM product_id)
CREATE TABLE IF NOT EXISTS public.platform_crm_tag_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  tag_id_to_add uuid NOT NULL
    REFERENCES public.platform_crm_lead_tags(id) ON DELETE CASCADE,
  tag_id_to_remove uuid
    REFERENCES public.platform_crm_lead_tags(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 4) SQUADS (times de venda da plataforma)
-- ============================================================

-- 4.1) sales_squads (SEM organization_id, SEM product_id)
CREATE TABLE IF NOT EXISTS public.platform_crm_sales_squads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon_url text,
  leader_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  color text DEFAULT '#6366F1'::text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4.2) squad_members
CREATE TABLE IF NOT EXISTS public.platform_crm_squad_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL
    REFERENCES public.platform_crm_sales_squads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text DEFAULT 'member'::text,
  joined_at timestamptz DEFAULT now(),
  CONSTRAINT platform_crm_squad_members_uniq UNIQUE (squad_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_squad_members_squad
  ON public.platform_crm_squad_members(squad_id);

-- 4.3) FK diferida de leads.squad_id -> squads (agora que a tabela existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_crm_leads_squad_id_fkey'
  ) THEN
    ALTER TABLE public.platform_crm_leads
      ADD CONSTRAINT platform_crm_leads_squad_id_fkey
      FOREIGN KEY (squad_id)
      REFERENCES public.platform_crm_sales_squads(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ============================================================
-- 5) DEALS + COMISSÕES
-- ============================================================

-- 5.1) deals (SEM organization_id, SEM product_id; seller -> auth.users)
CREATE TABLE IF NOT EXISTS public.platform_crm_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL
    REFERENCES public.platform_crm_leads(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  deal_value numeric NOT NULL,
  status text DEFAULT 'won'::text
    CHECK (status IN ('won','lost','cancelled')),
  notes text,
  plan_name text,
  closed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_deals_lead
  ON public.platform_crm_deals(lead_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_deals_seller
  ON public.platform_crm_deals(seller_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_deals_status
  ON public.platform_crm_deals(status);
CREATE INDEX IF NOT EXISTS idx_platform_crm_deals_created_at
  ON public.platform_crm_deals(created_at);

-- 5.2) commission_rules (SEM organization_id, SEM product_id; applies_to via stage)
CREATE TABLE IF NOT EXISTS public.platform_crm_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_type text NOT NULL DEFAULT 'percentage'::text
    CHECK (rule_type IN ('percentage','fixed')),
  base_value numeric NOT NULL DEFAULT 10,
  min_value numeric DEFAULT 0,
  max_value numeric,
  applies_to text DEFAULT 'deal'::text
    CHECK (applies_to IN ('deal','stage')),
  stage_id uuid
    REFERENCES public.platform_crm_pipeline_stages(id) ON DELETE SET NULL,
  is_default boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_commission_rules_user
  ON public.platform_crm_commission_rules(user_id);

-- 5.3) commissions (SEM organization_id, SEM product_id)
CREATE TABLE IF NOT EXISTS public.platform_crm_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL
    REFERENCES public.platform_crm_deals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount numeric NOT NULL,
  percentage_applied numeric,
  rule_id uuid
    REFERENCES public.platform_crm_commission_rules(id) ON DELETE SET NULL,
  status text DEFAULT 'pending'::text
    CHECK (status IN ('pending','approved','paid','cancelled')),
  earned_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_commissions_deal
  ON public.platform_crm_commissions(deal_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_commissions_user
  ON public.platform_crm_commissions(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_commissions_status
  ON public.platform_crm_commissions(status);

-- 5.4) Cálculo de comissão (portado; SEM product/organization — pipeline único)
CREATE OR REPLACE FUNCTION public.platform_crm_calculate_commission(
  p_deal_id uuid,
  p_deal_value numeric,
  p_seller_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rule RECORD;
  v_commission NUMERIC;
BEGIN
  -- Regra específica do vendedor OU regra padrão global (sem product/org scope)
  SELECT * INTO v_rule
  FROM public.platform_crm_commission_rules
  WHERE is_active = true
    AND (user_id = p_seller_id OR (user_id IS NULL AND is_default = true))
  ORDER BY user_id NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_rule.rule_type = 'percentage' THEN
    v_commission := p_deal_value * (v_rule.base_value / 100);
  ELSE
    v_commission := v_rule.base_value;
  END IF;

  IF v_rule.min_value IS NOT NULL AND v_commission < v_rule.min_value THEN
    v_commission := v_rule.min_value;
  END IF;

  IF v_rule.max_value IS NOT NULL AND v_commission > v_rule.max_value THEN
    v_commission := v_rule.max_value;
  END IF;

  INSERT INTO public.platform_crm_commissions (
    deal_id, user_id, amount, percentage_applied, rule_id, status
  ) VALUES (
    p_deal_id, p_seller_id, v_commission, v_rule.base_value, v_rule.id, 'pending'
  );

  RETURN v_commission;
END;
$function$;

-- ============================================================
-- 6) METAS
-- ============================================================

-- 6.1) sales_goals (SEM organization_id, SEM product_id)
CREATE TABLE IF NOT EXISTS public.platform_crm_sales_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  target_value numeric NOT NULL DEFAULT 0,
  target_deals integer NOT NULL DEFAULT 0,
  achieved_value numeric DEFAULT 0,
  achieved_deals integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_sales_goals_user
  ON public.platform_crm_sales_goals(user_id);

-- ============================================================
-- 7) TAREFAS
-- ============================================================

-- 7.1) tasks (SEM organization_id, SEM product_id; enums task_status/task_priority reusados)
CREATE TABLE IF NOT EXISTS public.platform_crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.platform_crm_leads(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  type text DEFAULT 'follow_up'::text,
  status task_status DEFAULT 'pending'::task_status,
  priority task_priority DEFAULT 'medium'::task_priority,
  due_date timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_tasks_user
  ON public.platform_crm_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_tasks_lead
  ON public.platform_crm_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_tasks_status
  ON public.platform_crm_tasks(status);

-- ============================================================
-- 8) DISTRIBUIÇÃO / FILA
-- ============================================================

-- 8.1) lead_queue (SEM organization_id, SEM product_id)
CREATE TABLE IF NOT EXISTS public.platform_crm_lead_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL
    REFERENCES public.platform_crm_leads(id) ON DELETE CASCADE,
  squad_id uuid REFERENCES public.platform_crm_sales_squads(id) ON DELETE SET NULL,
  priority integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'::text
    CHECK (status IN ('pending','assigned','expired')),
  queued_at timestamptz NOT NULL DEFAULT now(),
  assigned_at timestamptz,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_lead_queue_status
  ON public.platform_crm_lead_queue(status);
CREATE INDEX IF NOT EXISTS idx_platform_crm_lead_queue_lead
  ON public.platform_crm_lead_queue(lead_id);

-- 8.2) distribution_config (SEM organization_id)
CREATE TABLE IF NOT EXISTS public.platform_crm_distribution_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid REFERENCES public.platform_crm_sales_squads(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'round_robin'::text
    CHECK (method IN ('round_robin','least_busy','performance')),
  round_robin_index integer NOT NULL DEFAULT 0,
  auto_reassign boolean NOT NULL DEFAULT true,
  max_accept_time_minutes integer DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 9) CADÊNCIAS
-- ============================================================

-- 9.1) cadences (SEM organization_id; agent_id mantido como uuid solto)
CREATE TABLE IF NOT EXISTS public.platform_crm_cadences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  objective text,
  agent_id uuid,
  status text NOT NULL DEFAULT 'draft'::text
    CHECK (status IN ('draft','active','paused','archived')),
  entry_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  exclusion_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  stop_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  stop_actions jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_window jsonb NOT NULL
    DEFAULT '{"days":["mon","tue","wed","thu","fri"],"start":"09:00","end":"18:00","randomize":false}'::jsonb,
  channel text NOT NULL DEFAULT 'whatsapp'::text,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_executed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_cadences_status
  ON public.platform_crm_cadences(status);

-- 9.2) cadence_steps (context_id do original referenciava campaign_contexts do
--      tenant — REMOVIDO por isolamento; conteúdo do passo fica inline)
CREATE TABLE IF NOT EXISTS public.platform_crm_cadence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_id uuid NOT NULL
    REFERENCES public.platform_crm_cadences(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  name text NOT NULL,
  objective text,
  execute_immediately boolean NOT NULL DEFAULT false,
  delay_value integer NOT NULL DEFAULT 1,
  delay_unit text NOT NULL DEFAULT 'days'::text
    CHECK (delay_unit IN ('minutes','hours','days')),
  delay_from text NOT NULL DEFAULT 'previous_step'::text
    CHECK (delay_from IN ('previous_step','enrollment')),
  context_inline text,
  tone text,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_cadence_steps_cadence
  ON public.platform_crm_cadence_steps(cadence_id, order_index);

-- 9.3) cadence_enrollments (SEM organization_id; lead -> platform_crm_leads)
CREATE TABLE IF NOT EXISTS public.platform_crm_cadence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_id uuid NOT NULL
    REFERENCES public.platform_crm_cadences(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL
    REFERENCES public.platform_crm_leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'::text
    CHECK (status IN ('active','completed','stopped','paused')),
  current_step_id uuid
    REFERENCES public.platform_crm_cadence_steps(id) ON DELETE SET NULL,
  current_step_index integer NOT NULL DEFAULT 0,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  stopped_at timestamptz,
  stop_reason text,
  source text,
  source_ref jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_crm_cadence_enrollments_unique_active
  ON public.platform_crm_cadence_enrollments(cadence_id, lead_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_platform_crm_cadence_enrollments_lead
  ON public.platform_crm_cadence_enrollments(lead_id);

-- 9.4) cadence_step_runs (SEM organization_id)
CREATE TABLE IF NOT EXISTS public.platform_crm_cadence_step_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL
    REFERENCES public.platform_crm_cadence_enrollments(id) ON DELETE CASCADE,
  step_id uuid NOT NULL
    REFERENCES public.platform_crm_cadence_steps(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  executed_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled'::text
    CHECK (status IN ('scheduled','sent','skipped','failed','responded')),
  agent_message text,
  conversation_id uuid,
  skip_reason text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_cadence_step_runs_due
  ON public.platform_crm_cadence_step_runs(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_platform_crm_cadence_step_runs_enrollment
  ON public.platform_crm_cadence_step_runs(enrollment_id);

-- ============================================================
-- 10) CAMPOS CUSTOMIZADOS
-- ============================================================

-- 10.1) custom_fields (SEM organization_id)
CREATE TABLE IF NOT EXISTS public.platform_crm_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  field_key text NOT NULL,
  field_type text NOT NULL DEFAULT 'text'::text,
  description text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_custom_fields_key_uniq UNIQUE (field_key)
);

-- ============================================================
-- 11) TRIGGERS de updated_at (idempotentes)
-- ============================================================
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_stage_values',
    'platform_crm_leads',
    'platform_crm_lead_tags',
    'platform_crm_tag_automations',
    'platform_crm_sales_squads',
    'platform_crm_deals',
    'platform_crm_commission_rules',
    'platform_crm_sales_goals',
    'platform_crm_tasks',
    'platform_crm_distribution_config',
    'platform_crm_cadences',
    'platform_crm_cadence_steps',
    'platform_crm_cadence_enrollments',
    'platform_crm_cadence_step_runs',
    'platform_crm_custom_fields'
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
-- 12) RLS — super_admin-only em TODAS as tabelas platform_crm_*
--     (helper public.has_role já existe: SECURITY DEFINER sobre user_roles)
-- ============================================================
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_pipeline_stages',
    'platform_crm_stage_values',
    'platform_crm_leads',
    'platform_crm_lead_stage_history',
    'platform_crm_lead_notes',
    'platform_crm_lead_tags',
    'platform_crm_lead_tag_assignments',
    'platform_crm_tag_automations',
    'platform_crm_sales_squads',
    'platform_crm_squad_members',
    'platform_crm_deals',
    'platform_crm_commission_rules',
    'platform_crm_commissions',
    'platform_crm_sales_goals',
    'platform_crm_tasks',
    'platform_crm_lead_queue',
    'platform_crm_distribution_config',
    'platform_crm_cadences',
    'platform_crm_cadence_steps',
    'platform_crm_cadence_enrollments',
    'platform_crm_cadence_step_runs',
    'platform_crm_custom_fields'
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
-- FIM — 22 tabelas platform_crm_* isoladas, RLS super_admin-only.
-- ============================================================
