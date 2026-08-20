-- ─────────────────────────────────────────────────────────────────────────────
-- 20260820_platform_plans_quarterly.sql
-- Ciclo TRIMESTRAL em platform_plans + vitrine public_plans.
--
-- Cakto não tem enum quarterly: oferta = type=subscription, intervalType=month,
-- interval=3, recurrence_period=90. Slug interno fica em cakto_offer_slug_*.
-- public_plans NÃO expõe slugs Cakto (a view atual também não expõe o mensal).
-- Idempotente (re-runnable). DROP VIEW + GRANT — mesmo padrão de 20260714.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS price_quarterly numeric NOT NULL DEFAULT 0;

ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS checkout_url_quarterly text;

ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS cakto_offer_slug_quarterly text;

ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS cakto_offer_slug_yearly text;

COMMENT ON COLUMN public.platform_plans.price_quarterly IS
  'Preco cobrado no ciclo trimestral (Cakto: month/interval=3/recurrence_period=90). 0 = sem oferta trimestral.';
COMMENT ON COLUMN public.platform_plans.checkout_url_quarterly IS
  'URL publica de checkout do ciclo trimestral (https://pay.cakto.com.br/{offer.id}).';
COMMENT ON COLUMN public.platform_plans.cakto_offer_slug_quarterly IS
  'Id/slug da oferta Cakto trimestral vigente. Interno — nao vai em public_plans.';
COMMENT ON COLUMN public.platform_plans.cakto_offer_slug_yearly IS
  'Id/slug da oferta Cakto anual vigente. Interno — nao vai em public_plans.';

DROP VIEW IF EXISTS public.public_plans;

CREATE VIEW public.public_plans AS
SELECT
  id,
  name,
  slug,
  description,
  price_monthly,
  price_quarterly,
  price_yearly,
  list_price_monthly,
  trial_days,
  highlight_label,
  display_order,
  is_public,
  checkout_url,
  checkout_url_quarterly,
  checkout_url_yearly,
  feature_whatsapp,
  feature_instagram,
  feature_facebook,
  feature_scheduling,
  feature_kanban,
  feature_pipeline,
  feature_campaigns,
  feature_outreach,
  feature_capture_funnels,
  feature_forms,
  feature_internal_chat,
  feature_ai_agents,
  feature_voice_agents,
  feature_audio_transcription_ai,
  feature_text_correction_ai,
  feature_webhooks,
  feature_external_api,
  feature_integrations
FROM public.platform_plans
WHERE is_active = true;

COMMENT ON VIEW public.public_plans IS
  'Vitrine publica de planos (LP + sales-brain). Colunas de exibicao; WHERE is_active. price_quarterly + checkout_url_quarterly (2026-08-20). Sem slugs internos Cakto.';

GRANT SELECT ON public.public_plans TO anon;
GRANT SELECT ON public.public_plans TO authenticated;

COMMIT;
