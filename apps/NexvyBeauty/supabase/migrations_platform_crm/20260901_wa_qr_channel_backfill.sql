-- C-hard-1: backfill identidade canônica WhatsApp-via-QR.
-- Rollback (só se ainda houver dual-read no código):
--   UPDATE platform_crm_conversations
--   SET channel = 'whatsapp_evolution',
--       visitor_id = replace(visitor_id, 'wa_qr:', 'wa_evo:')
--   WHERE channel = 'whatsapp_qr' OR visitor_id LIKE 'wa_qr:%';

UPDATE public.platform_crm_conversations
SET
  channel = 'whatsapp_qr',
  visitor_id = CASE
    WHEN visitor_id LIKE 'wa_evo:%' THEN replace(visitor_id, 'wa_evo:', 'wa_qr:')
    ELSE visitor_id
  END,
  updated_at = now()
WHERE channel = 'whatsapp_evolution'
   OR visitor_id LIKE 'wa_evo:%';
