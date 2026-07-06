-- Lead scoring com decay temporal. Aplicada live 2026-06-22 via Supabase MCP.
-- score = temperatura (base) + progresso na etapa (order_index) - decay por
-- dias sem contato (clamp 0..100). is_won=100, is_lost=0.
-- Decay provado: hot 0d=55 -> 7d=41 -> 30d=10. Chamar via cron (pg_cron) p/ rodar diariamente.
alter table public.leads add column if not exists score integer not null default 0;
alter table public.leads add column if not exists score_updated_at timestamptz;
create index if not exists idx_leads_org_score on public.leads(organization_id, score desc);

create or replace function public.recompute_lead_scores(p_org uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.leads l set
    score = greatest(0, least(100, (
      case
        when ps.is_won then 100
        when ps.is_lost then 0
        else
          (case lower(coalesce(l.temperature::text, ''))
             when 'hot' then 55 when 'warm' then 35 when 'cold' then 12 else 20 end)
          + least(coalesce(ps.order_index, 0) * 5, 25)
          - least(
              coalesce(
                extract(day from (now() - l.last_contact_at))::int,
                extract(day from (now() - l.created_at))::int,
                30
              ) * 2,
              45
            )
      end
    ))),
    score_updated_at = now()
  from public.leads lx
  left join public.pipeline_stages ps on ps.id = lx.current_stage_id
  where l.id = lx.id
    and (p_org is null or l.organization_id = p_org);
  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.recompute_lead_scores(uuid) from public;
grant execute on function public.recompute_lead_scores(uuid) to service_role;
