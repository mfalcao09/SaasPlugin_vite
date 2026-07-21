-- B2 LOTE 1 — 25 funções de TRIGGER SECURITY DEFINER anon-executáveis.
-- APLICADA via apply_migration 2026-07-21 (b2_lote1_revoke_anon_triggers). Registro versionado.
-- Risco ZERO: função de trigger dispara pelo owner do trigger, não usa EXECUTE grant do role.
-- Prova pós-aplicação: 0 das 25 continuam expostas a anon/authenticated.
do $$ declare r record; begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.prosecdef
      and p.prorettype = 'pg_catalog.trigger'::regtype
      and p.proname in (
        'booking_log_status_change','enforce_max_ai_agents','enforce_max_users',
        'enforce_single_attendant','ensure_first_user_is_admin','ensure_org_owner_is_admin',
        'fill_default_sector','handle_new_user','link_whatsapp_conversation_to_lead',
        'mark_default_password_changed','pcrm_fill_journey_previous_event',
        'pcrm_journey_on_calendar_event','pcrm_journey_on_conversation_change',
        'pcrm_journey_on_deal_change','pcrm_journey_on_lead_change',
        'pcrm_journey_on_message_insert','pcrm_journey_on_stage_change',
        'pcrm_journey_on_task_change','platform_crm_booking_log_status_change',
        'platform_crm_deals_commission_trg','platform_crm_sync_active_leads_count',
        'protect_booking_public_updates','sync_active_leads_count',
        'sync_conversation_last_message','update_ticket_on_new_message')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
