-- B4 — correção NA ORIGEM do bug que gerou as 84k linhas sujas.
-- Aplicada em prod como `b4_upsert_clientes_wa_nome_vazio` (20260722051532).
-- SUCEDE: 20260714_f6_carteira_whatsapp.sql:175 (onde o bug nasceu).
--
-- O BUG: no INSERT, `coalesce(r.nome, r.tel_norm)`. Quando o WhatsApp não manda pushName
-- (grupo, contato sem nome público, LID não-resolvido), o telefone virava o NOME do
-- cliente. Por isso 84.194 linhas com 0 nomes reais — não era ruído do WhatsApp, era
-- a nossa própria RPC carimbando o número no campo errado.
--
-- A CORREÇÃO: `coalesce(r.nome, '')`. Nome vazio é honesto — e o próprio UPDATE acima
-- promove o nome real assim que um pushName chegar. Sem este fix, o backfill limparia
-- o passado e a próxima sincronização recriaria o problema inteiro.
--
-- NOTA: o arquivo grava a função completa (não um patch) porque é assim que o Postgres
-- versiona — CREATE OR REPLACE é o diff.
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
             -- NOTA: o '\\s' aqui está errado (vira barra-invertida literal, não classe
             -- de espaço). Preservado fiel ao que foi aplicado; corrigido na migration
             -- seguinte, 20260722_b4_fix_regex_nome_lixo_escapado.sql.
             and (c.nome is null or btrim(c.nome) = '' or btrim(c.nome) ~ '^[0-9()+\\s-]+$')
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
