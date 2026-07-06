-- ============================================================
-- platform_crm — SUITE DE CAPTACAO do super-admin (NexvyBeauty)
-- Quiz / Forms / Widget (WebChat) / ChatBot (Flows) / Templates
-- Schema TOTALMENTE ISOLADO / DESACOPLADO do tenant.
-- ============================================================
-- Regras de design (identicas ao 20260701_platform_crm_schema.sql):
--   * Prefixo obrigatorio platform_crm_<nome>.
--   * SEM organization_id, SEM product_id, SEM sector_id de tenant.
--   * FKs internas SO para platform_crm_* / auth.users.
--     - lead_id -> public.platform_crm_leads (ja existe no schema base).
--     - assigned_squad_id -> public.platform_crm_sales_squads (idem).
--     - created_by / assigned_user_id -> auth.users(id).
--   * Enums: originais NAO usam enum PG (tudo TEXT + CHECK) -> mantido TEXT+CHECK.
--   * updated_at via public.platform_crm_set_updated_at() (ja existe).
--   * RLS super_admin-only via public.has_role em TODAS.
--   * Idempotente (CREATE TABLE IF NOT EXISTS; DO-blocks).
-- ============================================================

-- ------------------------------------------------------------
-- 0) Helper updated_at (idempotente; no-op se ja criado pelo schema base)
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
-- 1) CAPTURE FUNNELS (nucleo da suite — quiz/form/widget/chatbot)
--    Original: capture_funnels + ALTERs channel_type/appearance.
--    Dropado: organization_id, product_id; UNIQUE(org,slug) -> UNIQUE(slug).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_capture_funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  slug text NOT NULL,
  channel_type text NOT NULL DEFAULT 'widget'
    CHECK (channel_type IN ('chatbot','whatsapp','form','widget','quiz')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','archived')),
  flow_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_block_id text,
  channels jsonb NOT NULL DEFAULT '{"chat": {"enabled": false, "slug_override": null}, "form": {"enabled": false, "slug_override": null}, "widget": {"enabled": false}}'::jsonb,
  widget_config jsonb DEFAULT '{"position": "bottom-right", "primary_color": "#3B82F6", "greeting": "Ola! Como posso ajudar?", "avatar_url": null, "allowed_domains": []}'::jsonb,
  distribution_rule text NOT NULL DEFAULT 'manual'
    CHECK (distribution_rule IN ('manual','round_robin','squad','user')),
  assigned_squad_id uuid REFERENCES public.platform_crm_sales_squads(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  round_robin_config jsonb DEFAULT '{"users": [], "current_index": 0}'::jsonb,
  default_temperature text DEFAULT 'warm',
  default_tags text[] DEFAULT '{}',
  facebook_pixel_id text,
  google_tag_id text,
  custom_scripts jsonb DEFAULT '{"header": "", "footer": ""}'::jsonb,
  utm_capture boolean DEFAULT true,
  theme jsonb DEFAULT '{"primary_color": "#3B82F6", "background_color": "#0F172A", "text_color": "#FFFFFF", "font_family": "Inter", "logo_url": null, "show_progress": true}'::jsonb,
  appearance jsonb,
  ai_enabled boolean DEFAULT true,
  ai_context text,
  total_views integer DEFAULT 0,
  total_leads integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT platform_crm_capture_funnels_slug_uniq UNIQUE (slug)
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_capture_funnels_status
  ON public.platform_crm_capture_funnels(status);
CREATE INDEX IF NOT EXISTS idx_platform_crm_capture_funnels_channel_type
  ON public.platform_crm_capture_funnels(channel_type);
CREATE INDEX IF NOT EXISTS idx_platform_crm_capture_funnels_updated_at
  ON public.platform_crm_capture_funnels(updated_at);

-- 1.2) funnel_analytics (por canal/dia)
CREATE TABLE IF NOT EXISTS public.platform_crm_funnel_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL
    REFERENCES public.platform_crm_capture_funnels(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('chat','form','widget')),
  date date NOT NULL DEFAULT CURRENT_DATE,
  views integer DEFAULT 0,
  starts integer DEFAULT 0,
  completions integer DEFAULT 0,
  leads_created integer DEFAULT 0,
  CONSTRAINT platform_crm_funnel_analytics_uniq UNIQUE (funnel_id, channel, date)
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_funnel_analytics_funnel
  ON public.platform_crm_funnel_analytics(funnel_id);

-- 1.3) funnel_webhook_logs (lead_id -> platform_crm_leads; dropado organization_id)
CREATE TABLE IF NOT EXISTS public.platform_crm_funnel_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL
    REFERENCES public.platform_crm_capture_funnels(id) ON DELETE CASCADE,
  block_id text NOT NULL,
  lead_id uuid REFERENCES public.platform_crm_leads(id) ON DELETE SET NULL,
  request_url text NOT NULL,
  request_method text NOT NULL DEFAULT 'POST',
  request_headers jsonb DEFAULT '{}'::jsonb,
  request_body jsonb,
  response_status integer,
  response_body text,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  duration_ms integer,
  trigger_source text NOT NULL DEFAULT 'on_block',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_funnel_webhook_logs_funnel
  ON public.platform_crm_funnel_webhook_logs(funnel_id);

