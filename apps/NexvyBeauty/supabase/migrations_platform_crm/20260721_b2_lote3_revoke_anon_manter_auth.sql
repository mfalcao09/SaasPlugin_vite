-- B2 LOTE 3 — 25 funções chamadas pelo FRONT LOGADO (authenticated) ou por edge.
-- APLICADA via apply_migration 2026-07-21 (b2_lote3_revoke_anon_manter_auth). Registro versionado.
-- Revoga anon+PUBLIC, MANTÉM authenticated+service_role. Fecha o vetor anon do IDOR inbox_*
-- e da auto-promoção initialize_user_permissions. As *_by_token não são chamadas por anon no
-- front (só via edge service_role) — verificado por grep. Prova: anon_exposto=0, auth_perdido=0.
-- ⚠️ Resíduo de CORPO (não é revoke, é hardening — cards à parte):
--    · initialize_user_permissions/inbox_*: IDOR cross-tenant por authenticated permanece.
--    · accept_invitation (MANTER, não neste lote): takeover cross-tenant — BLOQUEADOR de GO LIVE.
do $$ declare r record; begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.prosecdef
      and p.prorettype <> 'pg_catalog.trigger'::regtype
      and p.proname in (
        'get_booking_by_token','cancel_booking_by_token','reschedule_booking_by_token',
        'platform_crm_is_within_24h_window','initialize_user_permissions',
        'calculate_commission','process_pending_queue','create_product_tag_package',
        'platform_crm_user_has_product','inbox_list_conversations','inbox_count_conversations',
        'delete_lead_cascade','delete_product_safe','delete_team_member',
        'get_auth_user_id_by_email','get_or_create_first_access_onboarding',
        'get_organization_effective_limits','get_product_performance',
        'mark_super_admin_password_changed','save_onboarding_draft','set_onboarding_step',
        'set_active_organization','create_onboarding_link','revoke_onboarding_link',
        'submit_onboarding')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
