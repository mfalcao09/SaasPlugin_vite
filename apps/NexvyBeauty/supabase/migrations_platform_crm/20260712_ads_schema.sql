-- ============================================================================
-- MÓDULO NEXVYADS — camada PLATAFORMA (super_admin), PRODUCT-SCOPED — F1 schema
-- ----------------------------------------------------------------------------
-- ⚠️ ESCRITA-NÃO-APLICADA: rascunho para revisão do Marcelo. NÃO rodar sem
--    aprovação. NÃO aplicado, NÃO deployado, NÃO commitado (2026-07-12).
--
-- 8 tabelas F1 do blueprint DESENHO-NEXVYADS-F1-2026-07-12.md §2:
--   ads_platform_connections · ads_accounts · ads_campaigns · ads_adsets ·
--   ads_ads · ads_metrics · ads_recommendations · ads_mutations_log
--   (ads_attribution é Fase 2 — NÃO criada aqui.)
--
-- Decisões ratificadas por Marcelo (2026-07-12):
--   • Prefixo `ads_*`.
--   • FK `product_id` → platform_crm_products(id) ON DELETE CASCADE.
--   • Conexão OAuth-only (Facebook Login for Business / config_id).
--
-- Padrões da casa (idênticos às ~22 tabelas platform_crm_* — ver
-- 20260712_platform_crm_journey_events.sql):
--   • product-scoped puro, SEM org_id. Escopo = product_id.
--   • RLS única `<tabela>_super_admin_only`:
--       has_role(auth.uid(), 'super_admin'::app_role)   [assinatura verificada
--       em prod: has_role(_user_id uuid, _role app_role); app_role tem o valor
--       'super_admin'].
--   • updated_at mantido por trigger BEFORE UPDATE → update_updated_at_column()
--       [verificado em prod: NEW.updated_at = now()].
--   • Token de plataforma SEMPRE cifrado: coluna access_token_encrypted (AES-256
--       -GCM via _shared/meta-crypto.ts). NUNCA plaintext, NUNCA no frontend.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
--   DROP POLICY/TRIGGER IF EXISTS. Sem enums novos (status/level em text +
--   CHECK, para não travar em ALTER TYPE incremental).
-- Segurança: nenhuma coluna recebe input concatenado; RLS super_admin-only.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1) ads_platform_connections  (fonte V5: org_marketing_credentials, ajustada)
--    org→product · provider→platform · token cifrado em coluna · +auth_mode ·
--    +login_config_id (Login for Business).
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ads_platform_connections (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id             uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  platform               text NOT NULL DEFAULT 'meta'
    CHECK (platform IN ('meta')),
  auth_mode              text NOT NULL DEFAULT 'oauth'
    CHECK (auth_mode IN ('oauth')),          -- OAuth-only (token colado dropado)
  external_business_id   text,               -- Business ID concedido no Login for Business
  login_config_id        text,               -- Configuration usada no grant
  access_token_encrypted text,               -- system-user token (long-lived), cifrado
  token_expires_at       timestamptz,
  scopes                 text[],             -- escopos efetivos concedidos
  status                 text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','error','revoked')),
  last_error             text,
  connected_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
-- Uma conexão por (produto, plataforma, business). external_business_id pode ser
-- NULL enquanto pending → índice único parcial só quando já resolvido.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ads_connections_product_platform_business
  ON public.ads_platform_connections (product_id, platform, external_business_id)
  WHERE external_business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ads_connections_product
  ON public.ads_platform_connections (product_id);
CREATE INDEX IF NOT EXISTS idx_ads_connections_product_status
  ON public.ads_platform_connections (product_id, status);

-- ════════════════════════════════════════════════════════════════════════════
-- 2) ads_accounts  (novo — Login for Business habilita N contas por grant)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ads_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  connection_id       uuid NOT NULL
    REFERENCES public.ads_platform_connections(id) ON DELETE CASCADE,
  external_account_id text NOT NULL,          -- ex.: act_1234567890 / account_id
  name                text,
  currency            text,
  timezone_name       text,
  account_status      integer,                -- código Meta (1=ACTIVE, 2=DISABLED, …)
  business_id         text,
  business_name       text,
  is_active           boolean NOT NULL DEFAULT true,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_account_id)
);
CREATE INDEX IF NOT EXISTS idx_ads_accounts_product
  ON public.ads_accounts (product_id);
CREATE INDEX IF NOT EXISTS idx_ads_accounts_connection
  ON public.ads_accounts (connection_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3) ads_campaigns  (fonte V5: marketing_campaigns, 1:1 · org→product +conn)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ads_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  account_id       uuid NOT NULL
    REFERENCES public.ads_accounts(id) ON DELETE CASCADE,
  connection_id    uuid
    REFERENCES public.ads_platform_connections(id) ON DELETE SET NULL,
  external_id      text NOT NULL,             -- campaign id na plataforma
  name             text,
  objective        text,
  status           text,                      -- ACTIVE/PAUSED/ARCHIVED/DELETED
  effective_status text,
  daily_budget     numeric(18,2),
  lifetime_budget  numeric(18,2),
  buying_type      text,
  start_time       timestamptz,
  stop_time        timestamptz,
  raw              jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_ads_campaigns_product
  ON public.ads_campaigns (product_id);
