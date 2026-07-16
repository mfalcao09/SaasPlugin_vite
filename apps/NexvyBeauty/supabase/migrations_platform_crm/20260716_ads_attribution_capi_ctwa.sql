-- ============================================================================
-- NEXVYADS — ATRIBUIÇÃO CTWA + CAPI outbox + evento de funil `demo_completed`
-- camada PLATAFORMA (super_admin), PRODUCT-SCOPED — Caminho B (G1/G4 do blueprint
-- ADS-INBOUND-INSTAGRAM-ESTRATEGIA-2026-07-15.md)
-- ----------------------------------------------------------------------------
-- Fecha o loop de sinal do CTWA: liga o `ctwa_clid` da 1ª mensagem (anúncio
-- Click-to-WhatsApp) → lead/conversa → ids da Meta (raw), e cria a fila de saída
-- (outbox) da Conversions API para devolver conversões ao Meta com dedup.
--
-- Padrões da casa (idênticos às ~22 tabelas platform_crm_* e às 8 ads_*):
--   • product-scoped puro, SEM org_id. Escopo = product_id → platform_crm_products.
--   • RLS única `<tabela>_super_admin_only` com has_role(auth.uid(),'super_admin'::app_role).
--   • updated_at por trigger BEFORE UPDATE → update_updated_at_column().
--   • status/level em text + CHECK (sem enums novos além do valor de jornada abaixo).
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY/TRIGGER IF EXISTS,
--   ADD VALUE IF NOT EXISTS. Segurança: nenhuma coluna recebe input concatenado.
--
-- Verificado no LIVE (2026-07-16) antes de escrever:
--   • enum platform_crm_journey_event_type JÁ tem meta_ctwa_received / campaign_identified
--     / lead_qualified / checkout_created / sale_completed — FALTA só `demo_completed`.
--   • as 8 tabelas ads_* JÁ existem no live. platform_crm_leads NÃO tem source_ref
--     (atribuição rica vive em lead.metadata.referral + aqui).
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 0) Evento de funil que faltava: `demo_completed` (evento #4 — raio-x entregue).
--    Os outros 5 do funil já existem no enum. NÃO é usado nesta migration
--    (produtor = esteira/brain, em seus próprios PRs) → seguro no mesmo tx.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TYPE public.platform_crm_journey_event_type ADD VALUE IF NOT EXISTS 'demo_completed';

-- ════════════════════════════════════════════════════════════════════════════
-- 1) ads_attribution  (spine CTWA: ctwa_clid → lead/conversa → ad ids da Meta)
--    O `source_id`/`ctwa_clid` chegam como TEXTO (id da Meta) na 1ª mensagem; a
--    coluna ad_ref (FK opcional) só é resolvida depois pelo ads-sync (Fase C)
--    fazendo join ads_ads.external_id = source_id — no momento da captura o
--    ads_ads pode nem existir, então NÃO se exige FK aqui.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ads_attribution (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  lead_id         uuid REFERENCES public.platform_crm_leads(id)         ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.platform_crm_conversations(id) ON DELETE SET NULL,
  connection_id   uuid REFERENCES public.ads_platform_connections(id)   ON DELETE SET NULL,
  ctwa_clid       text,               -- click id da Meta (chave de atribuição p/ CAPI)
  source_id       text,               -- referral.source_id (o ad_id da Meta, como texto)
  source_type     text,               -- referral.source_type: 'ad' | 'post'
  source_url      text,               -- referral.source_url (URL do anúncio)
  headline        text,               -- referral.headline (o gancho — a Duda espelha)
  body            text,               -- referral.body
  media_type      text,               -- referral.media_type: image | video
  ctwa_channel    text NOT NULL DEFAULT 'whatsapp'
    CHECK (ctwa_channel IN ('whatsapp','instagram')),
  ad_ref          uuid REFERENCES public.ads_ads(id) ON DELETE SET NULL,  -- resolvido depois (ads-sync)
  raw             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- objeto referral inteiro
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Dedup: mesma conversa + mesmo click não duplica (re-entrega de webhook).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ads_attribution_conv_clid
  ON public.ads_attribution (conversation_id, ctwa_clid)
  WHERE conversation_id IS NOT NULL AND ctwa_clid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ads_attribution_product
  ON public.ads_attribution (product_id);
CREATE INDEX IF NOT EXISTS idx_ads_attribution_lead
  ON public.ads_attribution (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ads_attribution_conversation
  ON public.ads_attribution (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ads_attribution_source
  ON public.ads_attribution (source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ads_attribution_clid
  ON public.ads_attribution (ctwa_clid) WHERE ctwa_clid IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) ads_capi_events  (outbox + dedup da Conversions API — G4)
--    Cada conversão do funil (Lead/Qualified/Schedule/InitiateCheckout/Purchase)
--    vira uma linha aqui. O edge platform-capi-send consome status='pending' e
--    devolve ao Meta com event_id (dedup com o Pixel). Token só server-side.
--    action_source='business_messaging' é o canal CTWA/WhatsApp da CAPI.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ads_capi_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL
    REFERENCES public.platform_crm_products(id) ON DELETE CASCADE,
  lead_id          uuid REFERENCES public.platform_crm_leads(id)          ON DELETE SET NULL,
  conversation_id  uuid REFERENCES public.platform_crm_conversations(id)  ON DELETE SET NULL,
  attribution_id   uuid REFERENCES public.ads_attribution(id)            ON DELETE SET NULL,
  journey_event_id uuid REFERENCES public.platform_crm_journey_events(id) ON DELETE SET NULL,
  event_name       text NOT NULL
    CHECK (event_name IN ('Lead','Qualified','Schedule','InitiateCheckout','Purchase')),
  event_id         text NOT NULL,      -- chave de dedup enviada ao Meta (idempotência)
  ctwa_clid        text,               -- atribuição (denormalizado p/ envio)
  action_source    text NOT NULL DEFAULT 'business_messaging'
    CHECK (action_source IN ('business_messaging')),
  value            numeric(18,2),      -- só em Purchase (define ROAS)
  currency         text,
  event_time       timestamptz NOT NULL DEFAULT now(),
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','skipped','failed','dry_run')),
  attempts         integer NOT NULL DEFAULT 0,
  request          jsonb,              -- payload montado (auditoria)
  response         jsonb,              -- resposta da Graph/CAPI
  error            text,
  sent_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
-- Dedup duro por event_id (mesma conversão nunca é enviada 2x ao Meta).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ads_capi_events_event_id
  ON public.ads_capi_events (event_id);
CREATE INDEX IF NOT EXISTS idx_ads_capi_events_product_status
  ON public.ads_capi_events (product_id, status);
CREATE INDEX IF NOT EXISTS idx_ads_capi_events_pending
  ON public.ads_capi_events (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ads_capi_events_clid
  ON public.ads_capi_events (ctwa_clid) WHERE ctwa_clid IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS: super_admin only (padrão `_super_admin_only`)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.ads_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_capi_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ads_attribution_super_admin_only ON public.ads_attribution;
CREATE POLICY ads_attribution_super_admin_only ON public.ads_attribution
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS ads_capi_events_super_admin_only ON public.ads_capi_events;
CREATE POLICY ads_capi_events_super_admin_only ON public.ads_capi_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ════════════════════════════════════════════════════════════════════════════
-- Triggers updated_at → update_updated_at_column()
-- ════════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS set_updated_at_ads_attribution ON public.ads_attribution;
CREATE TRIGGER set_updated_at_ads_attribution
  BEFORE UPDATE ON public.ads_attribution
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_ads_capi_events ON public.ads_capi_events;
CREATE TRIGGER set_updated_at_ads_capi_events
  BEFORE UPDATE ON public.ads_capi_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- FIM — atribuição CTWA + CAPI outbox + demo_completed.
-- Produtores dos eventos de funil (fora desta migration, cada um no seu PR):
--   #2 conversa/CTWA  → platform-meta-whatsapp-webhook (G1, este build)
--   #3 lead_qualified → platform-sales-brain (G3, este build)
--   #4 demo_completed → esteira demo-* (PRs #70-74, quando mergear)
--   #5 checkout_created / #6 sale_completed → camada de checkout/Cakto (bridge próprio)
-- O edge platform-capi-send consome ads_capi_events(status='pending').
-- ============================================================================
