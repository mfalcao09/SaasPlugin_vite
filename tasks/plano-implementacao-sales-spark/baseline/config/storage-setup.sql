-- ============================================================
-- storage-setup.sql
-- Buckets + RLS policies de storage.objects
-- Reproduz 1:1 a configuração do projeto fonte.
-- Rodar APÓS o schema base estar criado (funções has_role / is_super_admin existem).
-- ============================================================

-- ---------- BUCKETS ----------
-- name | public | file_size_limit | allowed_mime_types
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('avatars',           'avatars',           true,  NULL,      NULL),
  ('cadence-media',     'cadence-media',     true,  NULL,      NULL),
  ('catalog-media',     'catalog-media',     true,  NULL,      NULL),
  ('chat-media',        'chat-media',        true,  NULL,      NULL),
  ('company-logos',     'company-logos',     true,  NULL,      NULL),
  ('form-media',        'form-media',        false, NULL,      NULL),
  ('funnel-assets',     'funnel-assets',     true,  NULL,      NULL),
  ('help-media',        'help-media',        true,  NULL,      NULL),
  ('materials',         'materials',         true,  NULL,      NULL),
  ('platform-assets',   'platform-assets',   true,  NULL,      NULL),
  ('product-documents', 'product-documents', true,  52428800,  NULL),
  ('squad-icons',       'squad-icons',       true,  1048576,   NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------- POLICIES (storage.objects) ----------
-- avatars (público leitura, dono escreve)
CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload own avatar" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can update own avatar" ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete own avatar" ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- cadence-media (público leitura, autenticado escreve)
CREATE POLICY "Anyone can view cadence media" ON storage.objects FOR SELECT
  USING (bucket_id = 'cadence-media');
CREATE POLICY "Authenticated users can upload cadence media" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'cadence-media');
CREATE POLICY "Authenticated users can delete cadence media" ON storage.objects FOR DELETE
  USING (bucket_id = 'cadence-media');

-- catalog-media
CREATE POLICY "catalog_media_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'catalog-media');
CREATE POLICY "catalog_media_auth_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'catalog-media' AND auth.uid() IS NOT NULL);
CREATE POLICY "catalog_media_auth_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'catalog-media' AND auth.uid() IS NOT NULL);
CREATE POLICY "catalog_media_auth_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'catalog-media' AND auth.uid() IS NOT NULL);

-- chat-media
CREATE POLICY "chat-media public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-media');
CREATE POLICY "chat-media authenticated upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'chat-media');
CREATE POLICY "chat-media authenticated update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'chat-media');
CREATE POLICY "chat-media authenticated delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'chat-media');

-- company-logos (público leitura; org admin gerencia pasta org_id)
CREATE POLICY "Anyone can view company logos" ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');
CREATE POLICY "Org admins can upload company logos" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company-logos'
    AND has_role(auth.uid(), 'admin'::app_role)
    AND (storage.foldername(name))[1] = (SELECT organization_id::text FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "Org admins can update company logos" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'company-logos'
    AND has_role(auth.uid(), 'admin'::app_role)
    AND (storage.foldername(name))[1] = (SELECT organization_id::text FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "Org admins can delete company logos" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'company-logos'
    AND has_role(auth.uid(), 'admin'::app_role)
    AND (storage.foldername(name))[1] = (SELECT organization_id::text FROM profiles WHERE id = auth.uid())
  );

-- form-media (privado, autenticado gerencia)
CREATE POLICY "form-media public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'form-media');
CREATE POLICY "form-media authenticated upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'form-media');
CREATE POLICY "form-media authenticated update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'form-media');
CREATE POLICY "form-media authenticated delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'form-media');

-- funnel-assets
CREATE POLICY "funnel_assets_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'funnel-assets');
CREATE POLICY "funnel_assets_auth_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'funnel-assets');
CREATE POLICY "funnel_assets_auth_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'funnel-assets');
CREATE POLICY "funnel_assets_auth_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'funnel-assets');

-- help-media (público leitura, super admin escreve)
CREATE POLICY "Help media is publicly accessible" ON storage.objects FOR SELECT
  USING (bucket_id = 'help-media');
CREATE POLICY "Super admin uploads help media" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'help-media' AND is_super_admin(auth.uid()));
CREATE POLICY "Super admin updates help media" ON storage.objects FOR UPDATE
  USING (bucket_id = 'help-media' AND is_super_admin(auth.uid()));
CREATE POLICY "Super admin deletes help media" ON storage.objects FOR DELETE
  USING (bucket_id = 'help-media' AND is_super_admin(auth.uid()));

-- materials (público leitura, autenticado gerencia)
CREATE POLICY "Public can view materials" ON storage.objects FOR SELECT
  USING (bucket_id = 'materials');
CREATE POLICY "Authenticated users can view materials" ON storage.objects FOR SELECT
  USING (bucket_id = 'materials');
CREATE POLICY "Authenticated users can upload materials" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'materials');
CREATE POLICY "Authenticated users can delete materials" ON storage.objects FOR DELETE
  USING (bucket_id = 'materials');

-- platform-assets (público leitura, super admin total)
CREATE POLICY "Anyone can view platform assets" ON storage.objects FOR SELECT
  USING (bucket_id = 'platform-assets');
CREATE POLICY "Super admins can manage platform assets" ON storage.objects FOR ALL
  USING (bucket_id = 'platform-assets' AND is_super_admin(auth.uid()))
  WITH CHECK (bucket_id = 'platform-assets' AND is_super_admin(auth.uid()));

-- product-documents (público + autenticado gerencia, limit 50MB)
CREATE POLICY "Users can view their org product documents" ON storage.objects FOR SELECT
  USING (bucket_id = 'product-documents' AND auth.uid() IS NOT NULL);
CREATE POLICY "Users can upload product documents" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-documents' AND auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete their org product documents" ON storage.objects FOR DELETE
  USING (bucket_id = 'product-documents' AND auth.uid() IS NOT NULL);

-- squad-icons (público leitura, admin/manager escreve, limit 1MB)
CREATE POLICY "Squad icons are publicly accessible" ON storage.objects FOR SELECT
  USING (bucket_id = 'squad-icons');
CREATE POLICY "Admins and managers can upload squad icons" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'squad-icons' AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role)));
CREATE POLICY "Admins and managers can update squad icons" ON storage.objects FOR UPDATE
  USING (bucket_id = 'squad-icons' AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role)));
CREATE POLICY "Admins and managers can delete squad icons" ON storage.objects FOR DELETE
  USING (bucket_id = 'squad-icons' AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role)));
