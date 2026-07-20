-- ============================================================================
-- SEGURANÇA P2→CRÍTICO (2026-07-20) — enumeração anônima de mídia via storage `list`.
--
-- ACHADO (reproduzido em produção só com a anon key pública, que vai no bundle JS):
--   POST /storage/v1/object/list/chat-media  →  HTTP 200, lista as orgs → conversas
--   → arquivos reais de mídia de WhatsApp de cliente (imagem + áudio). PII.
-- Causa: políticas SELECT em storage.objects com role {public} e escopo só de
-- bucket_id (sem auth.uid()). {public} inclui anon → qualquer um LISTA e os UUIDs
-- (que seriam não-adivinháveis) aparecem de graça. A flag public=true do bucket
-- NÃO é o problema — o download público (/object/public/…) IGNORA RLS de qualquer
-- forma; a política SELECT aberta só habilitava o `list` (enumeração em massa).
--
-- FIX (proporcional, reversível, NÃO-quebra):
--   • O front NUNCA chama .list()/.download() nesses buckets (0 usos, verificado).
--   • Exibição usa getPublicUrl → endpoint /object/public/ → serve sem RLS.
--   • Edges leem via service_role → ignora RLS.
--   ⇒ Remover a política SELECT {public} mata a enumeração e não quebra nada.
--
--   • chat-media, platform-crm-media, catalog-media, cadence-media, funnel-assets,
--     materials → DROP total da política {public} (fecha anon E cross-tenant).
--   • form-media → tem createSignedUrl por usuário AUTENTICADO (painéis de form);
--     createSignedUrl exige SELECT sob RLS → troca {public} por {authenticated}
--     (mata anon, mantém o painel funcionando).
--
-- RESIDUAL DOCUMENTADO (fora do escopo deste fix, backlog):
--   • form-media {authenticated} ainda é bucket-wide → um tenant logado pode
--     createSignedUrl mídia de form de outro tenant (cross-tenant entre AUTENTICADOS,
--     não anon). Fechar exige org-scoping por path (padrão onboarding_uploads_select).
--   • public=true mantém download por path-conhecido; confidencialidade real de PII
--     (chat/crm) pede bucket privado + signed URL on-demand (refactor "guardar path,
--     não URL" — frente própria).
--   • product-documents / prospeccao-video: SELECT exige só auth.uid() IS NOT NULL
--     (não anon, mas cross-tenant entre autenticados) — mesmo backlog de org-scoping.
--
-- Aplicada ao vivo via MCP em 2026-07-20; versionada para sobreviver a reset.
-- Reversão: recriar as políticas {public} bucket-wide (ver git de pg_policies).
-- ============================================================================

-- PII de cliente / dados de tenant — sem uso legítimo de list/download/signed no client.
drop policy if exists "chat-media public read"          on storage.objects;
drop policy if exists "platform_crm_media_public_read"  on storage.objects;
drop policy if exists "catalog_media_public_read"       on storage.objects;
drop policy if exists "Anyone can view cadence media"   on storage.objects;
drop policy if exists "funnel_assets_public_read"       on storage.objects;
drop policy if exists "Public can view materials"       on storage.objects;
drop policy if exists "Authenticated users can view materials" on storage.objects;

-- form-media: createSignedUrl por usuário autenticado precisa de SELECT.
-- Troca {public} (inclui anon) por {authenticated} (exclui anon).
drop policy if exists "form-media public read" on storage.objects;
create policy "form-media authenticated read" on storage.objects
  for select to authenticated using (bucket_id = 'form-media');
