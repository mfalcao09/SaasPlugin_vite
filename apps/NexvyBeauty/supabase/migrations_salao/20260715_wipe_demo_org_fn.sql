-- ============================================================================
-- ESTEIRA F3 — RPC de wipe LGPD da org demo (parte DB do wipe-demo-org).
--
-- O delete-organization atual VAZA tabelas sem FK e TRAVA nas 7 FKs NO ACTION.
-- Esta RPC resolve isso de forma auditável:
--   - Guard duro: só age se plan_status='demo' (jamais org paga).
--   - session_replication_role='replica' (SECURITY DEFINER owned by postgres):
--     desliga os triggers de FK → sem problema de ordem, sem cascade implícito,
--     TUDO explícito e contado. Reset garantido mesmo em erro.
--   - Deleta as filhas sem organization_id por id de conversa/instância.
--   - Loop em TODAS as BASE TABLES public com organization_id (filtra VIEWS —
--     servico_catalogo/pacotes são views sobre products e explodiriam).
--   - RETÉM (não toca): lgpd_consents, sales_leads, platform_crm_*,
--     platform_audit_logs (nenhuma tem organization_id → auto-retida).
--   - Escreve platform_audit_logs com as contagens (prova art. 16/18) ANTES de
--     apagar a org.
-- Retorna jsonb { total_rows, tables:{<tabela>:<n>} }.
--
-- A parte que SQL não faz (deletar a instância no servidor Evolution + storage)
-- fica na edge wipe-demo-org, que chama esta RPC.
-- ============================================================================
create or replace function public.wipe_demo_org_data(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_counts jsonb := '{}'::jsonb;
  v_total  bigint := 0;
  v_n      bigint;
  v_conv   uuid[];
  v_inst   text[];
begin
  -- GUARD duro
  if not exists (select 1 from organizations where id = p_org and plan_status = 'demo') then
    raise exception 'wipe_demo_org_data: org % nao e demo (guard plan_status)', p_org;
  end if;

  -- ids para as filhas sem organization_id
  select coalesce(array_agg(id), '{}') into v_conv
    from webchat_conversations where organization_id = p_org;
  select coalesce(array_agg(id::text) || array_agg(instance_id), '{}') into v_inst
    from evolution_instances where organization_id = p_org;

  set session_replication_role = 'replica';

  -- filhas sem organization_id (defensivo — pula se a tabela/coluna nao existir)
  begin
    delete from processed_messages where instance_id::text = any(v_inst);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('processed_messages', v_n); v_total := v_total + v_n; end if;
  exception when undefined_table or undefined_column then null; end;
  begin
    delete from conversation_processing_locks where conversation_id = any(v_conv);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('conversation_processing_locks', v_n); v_total := v_total + v_n; end if;
  exception when undefined_table or undefined_column then null; end;
  begin
    delete from sent_responses where conversation_id = any(v_conv);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('sent_responses', v_n); v_total := v_total + v_n; end if;
  exception when undefined_table or undefined_column then null; end;

  -- todas as BASE TABLES public com organization_id (nunca views)
  for r in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public'
       and c.column_name = 'organization_id'
       and t.table_type = 'BASE TABLE'
     order by c.table_name
  loop
    execute format('delete from public.%I where organization_id = $1', r.table_name) using p_org;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object(r.table_name, v_n); v_total := v_total + v_n; end if;
  end loop;

  -- Prova de eliminação (art. 16/18) ANTES de apagar a org (entity_id valido)
  begin
    insert into platform_audit_logs (action, entity_type, entity_id, metadata)
    values ('demo_org_data_wiped', 'organization', p_org,
            jsonb_build_object('total_rows', v_total, 'tables', v_counts, 'wiped_at', now()));
  exception when others then null; -- audit nunca derruba o wipe
  end;

  -- a org
  delete from organizations where id = p_org and plan_status = 'demo';
  get diagnostics v_n = row_count;
  if v_n > 0 then v_counts := v_counts || jsonb_build_object('organizations', v_n); v_total := v_total + v_n; end if;

  set session_replication_role = 'origin';
  return jsonb_build_object('total_rows', v_total, 'tables', v_counts);
exception when others then
  begin set session_replication_role = 'origin'; exception when others then null; end;
  raise;
end $$;

revoke all on function public.wipe_demo_org_data(uuid) from public, anon, authenticated;
grant execute on function public.wipe_demo_org_data(uuid) to service_role;
