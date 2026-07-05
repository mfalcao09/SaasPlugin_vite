-- ─────────────────────────────────────────────────────────────────────────────
-- 20260705_meta_whatsapp_wamid_idempotency.sql — F1 (autopilot de venda)
--
-- O Meta re-entrega webhooks em qualquer resposta não-200 (e às vezes duplica
-- mesmo com 200). platform_crm_messages não tem coluna de id externo — o wamid
-- da Cloud API vai em metadata->>'wamid'. Índice único parcial = garantia de
-- idempotência no banco (o receptor também checa, mas a corrida entre duas
-- entregas simultâneas só é fechada aqui).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_crm_messages_wamid
  ON public.platform_crm_messages ((metadata->>'wamid'))
  WHERE metadata->>'wamid' IS NOT NULL;

COMMENT ON INDEX public.uq_platform_crm_messages_wamid IS
  'Idempotência de webhooks WhatsApp Cloud API (re-entregas do Meta). Consumido por platform-meta-whatsapp-webhook.';
