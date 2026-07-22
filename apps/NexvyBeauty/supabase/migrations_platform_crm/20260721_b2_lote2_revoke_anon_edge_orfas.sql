-- B2 LOTE 2 — 29 funções SECURITY DEFINER não-trigger; callers = edge(service_role) ou órfãs.
-- APLICADA via apply_migration 2026-07-21 (b2_lote2_revoke_anon_edge_orfas). Registro versionado.
-- Fecha os 2 piores vazamentos do B2: search_lead_memory (memória de lead cross-tenant) e
-- pick_prompt_variant (system prompt dos agentes). policy_deps=0 em todas. service_role mantido.
-- Prova pós-aplicação: ainda_exposto=0, svc_perdido=0.
do $$ declare r record; begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.prosecdef
      and p.prorettype <> 'pg_catalog.trigger'::regtype
      and p.proname in (
        'resolve_affiliate_ref','has_sector_access','user_sector_ids',
        'pick_prompt_variant','pcrm_log_journey_event','record_variant_score',
        'record_variant_impression','pcrm_cold_bump_counter',
        'platform_crm_increment_webhook_requests','increment_webhook_requests',
        'increment_funnel_leads','increment_form_submissions_count',
        'reset_monthly_webhook_requests','platform_crm_reset_monthly_webhook_requests',
        'distribute_lead','platform_crm_distribute_lead','platform_crm_process_pending_queue',
        'platform_crm_calculate_commission','apply_tag_automations',
        'remove_lifecycle_tags_on_event','evaluate_routing_rules',
        'search_lead_memory','search_catalog_smart','try_acquire_conversation_lock',
        'try_lock_bot','release_bot_lock','is_system_initialized',
        'is_within_business_hours','claim_first_super_admin')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
