-- ============================================================================
-- GATE do card C1.4a — camada de dados de Publicações (PRD v2.1 §7.2.3)
--
-- Prova, em SQL puro, o contrato que src/services/publicacoes.mjs gera:
--   full-text em português via websearch_to_tsquery (com frase entre aspas),
--   filtro de período e de fonte, e a trava dura "status='revisao' nunca
--   aparece na consulta padrão de Publicações" (§4.5/§6.2) — que é uma regra
--   de QUERY, não de RLS (o acervo de atos é de leitura compartilhada; a
--   Fila de Revisão lê a mesma tabela filtrando o status oposto).
--
-- Uso:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/publicacoes.test.sql
-- Esperado: todas as linhas com resultado = PASS.
-- Dados 100% sintéticos, inseridos aqui — não depende do seed da migration.
-- Roda dentro de begin/rollback — não persiste nada.
-- ============================================================================

\set AUTH_T 'cccccccc-cccc-cccc-cccc-cccccccccccc'

begin;

-- ---------------------------------------------------------------------------
-- Arranjo: 1 usuário autenticado (testes de RLS) + 2 fontes sintéticas + 1
-- edição por fonte + 5 atos cobrindo cada cenário abaixo.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  (:'AUTH_T', 'leitor.teste@local')
on conflict (id) do nothing;

insert into public.fontes_diarios (nome, sigla, url_base, esfera, modo_acesso, parser_key) values
  ('Fonte Teste A — Publicações', 'PUBTEST-A', 'https://teste.local/a', 'judiciario', 'scrape', 'pubtest-a'),
  ('Fonte Teste B — Publicações', 'PUBTEST-B', 'https://teste.local/b', 'judiciario', 'scrape', 'pubtest-b');

insert into public.edicoes (fonte_id, data_publicacao, url_original, numero)
  select id, date '2026-07-10', url_base || '/edicao-1', 'ED-A'
    from public.fontes_diarios where sigla = 'PUBTEST-A';
insert into public.edicoes (fonte_id, data_publicacao, url_original, numero)
  select id, date '2026-07-15', url_base || '/edicao-1', 'ED-B'
    from public.fontes_diarios where sigla = 'PUBTEST-B';

-- Ato 1 — fonte A, contém a palavra "nomeação" na ementa (T1)
insert into public.atos
  (edicao_id, fonte_id, data_publicacao, origem_extracao, tipo, numero, ano, data_ato, ementa)
  select e.id, e.fonte_id, e.data_publicacao, 'xml', 'Portaria', '001', 2026, e.data_publicacao,
         'Dispõe sobre a nomeação de servidores públicos aprovados em concurso'
    from public.edicoes e join public.fontes_diarios f on f.id = e.fonte_id
   where f.sigla = 'PUBTEST-A';

-- Ato 2 — fonte A, contém a FRASE "processo seletivo" adjacente (T2 — match esperado)
insert into public.atos
  (edicao_id, fonte_id, data_publicacao, origem_extracao, tipo, numero, ano, data_ato, ementa)
  select e.id, e.fonte_id, e.data_publicacao, 'xml', 'Edital', '002', 2026, e.data_publicacao,
         'Abre processo seletivo simplificado para contratação temporária'
    from public.edicoes e join public.fontes_diarios f on f.id = e.fonte_id
   where f.sigla = 'PUBTEST-A';

-- Ato 3 — fonte A, contém as MESMAS palavras soltas ("seletivo"...."processo"),
-- fora de ordem e não adjacentes — prova que busca com aspas é frase exata,
-- não bag-of-words (T2 — NÃO deve casar)
insert into public.atos
  (edicao_id, fonte_id, data_publicacao, origem_extracao, tipo, numero, ano, data_ato, ementa)
  select e.id, e.fonte_id, e.data_publicacao, 'xml', 'Portaria', '003', 2026, e.data_publicacao,
         'Homologa resultado seletivo e determina o arquivamento do processo'
    from public.edicoes e join public.fontes_diarios f on f.id = e.fonte_id
   where f.sigla = 'PUBTEST-A';

-- Ato 4 — fonte B, fora do período de teste (T3/T4 — filtro de período e de fonte)
insert into public.atos
  (edicao_id, fonte_id, data_publicacao, origem_extracao, tipo, numero, ano, data_ato, ementa)
  select e.id, e.fonte_id, e.data_publicacao, 'xml', 'Resolução', '004', 2026, e.data_publicacao,
         'Regulamenta procedimento administrativo interno'
    from public.edicoes e join public.fontes_diarios f on f.id = e.fonte_id
   where f.sigla = 'PUBTEST-B';

-- Ato 5 — fonte A, origem IA com campo obrigatório (numero) faltando: o
-- TRIGGER da migration (atos_indexar_e_triar) tem que classificar sozinho
-- como status='revisao' — não fabricamos o status na mão (T5).
insert into public.atos
  (edicao_id, fonte_id, data_publicacao, origem_extracao, tipo, ano, data_ato, ementa)
  select e.id, e.fonte_id, e.data_publicacao, 'ia', 'Portaria', 2026, e.data_publicacao,
         'Ato de origem automatica pendente de revisao humana — campo obrigatorio ausente'
    from public.edicoes e join public.fontes_diarios f on f.id = e.fonte_id
   where f.sigla = 'PUBTEST-A';

