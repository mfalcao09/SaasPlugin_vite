-- ============================================================================
-- F4 — Backend das 9 abas do HUB DO PRODUTO (D3 multiproduto)
-- ----------------------------------------------------------------------------
-- Cria as GÊMEAS product-scoped `platform_crm_*` espelhando as tabelas salão
-- (org-scoped, sem prefixo) já provadas em prod (fonte: src/integrations/supabase/types.ts).
-- NÃO toca nas tabelas salão. RLS = padrão vigente `_super_admin_only` (has_role super_admin).
-- Rep-level (F6) trata SÓ de leads; abas do hub são config de superadmin.
--
-- STATUS: DRAFT v1 — escrito a partir do espelho types.ts. Reconciliar contra o
-- schema REAL (F1 `db pull`) antes/na aplicação. Aplicar via MCP apply_migration.
-- Idempotente: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS.
--
-- FKs conservadoras: só para tabelas cuja existência é certa (organizations,
-- platform_crm_products, auth.users, e as tabelas F4 entre si). Colunas que
-- apontam para tabelas de nome não-verificado (flow_id, target_stage_id,
-- evolution_instance_id, assign_sector_id, agent_id) ficam uuid SEM FK aqui
-- (adicionar FK na F1/F5 quando o nome canônico estiver confirmado).
-- ============================================================================

-- ─── 9. email_templates (org-scoped — SEM product_id; base p/ FK das actions) ──
CREATE TABLE IF NOT EXISTS public.platform_crm_email_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  slug            text NOT NULL,
  subject         text NOT NULL,
  html_content    text NOT NULL,
  variables       jsonb,
  is_active       boolean DEFAULT true,
  is_system       boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (organization_id, slug)
);