-- ============================================================
-- 2) FORMS (FormsSection / FormsManager)
--    Original: forms + form_blocks + form_submissions + form_templates.
--    Dropado: organization_id, product_id. UNIQUE(org,slug)->UNIQUE(slug).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  slug text NOT NULL,
  status text DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','archived')),
  distribution_rule text DEFAULT 'queue'
    CHECK (distribution_rule IN ('manual','round_robin','squad','user','queue')),
  assigned_squad_id uuid REFERENCES public.platform_crm_sales_squads(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  default_temperature text DEFAULT 'warm',
  round_robin_config jsonb DEFAULT '{"users": [], "current_index": 0}'::jsonb,
  theme jsonb DEFAULT '{"primary_color":"#8B5CF6","secondary_color":"#6366F1","background_color":"#ffffff","text_color":"#1f2937","font_family":"Inter","border_radius":"8px","button_style":"filled","logo_url":null,"show_progress":true,"redirect_url":null}'::jsonb,
  facebook_pixel_id text,
  google_tag_id text,
  custom_scripts jsonb DEFAULT '{"header": "", "footer": ""}'::jsonb,
  utm_capture boolean DEFAULT true,
  settings jsonb DEFAULT '{"show_branding":true,"allow_multiple_submissions":false,"notify_on_submission":true,"auto_create_lead":true}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  views_count integer DEFAULT 0,
  submissions_count integer DEFAULT 0,
  CONSTRAINT platform_crm_forms_slug_uniq UNIQUE (slug)
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_forms_status
  ON public.platform_crm_forms(status);
CREATE INDEX IF NOT EXISTS idx_platform_crm_forms_created_at
  ON public.platform_crm_forms(created_at);

-- 2.2) form_blocks
CREATE TABLE IF NOT EXISTS public.platform_crm_form_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL
    REFERENCES public.platform_crm_forms(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  block_type text NOT NULL CHECK (block_type IN (
    'text','email','phone','number','textarea',
    'select','multi_select','yes_no','scale',
    'conditional','score','tag','hidden_field',
    'ai_question','ai_followup',
    'welcome_screen','end_screen'
  )),
  label text NOT NULL,
  description text,
  placeholder text,
  required boolean DEFAULT false,
  options jsonb DEFAULT '[]'::jsonb,
  logic_rules jsonb DEFAULT '[]'::jsonb,
  maps_to text,
  score_value integer DEFAULT 0,
  score_rules jsonb DEFAULT '[]'::jsonb,
  apply_tags text[] DEFAULT '{}',
  validation jsonb DEFAULT '{}'::jsonb,
  block_settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_form_blocks_form
  ON public.platform_crm_form_blocks(form_id, order_index);

-- 2.3) form_submissions (lead_id -> platform_crm_leads)
CREATE TABLE IF NOT EXISTS public.platform_crm_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL
    REFERENCES public.platform_crm_forms(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.platform_crm_leads(id) ON DELETE SET NULL,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_score integer DEFAULT 0,
  tags text[] DEFAULT '{}',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  referrer_url text,
  landing_page text,
  user_agent text,
  ip_address inet,
  geo_country text,
  geo_city text,
  status text DEFAULT 'completed'
    CHECK (status IN ('started','abandoned','completed')),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  step_analytics jsonb DEFAULT '[]'::jsonb,
  time_spent_seconds integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_form_submissions_form
  ON public.platform_crm_form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_platform_crm_form_submissions_lead
  ON public.platform_crm_form_submissions(lead_id);

-- 2.4) form_templates (dropado organization_id; created_by -> auth.users)
CREATE TABLE IF NOT EXISTS public.platform_crm_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text DEFAULT 'general'
    CHECK (category IN ('general','qualification','diagnostic','pre_sale','feedback','survey')),
  thumbnail_url text,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  theme jsonb DEFAULT '{}'::jsonb,
  settings jsonb DEFAULT '{}'::jsonb,
  is_public boolean DEFAULT false,
  is_system boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_form_templates_category
  ON public.platform_crm_form_templates(category);

-- ============================================================
-- 3) QUIZ TEMPLATES (CaptureTemplatesSection / QuizManager)
--    Original: quiz_templates. Dropado: organization_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_quiz_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  category text NOT NULL,
  objective text,
  description text,
  thumbnail text,
  icon text,
  cover_gradient text,
  badges text[] NOT NULL DEFAULT '{}',
  estimated_time text,
  question_count integer NOT NULL DEFAULT 0,
  flow_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  appearance_json jsonb,
  settings_json jsonb,
  scoring_json jsonb,
  results_json jsonb,
  is_official boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT false,
  usage_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_quiz_templates_category
  ON public.platform_crm_quiz_templates(category);

