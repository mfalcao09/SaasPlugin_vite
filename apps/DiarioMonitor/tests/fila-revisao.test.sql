-- ============================================================================
-- GATE do card C1.3 — fila de revisão (PRD §6.2)
-- Critério binário do PRD: "Ato com numero nulo NÃO aparece em nenhuma lista
-- de disparo." Princípio §6.2: a IA PROPÕE, o humano DISPÕE.
--
-- Uso:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/fila-revisao.test.sql
-- Esperado: todas as linhas com resultado = PASS.
-- Roda dentro de begin/rollback — não persiste nada. Mesmo padrão de
-- tests/rls.test.sql (script gêmeo: scripts/test-fila-revisao.sh).
-- ============================================================================

\set INST_A '11111111-1111-1111-1111-111111111111'
\set INST_B '22222222-2222-2222-2222-222222222222'
\set AUTH_A 'cccccccc-cccc-cccc-cccc-cccccccccccc'
\set AUTH_B 'dddddddd-dddd-dddd-dddd-dddddddddddd'

begin;

-- ---------------------------------------------------------------------------
-- Arranjo
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  (:'AUTH_A', 'revisor.a@teste.local'),
  (:'AUTH_B', 'revisor.b@teste.local')
on conflict (id) do nothing;

-- perfil 'revisor': é quem aprova relação normativa (migration §1, distinto
-- de 'gestor' que monta lista de disparo — separação de alçada §4.1).
insert into public.usuarios (auth_id, instituicao_id, nome, email, perfil) values
  (:'AUTH_A', :'INST_A', 'Revisor A', 'revisor.a@teste.local', 'revisor'),
  (:'AUTH_B', :'INST_B', 'Revisor B', 'revisor.b@teste.local', 'revisor')
on conflict do nothing;

-- 1 edição de âncora (fonte DOU já semeada pela migration) para os atos.
insert into public.edicoes (fonte_id, data_publicacao, url_original, numero)
  select id, date '2026-07-20', url_base || '/fila-revisao-teste', 'FR1'
    from public.fontes_diarios where sigla = 'DOU';

-- ato_xml: fonte estruturada, completo -> status 'ok' + confianca 1.00
insert into public.atos
  (edicao_id, fonte_id, data_publicacao, origem_extracao, tipo, numero, ano, data_ato, ementa)
  select e.id, e.fonte_id, e.data_publicacao, 'xml', 'Portaria', '500', 2026,
         date '2026-07-19', 'Ato xml completo'
    from public.edicoes e where e.numero = 'FR1';

-- ato_ia_incompleto: IA, numero NULL -> trigger marca 'revisao' (o caso
-- central do card: isto NUNCA pode chegar em disparo)
insert into public.atos
  (edicao_id, fonte_id, data_publicacao, origem_extracao, tipo, numero, ementa)
  select e.id, e.fonte_id, e.data_publicacao, 'ia', 'Portaria', null,
         'Ato ia com numero ausente'
    from public.edicoes e where e.numero = 'FR1';

-- ato_ia_completo: IA mas com todos os campos críticos -> permanece 'ok'
-- (prova que o filtro certo é por STATUS, não por origem_extracao)
insert into public.atos
  (edicao_id, fonte_id, data_publicacao, origem_extracao, tipo, numero, ano, data_ato, ementa)
  select e.id, e.fonte_id, e.data_publicacao, 'ia', 'Portaria', '501', 2026,
         date '2026-07-19', 'Ato ia completo'
    from public.edicoes e where e.numero = 'FR1';

insert into public.normas (instituicao_id, tipo, numero, ano, orgao_emissor, ementa) values
  (:'INST_A', 'Resolucao', 'FR-A1', 2026, 'Tribunal de Teste A', 'Norma A para fila de revisao'),
  (:'INST_B', 'Resolucao', 'FR-B1', 2026, 'Tribunal de Teste B', 'Norma B para fila de revisao');

