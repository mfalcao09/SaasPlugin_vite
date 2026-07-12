-- ─────────────────────────────────────────────────────────────────────────────
-- 20260711_product_documents_bucket.sql — B11/file-upload (Cérebro do Produto)
--
-- Bucket `product-documents`: arquivos (PDF/DOC/DOCX/TXT) enviados no Cérebro do
-- Produto (BrainTab, aba "Arquivos") e nos materiais de treino do agente
-- (AgentTrainingSection). A edge `platform-process-knowledge-source` (ramo 'file')
-- baixa o objeto via SERVICE_ROLE, extrai o texto e persiste em
-- platform_crm_product_knowledge_sources (source_type='file').
--
-- SEGURANÇA (rede de proteção): este bucket JÁ é referenciado por features
-- shipadas (AgentTrainingSection · org-scoped useUploadKnowledgeDocument), logo
-- deve existir no projeto vivo. Esta migration é IDEMPOTENTE
-- (ON CONFLICT DO NOTHING / DROP POLICY IF EXISTS) — não quebra se o bucket já
-- existir; só garante o objeto + políticas caso um ambiente novo não o tenha.
--
-- PÚBLICO por padrão da casa (mesmo do `platform-crm-media`): a URL pública é o
-- que fica persistida em file_url — estável, não expira. O download da edge usa
-- filePath via SERVICE_ROLE (funciona até com bucket privado).
--
-- Escrita/gestão: SÓ super_admin (public.has_role sobre user_roles — mesma fonte
-- de verdade do RLS das tabelas platform_crm_*).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-documents', 'product-documents', true, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública (bucket público — URL estável persistida em file_url).
DROP POLICY IF EXISTS "product_documents_public_read" ON storage.objects;
CREATE POLICY "product_documents_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'product-documents');

-- Escrita/gestão: exclusivo super_admin (mesma fonte de verdade do RLS das
-- tabelas platform_crm_* — public.has_role sobre user_roles).
DROP POLICY IF EXISTS "product_documents_super_admin_insert" ON storage.objects;
CREATE POLICY "product_documents_super_admin_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-documents'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "product_documents_super_admin_update" ON storage.objects;
CREATE POLICY "product_documents_super_admin_update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'product-documents'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "product_documents_super_admin_delete" ON storage.objects;
CREATE POLICY "product_documents_super_admin_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'product-documents'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );
