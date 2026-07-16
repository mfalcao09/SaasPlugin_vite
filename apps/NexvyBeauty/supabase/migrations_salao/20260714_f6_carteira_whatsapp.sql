-- ============================================================================
-- F6 — Evolution lê histórico → monta a carteira de clientes (WhatsApp).
--
-- Quando o tenant conecta o WhatsApp com syncFullHistory=true, a Evolution API
-- v2 emite chunks de histórico (MESSAGES_SET / CHATS_SET / CONTACTS_SET). A
-- edge function `evolution-history-sync` transforma esses chunks em linhas de
-- `clientes` chamando a RPC `upsert_clientes_whatsapp` abaixo.
--
-- O que esta migration faz:
--   1. Garante public.normalize_phone_br (só cria se não existir — a função já
--      existe live no project e webchat_conversations.visitor_phone_normalized
--      depende dela; não recriamos por cima).
--   2. clientes.telefone_normalizado  — coluna GERADA (normalize_phone_br(telefone)),
--      chave lógica de dedup do import.
--   3. clientes.ultima_interacao_wa   — timestamptz da última mensagem INBOUND
--      do cliente no WhatsApp (MAX dos timestamps vistos no histórico).
--   4. Índice (organization_id, telefone_normalizado) — lookup do upsert.
--      *** NÃO-UNIQUE de propósito ***: a base viva pode conter clientes
--      duplicados por telefone (existe até a RPC merge_clientes pra higiene
--      manual). Um UNIQUE aqui faria a migration falhar ou exigiria merge
--      automático destrutivo (repontar FKs + delete). A idempotência do import
--      é garantida pela RPC (advisory lock por organização + match pela coluna
--      normalizada), não pelo índice.
--   5. RPC public.upsert_clientes_whatsapp(org, jsonb[]) — upsert em BATCH,
--      SECURITY DEFINER, executável apenas pelo service_role (edge function).
--
-- NÃO APLICADA — aplicar junto com o deploy de evolution-history-sync.
-- ============================================================================

-- 1) normalize_phone_br — cria apenas se ainda não existir (espelho exato de
--    supabase/functions/_shared/phone.ts::normalizePhoneBR).
do $create_fn$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'normalize_phone_br'
  ) then
    execute $fn$
      create function public.normalize_phone_br(input text)
      returns text
      language plpgsql
      immutable
      as $body$
      declare
        d text;
      begin
        if input is null then
          return null;
        end if;
        d := regexp_replace(input, '\D', '', 'g');
        d := regexp_replace(d, '^0+', '');
        if length(d) < 8 then
          return null;
        end if;

        -- Remove DDI 55 pra inspecionar a parte nacional
        if left(d, 2) = '55' and length(d) in (12, 13) then
          d := substring(d from 3);
        end if;

        -- Nacional: DDD(2) + 8 dígitos (faltando o 9 de celular) → injeta o 9
        if length(d) = 10 and substring(d from 3 for 1) ~ '[6-9]' then
          d := left(d, 2) || '9' || substring(d from 3);
        end if;

        if length(d) in (10, 11) then
          d := '55' || d;
        end if;

        return d;
      end;
      $body$;
    $fn$;
  end if;
end
$create_fn$;

-- 2) Coluna gerada com o telefone canônico BR (55 + DDD + 9 + 8 dígitos)
alter table public.clientes
  add column if not exists telefone_normalizado text
    generated always as (public.normalize_phone_br(telefone)) stored;

comment on column public.clientes.telefone_normalizado is
  'Telefone canônico BR (normalize_phone_br). Chave lógica de dedup do import de WhatsApp (F6).';

-- 3) Última interação inbound do cliente no WhatsApp (histórico + futuro)
alter table public.clientes
  add column if not exists ultima_interacao_wa timestamptz;

comment on column public.clientes.ultima_interacao_wa is
  'MAX(timestamp) de mensagem INBOUND do cliente no WhatsApp (importado do histórico Evolution — F6).';

-- 4) Índice de lookup do upsert (ver cabeçalho: NÃO-unique de propósito)
create index if not exists idx_clientes_org_tel_norm
  on public.clientes (organization_id, telefone_normalizado);

-- 5) RPC de upsert em batch — chamada exclusivamente pela edge function
--    evolution-history-sync (service_role).
--    p_clientes: jsonb array de { telefone text, nome text|null,
--                                 ultima_interacao_wa timestamptz|null (ISO) }
create or replace function public.upsert_clientes_whatsapp(
  p_organization_id uuid,
  p_clientes jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  -- Serializa escritores da MESMA org (chunks de histórico podem chegar em
  -- paralelo): idempotência sem exigir UNIQUE index na base viva. O lock é
  -- liberado automaticamente no fim da transação.
  perform pg_advisory_xact_lock(hashtext('clientes_wa:' || p_organization_id::text));

  for r in
    select
      t.tel_norm,
      -- melhor nome do grupo = o mais longo não-vazio
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
    -- UPDATE primeiro (pode atingir mais de 1 linha se a base já tinha
    -- duplicatas pré-existentes — atualizamos todas, sem apagar nada).
    update public.clientes c
    set
      -- só preenche nome se o atual está vazio ou "parece telefone";
      -- nunca sobrescreve nome curado pelo salão.
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
        coalesce(r.nome, r.tel_norm),
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
$$;

-- Só o service_role (edge functions) pode executar — nunca o front.
revoke all on function public.upsert_clientes_whatsapp(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_clientes_whatsapp(uuid, jsonb) to service_role;