-- relacao_A_proposta: instituição A, aguardando revisor (o caso "fila")
insert into public.norma_relacoes (instituicao_id, ato_origem_id, norma_destino_id, tipo, proposta_por, confianca)
  select :'INST_A', a.id, n.id, 'cria', 'ia', 0.62
    from public.atos a, public.normas n
   where a.numero = '500' and n.numero = 'FR-A1' and n.instituicao_id = :'INST_A';

-- relacao_A_para_aprovar: instituição A, vai ser aprovada no T5
insert into public.norma_relacoes (instituicao_id, ato_origem_id, norma_destino_id, tipo, proposta_por, confianca)
  select :'INST_A', a.id, n.id, 'altera', 'ia', 0.81
    from public.atos a, public.normas n
   where a.numero = '501' and n.numero = 'FR-A1' and n.instituicao_id = :'INST_A';

-- relacao_B_proposta: instituição B, mesma forma — para provar isolamento
insert into public.norma_relacoes (instituicao_id, ato_origem_id, norma_destino_id, tipo, proposta_por, confianca)
  select :'INST_B', a.id, n.id, 'regulamenta', 'ia', 0.55
    from public.atos a, public.normas n
   where a.numero = '500' and n.numero = 'FR-B1' and n.instituicao_id = :'INST_B';

-- ---------------------------------------------------------------------------
-- T1 — ato origem_extracao='ia' + numero nulo entra em revisão automaticamente
-- ---------------------------------------------------------------------------
select case when count(*) = 1 then 'PASS' else 'FAIL' end as resultado,
       'T1: ia + numero nulo -> status=revisao (automatico, via trigger)' as teste
  from public.atos a
  join public.edicoes e on e.id = a.edicao_id
 where e.numero = 'FR1' and a.origem_extracao = 'ia' and a.numero is null
   and a.status = 'revisao';

-- ---------------------------------------------------------------------------
-- T2 — ato origem_extracao='xml' NAO vai para revisão e ganha confianca 1.00
-- ---------------------------------------------------------------------------
select case when count(*) = 1 then 'PASS' else 'FAIL' end as resultado,
       'T2: xml -> status=ok direto + confianca_extracao=1.00' as teste
  from public.atos a
  join public.edicoes e on e.id = a.edicao_id
 where e.numero = 'FR1' and a.origem_extracao = 'xml' and a.numero = '500'
   and a.status = 'ok' and a.confianca_extracao = 1.00;

-- ---------------------------------------------------------------------------
-- T3 — a view fila_revisao_relacoes só mostra norma_relacoes com
-- status='proposta' (checagem estrutural da definição da view; roda como
-- superuser para isolar a semântica do WHERE de qualquer efeito de RLS).
-- A view não expõe a coluna `status` (só usa no WHERE interno), então a
-- prova é: (a) todo id da view corresponde a uma relacao status=proposta,
-- e (b) a contagem bate — nenhuma relacao proposta fica de fora e nenhuma
-- não-proposta entra.
-- ---------------------------------------------------------------------------
select case when count(*) filter (where r.status is distinct from 'proposta') = 0
             and count(*) = (select count(*) from public.norma_relacoes where status = 'proposta')
            then 'PASS' else 'FAIL' end as resultado,
       'T3: fila_revisao_relacoes so contem status=proposta' as teste
  from public.fila_revisao_relacoes v
  join public.norma_relacoes r on r.id = v.id;

-- ---------------------------------------------------------------------------
-- T4 — O TESTE CENTRAL: a query de produção (mesmo shape de
-- atosElegiveisParaDisparo em src/services/revisao.mjs, allowlist
-- status='ok') NAO retorna atos com status='revisao'. Roda como usuário
-- autenticado real, como aconteceria em produção.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

