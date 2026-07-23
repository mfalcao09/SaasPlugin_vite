-- ============================================================================
-- GATE do card C0.3 — isolamento multi-tenant
-- Critério binário do PRD §9: "SELECT cross-tenant retorna 0 linhas em teste
-- com 2 instituições". Qualquer linha vazada = REPROVA.
--
-- Uso:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/rls.test.sql
-- Esperado: todas as linhas com resultado = PASS.
-- Roda dentro de begin/rollback — não persiste nada.
-- ============================================================================

\set INST_A '11111111-1111-1111-1111-111111111111'
\set INST_B '22222222-2222-2222-2222-222222222222'
\set AUTH_A 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set AUTH_B 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

begin;

-- ---------------------------------------------------------------------------
-- Arranjo: 1 usuário, 1 lista e 1 norma em cada instituição
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  (:'AUTH_A', 'gestor.a@teste.local'),
  (:'AUTH_B', 'gestor.b@teste.local')
on conflict (id) do nothing;

insert into public.usuarios (auth_id, instituicao_id, nome, email, perfil) values
  (:'AUTH_A', :'INST_A', 'Gestor A', 'gestor.a@teste.local', 'gestor'),
  (:'AUTH_B', :'INST_B', 'Gestor B', 'gestor.b@teste.local', 'gestor')
on conflict do nothing;

insert into public.listas_disparo (instituicao_id, nome) values
  (:'INST_A', 'Boletim diario - A'),
  (:'INST_B', 'Boletim diario - B');

insert into public.normas (instituicao_id, tipo, numero, ano, orgao_emissor, ementa) values
  (:'INST_A', 'Resolucao', '001', 2026, 'Tribunal de Teste A', 'Norma privada de A'),
  (:'INST_B', 'Resolucao', '001', 2026, 'Tribunal de Teste B', 'Norma privada de B');

-- ---------------------------------------------------------------------------
-- Papel do usuário A
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

-- T1 — A enxerga a própria lista
select case when count(*) = 1 then 'PASS' else 'FAIL' end as resultado,
       'T1: A ve a propria lista de disparo' as teste
  from public.listas_disparo;

-- T2 — A NÃO enxerga nada de B  ← o critério binário do card
select case when count(*) = 0 then 'PASS' else 'FAIL' end as resultado,
       'T2: A nao ve listas de B (cross-tenant = 0 linhas)' as teste
  from public.listas_disparo
 where instituicao_id = :'INST_B';

-- T3 — mesma prova no acervo normativo
select case when count(*) = 0 then 'PASS' else 'FAIL' end as resultado,
       'T3: A nao ve normas de B' as teste
  from public.normas
 where instituicao_id = :'INST_B';

-- T4 — A não consegue ESCREVER no tenant de B (with check da policy)
do $$
begin
  insert into public.listas_disparo (instituicao_id, nome)
  values ('22222222-2222-2222-2222-222222222222', 'Invasao');
  raise exception 'FAIL T4: insert cross-tenant foi aceito';
exception
  when insufficient_privilege or check_violation then
    raise notice 'PASS T4: insert cross-tenant bloqueado pela policy';
end $$;

-- T5 — o acervo público (fontes) É visível: 6 fontes semeadas
select case when count(*) = 6 then 'PASS' else 'FAIL' end as resultado,
       'T5: fontes publicas visiveis para autenticado' as teste
  from public.fontes_diarios;

-- ---------------------------------------------------------------------------
-- Usuário B — a prova precisa valer nos dois sentidos
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

-- T6 — B não enxerga nada de A
select case when count(*) = 0 then 'PASS' else 'FAIL' end as resultado,
       'T6: B nao ve listas de A (simetria)' as teste
  from public.listas_disparo
 where instituicao_id = :'INST_A';

-- T7 — B enxerga exatamente a própria lista
select case when count(*) = 1 then 'PASS' else 'FAIL' end as resultado,
       'T7: B ve apenas a propria lista' as teste
  from public.listas_disparo;

-- ---------------------------------------------------------------------------
-- Provas estruturais (§4.3 e §5.4) — independem de tenant
-- ---------------------------------------------------------------------------
reset role;

-- T8 — relação normativa nasce PROPOSTA. A IA nunca aprova sozinha.
select case when (select column_default like '%proposta%'
                    from information_schema.columns
                   where table_name = 'norma_relacoes' and column_name = 'status')
            then 'PASS' else 'FAIL' end as resultado,
       'T8: norma_relacoes.status default = proposta' as teste;

-- T9 — fonte estruturada entra direto; IA com campo nulo cai na revisão
insert into public.edicoes (fonte_id, data_publicacao, url_original, numero)
  select id, date '2026-07-22', url_base || '/teste', 'T9'
    from public.fontes_diarios where sigla = 'DOU';

insert into public.atos (edicao_id, fonte_id, data_publicacao, origem_extracao, tipo, numero, ano, data_ato)
  select e.id, e.fonte_id, e.data_publicacao, 'xml', 'Portaria', '123', 2026, date '2026-07-21'
    from public.edicoes e where e.numero = 'T9';

insert into public.atos (edicao_id, fonte_id, data_publicacao, origem_extracao, tipo, numero)
  select e.id, e.fonte_id, e.data_publicacao, 'ia', 'Portaria', null
    from public.edicoes e where e.numero = 'T9';

select case when count(*) filter (where a.origem_extracao = 'xml' and a.status = 'ok')      = 1
             and count(*) filter (where a.origem_extracao = 'ia'  and a.status = 'revisao') = 1
            then 'PASS' else 'FAIL' end as resultado,
       'T9: xml=ok direto | ia com numero nulo=revisao' as teste
  from public.atos a
  join public.edicoes e on e.id = a.edicao_id
 where e.numero = 'T9';

-- T10 — fonte estruturada recebe confiança 1.0 automaticamente (§5.4)
select case when count(*) = 1 then 'PASS' else 'FAIL' end as resultado,
       'T10: origem xml recebe confianca_extracao = 1.00' as teste
  from public.atos a
  join public.edicoes e on e.id = a.edicao_id
 where e.numero = 'T9' and a.origem_extracao = 'xml' and a.confianca_extracao = 1.00;

-- ---------------------------------------------------------------------------
-- T11/T12 — VIEWS. Adicionados apos vazamento real encontrado no card C1.3:
-- view sem security_invoker roda com privilegio do DONO e IGNORA a RLS da
-- tabela base. O gate anterior so testava TABELAS e por isso passou 10/10
-- com o isolamento furado. Um gate so protege a superficie que mede.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select case when (select count(*) from public.fila_revisao_relacoes)
                 = (select count(*) from public.norma_relacoes where status = 'proposta')
            then 'PASS' else 'FAIL' end as resultado,
       'T11: view fila_revisao_relacoes nao expoe mais que a tabela (cross-tenant)' as teste;

reset role;

select case when count(*) = 0 then 'PASS' else 'FAIL' end as resultado,
       'T12: nenhuma view de public sem security_invoker (' ||
       coalesce(string_agg(view_name, ', '), 'nenhuma') || ')' as teste
  from public.views_sem_security_invoker();

rollback;
