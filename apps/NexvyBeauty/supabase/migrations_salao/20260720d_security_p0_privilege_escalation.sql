-- ============================================================================
-- SEGURANÇA P0 (2026-07-20) — auditoria adversarial pré-lançamento.
--
-- Fecha a escalação de privilégio para super_admin da plataforma: a policy de
-- INSERT em user_roles só checava has_role(caller,'admin') no WITH CHECK — sem
-- restringir QUAL papel nem PARA QUEM. Um admin de tenant (todo dono de salão)
-- inseria {user_id: próprio, role: 'super_admin'} e virava super_admin da
-- plataforma inteira (is_super_admin lê exatamente essa tabela). Também permitia
-- conceder papel a usuário de OUTRO salão.
--
-- Aplicada ao vivo via MCP em 2026-07-20; versionada aqui para sobreviver a
-- `db reset` (senão a policy permissiva original volta).
-- ============================================================================

drop policy if exists "Admins can insert roles" on public.user_roles;
create policy "Admins can insert roles"
  on public.user_roles for insert to authenticated
  with check (
    has_role(auth.uid(), 'admin'::app_role)
    and role <> 'super_admin'::app_role
    and exists (
      select 1 from public.profiles p
      where p.id = user_roles.user_id
        and p.organization_id = get_user_organization(auth.uid())
    )
  );

drop policy if exists "Admins can delete roles" on public.user_roles;
create policy "Admins can delete roles"
  on public.user_roles for delete to authenticated
  using (
    has_role(auth.uid(), 'admin'::app_role)
    and role <> 'super_admin'::app_role
    and exists (
      select 1 from public.profiles p
      where p.id = user_roles.user_id
        and p.organization_id = get_user_organization(auth.uid())
    )
  );