select case when count(*) filter (where status = 'revisao') = 0
             and count(*) filter (where numero = '500') = 1
             and count(*) filter (where numero = '501') = 1
            then 'PASS' else 'FAIL' end as resultado,
       'T4 (CENTRAL): query de lista de disparo (status=ok) exclui revisao' as teste
  from (
    -- réplica literal do shape de atosElegiveisParaDisparo()
    select a.id, a.numero, a.status
      from public.atos a
     where a.status = 'ok'
       and a.fonte_id = (select id from public.fontes_diarios where sigla = 'DOU')
  ) disparo;

-- controle negativo: confirma que o ato de numero nulo de fato existe e SÓ
-- não aparece por causa do filtro de status (não por acidente/typo no teste)
select case when count(*) = 1 then 'PASS' else 'FAIL' end as resultado,
       'T4b: controle - o ato revisao existe no acervo (nao sumiu por engano)' as teste
  from public.atos where origem_extracao = 'ia' and numero is null and status = 'revisao';

-- ---------------------------------------------------------------------------
-- T5 — aprovar uma norma_relacao (status -> 'aprovada') a tira da fila.
-- Reproduz exatamente o statement de aprovarRelacao() em revisao.mjs.
-- Governança (§4.3): so roda sob role privilegiado — auditoria nao tem
-- policy de INSERT para 'authenticated' (ver T-governanca abaixo).
-- ---------------------------------------------------------------------------
reset role;

with alvo as (
  select r.id as relacao_id, u.id as usuario_id
    from public.norma_relacoes r
    join public.atos a on a.id = r.ato_origem_id
    join public.usuarios u on u.instituicao_id = r.instituicao_id and u.perfil = 'revisor'
   where r.instituicao_id = :'INST_A' and a.numero = '501'
),
antes as (
  select id, instituicao_id, status from public.norma_relacoes
   where id = (select relacao_id from alvo) and status = 'proposta'
   for update
),
atualizado as (
  update public.norma_relacoes r
     set status = 'aprovada', revisada_por = (select usuario_id from alvo), revisada_em = now()
    from antes
   where r.id = antes.id
  returning r.id, r.instituicao_id, r.status, r.revisada_por, r.revisada_em,
            antes.status as status_anterior
)
insert into public.auditoria
  (instituicao_id, usuario_id, entidade, entidade_id, acao, valor_anterior, valor_novo, em)
select instituicao_id, (select usuario_id from alvo), 'norma_relacoes', id::text, 'aprovar_relacao',
       jsonb_build_object('status', status_anterior),
       jsonb_build_object('status', status, 'revisada_por', revisada_por, 'revisada_em', revisada_em),
       now()
  from atualizado;

select case when count(*) = 1 then 'PASS' else 'FAIL' end as resultado,
       'T5a: aprovar registra 1 linha em auditoria (quem+quando)' as teste
  from public.auditoria
 where entidade = 'norma_relacoes' and acao = 'aprovar_relacao';

select case when count(*) = 0 then 'PASS' else 'FAIL' end as resultado,
       'T5b: relacao aprovada SAI da fila (status=proposta)' as teste
  from public.norma_relacoes r
  join public.atos a on a.id = r.ato_origem_id
 where r.instituicao_id = :'INST_A' and a.numero = '501' and r.status = 'proposta';

select case when count(*) = 1 then 'PASS' else 'FAIL' end as resultado,
       'T5c: relacao aprovada tem status=aprovada e revisada_por/em preenchidos' as teste
  from public.norma_relacoes r
  join public.atos a on a.id = r.ato_origem_id
 where r.instituicao_id = :'INST_A' and a.numero = '501'
   and r.status = 'aprovada' and r.revisada_por is not null and r.revisada_em is not null;

-- relação de A que continua proposta (nunca tocada) permanece na fila
select case when count(*) = 1 then 'PASS' else 'FAIL' end as resultado,
       'T5d: outra relacao de A (nao aprovada) continua na fila' as teste
  from public.norma_relacoes r
  join public.atos a on a.id = r.ato_origem_id
 where r.instituicao_id = :'INST_A' and a.numero = '500' and r.status = 'proposta';

