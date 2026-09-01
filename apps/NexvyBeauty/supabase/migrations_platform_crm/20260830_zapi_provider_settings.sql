-- Z-API motor (teste Camila): provider + credenciais em platform_settings.
-- Reversível: whatsapp_qr_provider='evolution' volta ao motor antigo.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS whatsapp_qr_provider text NOT NULL DEFAULT 'evolution',
  ADD COLUMN IF NOT EXISTS zapi_client_token text,
  ADD COLUMN IF NOT EXISTS zapi_base_url text DEFAULT 'https://api.z-api.io',
  ADD COLUMN IF NOT EXISTS zapi_bootstrap_instance_id text,
  ADD COLUMN IF NOT EXISTS zapi_bootstrap_instance_token text;

COMMENT ON COLUMN public.platform_settings.whatsapp_qr_provider IS
  'Motor WhatsApp-via-QR da plataforma: evolution | zapi';
COMMENT ON COLUMN public.platform_settings.zapi_client_token IS
  'Client-Token (segurança da conta Z-API). Nunca expor no front.';
COMMENT ON COLUMN public.platform_settings.zapi_bootstrap_instance_id IS
  'Instância Z-API pré-criada para teste (bind no create_instance_self).';
COMMENT ON COLUMN public.platform_settings.zapi_bootstrap_instance_token IS
  'Token da instância Z-API bootstrap. Nunca expor no front.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_settings_whatsapp_qr_provider_check'
  ) THEN
    ALTER TABLE public.platform_settings
      ADD CONSTRAINT platform_settings_whatsapp_qr_provider_check
      CHECK (whatsapp_qr_provider IN ('evolution', 'zapi'));
  END IF;
END $$;