-- ─── 1. product_knowledge_sources (Cérebro) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_crm_product_knowledge_sources (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id         uuid NOT NULL REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  source_type        text NOT NULL CHECK (source_type IN ('file','website','youtube','faq','data','training','catalog')),
  title              text NOT NULL,
  description        text,
  file_url           text,
  file_type          text,
  file_size          integer,
  source_url         text,
  last_crawled_at    timestamptz,
  video_id           text,
  video_duration     integer,
  transcript         text,
  question           text,
  answer             text,
  data_category      text,
  data_json          jsonb,
  raw_content        text,
  extracted_content  text,
  processing_status  text DEFAULT 'pending' CHECK (processing_status IN ('pending','processing','completed','failed')),
  processing_error   text,
  processed_at       timestamptz,
  is_active          boolean DEFAULT true,
  is_synced          boolean,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcrm_knowledge_sources_product ON public.platform_crm_product_knowledge_sources(product_id);

-- ─── 2. materials (Materiais) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_crm_materials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  name            text NOT NULL,
  type            text NOT NULL CHECK (type IN ('pdf','video','image','link','banner')),
  url             text NOT NULL,
  objective       text,
  tags            text[],
  status          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcrm_materials_product ON public.platform_crm_materials(product_id);

-- ─── 3. product_training_videos (Playbook) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_crm_product_training_videos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  title             text NOT NULL,
  description       text,
  video_url         text NOT NULL,
  thumbnail_url     text,
  duration_seconds  integer,
  order_index       integer,
  is_active         boolean DEFAULT true,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcrm_training_videos_product ON public.platform_crm_product_training_videos(product_id);

-- ─── 4. objections (Objeções) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_crm_objections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  category            text NOT NULL CHECK (category IN ('price','trust','timing','thinking','partner','competitor')),
  what_they_say       text NOT NULL,
  what_they_mean      text,
  suggested_response  text NOT NULL,
  follow_up_question  text,
  proof_material_id   uuid REFERENCES public.platform_crm_materials(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcrm_objections_product ON public.platform_crm_objections(product_id);

-- ─── 5. product_catalog_items (Catálogo) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_crm_product_catalog_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id      uuid REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  external_id     text,
  title           text NOT NULL,
  description     text,
  price           numeric,
  currency        text DEFAULT 'BRL',
  url             text,
  thumbnail_url   text,
  images          text[] DEFAULT '{}',
  videos          text[] NOT NULL DEFAULT '{}',
  documents       jsonb NOT NULL DEFAULT '[]',       -- Array<{url,name,type?}>
  attributes      jsonb DEFAULT '{}',
  tags            text[],
  source_type     text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','firecrawl','webhook','api','csv')),
  source_url      text,
  is_active       boolean NOT NULL DEFAULT true,
  last_synced_at  timestamptz,
  search_vector   tsvector GENERATED ALWAYS AS (
                     to_tsvector('portuguese', coalesce(title,'') || ' ' || coalesce(description,''))
                   ) STORED,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcrm_catalog_items_product ON public.platform_crm_product_catalog_items(product_id);
CREATE INDEX IF NOT EXISTS idx_pcrm_catalog_items_search ON public.platform_crm_product_catalog_items USING gin(search_vector);

-- ─── 6. product_ctas (CTAs do chat) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_crm_product_ctas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id        uuid REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  cta_type          text NOT NULL CHECK (cta_type IN ('checkout','whatsapp','calendar','callback','video','custom')),
  label             text NOT NULL,
  icon              text,
  action_url        text,
  whatsapp_number   text,
  whatsapp_message  text,
  video_url         text,
  intent_level      text CHECK (intent_level IN ('high','medium','low')),
  trigger_keywords  text[],
  display_order     integer,
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcrm_ctas_product ON public.platform_crm_product_ctas(product_id);

-- ─── 7. post_sale_event_actions (Pós-venda — regras) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_crm_post_sale_event_actions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id            uuid NOT NULL REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  event_type            text NOT NULL,   -- compra_aprovada/pix_gerado/boleto_gerado/carrinho_abandonado/reembolso/chargeback/assinatura_cancelada
  is_active             boolean NOT NULL DEFAULT true,
  add_tag_ids           uuid[] NOT NULL DEFAULT '{}',
  remove_tag_ids        uuid[] NOT NULL DEFAULT '{}',
  send_mode             text NOT NULL DEFAULT 'none' CHECK (send_mode IN ('none','flow','message')),
  flow_id               uuid,            -- FK chat_flows (nome canônico p/ confirmar na F1)
  inline_message        text,
  message_channel       text CHECK (message_channel IN ('whatsapp','email')),
  evolution_instance_id uuid,            -- FK evolution_instances (confirmar na F1)
  target_stage_id       uuid,            -- FK pipeline_stages (confirmar na F1)
  deal_outcome          text NOT NULL DEFAULT 'none' CHECK (deal_outcome IN ('none','won','lost')),
  deal_value_source     text NOT NULL DEFAULT 'none' CHECK (deal_value_source IN ('none','webhook','manual')),
  deal_value_manual     numeric,
  assign_sector_id      uuid,            -- FK platform_crm_sectors (confirmar na F1)
  assign_user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_id              uuid,            -- FK platform_crm_product_agents (confirmar na F1)
  agent_objective       text,
  agent_extra_context   text,
  agent_outreach_mode   text NOT NULL DEFAULT 'direct' CHECK (agent_outreach_mode IN ('direct','conversational')),
  email_template_id     uuid REFERENCES public.platform_crm_email_templates(id) ON DELETE SET NULL,
  delay_minutes         integer NOT NULL DEFAULT 0,
  notify_user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcrm_postsale_actions_product ON public.platform_crm_post_sale_event_actions(product_id);

-- ─── 8. post_sale_event_logs (Pós-venda — execuções) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_crm_post_sale_event_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id        uuid REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  event_type        text NOT NULL,
  source            text NOT NULL,
  action_id         uuid REFERENCES public.platform_crm_post_sale_event_actions(id) ON DELETE SET NULL,
  lead_id           uuid,             -- FK platform_crm_leads (confirmar na F1)
  event_data        jsonb NOT NULL DEFAULT '{}',
  executed_actions  jsonb NOT NULL DEFAULT '[]',   -- Array<{success:boolean,...}>
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcrm_postsale_logs_product ON public.platform_crm_post_sale_event_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_pcrm_postsale_logs_action ON public.platform_crm_post_sale_event_logs(action_id);

-- ============================================================================
-- RLS — padrão vigente `_super_admin_only` (idêntico às 22 tabelas existentes)
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_crm_email_templates',
    'platform_crm_product_knowledge_sources',
    'platform_crm_materials',
    'platform_crm_product_training_videos',
    'platform_crm_objections',
    'platform_crm_product_catalog_items',
    'platform_crm_product_ctas',
    'platform_crm_post_sale_event_actions',
    'platform_crm_post_sale_event_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_super_admin_only', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR ALL TO authenticated
        USING (public.has_role(auth.uid(), 'super_admin'::app_role))
        WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
    $f$, t || '_super_admin_only', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
  END LOOP;
END $$;
