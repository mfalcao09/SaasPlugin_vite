-- ============================================================================
-- 20260903_camila_model_sonnet5.sql — Camila → anthropic/claude-sonnet-5
--
-- UPDATE-by-id only: 68aeece9-26f2-4f7b-a595-a6ea5e8acfa7
-- Alinha Camila (prospector) ao mesmo modelo de Duda/Bia.
-- Precedência no brain: persona.model > env > DEFAULT_MODEL (Flash).
-- Idempotente. Sem WhatsApp. Sem tocar prompt/flags de canal.
-- ============================================================================

UPDATE public.platform_crm_product_agents
SET model = 'anthropic/claude-sonnet-5',
    updated_at = now()
WHERE id = '68aeece9-26f2-4f7b-a595-a6ea5e8acfa7'
  AND coalesce(model, '') IS DISTINCT FROM 'anthropic/claude-sonnet-5';
