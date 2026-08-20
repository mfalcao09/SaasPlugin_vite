-- Fonte declarada do app secret nas conexões Cloud API de plataforma.
-- 'platform' = secret do app Nexvy em env; nunca inferir de NULL.

ALTER TABLE public.platform_crm_whatsapp_meta_connections
  ADD COLUMN IF NOT EXISTS app_secret_source text;

COMMENT ON COLUMN public.platform_crm_whatsapp_meta_connections.app_secret_source IS
  'platform = secret no env do app Nexvy; connection/NULL = secret cifrado na linha (ausência NEGA). Nunca inferir de NULL.';
