-- ============================================================================
-- F1 — Baseline / reconciliação (paga G3) — VERSIONAMENTO, NÃO aplicar
-- ----------------------------------------------------------------------------
-- Os 3 twins abaixo EXISTEM no remoto (fzhlbwhdejumkyqosuvq) mas NÃO estavam em
-- nenhuma migration local (foram aplicados via MCP em outra máquina — G3).
-- Este arquivo os versiona no git, fiel ao schema REAL (DDL gerado do catálogo
-- do próprio banco via pg_catalog em 2026-07-06). É IDEMPOTENTE (IF NOT EXISTS):
-- aplicar é no-op (as tabelas já existem) → `db diff` vazio p/ elas by construction.
--
-- Nota: as outras ~20 tabelas platform_crm_* já estão versionadas em
-- 20260701_platform_crm_schema.sql e nos arquivos 20260702/03. O DELTA que
-- faltava localmente eram só estes 3 objetos + a coluna product_id (documentada
-- ao fim). PK adicionada (id) sobre o DDL gerado.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_crm_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text,
  status text NOT NULL DEFAULT 'published'::text,
  category text,
  description text,
  short_description text,
  logo_url text,
  banner_url text,
  product_image_url text,
  pricing jsonb,
  external_links jsonb,
  settings jsonb,
  pitch_15s text,
  pitch_30s text,
  pitch_2min text,
  icp text,
  objections text,
  benefits text,
  bonuses text,
  differentials text[],
  guarantee text,
  discount_policy text,
  payment_conditions text,
  plans text,
  knowledge_base text,
  custom_info text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_crm_user_product_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  monthly_goal numeric,
  assigned_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_crm_product_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  name character varying(100) NOT NULL,
  description text,
  avatar_url text,
  agent_type character varying(50) NOT NULL DEFAULT 'custom'::character varying,
  primary_objective text NOT NULL,
  can_do text[] DEFAULT '{}'::text[],
  cannot_do text[] DEFAULT '{}'::text[],
  handoff_triggers text[] DEFAULT '{}'::text[],
  end_conversation_triggers text[] DEFAULT '{}'::text[],
  tone_style character varying(30) DEFAULT 'friendly'::character varying,
  message_style character varying(20) DEFAULT 'balanced'::character varying,
  always_end_with_question boolean DEFAULT true,
  additional_prompt text,
  required_phrases text[] DEFAULT '{}'::text[],
  prohibited_phrases text[] DEFAULT '{}'::text[],
  auto_tag_leads boolean DEFAULT true,
  default_tags text[] DEFAULT '{}'::text[],
  can_update_pipeline boolean DEFAULT true,
  can_create_tasks boolean DEFAULT true,
  can_schedule_meetings boolean DEFAULT true,
  active_in_funnels boolean DEFAULT true,
  active_in_chat boolean DEFAULT true,
  active_in_widget boolean DEFAULT true,
  active_in_inbox boolean DEFAULT true,
  active_in_copilot boolean DEFAULT false,
  active_in_whatsapp boolean DEFAULT true,
  active_in_facebook boolean DEFAULT true,
  active_in_instagram boolean DEFAULT true,
  activation_keywords text[] NOT NULL DEFAULT '{}'::text[],
  activation_phrases text[] NOT NULL DEFAULT '{}'::text[],
  activation_priority integer NOT NULL DEFAULT 0,
  activation_scope text NOT NULL DEFAULT 'all'::text,
  takeover_on_match boolean NOT NULL DEFAULT true,
  can_apply_tags boolean NOT NULL DEFAULT false,
  can_update_lead boolean NOT NULL DEFAULT false,
  can_add_notes boolean NOT NULL DEFAULT false,
  can_notify boolean NOT NULL DEFAULT false,
  can_qualify boolean NOT NULL DEFAULT false,
  can_send_emails boolean NOT NULL DEFAULT false,
  can_send_materials boolean NOT NULL DEFAULT false,
  can_start_cadence boolean NOT NULL DEFAULT false,
  can_transfer boolean NOT NULL DEFAULT false,
  can_trigger_flows boolean NOT NULL DEFAULT false,
  enable_audio_transcription boolean NOT NULL DEFAULT true,
  enable_image_vision boolean NOT NULL DEFAULT true,
  allowed_event_type_ids uuid[] DEFAULT '{}'::uuid[],
  default_schedule_user_id uuid,
  booking_notification_user_ids uuid[] DEFAULT '{}'::uuid[],
  booking_notify_org_admins boolean DEFAULT false,
  evolution_instance_id uuid,
  followup_enabled boolean NOT NULL DEFAULT false,
  followup_max_attempts integer NOT NULL DEFAULT 3,
  followup_intervals_minutes integer[] NOT NULL DEFAULT ARRAY[15, 120, 1440],
  followup_channels text[] NOT NULL DEFAULT ARRAY['whatsapp'::text, 'instagram'::text],
  followup_tone text NOT NULL DEFAULT 'warm'::text,
  followup_extra_instructions text,
  followup_attempt_hints jsonb NOT NULL DEFAULT '[]'::jsonb,
  followup_respect_business_hours boolean NOT NULL DEFAULT true,
  followup_stop_on_booking boolean NOT NULL DEFAULT true,
  followup_stop_on_human boolean NOT NULL DEFAULT true,
  handoff_delay_seconds integer NOT NULL DEFAULT 4,
  handoff_include_summary boolean NOT NULL DEFAULT true,
  handoff_incoming_message text,
  handoff_outgoing_message text,
  humanization jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_delay_seconds integer NOT NULL DEFAULT 2,
  quick_menu_mode text NOT NULL DEFAULT 'off'::text,
  quick_menu_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  quick_menu_intro text,
  quick_menu_invalid_message text,
  qualification_schema jsonb,
  welcome_enabled boolean NOT NULL DEFAULT false,
  welcome_message text,
  tool_configs jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- ─── product_id (reconciliação G3): as 23 tabelas platform_crm_* que carregam
-- product_id no remoto (verificado 2026-07-06). Já presentes no banco; listadas
-- aqui como registro do escopo product-aware (não re-emitir ADD COLUMN):
--   cadences, calendar_events, capture_funnels, chat_flows, commission_rules,
--   commissions, conversations, deals, forms, lead_queue, leads, notifications,
--   pipeline_stages, product_agents, sales_goals, sales_squads, stage_values,
--   tag_automations, tasks, user_product_assignments, webchat_agent_configs,
--   webchat_widgets, webhooks
-- ============================================================================
