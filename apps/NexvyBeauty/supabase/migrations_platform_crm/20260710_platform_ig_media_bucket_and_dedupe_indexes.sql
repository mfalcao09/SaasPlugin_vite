-- ─────────────────────────────────────────────────────────────────────────────
-- 20260710_platform_ig_media_bucket_and_dedupe_indexes.sql — A1.3 (canal inbound)
--
-- (1) Bucket PRIVADO `instagram-media`: o platform-instagram-webhook baixa a
--     mídia do CDN da Meta (URLs expiram) e persiste aqui; a edge gera signed
--     URL 7d. Sem o bucket, degrade = URL do CDN (expira). Escrita = service
--     role (webhook); leitura autenticada = super_admin.
-- (2) Índices ÚNICOS parciais de idempotência inbound (espelho do
--     uq_platform_crm_messages_wamid): fecham a corrida de re-entrega de
--     webhook que o select-dedupe sozinho não fecha.
--
-- APLICADA em prod 2026-07-10 (apply_migration
-- platform_ig_media_bucket_and_dedupe_indexes) — este arquivo é o espelho.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('instagram-media', 'instagram-media', false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "instagram_media_super_admin_read" ON storage.objects;
CREATE POLICY "instagram_media_super_admin_read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'instagram-media'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_crm_messages_ig_mid
  ON public.platform_crm_messages ((metadata->>'ig_mid'))
  WHERE metadata->>'ig_mid' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_crm_messages_evolution_message_id
  ON public.platform_crm_messages ((metadata->>'evolution_message_id'))
  WHERE metadata->>'evolution_message_id' IS NOT NULL;
