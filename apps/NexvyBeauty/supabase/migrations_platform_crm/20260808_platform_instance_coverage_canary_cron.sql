-- E2 — canário de cobertura das instâncias, a cada 30 minutos.
--
-- Pré-requisitos: extensões pg_cron + pg_net e secret `service_role_key` no
-- Vault. A migration apenas agenda; não faz deploy nem invoca a Edge Function.
--
-- Idempotência: remove TODOS os jobs homônimos por jobid antes de criar um
-- único job. O loop também saneia eventual duplicata legada sem depender da
-- sobrecarga de cron.unschedule(text).
alter table public.platform_crm_cold_campaigns
  add column if not exists coverage_alert_at timestamptz;

comment on column public.platform_crm_cold_campaigns.coverage_alert_at is
  'Throttle persistente do canário de cobertura; um estado por campanha, independente do burner atualmente fixado.';

create or replace function public.pcrm_try_timestamptz(p_value text)
returns timestamptz
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  return p_value::timestamptz;
exception when others then
  return null;
end;
$$;

-- Claims atômicos: evitam read→send→update concorrente e preservam chaves
-- adicionadas por outros fluxos ao JSON metadata.
drop function if exists public.pcrm_claim_instance_health_alert(
  text,
  uuid,
  timestamptz,
  timestamptz
);
drop function if exists public.pcrm_release_instance_health_alert(
  text,
  uuid,
  timestamptz
);
drop function if exists public.pcrm_finalize_instance_health_alert(
  text,
  uuid,
  timestamptz,
  timestamptz
);

create or replace function public.pcrm_claim_instance_health_alert(
  p_instance_id uuid,
  p_claimed_at timestamptz,
  p_stale_before timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer;
begin
  update public.platform_crm_evolution_instances
     set metadata = jsonb_set(
       coalesce(metadata, '{}'::jsonb),
       '{health_alert_at}',
       to_jsonb(p_claimed_at),
       true
     )
   where id = p_instance_id
     and status is distinct from 'connected'
     and not (coalesce(metadata, '{}'::jsonb) @> '{"health_mute": true}'::jsonb)
     and coalesce(
       public.pcrm_try_timestamptz(metadata->>'health_alert_at') < p_stale_before,
       true
     );

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function public.pcrm_release_instance_health_alert(
  p_instance_id uuid,
  p_claimed_at timestamptz
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.platform_crm_evolution_instances
     set metadata = coalesce(metadata, '{}'::jsonb) - 'health_alert_at'
   where id = p_instance_id
     and public.pcrm_try_timestamptz(metadata->>'health_alert_at') =
       p_claimed_at;
end;
$$;

create or replace function public.pcrm_finalize_instance_health_alert(
  p_instance_id uuid,
  p_claimed_at timestamptz,
  p_alerted_at timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer;
begin
  update public.platform_crm_evolution_instances
     set metadata = jsonb_set(
       coalesce(metadata, '{}'::jsonb),
       '{health_alert_at}',
       to_jsonb(p_alerted_at),
       true
     )
   where id = p_instance_id
     and public.pcrm_try_timestamptz(metadata->>'health_alert_at') =
       p_claimed_at;

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function public.pcrm_rearm_connected_health_alerts()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plataforma integer;
begin
  update public.platform_crm_evolution_instances
     set metadata = coalesce(metadata, '{}'::jsonb) - 'health_alert_at'
   where status = 'connected'
     and coalesce(metadata, '{}'::jsonb) ? 'health_alert_at';
  get diagnostics v_plataforma = row_count;

  return v_plataforma;
end;
$$;

drop function if exists public.pcrm_claim_campaign_coverage_alert(
  uuid,
  uuid,
  timestamptz,
  timestamptz
);
drop function if exists public.pcrm_release_campaign_coverage_alert(
  uuid,
  uuid,
  timestamptz
);
drop function if exists public.pcrm_finalize_campaign_coverage_alert(
  uuid,
  uuid,
  timestamptz,
  timestamptz
);

create or replace function public.pcrm_claim_campaign_coverage_alert(
  p_campaign_id uuid,
  p_claimed_at timestamptz,
  p_stale_before timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer;
begin
  update public.platform_crm_cold_campaigns
     set coverage_alert_at = p_claimed_at
   where id = p_campaign_id
     and (
       coverage_alert_at is null
       or coverage_alert_at < p_stale_before
     );

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function public.pcrm_release_campaign_coverage_alert(
  p_campaign_id uuid,
  p_claimed_at timestamptz
) returns void
language sql
security invoker
set search_path = ''
as $$
  update public.platform_crm_cold_campaigns
     set coverage_alert_at = null
   where id = p_campaign_id
     and coverage_alert_at = p_claimed_at;
$$;

create or replace function public.pcrm_finalize_campaign_coverage_alert(
  p_campaign_id uuid,
  p_claimed_at timestamptz,
  p_alerted_at timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer;
begin
  update public.platform_crm_cold_campaigns
     set coverage_alert_at = p_alerted_at
   where id = p_campaign_id
     and coverage_alert_at = p_claimed_at;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.pcrm_try_timestamptz(text)
  from public, anon, authenticated;
revoke all on function public.pcrm_claim_instance_health_alert(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.pcrm_release_instance_health_alert(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.pcrm_finalize_instance_health_alert(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.pcrm_rearm_connected_health_alerts()
  from public, anon, authenticated;
revoke all on function public.pcrm_claim_campaign_coverage_alert(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.pcrm_release_campaign_coverage_alert(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.pcrm_finalize_campaign_coverage_alert(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

grant execute on function public.pcrm_try_timestamptz(text)
  to service_role;
grant execute on function public.pcrm_claim_instance_health_alert(uuid, timestamptz, timestamptz)
  to service_role;
grant execute on function public.pcrm_release_instance_health_alert(uuid, timestamptz)
  to service_role;
grant execute on function public.pcrm_finalize_instance_health_alert(uuid, timestamptz, timestamptz)
  to service_role;
grant execute on function public.pcrm_rearm_connected_health_alerts()
  to service_role;
grant execute on function public.pcrm_claim_campaign_coverage_alert(uuid, timestamptz, timestamptz)
  to service_role;
grant execute on function public.pcrm_release_campaign_coverage_alert(uuid, timestamptz)
  to service_role;
grant execute on function public.pcrm_finalize_campaign_coverage_alert(uuid, timestamptz, timestamptz)
  to service_role;

do $$
declare
  v_jobid bigint;
begin
  for v_jobid in
    select jobid
      from cron.job
     where jobname = 'platform-instance-coverage-canary'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end
$$;

select cron.schedule(
  'platform-instance-coverage-canary',
  '7,37 * * * *',
  $job$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/platform-instance-coverage-canary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'service_role_key'
         limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);
