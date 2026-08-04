-- ============================================================================
-- form-media (2026-07-30) — ativo de marca é PÚBLICO por natureza.
-- Encerra o resíduo aberto pela 20260720h e mata a signed URL de 10 anos.
--
-- ACHADO 1 (o que motivou): FormDesignPanel.tsx:68 e PlatformCrmFormDesignPanel.tsx:78
--   assinavam a URL do logo com TTL de 10 anos e PERSISTIAM a assinatura em
--   theme.logo_url. Assinatura salva no banco é credencial bearer de longa duração:
--   quem lê a string tem acesso pelo prazo inteiro, sem revogação individual (só
--   deletando o objeto ou rodando rotate do JWT do projeto, que invalida TODAS as
--   assinaturas de todos os buckets).
--
-- ACHADO 2 (por que a resposta NÃO é signed URL com TTL curto):
--   O consumidor do logo é a página PÚBLICA do formulário (/f/:slug), servida a
--   visitante anônimo sem login. Bucket privado + assinatura entregue a todo visitante
--   é bucket privado de fachada: paga-se a complexidade e não se compra
--   confidencialidade. O ativo é a placa da loja, não documento de cliente.
--
-- ACHADO 3 (evidência de que o código JÁ esperava bucket público):
--   Três call-sites gravam em form-media e resolvem com getPublicUrl — que em bucket
--   privado devolve URL que responde 400:
--     • PlatformCrmFormBlockEditor.tsx:179
--     • PlatformCrmImageUploadField.tsx:51
--     • FormBlockEditor.tsx:163
--   São imagens quebradas em produção, invisíveis apenas porque o bucket está VAZIO.
--   O irmão tenant do mesmo componente (admin/capture/appearance/ImageUploadField.tsx)
--   usa `funnel-assets`, que é público. form-media privado é a anomalia, não a regra.
--
-- ACHADO 4 (o que exige a ordem desta migration — INSERT ANTES de public):
--   A policy de INSERT herdada é `bucket_id = 'form-media' AND auth.uid() IS NOT NULL`
--   — SEM escopo de path. A 20260720h documentou isso como decisão deliberada
--   (linha 44: "INSERT fica como está"), defensável enquanto o bucket era privado.
--   Com upsert:true nos uploads, qualquer autenticado de QUALQUER org pode sobrescrever
--   o logo de outra org — e de `platform/`. Abrir a leitura antes de fechar a escrita
--   converteria defacement contido em defacement público. Por isso INSERT primeiro.
--
-- VERIFICAÇÃO DE PATH (pré-requisito, call-site a call-site — não por inferência):
--   FormDesignPanel.tsx:60             `<organization_id>/<form_id>/logo-<ts>.<ext>`  → [1] = org   ✔
--   FormBlockEditor.tsx:154            `<organization_id>/<form_id>/<uuid>.<ext>`     → [1] = org   ✔
--   PlatformCrmFormDesignPanel.tsx:70  `platform/<form_id>/logo-<ts>.<ext>`           → super_admin ✔
--   PlatformCrmFormBlockEditor.tsx:170 `platform/<form_id>/<uuid>.<ext>`              → super_admin ✔
--   PlatformCrmImageUploadField.tsx:48 `platform/<scope>/<folder>/<ts>.<ext>`         → super_admin ✔
--   5/5 uploads legítimos passam na policy nova. Zero regressão de escrita.
--
-- POR QUE NÃO QUEBRA A LEITURA:
--   • Tornar o bucket público ADICIONA o endpoint /object/public/ (sem RLS); NÃO
--     remove o caminho autenticado. Nenhum read existente deixa de funcionar.
--   • Após os fixes de código desta mesma frente, restam ZERO createSignedUrl de
--     client em form-media (eram exatamente os dois painéis de design). A policy
--     form_media_select vira defesa em profundidade, não caminho quente.
--   • Bucket VAZIO na aplicação (0 objetos verificados) → nada exposto retroativamente,
--     sem backfill, sem migração de dados. As tabelas forms e platform_crm_forms têm
--     0 linhas com assinatura persistida (`token=`) em theme.
--
-- OBSOLETA o aviso das linhas 54-56 da 20260720h: o fallback createSignedUrl de
--   src/components/ui/image-upload.tsx foi REMOVIDO nesta frente (o componente agora
--   falha explicitamente em bucket privado, em vez de cunhar credencial de 1 ano em
--   silêncio). Não há mais fallback para "passar a rodar".
--
-- APLICADA AO VIVO em 2026-07-30, em dois passos separados e verificados:
--   passo 1 `form_media_insert_org_scoped` → conferido: policy INSERT única, org-scoped.
--   passo 2 `form_media_bucket_public`     → conferido: public=true, 0 objetos.
-- VERIFICAÇÃO PÓS-APLICAÇÃO (medida, não inferida):
--   • GET anônimo em /object/public/form-media/<inexistente> → "Object not found",
--     idêntico ao controle público `avatars`. Antes respondia "Bucket not found", como
--     ainda responde o controle privado `prospeccao-video`. Leitura pública ativa.
--   • Expressão do with_check avaliada contra os 5 formatos reais de path + 1 caso de
--     ataque, com organization_id real: 5/5 uploads legítimos ACEITOS; gravação em
--     pasta de outra org BLOQUEADA.
--   • Front: `npx tsc --noEmit` exit 0 e `npm run build` verde após os 3 fixes.
--
-- REVERSÃO (1 comando, sem perda de dado):
--   update storage.buckets set public = false where id = 'form-media';
--   -- e, se quiser destravar a escrita de volta:
--   -- drop policy "form_media_insert" on storage.objects;
--   -- create policy "form-media authenticated upload" on storage.objects
--   --   for insert with check (bucket_id = 'form-media' AND auth.uid() IS NOT NULL);
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PASSO 1 — fechar a ESCRITA (obrigatoriamente antes do passo 2).
-- Mesmo escopo já vigente em form_media_select/update/delete (20260720h): simetria
-- entre quem lê, escreve, altera e apaga.
-- Antes: with check (bucket_id = 'form-media' AND auth.uid() IS NOT NULL)  -- sem path
-- ---------------------------------------------------------------------------
drop policy if exists "form-media authenticated upload" on storage.objects;
drop policy if exists "form_media_insert"               on storage.objects;

create policy "form_media_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'form-media'
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR (storage.foldername(name))[1] = (
        SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- PASSO 2 — só agora abrir a LEITURA pública.
-- Serve /object/public/form-media/... sem RLS, que é o que a página pública
-- do formulário precisa. Policies de select/update/delete permanecem intactas.
-- ---------------------------------------------------------------------------
update storage.buckets
set public = true
where id = 'form-media';
