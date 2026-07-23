-- B4 / FASE 2 — a tag de ASSUNTO no `tipo_contato`.
-- Aplicada em prod como `b4_fase2_tipo_contato_assunto`.
-- SUCEDE: 20260722_b4_carteira_classificacao_camada1.sql (onde a constraint nasceu).
--
-- DECISÃO DO MARCELO (22/07): "pessoal é estado/classificação, uma tag, assim como
-- cliente". Ou seja: MESMO campo que `cliente`, não um novo `carteira_estado`. Contato
-- pessoal continua VISÍVEL na carteira; o que muda é que campanha não o alcança — o
-- gate vive em `salon-automation-run` (Fase 3).
--
-- Os três eixos convivem no mesmo campo, cada um com seus valores:
--   Eixo 1 · forma    (determinístico) → ruido, grupo, nao_br, lid
--   Eixo 2 · relação  (transacional)   → cliente, lead
--   Eixo 3 · assunto  (agente)         → pessoal, misto, indefinido
--
-- `misto` existe porque a sogra que também faz a unha no salão é as duas coisas.
-- `indefinido` é o repouso de quem ainda não foi classificado: NÃO impede visualização,
-- só disparo — que exige assunto resolvido.
--
-- PROVA (sintéticos, inseridos e removidos):
--   2.1 valor inválido ('banana')              -> rejeitado pela constraint ✅
--   3.1 principal + cliente                    -> 📨 RECEBE
--       principal + pessoal  (a sogra)         -> 🚫 BLOQUEADO
--       lixeira   + lid                        -> 🚫 BLOQUEADO
--       a_revisar + indefinido                 -> 🚫 BLOQUEADO
alter table public.clientes drop constraint if exists clientes_tipo_contato_check;

alter table public.clientes add constraint clientes_tipo_contato_check
  check (tipo_contato = any (array[
    -- relação comercial (Eixo 2 / decisão humana)
    'cliente'::text, 'lead'::text,
    -- assunto da conversa (Eixo 3 / agente)
    'pessoal'::text, 'misto'::text, 'indefinido'::text,
    -- forma do contato (Eixo 1 / determinístico)
    'ruido'::text, 'grupo'::text, 'nao_br'::text, 'lid'::text
  ]));

comment on column public.clientes.tipo_contato is
  'O QUE o contato e. Eixo1 forma: ruido/grupo/nao_br/lid. Eixo2 relacao: cliente/lead. Eixo3 assunto (agente): pessoal/misto/indefinido.';

-- Contrato do classificador, gravado em sinais_wa. Documentado no proprio banco para
-- que a forma seja unica em todo lugar que grava ou le:
--   {"assunto":"pessoal","confianca":0.86,"versao":"v1",
--    "evidencias":["em 3 anos nunca citou servico","ultimas 12 msgs sobre o neto"],
--    "sinais":{"pediu_horario":false,"perguntou_preco":false,"servicos_citados":[]},
--    "janela":{"msgs_lidas":40,"de":"2025-06-17","ate":"2026-07-21"}}
comment on column public.clientes.sinais_wa is
  'Saida do classificador do Eixo 3: {assunto, confianca, versao, evidencias[], sinais{}, janela{}}. Evidencia e obrigatoria — a analise de carteira e vendida, e a dona vai perguntar o porque.';
