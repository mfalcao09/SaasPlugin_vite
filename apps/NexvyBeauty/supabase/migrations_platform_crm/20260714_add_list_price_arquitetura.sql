-- ─────────────────────────────────────────────────────────────────────────────
-- 20260714_add_list_price_arquitetura.sql
-- Arquitetura de PREÇO à prova de drift (§3-A do PACOTE-SUNSET-LANCAMENTO).
--
-- PROPOSTA — nada aplicado no banco por este PR. Aplicar SÓ após revisão do
-- Marcelo, ANTES da migration de dados (20260714_sunset_piloto_e_novo_playbook)
-- e ANTES do deploy das edges (o brain passa a ler list_price_monthly da view).
--
-- O QUE FAZ:
--   A1. Adiciona platform_plans.list_price_monthly (preço de TABELA / futuro).
--   A2. Semeia 383/599/849 (tabela) — NÃO toca price_monthly (lançamento vigente).
--   A3. RECRIA a view public_plans expondo list_price_monthly. CRÍTICO: a view
--       tem LISTA DE COLUNAS EXPLÍCITA e NÃO herda colunas novas da tabela-mãe;
--       sem este passo o brain lê list_price_monthly como undefined e o de-para
--       "de R$X por R$Y" some SILENCIOSAMENTE (sem erro).
--   A4. (opcional) platform_settings.launch_price_ends_at — data-limite do preço
--       de lançamento (NULL = urgência honesta sem deadline falso).
--
-- NOTA DE ENGENHARIA (por que DROP+CREATE e não CREATE OR REPLACE):
--   public_plans é uma view de LISTA DE COLUNAS. O Postgres só permite APPEND de
--   coluna no FINAL num CREATE OR REPLACE VIEW — inserir list_price_monthly no
--   meio da lista (ao lado de price_monthly, onde é legível) exige recriar a view.
--   Por isso usamos o MESMO padrão da migration original (20260704): DROP VIEW +
--   CREATE VIEW. Como DROP descarta os GRANTs, o REGRANT abaixo é OBRIGATÓRIO
--   (é o passo que o pacote marcou como CRÍTICO). Nenhum objeto do banco depende
--   de public_plans (verificado 2026-07-14), então o DROP é seguro sem CASCADE.
-- Idempotente (re-runnable).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- A1. Preço de TABELA (futuro) por plano. NULL = sem âncora (Trial/Teste E2E).
--     price_monthly (preço de LANÇAMENTO vigente) NÃO é tocado aqui.
ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS list_price_monthly numeric NULL;

COMMENT ON COLUMN public.platform_plans.list_price_monthly IS
  'Preco de TABELA (futuro). Quando > price_monthly, o brain injeta o de-para "de R$X por R$Y (preco de lancamento)". NULL = sem ancora. price_monthly = preco vigente (lancamento).';

-- A2. Semear âncoras de tabela (383/599/849). Lançamento (275/427/693) intocado.
UPDATE public.platform_plans SET list_price_monthly = 383 WHERE slug = 'starter'; -- Essencial
UPDATE public.platform_plans SET list_price_monthly = 599 WHERE slug = 'pro';     -- Premium
UPDATE public.platform_plans SET list_price_monthly = 849 WHERE slug = 'premium'; -- Ultra

-- A3. CRÍTICO — recriar public_plans expondo list_price_monthly (a view NÃO herda
--     colunas novas). Mesma lista de colunas de 20260704_public_plans_view.sql,
--     acrescida de list_price_monthly (ao lado de price_monthly/price_yearly).
DROP VIEW IF EXISTS public.public_plans;

CREATE VIEW public.public_plans AS
SELECT
  id,
  name,
  slug,
  description,
  price_monthly,
  price_yearly,
  list_price_monthly,                                 -- << NOVA (preço de tabela)
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
  'Vitrine pública de planos para a LP + fonte-única de preço do sales-brain. Só colunas de exibição; WHERE is_active. list_price_monthly (preço de tabela) adicionada no sunset lancamento (2026-07-14). Dona da view bypassa RLS de platform_plans.';

-- CRÍTICO: o DROP descarta os GRANTs — reaplicar leitura anônima/logada, senão a
-- LP e o brain (fetch anônimo) recebem [] e o preço some do apex.
GRANT SELECT ON public.public_plans TO anon;
GRANT SELECT ON public.public_plans TO authenticated;

-- A4. (OPCIONAL) data-limite global do preço de lançamento — configurável.
--     NULL = urgência honesta sem deadline falso ("sobe em breve"). Quando o
--     Marcelo fixar a data, o brain pode injetar "vale até DD/MM". Nunca inventar.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS launch_price_ends_at timestamptz NULL;

COMMENT ON COLUMN public.platform_settings.launch_price_ends_at IS
  'Data-limite do preco de lancamento (singleton). NULL = sem deadline (urgencia honesta "sobe em breve"). Definir so quando houver data real.';

COMMIT;

-- ── VERIFICAÇÃO (rodar após aplicar; check binário) ──────────────────────────
-- SELECT slug, price_monthly, list_price_monthly FROM public.public_plans
--   WHERE slug IN ('starter','pro','premium') ORDER BY price_monthly;
-- espera: starter 275/383 · pro 427/599 · premium 693/849
