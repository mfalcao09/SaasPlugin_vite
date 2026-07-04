-- ─────────────────────────────────────────────────────────────────────────────
-- 20260704_public_plans_view.sql — vitrine pública de planos para a LP (apex)
--
-- PROBLEMA: a SalesPage (LP) lê platform_plans via useActivePlans, mas a tabela
-- não tem leitura anônima (RLS) → visitante deslogado recebe [] e a seção de
-- preços cai no fallback ("Fale com a gente"). Preço nunca aparece no apex.
--
-- SOLUÇÃO (decisão Marcelo 2026-07-04, roadmap F1.1): view `public_plans` com
-- SOMENTE as colunas de vitrine, dona = postgres (security definer semantics:
-- bypassa o RLS da tabela-mãe), SELECT liberado para anon/authenticated.
-- A tabela platform_plans continua fechada — nada de policy pública nela.
--
-- Colunas EXCLUÍDAS de propósito: quotas internas (max_*), extra_features,
-- timestamps, ids de integração — visitante não precisa e não deve ver.
-- checkout_url entra porque é o destino público do CTA "Assinar agora".
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.public_plans;

CREATE VIEW public.public_plans AS
SELECT
  id,
  name,
  slug,
  description,
  price_monthly,
  price_yearly,
  trial_days,
  highlight_label,
  display_order,
  is_public,
  checkout_url,
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
  'Vitrine pública de planos para a LP (SalesPage). Só colunas de exibição; WHERE is_active. Dona da view bypassa RLS de platform_plans (a tabela segue fechada). Criada no roadmap lancamento-oferta-v3 (2026-07-04).';

-- PostgREST expõe a view; leitura liberada para visitante anônimo e logado.
GRANT SELECT ON public.public_plans TO anon;
GRANT SELECT ON public.public_plans TO authenticated;