-- ---------------------------------------------------------------------------
-- T1 — full-text encontra ato por palavra da ementa
-- ---------------------------------------------------------------------------
select case when count(*) = 1 then 'PASS' else 'FAIL' end as resultado,
       'T1: busca por palavra da ementa (nomeacao) encontra o ato certo' as teste
  from public.atos
 where conteudo_ts @@ websearch_to_tsquery('portuguese', 'nomeação')
   and status <> 'revisao';

-- ---------------------------------------------------------------------------
-- T2 — busca com aspas ("termo exato") funciona via websearch_to_tsquery:
-- só o ato com a frase ADJACENTE casa, não o que tem as mesmas palavras soltas
-- ---------------------------------------------------------------------------
select case when count(*) = 1 and bool_or(numero = '002') then 'PASS' else 'FAIL' end as resultado,
       'T2: busca com aspas casa a frase exata (nao bag-of-words)' as teste
  from public.atos
 where conteudo_ts @@ websearch_to_tsquery('portuguese', '"processo seletivo"')
   and status <> 'revisao'
   and fonte_id = (select id from public.fontes_diarios where sigla = 'PUBTEST-A');

-- ---------------------------------------------------------------------------
-- T3 — filtro por período funciona
-- ---------------------------------------------------------------------------
select case when count(*) = 3 then 'PASS' else 'FAIL' end as resultado,
       'T3: filtro de periodo (2026-07-10 a 2026-07-12) traz so os atos nessa janela' as teste
  from public.atos
 where data_publicacao >= date '2026-07-10'
   and data_publicacao <= date '2026-07-12'
   and status <> 'revisao';

-- ---------------------------------------------------------------------------
-- T4 — filtro por fonte funciona
-- ---------------------------------------------------------------------------
select case when count(*) = 1 then 'PASS' else 'FAIL' end as resultado,
       'T4: filtro por fonte (sigla PUBTEST-B) traz so o ato da fonte B' as teste
  from public.atos a
  join public.fontes_diarios f on f.id = a.fonte_id
 where f.sigla = 'PUBTEST-B'
   and a.status <> 'revisao';

-- ---------------------------------------------------------------------------
-- T5 — ato com status='revisao' NÃO retorna na consulta padrão de publicações
-- ---------------------------------------------------------------------------
select case when status = 'revisao' then 'PASS' else 'FAIL' end as resultado,
       'T5a (arranjo): trigger classificou o ato 5 como revisao (numero ausente)' as teste
  from public.atos
 where numero is null
   and fonte_id = (select id from public.fontes_diarios where sigla = 'PUBTEST-A');

select case when count(*) = 4 then 'PASS' else 'FAIL' end as resultado,
       'T5b (arranjo): sem o filtro status<>revisao a fonte A tem 4 atos (inclui o em revisao)' as teste
  from public.atos
 where fonte_id = (select id from public.fontes_diarios where sigla = 'PUBTEST-A');

select case when count(*) = 3 then 'PASS' else 'FAIL' end as resultado,
       'T5: consulta padrao (status<>revisao) traz so 3 atos da fonte A — exclui o em revisao' as teste
  from public.atos
 where fonte_id = (select id from public.fontes_diarios where sigla = 'PUBTEST-A')
   and status <> 'revisao';

-- ---------------------------------------------------------------------------
-- T6/T7 — RLS: acervo compartilhado, leitura funciona para usuário autenticado
-- (e falha sem JWT válido — prova que depende de autenticação de verdade,
-- não só do role 'authenticated')
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

select case when count(*) = 5 then 'PASS' else 'FAIL' end as resultado,
       'T6: usuario autenticado LE o acervo de atos (compartilhado, nao tenant-scoped)' as teste
  from public.atos
 where fonte_id in (select id from public.fontes_diarios where sigla like 'PUBTEST-%');

select case when count(*) = 2 then 'PASS' else 'FAIL' end as resultado,
       'T6b: usuario autenticado LE as fontes de diarios' as teste
  from public.fontes_diarios where sigla like 'PUBTEST-%';

-- `reset` de um GUC custom (placeholder) NÃO volta pra NULL — o Postgres
-- reverte pra '' (string vazia), e '' não é JSON válido: o cast em
-- auth.uid() lançaria erro e abortaria a transação antes deste teste
-- rodar. `'{}'` é JSON válido sem 'sub' → auth.uid() = null do mesmo jeito,
-- sem quebrar o parse.
set local request.jwt.claims = '{}';

select case when count(*) = 0 then 'PASS' else 'FAIL' end as resultado,
       'T7: sem JWT valido (auth.uid() nulo) a policy bloqueia a leitura de atos' as teste
  from public.atos
 where fonte_id in (select id from public.fontes_diarios where sigla like 'PUBTEST-%');

reset role;

rollback;
