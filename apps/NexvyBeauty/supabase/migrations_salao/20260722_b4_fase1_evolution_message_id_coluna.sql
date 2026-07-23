-- B4 / FASE 1 — idempotência vira garantia do banco, não trabalho da aplicação.
-- Aplicada em prod como `b4_fase1_evolution_message_id_coluna`.
--
-- O PROBLEMA MEDIDO: o carregador buscava os `evolution_message_id` já existentes da
-- conversa para filtrar antes de inserir. Funcionava para contato pequeno e FALHAVA
-- para contato grande: o PostgREST tem teto próprio de linhas, então numa conversa de
-- 37.848 mensagens o conjunto voltava incompleto, o filtro deixava passar o que já
-- existia, e o insert batia no índice único derrubando o contato inteiro. Os 4 únicos
-- contatos que falharam eram justamente os maiores (39.236 e 21.444 mensagens).
--
-- Esse mesmo passo era também a causa do timeout ao reprocessar contato grande.
--
-- A CORREÇÃO: promover o id do Evolution a COLUNA REAL (generated stored). Com ela,
-- o `upsert ... ignoreDuplicates` resolve no próprio insert — o passo de leitura
-- prévia deixa de existir, e a idempotência para de depender de a aplicação lembrar
-- de fazer a coisa certa.
--
-- Verificado antes de criar o índice sem filtro de direção: 0 colisões entre direções
-- (um id de mensagem do WhatsApp é único, nunca aparece como inbound E outbound).
alter table public.webchat_messages
  add column if not exists evolution_message_id text
  generated always as (metadata ->> 'evolution_message_id') stored;

comment on column public.webchat_messages.evolution_message_id is
  'ID da mensagem no Evolution, promovido de metadata para coluna real: e o alvo de conflito do upsert que garante idempotencia da carga do legado.';
