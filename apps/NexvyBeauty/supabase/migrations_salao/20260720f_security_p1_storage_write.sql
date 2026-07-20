-- ============================================================================
-- SEGURANÇA P1 (2026-07-20) — escrita anônima em storage.objects.
--
-- Policies de UPDATE/DELETE (e o INSERT de form-media) não exigiam auth.uid()
-- — qualquer anônimo com a anon key apagava/sobrescrevia/subia mídia de chat,
-- cadência, materiais, formulários e funis de qualquer salão (DoS, hosting de
-- arquivo, adulteração do que os agentes de IA enviam aos clientes).
-- Correção: exigir auth.uid() IS NOT NULL. Uploads legítimos são de usuários
-- autenticados; nenhum fluxo anônimo legítimo usa estes buckets.
--
-- Aplicada ao vivo via MCP em 2026-07-20; versionada para sobreviver a reset.
-- ============================================================================

drop policy if exists "form-media authenticated upload" on storage.objects;
create policy "form-media authenticated upload" on storage.objects
  for insert to public with check (bucket_id = 'form-media' and auth.uid() is not null);
drop policy if exists "form-media authenticated update" on storage.objects;
create policy "form-media authenticated update" on storage.objects
  for update to public using (bucket_id = 'form-media' and auth.uid() is not null);
drop policy if exists "form-media authenticated delete" on storage.objects;
create policy "form-media authenticated delete" on storage.objects
  for delete to public using (bucket_id = 'form-media' and auth.uid() is not null);

drop policy if exists "chat-media authenticated update" on storage.objects;
create policy "chat-media authenticated update" on storage.objects
  for update to public using (bucket_id = 'chat-media' and auth.uid() is not null);
drop policy if exists "chat-media authenticated delete" on storage.objects;
create policy "chat-media authenticated delete" on storage.objects
  for delete to public using (bucket_id = 'chat-media' and auth.uid() is not null);

drop policy if exists "Authenticated users can delete cadence media" on storage.objects;
create policy "Authenticated users can delete cadence media" on storage.objects
  for delete to public using (bucket_id = 'cadence-media' and auth.uid() is not null);

drop policy if exists "Authenticated users can delete materials" on storage.objects;
create policy "Authenticated users can delete materials" on storage.objects
  for delete to public using (bucket_id = 'materials' and auth.uid() is not null);

drop policy if exists "funnel_assets_auth_update" on storage.objects;
create policy "funnel_assets_auth_update" on storage.objects
  for update to public using (bucket_id = 'funnel-assets' and auth.uid() is not null);
drop policy if exists "funnel_assets_auth_delete" on storage.objects;
create policy "funnel_assets_auth_delete" on storage.objects
  for delete to public using (bucket_id = 'funnel-assets' and auth.uid() is not null);
