-- merge_clientes: junta clientes duplicados (higiene/dedup — Onda 4).
-- Org-scoped (tenant) + SECURITY DEFINER: migra TODAS as FKs que apontam pra
-- clientes.id (agendamentos, lancamentos, orcamentos, ordens_servico,
-- pacote_clientes, veiculos) pro registro mantido e apaga os duplicados, de
-- forma transacional. Chamada do front via supabase.rpc('merge_clientes', {p_keep, p_dups}).
-- Aplicada live em 2026-06-24 no project fzhlbwhdejumkyqosuvq.

create or replace function public.merge_clientes(p_keep uuid, p_dups uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_org uuid;
  v_keep_org uuid;
  v_removed integer;
begin
  if p_keep is null or p_dups is null or array_length(p_dups, 1) is null then
    raise exception 'parametros invalidos';
  end if;
  if p_keep = any(p_dups) then
    raise exception 'keep nao pode estar entre os duplicados';
  end if;

  -- org do chamador (auth) — tenant scoping
  select organization_id into v_caller_org from public.profiles where id = auth.uid();
  if v_caller_org is null then raise exception 'sem organizacao'; end if;

  -- keep precisa existir e ser da org do chamador
  select organization_id into v_keep_org from public.clientes where id = p_keep;
  if v_keep_org is null or v_keep_org <> v_caller_org then raise exception 'cliente mantido invalido'; end if;

  -- todos os dups precisam existir e ser da MESMA org (anti cross-tenant)
  if (select count(*) from public.clientes where id = any(p_dups) and organization_id = v_caller_org) <> array_length(p_dups, 1) then
    raise exception 'duplicatas invalidas ou de outra organizacao';
  end if;

  -- migra TODAS as FKs que apontam pra clientes.id antes do delete
  update public.agendamentos    set cliente_id = p_keep where cliente_id = any(p_dups);
  update public.lancamentos     set cliente_id = p_keep where cliente_id = any(p_dups);
  update public.orcamentos      set cliente_id = p_keep where cliente_id = any(p_dups);
  update public.ordens_servico  set cliente_id = p_keep where cliente_id = any(p_dups);
  update public.pacote_clientes set cliente_id = p_keep where cliente_id = any(p_dups);
  update public.veiculos        set cliente_id = p_keep where cliente_id = any(p_dups);

  delete from public.clientes where id = any(p_dups) and organization_id = v_caller_org;
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke all on function public.merge_clientes(uuid, uuid[]) from public, anon;
grant execute on function public.merge_clientes(uuid, uuid[]) to authenticated;