-- ============================================================
-- 4) WEBCHAT / WIDGET (WidgetSection / WidgetManager)
--    Original: webchat_widgets + webchat_agent_configs (+ ALTERs).
--    Dropado: organization_id, product_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_webchat_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Widget Principal',
  is_active boolean DEFAULT true,
  primary_color text DEFAULT '#14B8A6',
  secondary_color text DEFAULT '#0F172A',
  welcome_message text DEFAULT 'Ola! Como posso ajudar?',
  placeholder_text text DEFAULT 'Digite sua mensagem...',
  position text DEFAULT 'bottom-right'
    CHECK (position IN ('bottom-right','bottom-left')),
  avatar_url text,
  auto_open_delay integer,
  business_hours jsonb DEFAULT '{"enabled": false}'::jsonb,
  offline_message text DEFAULT 'Estamos offline no momento. Deixe sua mensagem!',
  collect_email boolean DEFAULT false,
  collect_phone boolean DEFAULT false,
  collect_name boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4.2) webchat_agent_configs (base + todos ALTER ADD COLUMN avancados;
--      product_id dropado; widget_id -> platform_crm_webchat_widgets)
CREATE TABLE IF NOT EXISTS public.platform_crm_webchat_agent_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id uuid NOT NULL
    REFERENCES public.platform_crm_webchat_widgets(id) ON DELETE CASCADE,
  agent_name text DEFAULT 'Assistente Virtual',
  agent_avatar_url text,
  system_prompt text DEFAULT 'Voce e um assistente virtual prestativo e amigavel. Responda de forma clara e objetiva.',
  knowledge_base text,
  faq jsonb DEFAULT '[]'::jsonb,
  handoff_triggers text[] DEFAULT ARRAY['falar com atendente','falar com humano','atendente','quero comprar','preco','valor'],
  auto_handoff_enabled boolean DEFAULT true,
  greeting_message text DEFAULT 'Ola! Sou o assistente virtual. Como posso ajudar voce hoje?',
  fallback_message text DEFAULT 'Desculpe, nao entendi. Posso transferir voce para um atendente?',
  handoff_message text DEFAULT 'Certo! Estou transferindo voce para um atendente. Aguarde um momento.',
  is_active boolean DEFAULT true,
  temperature numeric DEFAULT 0.7,
  max_tokens integer DEFAULT 500,
  persona_style text DEFAULT 'friendly',
  use_product_brain boolean DEFAULT true,
  collect_before_chat boolean DEFAULT true,
  required_fields text[] DEFAULT ARRAY['name','whatsapp'],
  welcome_flow jsonb DEFAULT '[]'::jsonb,
  sales_prompt text,
  sales_context text,
  chunked_messages_enabled boolean DEFAULT true,
  typing_delay_ms integer DEFAULT 1500,
  max_message_length integer DEFAULT 150,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_webchat_agent_configs_widget
  ON public.platform_crm_webchat_agent_configs(widget_id);

-- ============================================================
-- 5) CHAT FLOWS (ChatBotSection / ChatBotManager)
--    Original: chat_flows. Dropado: organization_id, product_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_crm_chat_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Fluxo de Qualificacao',
  description text,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_block_id text,
  is_active boolean DEFAULT true,
  trigger_type text DEFAULT 'always'
    CHECK (trigger_type IN ('always','first_visit','utm_match','none')),
  trigger_conditions jsonb DEFAULT '{}'::jsonb,
  collected_variables jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_platform_crm_chat_flows_active
  ON public.platform_crm_chat_flows(is_active);

-- ============================================================
-- 6) TRIGGERS de updated_at (idempotentes)
-- ============================================================
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_capture_funnels',
    'platform_crm_forms',
    'platform_crm_form_templates',
    'platform_crm_quiz_templates',
    'platform_crm_webchat_widgets',
    'platform_crm_webchat_agent_configs',
    'platform_crm_chat_flows'
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
-- 7) RLS — super_admin-only em TODAS
-- ============================================================
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_capture_funnels',
    'platform_crm_funnel_analytics',
    'platform_crm_funnel_webhook_logs',
    'platform_crm_forms',
    'platform_crm_form_blocks',
    'platform_crm_form_submissions',
    'platform_crm_form_templates',
    'platform_crm_quiz_templates',
    'platform_crm_webchat_widgets',
    'platform_crm_webchat_agent_configs',
    'platform_crm_chat_flows'
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
-- FIM — 11 tabelas platform_crm_* da suite de Captacao, RLS super_admin-only.
-- ============================================================