-- ---------------------------------------------------------------------------
-- T-governanca — aprovar/rejeitar SOB O ROLE 'authenticated' é bloqueado:
-- auditoria tem RLS habilitado sem policy de INSERT para authenticated
-- (migration §6). Prova que "IA propoe, humano dispoe" nao pode ser
-- contornado por um client comum sem deixar rastro.
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true);

  with alvo as (
    select r.id as relacao_id, u.id as usuario_id
      from public.norma_relacoes r
      join public.atos a on a.id = r.ato_origem_id
      join public.usuarios u on u.instituicao_id = r.instituicao_id and u.perfil = 'revisor'
     where r.instituicao_id = '11111111-1111-1111-1111-111111111111' and a.numero = '500'
  ),
  antes as (
    select id, instituicao_id, status from public.norma_relacoes
     where id = (select relacao_id from alvo) and status = 'proposta'
     for update
  ),
  atualizado as (
    update public.norma_relacoes r
       set status = 'aprovada', revisada_por = (select usuario_id from alvo), revisada_em = now()
      from antes
     where r.id = antes.id
    returning r.id, r.instituicao_id, r.status, antes.status as status_anterior
  )
  insert into public.auditoria
    (instituicao_id, usuario_id, entidade, entidade_id, acao, valor_anterior, valor_novo, em)
  select instituicao_id, (select usuario_id from alvo), 'norma_relacoes', id::text, 'aprovar_relacao',
         jsonb_build_object('status', status_anterior),
         jsonb_build_object('status', status), now()
    from atualizado;

  raise exception 'FAIL T-governanca: authenticated conseguiu escrever em auditoria (deveria ser bloqueado)';
exception
  when insufficient_privilege then
    raise notice 'PASS T-governanca: aprovar/rejeitar sob authenticated bloqueado (sem policy de INSERT em auditoria)';
end $$;

reset role;

-- confirma que o bloqueio foi atômico: o UPDATE também não vazou sem o audit
select case when count(*) = 1 then 'PASS' else 'FAIL' end as resultado,
       'T-governanca-b: relacao continua proposta apos tentativa bloqueada (nada committou)' as teste
  from public.norma_relacoes r
  join public.atos a on a.id = r.ato_origem_id
 where r.instituicao_id = :'INST_A' and a.numero = '500' and r.status = 'proposta';

-- ---------------------------------------------------------------------------
-- T6/T7 — RLS: a fila de um tenant não vaza para outro.
-- Consulta DIRETO na tabela norma_relacoes com filtro explícito de
-- instituicao_id — o mesmo padrão de listarFilaRevisao() em revisao.mjs.
-- (NÃO testamos isolamento via a view crua: achado de segurança documentado
-- no topo de revisao.mjs — a view bypassa RLS porque é dona de um role
-- privilegiado; por isso o serviço nunca a usa sem filtro, e o teste segue
-- o mesmo caminho seguro que o serviço usa de fato.)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

select case when count(*) = 0 then 'PASS' else 'FAIL' end as resultado,
       'T6: A nao ve relacoes propostas de B (fila direta na tabela)' as teste
  from public.norma_relacoes
 where instituicao_id = :'INST_B' and status = 'proposta';

select case when count(*) = 1 then 'PASS' else 'FAIL' end as resultado,
       'T6b: A ve exatamente a propria relacao proposta restante' as teste
  from public.norma_relacoes
 where instituicao_id = :'INST_A' and status = 'proposta';

set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';

select case when count(*) = 0 then 'PASS' else 'FAIL' end as resultado,
       'T7: B nao ve relacoes propostas de A (simetria)' as teste
  from public.norma_relacoes
 where instituicao_id = :'INST_A' and status = 'proposta';

select case when count(*) = 1 then 'PASS' else 'FAIL' end as resultado,
       'T7b: B ve exatamente a propria relacao proposta' as teste
  from public.norma_relacoes
 where instituicao_id = :'INST_B' and status = 'proposta';

reset role;

rollback;
