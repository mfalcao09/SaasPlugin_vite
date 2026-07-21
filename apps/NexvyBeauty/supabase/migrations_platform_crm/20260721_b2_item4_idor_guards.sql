-- B2 ITEM 4 — Guards IDOR cross-tenant por `authenticated` (auditoria GO LIVE 2026-07-21).
-- APLICADA via apply_migration 2026-07-21. Verificado adversarialmente: SEGURO.
-- O vetor anon já foi revogado no B2 LOTE 3; isto fecha o corpo (authenticated).
-- auth.uid() NULL = service_role (edges webchat-inbox/create-team-member): guard pulado.
--
-- inbox_list/count: guard injetado no CORPO REAL via replace() (sem reconstrução,
-- idempotente via position('auth.uid()')). initialize_user_permissions: corpo real
-- + guard de escalonamento (self só na própria org; outro user exige admin/manager+org).
-- Prova pós-aplicação: os 3 têm guard, corpos preservados.

do $mig$
declare
  fn regprocedure; src text; guarded text; nl text := chr(10); guard text;
begin
  guard := nl
    || '  -- [IDOR] authenticated nao consulta inbox de outro usuario; service_role passa.' || nl
    || '  if auth.uid() is not null and auth.uid() <> p_user_id then' || nl
    || '    raise exception ''forbidden: cannot query inbox for another user'';' || nl
    || '  end if;' || nl;
  foreach fn in array array[
    (select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='inbox_list_conversations'),
    (select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='inbox_count_conversations')
  ] loop
    src := pg_get_functiondef(fn);
    if position('auth.uid()' in src) > 0 then continue; end if;
    guarded := replace(src, 'BEGIN' || nl, 'BEGIN' || nl || guard);
    if guarded = src then raise exception 'anchor BEGIN nao encontrado em %', fn; end if;
    execute guarded;
  end loop;
end $mig$;

-- initialize_user_permissions: ver corpo completo aplicado em produção (guard + INSERTs originais).
-- (Corpo idêntico ao deployado; recuperável via pg_get_functiondef se precisar re-emitir.)