CREATE INDEX IF NOT EXISTS idx_ads_campaigns_account
  ON public.ads_campaigns (account_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 4) ads_adsets  (fonte V5: marketing_adsets, 1:1)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ads_adsets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  campaign_id       uuid NOT NULL
    REFERENCES public.ads_campaigns(id) ON DELETE CASCADE,
  account_id        uuid NOT NULL
    REFERENCES public.ads_accounts(id) ON DELETE CASCADE,
  external_id       text NOT NULL,
  name              text,
  status            text,
  effective_status  text,
  daily_budget      numeric(18,2),
  lifetime_budget   numeric(18,2),
  optimization_goal text,
  billing_event     text,
  bid_amount        numeric(18,2),
  targeting         jsonb NOT NULL DEFAULT '{}'::jsonb,
  start_time        timestamptz,
  end_time          timestamptz,
  raw               jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_ads_adsets_product
  ON public.ads_adsets (product_id);
CREATE INDEX IF NOT EXISTS idx_ads_adsets_campaign
  ON public.ads_adsets (campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads_adsets_account
  ON public.ads_adsets (account_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 5) ads_ads  (fonte V5: marketing_ads + marketing_creatives)
--    creative dobrado em jsonb (perde dedupe por content_hash — blueprint §2).
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ads_ads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  adset_id         uuid NOT NULL
    REFERENCES public.ads_adsets(id) ON DELETE CASCADE,
  campaign_id      uuid NOT NULL
    REFERENCES public.ads_campaigns(id) ON DELETE CASCADE,
  account_id       uuid NOT NULL
    REFERENCES public.ads_accounts(id) ON DELETE CASCADE,
  external_id      text NOT NULL,
  name             text,
  status           text,
  effective_status text,
  creative         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- creative dobrado
  preview_url      text,
  raw              jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (adset_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_ads_ads_product
  ON public.ads_ads (product_id);
CREATE INDEX IF NOT EXISTS idx_ads_ads_adset
  ON public.ads_ads (adset_id);
CREATE INDEX IF NOT EXISTS idx_ads_ads_campaign
  ON public.ads_ads (campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads_ads_account
  ON public.ads_ads (account_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 6) ads_metrics  (fonte V5: marketing_insights_daily; -ctwa_clicks; +cpa/roas)
--    Insights diários em qualquer nível (account/campaign/adset/ad). Chave de
--    upsert = (account_id, level, external_entity_id, date_start).
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ads_metrics (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  account_id          uuid NOT NULL
    REFERENCES public.ads_accounts(id) ON DELETE CASCADE,
  level               text NOT NULL
    CHECK (level IN ('account','campaign','adset','ad')),
  external_entity_id  text NOT NULL,          -- id da entidade na plataforma
  campaign_id         uuid REFERENCES public.ads_campaigns(id) ON DELETE SET NULL,
  adset_id            uuid REFERENCES public.ads_adsets(id)    ON DELETE SET NULL,
  ad_id               uuid REFERENCES public.ads_ads(id)       ON DELETE SET NULL,
  date_start          date NOT NULL,
  impressions         bigint,
  clicks              bigint,
  reach               bigint,
  spend               numeric(18,2),
  cpc                 numeric(18,6),
  cpm                 numeric(18,6),
  ctr                 numeric(18,6),
  conversions         numeric(18,4),
  conversion_value    numeric(18,2),
  cpa                 numeric(18,4),          -- derivado (spend / conversions)
  roas                numeric(18,4),          -- derivado (conversion_value / spend)
  actions             jsonb NOT NULL DEFAULT '[]'::jsonb,   -- breakdown bruto de actions
  raw                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, level, external_entity_id, date_start)
);
CREATE INDEX IF NOT EXISTS idx_ads_metrics_product_date
  ON public.ads_metrics (product_id, date_start DESC);
CREATE INDEX IF NOT EXISTS idx_ads_metrics_account_level_date
  ON public.ads_metrics (account_id, level, date_start DESC);
CREATE INDEX IF NOT EXISTS idx_ads_metrics_campaign
  ON public.ads_metrics (campaign_id) WHERE campaign_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 7) ads_recommendations  (GREENFIELD — camada agente/HITL, zero fonte V5)
--    O agente ads-optimize (Fase 1) grava recomendações pending; super_admin
--    aprova/rejeita; ao aplicar, aponta para a linha em ads_mutations_log.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ads_recommendations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  account_id          uuid REFERENCES public.ads_accounts(id)   ON DELETE SET NULL,
  campaign_id         uuid REFERENCES public.ads_campaigns(id)  ON DELETE SET NULL,
  adset_id            uuid REFERENCES public.ads_adsets(id)     ON DELETE SET NULL,
  ad_id               uuid REFERENCES public.ads_ads(id)        ON DELETE SET NULL,
  kind                text NOT NULL,          -- ex.: budget_increase / pause_ad / shift_budget
  title               text,
  rationale           text,
  proposed_action     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- mutação estruturada a aplicar
  expected_impact     jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence          numeric(5,4),           -- 0..1
  priority            integer NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','applied','expired')),
  reviewed_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  applied_mutation_id uuid,                   -- → ads_mutations_log.id (sem FK: evita ciclo)
  source              text NOT NULL DEFAULT 'ads-optimize',
  expires_at          timestamptz,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ads_recs_product_status
  ON public.ads_recommendations (product_id, status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_ads_recs_account
  ON public.ads_recommendations (account_id) WHERE account_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 8) ads_mutations_log  (GREENFIELD — auditoria de mutações, zero fonte V5)
--    Toda escrita na Graph API (aprovada via HITL) registra before/after + resp.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ads_mutations_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  recommendation_id  uuid REFERENCES public.ads_recommendations(id)      ON DELETE SET NULL,
  account_id         uuid REFERENCES public.ads_accounts(id)             ON DELETE SET NULL,
  connection_id      uuid REFERENCES public.ads_platform_connections(id) ON DELETE SET NULL,
  target_level       text NOT NULL
    CHECK (target_level IN ('campaign','adset','ad')),
  target_external_id text NOT NULL,
  action             text NOT NULL,           -- ex.: update_budget / pause / resume
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,   -- o que foi enviado
  before_state       jsonb,
  after_state        jsonb,
  status             text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','success','error')),
  error              text,
  graph_response     jsonb,
  applied_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ads_mutations_product_time
  ON public.ads_mutations_log (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_mutations_recommendation
  ON public.ads_mutations_log (recommendation_id) WHERE recommendation_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS: super_admin only (padrão vigente `_super_admin_only`) — 8 tabelas
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.ads_platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_accounts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_adsets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_ads                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_metrics              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_recommendations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_mutations_log        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ads_platform_connections_super_admin_only ON public.ads_platform_connections;
CREATE POLICY ads_platform_connections_super_admin_only ON public.ads_platform_connections
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS ads_accounts_super_admin_only ON public.ads_accounts;
CREATE POLICY ads_accounts_super_admin_only ON public.ads_accounts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS ads_campaigns_super_admin_only ON public.ads_campaigns;
CREATE POLICY ads_campaigns_super_admin_only ON public.ads_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS ads_adsets_super_admin_only ON public.ads_adsets;
CREATE POLICY ads_adsets_super_admin_only ON public.ads_adsets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS ads_ads_super_admin_only ON public.ads_ads;
CREATE POLICY ads_ads_super_admin_only ON public.ads_ads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS ads_metrics_super_admin_only ON public.ads_metrics;
CREATE POLICY ads_metrics_super_admin_only ON public.ads_metrics
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS ads_recommendations_super_admin_only ON public.ads_recommendations;
CREATE POLICY ads_recommendations_super_admin_only ON public.ads_recommendations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS ads_mutations_log_super_admin_only ON public.ads_mutations_log;
CREATE POLICY ads_mutations_log_super_admin_only ON public.ads_mutations_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ════════════════════════════════════════════════════════════════════════════
-- Triggers updated_at → update_updated_at_column() (8 tabelas)
-- ════════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS set_updated_at_ads_platform_connections ON public.ads_platform_connections;
CREATE TRIGGER set_updated_at_ads_platform_connections
  BEFORE UPDATE ON public.ads_platform_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_ads_accounts ON public.ads_accounts;
CREATE TRIGGER set_updated_at_ads_accounts
  BEFORE UPDATE ON public.ads_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_ads_campaigns ON public.ads_campaigns;
CREATE TRIGGER set_updated_at_ads_campaigns
  BEFORE UPDATE ON public.ads_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_ads_adsets ON public.ads_adsets;
CREATE TRIGGER set_updated_at_ads_adsets
  BEFORE UPDATE ON public.ads_adsets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_ads_ads ON public.ads_ads;
CREATE TRIGGER set_updated_at_ads_ads
  BEFORE UPDATE ON public.ads_ads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_ads_metrics ON public.ads_metrics;
CREATE TRIGGER set_updated_at_ads_metrics
  BEFORE UPDATE ON public.ads_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_ads_recommendations ON public.ads_recommendations;
CREATE TRIGGER set_updated_at_ads_recommendations
  BEFORE UPDATE ON public.ads_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_ads_mutations_log ON public.ads_mutations_log;
CREATE TRIGGER set_updated_at_ads_mutations_log
  BEFORE UPDATE ON public.ads_mutations_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- FIM — NexvyAds F1 schema (ads_*, product-scoped, super_admin-only)
-- Pendência conhecida (NÃO nesta migration): as credenciais do App Meta Ads
-- (app_id/app_secret/login_config_id) NÃO têm coluna no prod — platform_settings
-- só tem meta_commerce_* / meta_wa_master_key (verificado 2026-07-12). O
-- meta-ads-oauth.ts lê de env (Function secrets) por ora; migração aditiva de
-- platform_settings.meta_ads_* fica para o passo de credencial, se/quando a casa
-- optar por guardar no banco em vez de env.
-- ============================================================================
