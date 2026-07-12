-- ============================================================================
-- MÓDULO INSTAGRAM FLOWS (automações estilo ManyChat) — camada PLATAFORMA
-- (super_admin), PRODUCT-SCOPED
-- ----------------------------------------------------------------------------
-- PORTE product-scoped do módulo "Instagram Automations" do CRM Vendus V5
-- (org-scoped) para a camada platform_crm_*.
-- Fonte (V5): supabase/migrations/20260704200129_f92e893f-e145-4f43-9567-
--   baaba0f62ba7.sql
--   (guigascruz25-sales-guide-buddy-11, snapshot completo-0109)
--   → 3 tabelas: instagram_flows, instagram_flow_runs,
--     instagram_comment_replies + coluna subscribed_fields em
--     instagram_connections.
--
-- Adaptações para a camada platform_crm_* (super_admin, single-plataforma):
--   • organization_id  →  REMOVIDO. Escopo passa a ser product_id
--     (uuid NOT NULL REFERENCES platform_crm_products(id) ON DELETE CASCADE).
--   • instagram_flows            → platform_crm_instagram_flows.
--   • instagram_flow_runs        → platform_crm_instagram_flow_runs.
--   • instagram_comment_replies  → platform_crm_instagram_comment_replies.
--   • FK connection_id           → platform_crm_instagram_connections(id).
--   • FK conversation_id (era webchat_conversations no V5)
--                                → platform_crm_conversations(id) ON DELETE
--     SET NULL. (a gêmea unificada de conversas na plataforma).
--   • FK created_by              → auth.users(id) ON DELETE SET NULL (idêntico).
--   • RLS = padrão vigente `_super_admin_only`
--     (has_role(auth.uid(),'super_admin'::app_role)), idêntico às demais
--     tabelas platform_crm_* (ver modelo 20260712_platform_crm_journey_events).
--     Substitui as policies org-based (user_belongs_to_organization /
--     user_has_permission) do V5, que não se aplicam ao painel super_admin.
--   • GRANTs explícitos do V5 (authenticated/service_role) OMITIDOS — o modelo
--     platform_crm_journey_events também não os inclui; o acesso é governado
--     pela policy _super_admin_only + grants globais da camada.
--   • updated_at → trigger public.update_updated_at_column() (existe no projeto,
--     verificado). Nome do trigger prefixado trg_pcrm_*.
--
-- DECISÃO DE ESCOPO — instagram_comment_replies:
--   No V5 esta tabela NÃO tem organization_id: é CONNECTION-SCOPED (dedup por
--   comentário, escopada via connection_id → org na RLS). O porte MANTÉM ela
--   connection-scoped (SEM product_id inventado — fidelidade 1:1 e impacto
--   mínimo). A RLS vira _super_admin_only, que não depende de escopo de linha.
--
-- CHECKs de status/trigger_type/trigger_source/status: portados verbatim do V5.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- DROP POLICY/TRIGGER IF EXISTS, ADD COLUMN IF NOT EXISTS.
-- ⚠️ ESCRITA-NÃO-APLICADA: NÃO rodar sem revisão. Não aplicar via MCP/CLI.
--    Segurança: nenhum input de usuário concatenado; nenhum SQL dinâmico.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1) platform_crm_instagram_flows — fluxos visuais (gatilho + blocos)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.platform_crm_instagram_flows (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id                uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  connection_id             uuid
    REFERENCES public.platform_crm_instagram_connections(id) ON DELETE SET NULL,
  name                      text NOT NULL,
  description               text,
  status                    text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','archived')),
  trigger_type              text NOT NULL
    CHECK (trigger_type IN ('comment_keyword','dm_keyword','story_reply',
                            'mention','manual','new_follower')),
  trigger_config            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- trigger_config exemplos:
  --   comment_keyword: { post_ids?: string[] (empty = any post), keywords: string[],
  --                      match: 'any'|'all'|'exact'|'regex', case_sensitive?: bool,
  --                      also_private_reply?: bool, also_like_comment?: bool }
  --   dm_keyword:      { keywords: string[], match: 'any'|'all'|'exact'|'regex' }
  --   story_reply:     { keywords?: string[], match?: 'any'|'exact' }
  --   mention:         { in: 'comment'|'caption'|'both' }
  flow_blocks               jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_block_id            text,
  stats                     jsonb NOT NULL DEFAULT '{}'::jsonb,
  throttle_per_sender_hours integer NOT NULL DEFAULT 24,
  created_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcrm_ig_flows_product
  ON public.platform_crm_instagram_flows(product_id);
CREATE INDEX IF NOT EXISTS idx_pcrm_ig_flows_conn
  ON public.platform_crm_instagram_flows(connection_id)
  WHERE connection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pcrm_ig_flows_active
  ON public.platform_crm_instagram_flows(product_id, trigger_type)
  WHERE status = 'active';

ALTER TABLE public.platform_crm_instagram_flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_crm_instagram_flows_super_admin_only
  ON public.platform_crm_instagram_flows;
CREATE POLICY platform_crm_instagram_flows_super_admin_only
  ON public.platform_crm_instagram_flows
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP TRIGGER IF EXISTS trg_pcrm_ig_flows_updated_at
  ON public.platform_crm_instagram_flows;
CREATE TRIGGER trg_pcrm_ig_flows_updated_at
  BEFORE UPDATE ON public.platform_crm_instagram_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ════════════════════════════════════════════════════════════════════════════
-- 2) platform_crm_instagram_flow_runs — auditoria de execuções
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.platform_crm_instagram_flow_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  flow_id         uuid NOT NULL
    REFERENCES public.platform_crm_instagram_flows(id) ON DELETE CASCADE,
  connection_id   uuid
    REFERENCES public.platform_crm_instagram_connections(id) ON DELETE SET NULL,
  trigger_source  text NOT NULL
    CHECK (trigger_source IN ('comment','dm','story_reply','mention',
                              'manual','new_follower','postback')),
  source_id       text,                 -- comment_id / message id / etc
  sender_ig_id    text,
  conversation_id uuid
    REFERENCES public.platform_crm_conversations(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','failed','skipped')),
  error           text,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pcrm_ig_flow_runs_flow
  ON public.platform_crm_instagram_flow_runs(flow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcrm_ig_flow_runs_product
  ON public.platform_crm_instagram_flow_runs(product_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcrm_ig_flow_runs_conv
  ON public.platform_crm_instagram_flow_runs(conversation_id)
  WHERE conversation_id IS NOT NULL;

ALTER TABLE public.platform_crm_instagram_flow_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_crm_instagram_flow_runs_super_admin_only
  ON public.platform_crm_instagram_flow_runs;
CREATE POLICY platform_crm_instagram_flow_runs_super_admin_only
  ON public.platform_crm_instagram_flow_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ════════════════════════════════════════════════════════════════════════════
-- 3) platform_crm_instagram_comment_replies — dedup por comentário
--    (CONNECTION-SCOPED — sem product_id, fiel ao V5)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.platform_crm_instagram_comment_replies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   uuid NOT NULL
    REFERENCES public.platform_crm_instagram_connections(id) ON DELETE CASCADE,
  comment_id      text NOT NULL,
  flow_id         uuid
    REFERENCES public.platform_crm_instagram_flows(id) ON DELETE SET NULL,
  replied_public  boolean NOT NULL DEFAULT false,
  replied_private boolean NOT NULL DEFAULT false,
  liked           boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_pcrm_ig_comment_replies_conn
  ON public.platform_crm_instagram_comment_replies(connection_id, created_at DESC);

ALTER TABLE public.platform_crm_instagram_comment_replies
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_crm_instagram_comment_replies_super_admin_only
  ON public.platform_crm_instagram_comment_replies;
CREATE POLICY platform_crm_instagram_comment_replies_super_admin_only
  ON public.platform_crm_instagram_comment_replies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ════════════════════════════════════════════════════════════════════════════
-- 4) Coluna extra em platform_crm_instagram_connections
--    (fields inscritos no webhook do Instagram) — porte 1:1 do V5.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.platform_crm_instagram_connections
  ADD COLUMN IF NOT EXISTS subscribed_fields text[] NOT NULL
  DEFAULT ARRAY['messages','messaging_postbacks','message_reactions']::text[];

-- ============================================================================
-- FIM — módulo Instagram Flows (platform_crm, product-scoped)
-- ============================================================================
