-- Lock motor WhatsApp-via-QR da plataforma em Z-API (Option A+B sanitização).
-- Reversível: UPDATE whatsapp_qr_provider = 'evolution' (não recomendado).

UPDATE public.platform_settings
SET whatsapp_qr_provider = 'zapi'
WHERE whatsapp_qr_provider IS DISTINCT FROM 'zapi';

ALTER TABLE public.platform_settings
  ALTER COLUMN whatsapp_qr_provider SET DEFAULT 'zapi';

COMMENT ON COLUMN public.platform_settings.whatsapp_qr_provider IS
  'Motor WhatsApp-via-QR da plataforma: zapi (canônico desde 2026-09-01). evolution = legado desativado nos edges platform.';
