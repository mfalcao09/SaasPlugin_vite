-- ============================================================================
-- SEGURANÇA P0 (2026-07-20) — RPCs SECURITY DEFINER sem autorização própria.
--
-- Estas funções rodam como postgres (ignoram RLS) e tinham EXECUTE para
-- anon/authenticated com ZERO checagem no corpo — a anon key pública (no bundle
-- JS) chamava qualquer uma. delete_team_member/delete_product_safe eram
-- destrutivas cross-tenant (HTTP 204 comprovado com a anon key); os get_* vazavam
-- plano/pipeline/UUID de conta de qualquer org.
--
-- Correção: gate interno (auth.role='service_role' preserva chamadas server-to-
-- server; super_admin sempre; senão membership na própria org) + REVOKE de anon.
-- Cuidado com lógica ternária do SQL: `IS NOT TRUE` trata NULL (auth.uid() de
-- anon) como não-autorizado — `NOT (NULL)` não entraria no branch de bloqueio.
--
-- Aplicada ao vivo via MCP em 2026-07-20; versionada aqui para sobreviver a reset.
-- ============================================================================

create or replace function public.delete_team_member(p_user_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not (
    auth.role() = 'service_role'
    or is_super_admin(auth.uid())
    or (
      has_role(auth.uid(),'admin'::app_role)
      and exists (select 1 from public.profiles p where p.id = p_user_id and p.organization_id = get_user_organization(auth.uid()))
      and not exists (select 1 from public.user_roles ur where ur.user_id = p_user_id and ur.role = 'super_admin'::app_role)
    )
  ) then
    raise exception 'not_authorized';
  end if;
  delete from public.user_product_assignments where user_id = p_user_id;
  delete from public.squad_members where user_id = p_user_id;
  delete from public.user_roles where user_id = p_user_id;
  update public.leads set assigned_to = null where assigned_to = p_user_id;
  update public.deals set seller_id = null where seller_id = p_user_id;
  delete from public.user_status where user_id = p_user_id;
  delete from public.availability_overrides where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
end;
$function$;
revoke execute on function public.delete_team_member(uuid) from anon;

create or replace function public.delete_product_safe(p_product_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not (
    auth.role() = 'service_role'
    or is_super_admin(auth.uid())
    or (
      has_role(auth.uid(),'admin'::app_role)
      and exists (select 1 from public.products pr where pr.id = p_product_id and pr.organization_id = get_user_organization(auth.uid()))
    )
  ) then
    raise exception 'not_authorized';
  end if;
  delete from public.user_product_assignments where product_id = p_product_id;
  update public.leads set product_id = null, current_stage_id = null where product_id = p_product_id;
  update public.tasks set product_id = null where product_id = p_product_id;
  update public.calendar_events set product_id = null where product_id = p_product_id;
  update public.lead_queue set product_id = null where product_id = p_product_id;
  update public.sales_squads set product_id = null where product_id = p_product_id;
  update public.webchat_agent_configs set product_id = null where product_id = p_product_id;
  update public.agent_training_materials set product_id = null where product_id = p_product_id;
  update public.webhooks set product_id = null where product_id = p_product_id;
  update public.notifications set product_id = null where product_id = p_product_id;
  delete from public.products where id = p_product_id;
end;
$function$;
revoke execute on function public.delete_product_safe(uuid) from anon;

create or replace function public.get_auth_user_id_by_email(_email text)
returns uuid language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not (auth.role()='service_role' or is_super_admin(auth.uid())) then return null; end if;
  return (select id from auth.users where lower(email) = lower(_email) limit 1);
end;
$function$;
revoke execute on function public.get_auth_user_id_by_email(text) from anon;

create or replace function public.get_organization_effective_limits(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_org record; v_plan record; v_result jsonb;
begin
  if (auth.role()='service_role' or is_super_admin(auth.uid()) or p_org_id = get_user_organization(auth.uid())) is not true then
    return null;
  end if;
  select * into v_org from public.organizations where id = p_org_id;
  if not found then return null; end if;
  if v_org.plan_id is not null then select * into v_plan from public.platform_plans where id = v_org.plan_id; end if;
  v_result := jsonb_build_object(
    'plan_id', v_org.plan_id,
    'plan_name', coalesce(v_plan.name, 'Personalizado'),
    'plan_slug', coalesce(v_plan.slug, 'custom'),
    'limits', jsonb_build_object(
      'max_users', coalesce(v_org.max_users, v_plan.max_users, 5),
      'max_connections', coalesce(v_org.max_connections, v_plan.max_connections, 1),
      'max_professionals', v_plan.max_professionals,
      'max_sectors', coalesce(v_plan.max_sectors, 3),
      'max_products', coalesce(v_org.max_products, v_plan.max_products, 5),
      'max_contacts', coalesce(v_plan.max_contacts, 1000),
      'max_messages_month', coalesce(v_plan.max_messages_month, 5000),
      'max_ai_tokens_month', coalesce(v_plan.max_ai_tokens_month, 100000),
      'max_ai_agents', coalesce(v_org.max_ai_agents, v_plan.max_ai_agents, 0)
    ),
    'features', coalesce(v_org.features, '{}'::jsonb) || jsonb_build_object(
      'whatsapp', coalesce(v_plan.feature_whatsapp, true),
      'facebook', coalesce(v_plan.feature_facebook, false),
      'instagram', coalesce(v_plan.feature_instagram, false),
      'campaigns', coalesce(v_plan.feature_campaigns, false),
      'scheduling', coalesce(v_plan.feature_scheduling, true),
      'internal_chat', coalesce(v_plan.feature_internal_chat, true),
      'external_api', coalesce(v_plan.feature_external_api, false),
      'kanban', coalesce(v_plan.feature_kanban, true),
      'pipeline', coalesce(v_plan.feature_pipeline, true),
      'integrations', coalesce(v_plan.feature_integrations, false),
      'audio_transcription_ai', coalesce(v_plan.feature_audio_transcription_ai, false),
      'text_correction_ai', coalesce(v_plan.feature_text_correction_ai, false),
      'ai_agents', coalesce(v_plan.feature_ai_agents, false),
      'voice_agents', coalesce(v_plan.feature_voice_agents, false),
      'outreach', coalesce(v_plan.feature_outreach, false),
      'capture_funnels', coalesce(v_plan.feature_capture_funnels, false),
      'forms', coalesce(v_plan.feature_forms, true),
      'webhooks', coalesce(v_plan.feature_webhooks, false)
    ) || coalesce(v_plan.extra_features, '{}'::jsonb)
  );
  return v_result;
end;
$function$;
revoke execute on function public.get_organization_effective_limits(uuid) from anon;

create or replace function public.get_product_performance(
  p_org_id uuid, p_from timestamp with time zone default null, p_to timestamp with time zone default null
)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_result jsonb;
begin
  if (auth.role()='service_role' or is_super_admin(auth.uid()) or p_org_id = get_user_organization(auth.uid())) is not true then
    raise exception 'not_authorized';
  end if;
  with filtered as (
    select co.* from cakto_orders co
    where co.organization_id = p_org_id
      and (p_from is null or co.created_at_cakto >= p_from)
      and (p_to is null or co.created_at_cakto <= p_to)
  ),
  by_product as (
    select f.product_id, p.name as product_name, p.suite_id,
      count(*) filter (where f.status='paid') as paid_count,
      count(*) filter (where f.status in ('pending','waiting_payment')) as pending_count,
      count(*) filter (where f.status='refunded') as refunded_count,
      coalesce(sum(f.amount) filter (where f.status='paid'),0) as revenue,
      coalesce(avg(f.amount) filter (where f.status='paid'),0) as avg_ticket
    from filtered f left join products p on p.id=f.product_id
    group by f.product_id, p.name, p.suite_id
  ),
  by_role as (
    select f.product_id, coalesce(po.role,'unmapped') as role,
      count(*) filter (where f.status='paid') as paid_count,
      coalesce(sum(f.amount) filter (where f.status='paid'),0) as revenue
    from filtered f left join product_offers po on po.id=f.offer_id
    group by f.product_id, coalesce(po.role,'unmapped')
  )
  select jsonb_build_object(
    'products', coalesce(jsonb_agg(jsonb_build_object(
      'product_id', bp.product_id, 'product_name', bp.product_name, 'suite_id', bp.suite_id,
      'paid_count', bp.paid_count, 'pending_count', bp.pending_count, 'refunded_count', bp.refunded_count,
      'revenue', bp.revenue, 'avg_ticket', bp.avg_ticket,
      'roles', (select jsonb_agg(jsonb_build_object('role', br.role, 'paid_count', br.paid_count, 'revenue', br.revenue))
                from by_role br where br.product_id is not distinct from bp.product_id)
    )), '[]'::jsonb),
    'totals', (select jsonb_build_object(
        'revenue', coalesce(sum(amount) filter (where status='paid'),0),
        'paid_count', count(*) filter (where status='paid'),
        'pending_count', count(*) filter (where status in ('pending','waiting_payment')),
        'refunded_count', count(*) filter (where status='refunded'),
        'avg_ticket', coalesce(avg(amount) filter (where status='paid'),0)
      ) from filtered)
  ) into v_result from by_product bp;
  return v_result;
end;
$function$;
revoke execute on function public.get_product_performance(uuid, timestamp with time zone, timestamp with time zone) from anon;

-- Sem chamador no front — só service_role deve invocar.
revoke execute on function public.recompute_lead_scores(uuid) from anon, authenticated;
revoke execute on function public.register_human_seller(text, text, text, uuid) from anon, authenticated;
