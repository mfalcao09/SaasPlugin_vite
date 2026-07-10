-- ─────────────────────────────────────────────────────────────────────────────
-- 20260709_platform_crm_media_bucket.sql — A1.2 (mídia no inbox da plataforma)
--
-- Bucket `platform-crm-media`: anexos enviados/recebidos pelo CRM de
-- PLATAFORMA (super_admin) via WhatsApp Cloud API (platform-webchat-inbox
-- action `send` com payload `media:{bucket,path,...}`).
--
-- PÚBLICO por decisão de padrão: o bucket análogo do tenant (`chat-media`) é
-- público e a URL pública é o que fica persistida em metadata.media.url das
-- mensagens (estável — signed URL expiraria e quebraria a renderização do
-- histórico). O fetch da Meta usa signed URL de 15min gerada pela edge (que
-- também valida a existência do objeto), então este bucket funcionaria até
-- privado; público mantém a UI simples e o padrão da casa.
--
-- Escrita: SÓ super_admin (has_role — mesmo gate das tabelas platform_crm_*).
-- Paths sugeridos pela UI: whatsapp-outbound/<conversation_id>/<uuid>-<nome>.
-- Idempotente (ON CONFLICT / DROP POLICY IF EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('platform-crm-media', 'platform-crm-media', true, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública (bucket público — necessário pra URL estável persistida e
-- pro download da Meta caso a URL pública seja usada como link).
DROP POLICY IF EXISTS "platform_crm_media_public_read" ON storage.objects;
CREATE POLICY "platform_crm_media_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'platform-crm-media');

-- Escrita/gestão: exclusivo super_admin (mesma fonte de verdade do RLS das
-- tabelas platform_crm_* — public.has_role sobre user_roles).
DROP POLICY IF EXISTS "platform_crm_media_super_admin_insert" ON storage.objects;
CREATE POLICY "platform_crm_media_super_admin_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'platform-crm-media'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "platform_crm_media_super_admin_update" ON storage.objects;
CREATE POLICY "platform_crm_media_super_admin_update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'platform-crm-media'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "platform_crm_media_super_admin_delete" ON storage.objects;
CREATE POLICY "platform_crm_media_super_admin_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'platform-crm-media'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );
