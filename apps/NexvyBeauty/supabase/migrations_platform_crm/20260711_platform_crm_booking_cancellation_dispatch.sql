-- 20260711_platform_crm_booking_cancellation_dispatch.sql
-- Suporte ao caminho ADITIVO de CANCELAMENTO do platform-booking-dispatcher.
--
-- Contexto: o dispatcher passou a aceitar action='cancellation', que entrega o
-- aviso de cancelamento ao convidado (WhatsApp Cloud API) de forma IDEMPOTENTE
-- por wamid. A confirmação já usa `whatsapp_message_id` como guarda de
-- idempotência; o cancelamento precisa de sua PRÓPRIA coluna para não colidir
-- com o wamid da confirmação (as duas mensagens coexistem no mesmo booking).
--
-- Duas mudanças, ambas aditivas e não-destrutivas:
--   1) nova coluna platform_crm_booking_requests.cancellation_message_id
--   2) novo valor 'cancellation_sent' no CHECK de platform_crm_booking_logs.type
--
-- Product-scoped, ZERO organization_id. Idempotente (IF NOT EXISTS / DROP+ADD).

-- 1) Guarda de idempotência do aviso de cancelamento ao convidado.
ALTER TABLE public.platform_crm_booking_requests
  ADD COLUMN IF NOT EXISTS cancellation_message_id text;

COMMENT ON COLUMN public.platform_crm_booking_requests.cancellation_message_id IS
  'wamid da mensagem de cancelamento entregue ao convidado (WhatsApp Cloud API). '
  'Guarda de idempotencia do caminho action=cancellation no platform-booking-dispatcher; '
  'independente de whatsapp_message_id (que guarda a confirmacao).';

-- 2) Amplia o CHECK de tipos de log para registrar o envio de cancelamento.
--    O constraint foi criado inline (nome canonico gerado pelo Postgres).
ALTER TABLE public.platform_crm_booking_logs
  DROP CONSTRAINT IF EXISTS platform_crm_booking_logs_type_check;

ALTER TABLE public.platform_crm_booking_logs
  ADD CONSTRAINT platform_crm_booking_logs_type_check CHECK (type IN (
    'confirmation_sent','reminder_sent','recovery_sent','reply_received',
    'notification_sent','send_failed','status_changed',
    'cancellation_sent'
  ));
