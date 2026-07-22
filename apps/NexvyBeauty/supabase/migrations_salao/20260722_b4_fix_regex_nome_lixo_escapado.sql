-- B4 — correção do regex do guard "o nome atual é lixo numérico?".
-- Aplicada em prod como `b4_fix_regex_nome_lixo_escapado`.
-- SUCEDE: 20260722_b4_upsert_clientes_wa_nome_vazio.sql (mesma função, 1 caractere).
--
-- O DEFEITO: o guard usava '^[0-9()+\\s-]+$'. Com standard_conforming_strings = on
-- (padrão no Postgres moderno), '\\s' NÃO é a classe de espaço — é barra-invertida
-- literal seguida de 's'. Efeito prático: um nome como "(11) 99999-9999" não era
-- reconhecido como lixo e ficava travado para sempre, mesmo quando o pushName real
-- chegava numa sincronização posterior.
--
-- PROVA (rodada antes/depois):
--   nome                 antes_era_lixo   agora_e_lixo
--   '11 99999-9999'      false            true    <-- destravado
--   '(11) 99999-9999'    false            true    <-- destravado
--   '5511999999999'      true             true
--   'Maria Silva'        false            false   <-- nome real segue protegido
--   'Ana 2'              false            false
--   'José'               false            false
--
-- A mudança só ALARGA o "isto é lixo, pode sobrescrever" para strings compostas
-- exclusivamente de dígitos/parênteses/+/espaço/hífen — ou seja, telefones. Nenhum
-- nome humano cai nessa classe.
create or replace function public.upsert_clientes_whatsapp(p_organization_id uuid, p_clientes jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_inserted integer := 0;
  v_updated  integer := 0;
  v_count    integer;
  r record;
begin
  if p_organization_id is null then
    raise exception 'organization_id obrigatorio';
  end if;
  if p_clientes is null or jsonb_typeof(p_clientes) <> 'array' then
    raise exception 'p_clientes deve ser um array jsonb';
  end if;

  perform pg_advisory_xact_lock(hashtext('clientes_wa:' || p_organization_id::text));

  for r in
    select
      t.tel_norm,
      (array_remove(
        array_agg(nullif(btrim(x.nome), '') order by length(coalesce(x.nome, '')) desc),
        null
      ))[1] as nome,
      max(x.ultima_interacao_wa) as ultima
    from jsonb_to_recordset(p_clientes)
      as x(telefone text, nome text, ultima_interacao_wa timestamptz)
    cross join lateral (
      select public.normalize_phone_br(x.telefone) as tel_norm
    ) t
    where t.tel_norm is not null
    group by t.tel_norm
  loop
    update public.clientes c
    set
      nome = case
        when r.nome is not null
             and (c.nome is null or btrim(c.nome) = '' or btrim(c.nome) ~ '^[0-9()+\s-]+$')
        then r.nome
        else c.nome
      end,
      ultima_interacao_wa = greatest(
        coalesce(c.ultima_interacao_wa, r.ultima),
        coalesce(r.ultima, c.ultima_interacao_wa)
      ),
      updated_at = now()
    where c.organization_id = p_organization_id
      and c.telefone_normalizado = r.tel_norm;

    get diagnostics v_count = row_count;

    if v_count > 0 then
      v_updated := v_updated + v_count;
    else
      insert into public.clientes
        (organization_id, nome, telefone, status, tags, ultima_interacao_wa)
      values (
        p_organization_id,
        coalesce(r.nome, ''),   -- [B4] era coalesce(r.nome, r.tel_norm) — o LID virava nome
        r.tel_norm,
        'ativo',
        array['whatsapp'],
        r.ultima
      );
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end;
$function$;
