-- ============================================================================
-- SEGURANÇA P2 (2026-07-20) — residual cross-tenant entre AUTENTICADOS no storage.
-- Fecha o backlog que a 20260720g deixou documentado (linhas 25-33 daquele arquivo).
--
-- ACHADO: as políticas de form-media / product-documents / prospeccao-video são
-- bucket-wide. Um tenant logado do salão A consegue `list` e `createSignedUrl` de
-- arquivos do salão B. As de UPDATE/DELETE têm o MESMO escopo — ou seja, o furo
-- destrutivo é idêntico ao de leitura (apagar mídia de outro tenant).
--
-- VERIFICAÇÃO DE PATH (pré-requisito — feita antes de escolher a forma da policy):
--   form-media          tenant     `<organization_id>/<form_id>/<uuid>.<ext>`
--                       plataforma `platform/<form_id>/<uuid>.<ext>`
--     ⇒ org_id ESTÁ em foldername[1] no caminho do tenant. Org-scoping se aplica.
--   product-documents   5 formatos convivendo, org_id NUNCA em [1]:
--                       `platform/knowledge/<product_id>/…`
--                       `platform/training/<product_id>/agents/<agent_id>/…`
--                       `training/<organization_id>/agents/<agent_id>/…`   (org em [2])
--                       `<product_id>/<uuid>.<ext>`                        (sem org)
--                       `products/<product_id>/{logo,banner,image}/…`      (sem org)
--     ⇒ org-scoping por [1] é IMPOSSÍVEL sem reescrever 6 call-sites de upload.
--   prospeccao-video    `<product_id>/<ts>-<rand>.<ext>`                   (sem org)
--     ⇒ idem. E a superfície é 100% super_admin (src/components/superadmin/crm/prospeccao/).
--
-- DECISÃO (opção "b" — documentar por que o org-scoping por [1] não se aplica):
--   Em vez de forçar um prefixo que o path não tem (a policy não daria erro, apenas
--   retornaria falso e o tenant perderia acesso ao PRÓPRIO arquivo), o escopo vira o
--   mínimo que cobre 100% dos usos legítimos verificados no código:
--     • form-media          → org do usuário (por path) OU super_admin.
--     • product-documents   → super_admin apenas.
--     • prospeccao-video    → super_admin apenas.
--
-- POR QUE NÃO QUEBRA (verificado call-site a call-site, não por inferência):
--   • form-media: os únicos reads do client são createSignedUrl nos dois painéis de
--     design (FormDesignPanel.tsx:68 tenant, PlatformCrmFormDesignPanel.tsx:78
--     plataforma), sempre logo após o upload do próprio arquivo → cobertos pelo
--     org-scope e pelo ramo super_admin respectivamente. UPDATE é exigido pelo
--     `upsert: true` desses mesmos uploads → mantido no mesmo escopo.
--   • product-documents e prospeccao-video: o client só faz `upload` + `getPublicUrl`.
--     ZERO `.list()`, `.download()`, `.createSignedUrl()` e ZERO `.remove()` nesses
--     buckets em todo o src/. getPublicUrl não passa por RLS (monta string).
--   • Todas as edges que leem esses buckets usam SUPABASE_SERVICE_ROLE_KEY
--     (platform-process-training-material, process-training-material,
--     platform-process-knowledge-source, leads-import-video) → RLS não se aplica.
--   • INSERT fica como está: qualquer autenticado continua subindo (fluxo do produto).
--   • Buckets estavam VAZIOS (0 objetos nos três) na aplicação → sem backfill.
--
-- RESIDUAL QUE ESTE FIX **NÃO** FECHA (decisão de produto, não de policy):
--   product-documents tem public=true. O endpoint /object/public/ serve SEM RLS, logo
--   quem tiver a URL lê o arquivo — inclusive anônimo. Esta migration mata a
--   ENUMERAÇÃO (que é como se descobrem as URLs), não a leitura por URL conhecida.
--   Fechar de verdade exige: bucket privado + trocar getPublicUrl por signed URL
--   on-demand + normalizar os 5 formatos de path (as linhas do DB guardam a URL
--   pública, não o path) — frente própria, mesma do refactor citado na 20260720g.
--   ⚠️ Se um dia o bucket virar privado, o fallback createSignedUrl de
--   src/components/ui/image-upload.tsx:87 passa a rodar e vai precisar de SELECT de
--   tenant aqui — reavaliar esta policy junto com aquela mudança.
--
-- Aplicada ao vivo em 2026-07-20; versionada para sobreviver a reset de schema.
-- Reversão: recriar as políticas bucket-wide (definições originais nos comentários).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- form-media (privado) — org-scoped por prefixo de path, padrão onboarding_uploads.
-- Antes: SELECT to authenticated using (bucket_id = 'form-media')
--        UPDATE/DELETE to public using (bucket_id = 'form-media' AND auth.uid() IS NOT NULL)
-- ---------------------------------------------------------------------------
drop policy if exists "form-media authenticated read"   on storage.objects;
drop policy if exists "form-media authenticated update" on storage.objects;
drop policy if exists "form-media authenticated delete" on storage.objects;

create policy "form_media_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'form-media'
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR (storage.foldername(name))[1] = (
        SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
      )
    )
  );

create policy "form_media_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'form-media'
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR (storage.foldername(name))[1] = (
        SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
      )
    )
  );

create policy "form_media_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'form-media'
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR (storage.foldername(name))[1] = (
        SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- product-documents — path não carrega org; nenhum read/remove de client.
-- Antes: SELECT/DELETE to public using (bucket_id = '…' AND auth.uid() IS NOT NULL)
-- ---------------------------------------------------------------------------
drop policy if exists "Users can view their org product documents"   on storage.objects;
drop policy if exists "Users can delete their org product documents" on storage.objects;

create policy "product_documents_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-documents' AND has_role(auth.uid(), 'super_admin'::app_role));

create policy "product_documents_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-documents' AND has_role(auth.uid(), 'super_admin'::app_role));

-- ---------------------------------------------------------------------------
-- prospeccao-video (privado) — feature exclusivamente super_admin; client só sobe.
-- Antes: SELECT/DELETE to public using (bucket_id = '…' AND auth.uid() IS NOT NULL)
-- ---------------------------------------------------------------------------
drop policy if exists "Auth can read prospeccao videos"   on storage.objects;
drop policy if exists "Auth can delete prospeccao videos" on storage.objects;

create policy "prospeccao_video_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'prospeccao-video' AND has_role(auth.uid(), 'super_admin'::app_role));

create policy "prospeccao_video_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'prospeccao-video' AND has_role(auth.uid(), 'super_admin'::app_role));
