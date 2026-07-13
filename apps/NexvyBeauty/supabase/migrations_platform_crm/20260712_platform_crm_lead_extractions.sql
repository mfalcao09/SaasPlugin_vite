-- ============================================================================
-- C9 — MOTOR DE EXTRAÇÃO DE LEADS (Instagram-first) · F0 PoC — schema
-- ----------------------------------------------------------------------------
-- Réplica nativa do `prospectagram` dentro do CRM de plataforma (Captação).
-- Fonte F0 = Instagram (busca por palavras-chave → perfil → telefone do BIO).
--
-- 3 tabelas F0 (espelham o card do prospectagram + as travas LGPD):
--   platform_crm_lead_extractions  (o job de extração)
--   platform_crm_extracted_leads   (staging — o card, 1 linha por perfil)
--   platform_crm_lead_optout       (Art.18 LGPD — oposição, respeitada no import)
--
-- Padrões da casa (idênticos às ~22 tabelas platform_crm_* e ads_* — ver
-- 20260712_ads_schema.sql):
--   • product-scoped puro, SEM org_id. Escopo = product_id → platform_crm_products.
--   • FK product_id ... ON DELETE CASCADE.
--   • RLS única `<tabela>_super_admin_only` FOR ALL TO authenticated
--       USING/WITH CHECK has_role(auth.uid(), 'super_admin'::app_role).
--       (assinatura em prod: has_role(_user_id uuid, _role app_role);
--        app_role tem o valor 'super_admin' — verificado 2026-07-12.)
--   • updated_at por trigger BEFORE UPDATE → update_updated_at_column().
--
-- LGPD (embutido no schema, não é feature futura):
--   • base legal = art.7º §4º (dados manifestamente públicos) → coluna lgpd_basis.
--   • finalidade por lead = coluna finalidade (default 'audiencia_ads'):
--       uso é SÓ audiência de Ads (lookalike/custom audience), NÃO outreach.
--   • Art.18 (oposição) = platform_crm_lead_optout; o import respeita (F1) e a
--       própria staging (webhook) pula quem está em opt-out.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY/TRIGGER IF EXISTS.
-- Segurança: nenhuma coluna recebe input concatenado; RLS super_admin-only; os
--   edges escrevem via SERVICE_ROLE (bypass RLS) e re-aplicam o gate em código.
-- ⚠️ ESCRITA-NÃO-DEPLOYADA de edges: as tabelas SÃO aplicadas (instrução explícita
--   do Marcelo via apply_migration); os edges NÃO são deployados nesta sessão.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1) platform_crm_lead_extractions  (o JOB)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.platform_crm_lead_extractions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  keywords       text[] NOT NULL DEFAULT '{}',
  source         text NOT NULL DEFAULT 'instagram'
    CHECK (source IN ('instagram')),          -- F0 = IG-only; multi-fonte é F1
  status         text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','done','error')),
  apify_run_id   text,
  apify_actor_id text,
  requested_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  total_found    integer NOT NULL DEFAULT 0,
  params         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {search, searchLimit, limit, ...}
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_extractions_product
  ON public.platform_crm_lead_extractions (product_id);
CREATE INDEX IF NOT EXISTS idx_lead_extractions_product_status
  ON public.platform_crm_lead_extractions (product_id, status);
-- Lookup do webhook (Apify → busca a extração pelo run id).
CREATE INDEX IF NOT EXISTS idx_lead_extractions_apify_run
  ON public.platform_crm_lead_extractions (apify_run_id)
  WHERE apify_run_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) platform_crm_extracted_leads  (STAGING — o card do prospectagram)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.platform_crm_extracted_leads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id      uuid NOT NULL
    REFERENCES public.platform_crm_lead_extractions(id) ON DELETE CASCADE,
  product_id         uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  -- ── card ──────────────────────────────────────────────────────────────────
  handle             text,                     -- @ (sem o '@')
  name               text,
  primeiro_nome      text,
  seguidores         integer,
  seguindo           integer,
  posts              integer,
  telefone           text,                     -- E.164 dígitos: "5541985036800"
  whatsapp_link      text,                     -- https://wa.me/<telefone>
  email              text,
  instagram_url      text,
  website            text,
  categoria          text,
  cnpj               jsonb,                    -- {value, source} quando achado no bio
  is_verified        boolean,
  is_private         boolean,
  bio                text,
  palavras_chave     text[] NOT NULL DEFAULT '{}',   -- keywords que geraram o lead
  is_business        boolean,
  -- ── LGPD ──────────────────────────────────────────────────────────────────
  lgpd_basis         text NOT NULL DEFAULT 'art7_par4_publico',
  finalidade         text NOT NULL DEFAULT 'audiencia_ads',   -- SÓ audiência de Ads
  -- ── handoff ───────────────────────────────────────────────────────────────
  imported_to_lead_id uuid REFERENCES public.platform_crm_leads(id) ON DELETE SET NULL,
  raw                jsonb,                    -- item bruto do Apify (auditoria)
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (extraction_id, handle)
);
CREATE INDEX IF NOT EXISTS idx_extracted_leads_extraction
  ON public.platform_crm_extracted_leads (extraction_id);
CREATE INDEX IF NOT EXISTS idx_extracted_leads_product
  ON public.platform_crm_extracted_leads (product_id);
CREATE INDEX IF NOT EXISTS idx_extracted_leads_product_phone
  ON public.platform_crm_extracted_leads (product_id, telefone)
  WHERE telefone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_extracted_leads_not_imported
  ON public.platform_crm_extracted_leads (product_id)
  WHERE imported_to_lead_id IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) platform_crm_lead_optout  (Art.18 LGPD — oposição persistente)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.platform_crm_lead_optout (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  handle      text,                            -- identificador por @ (opcional)
  telefone    text,                            -- identificador por E.164 (opcional)
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, telefone)                -- 1 opt-out por telefone/produto
);
CREATE INDEX IF NOT EXISTS idx_lead_optout_product_handle
  ON public.platform_crm_lead_optout (product_id, handle)
  WHERE handle IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — super_admin only (padrão `_super_admin_only`) — 3 tabelas
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.platform_crm_lead_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_crm_extracted_leads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_crm_lead_optout      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_crm_lead_extractions_super_admin_only ON public.platform_crm_lead_extractions;
CREATE POLICY platform_crm_lead_extractions_super_admin_only ON public.platform_crm_lead_extractions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS platform_crm_extracted_leads_super_admin_only ON public.platform_crm_extracted_leads;
CREATE POLICY platform_crm_extracted_leads_super_admin_only ON public.platform_crm_extracted_leads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS platform_crm_lead_optout_super_admin_only ON public.platform_crm_lead_optout;
CREATE POLICY platform_crm_lead_optout_super_admin_only ON public.platform_crm_lead_optout
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ════════════════════════════════════════════════════════════════════════════
-- Trigger updated_at → update_updated_at_column() (só a tabela do job muda depois
-- de criada; staging e opt-out são append-only com created_at só).
-- ════════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS set_updated_at_platform_crm_lead_extractions ON public.platform_crm_lead_extractions;
CREATE TRIGGER set_updated_at_platform_crm_lead_extractions
  BEFORE UPDATE ON public.platform_crm_lead_extractions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- FIM — C9 F0 (Instagram-first, product-scoped, super_admin-only)
-- ============================================================================
