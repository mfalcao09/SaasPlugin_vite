-- B4 / FASE 1 — o índice precisa ser NÃO-PARCIAL para servir de alvo do ON CONFLICT.
-- Aplicada em prod como `b4_fase1_indice_nao_parcial_on_conflict`.
-- SUCEDE: 20260722_b4_fase1_evolution_message_id_coluna.sql
--
-- ERRO MEDIDO: "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". O Postgres só aceita índice PARCIAL como alvo de ON CONFLICT se a
-- instrução repetir o mesmo predicado — e o PostgREST (que é quem emite o comando do
-- `upsert` do supabase-js) não tem como fazer isso.
--
-- Trocar por índice sem filtro é seguro e equivalente: por padrão o Postgres trata
-- NULLs como DISTINTOS num índice único, então mensagem sem `evolution_message_id`
-- (as do webchat web, por exemplo) continua podendo repetir à vontade.
--
-- PROVA depois desta migration: reprocessados os 4 maiores contatos, 60.677 linhas
-- reenviadas ao upsert, contagem 81.045 -> 81.045 (diferença 0), 0 duplicatas.
drop index if exists public.webchat_messages_evolution_msg_uniq;

create unique index if not exists webchat_messages_evolution_msg_uniq
  on public.webchat_messages (conversation_id, evolution_message_id);

comment on index public.webchat_messages_evolution_msg_uniq is
  'Alvo do ON CONFLICT do upsert da carga de legado. Nao-parcial de proposito: indice parcial nao serve de alvo para ON CONFLICT via PostgREST. NULL nao colide (NULLS DISTINCT).';
