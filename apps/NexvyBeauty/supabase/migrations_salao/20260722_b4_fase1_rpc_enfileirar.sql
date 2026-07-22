-- B4 / FASE 1 — enfileiração em SQL, não em TypeScript.
-- Aplicada em prod como `b4_fase1_rpc_enfileirar`.
--
-- POR QUE AQUI E NÃO NA EDGE FUNCTION: `normalize_phone_br` (insere o nono dígito) e
-- `is_br_dialable` (Eixo 1) já são a fonte de verdade no banco. Reimplementá-las em TS
-- criaria uma segunda versão que diverge com o tempo — o padrão exato que gerou o bug
-- do LID-vira-nome.
--
-- Aplica o EIXO 1 na entrada da fila: grupo e LID não entram na carteira, e ficam
-- registrados com motivo em vez de silenciosamente pulados (o que some com 45% dos
-- contatos sem deixar rastro).
--
-- MEDIDO na instância meuteste1-sal-o1: 860 JIDs -> 348 pendentes,
-- 512 ignorados (117 grupo, 389 lid_sem_telefone, 6 nao_br).
create or replace function public.carteira_import_enfileirar(
  p_organization_id uuid,
  p_instance_name   text,
  p_jids            text[]
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_res jsonb;
begin
  if p_organization_id is null or p_instance_name is null then
    raise exception 'organization_id e instance_name sao obrigatorios';
  end if;

  insert into public.carteira_import_jobs
    (organization_id, instance_name, remote_jid, telefone_normalizado, status, motivo_ignorado)
  select
    p_organization_id,
    p_instance_name,
    j,
    t.n,
    case
      when j like '%@g.us' then 'ignorado'
      when j like '%@lid'  then 'ignorado'
      when t.n is null or not public.is_br_dialable(t.n) then 'ignorado'
      else 'pendente'
    end,
    case
      when j like '%@g.us' then 'grupo'
      when j like '%@lid'  then 'lid_sem_telefone'
      when t.n is null or not public.is_br_dialable(t.n) then 'nao_br'
      else null
    end
  from unnest(p_jids) as j
  cross join lateral (
    select public.normalize_phone_br(split_part(j, '@', 1)) as n
  ) t
  on conflict (organization_id, instance_name, remote_jid) do nothing;

  select jsonb_build_object(
    'total',     count(*),
    'pendente',  count(*) filter (where status = 'pendente'),
    'feito',     count(*) filter (where status = 'feito'),
    'ignorado',  count(*) filter (where status = 'ignorado'),
    'por_motivo', coalesce(
      (select jsonb_object_agg(motivo_ignorado, n)
       from (select motivo_ignorado, count(*) as n
             from public.carteira_import_jobs
             where organization_id = p_organization_id
               and instance_name = p_instance_name
               and motivo_ignorado is not null
             group by motivo_ignorado) z), '{}'::jsonb)
  ) into v_res
  from public.carteira_import_jobs
  where organization_id = p_organization_id and instance_name = p_instance_name;

  return v_res;
end $function$;

revoke all on function public.carteira_import_enfileirar(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.carteira_import_enfileirar(uuid, text, text[]) to service_role;

comment on function public.carteira_import_enfileirar(uuid, text, text[]) is
  'Fase 1: enfileira contatos do Evolution aplicando o Eixo 1 (forma) em SQL. Grupo/LID/nao-BR entram como ignorado COM motivo, nunca silenciosamente pulados.';
