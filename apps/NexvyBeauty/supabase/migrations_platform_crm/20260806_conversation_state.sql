-- 20260806 — MEMÓRIA DE CURTO PRAZO DA CONVERSA (PR-A)
--
-- PRD: apps/NexvyBeauty/tasks/PRD-CONVERSATION-STATE-2026-08-06.md
-- Módulo: supabase/functions/_shared/conversation-state.ts (+ .test.ts, 17 verdes)
--
-- Problema medido em produção (2026-08-05/06): a agente não tem ESTADO, tem
-- TRANSCRIÇÃO. A cada turno um flash re-deriva do histórico bruto "o que já
-- ofereci / o que ela recusou / se já me apresentei", e re-deriva ERRADO sob
-- pressão. Caso concreto: ofereceu demonstração pela 2ª vez DEPOIS de a lead
-- dizer "tá chato".
--
-- Esta coluna guarda o que o CÓDIGO sabe, para o modelo não ter que adivinhar.
--
-- ADITIVA POR CONSTRUÇÃO: só ADD COLUMN (nullable, sem default, sem NOT NULL),
-- COMMENT e um índice parcial. Zero UPDATE, zero DELETE, zero DROP.
-- Conversa existente fica com NULL → o brain se comporta exatamente como hoje.
-- Nada lê esta coluna até o PR-B: aplicar isto NÃO muda comportamento.

alter table public.platform_crm_conversations
  add column if not exists conversation_state jsonb;

comment on column public.platform_crm_conversations.conversation_state is
  'Memoria de curto prazo da conversa, mantida FORA do modelo. Reduzida por '
  '_shared/conversation-state.ts. LEI DOS TIERS: tier 1 = ato do codigo (apresentou, '
  'link_enviado, nome_ultimo_uso_seq) — pode virar fato no prompt; tier 2 = tag explicita '
  'do modelo (demo_ofertas, demo_recusas, objecoes_vistas) — falha SUBCONTANDO, nunca '
  'mentindo; tier 3 = regex sobre prosa — PROIBIDO, mentiria com peso de fato (o padrao '
  'casa dentro da frase negada: "nao vou ficar te oferecendo demonstracao"). '
  'REGRA DE OURO: campo em duvida OMITE, nunca assume default — estado ausente faz o '
  'modelo improvisar, estado errado o faz obedecer com conviccao. '
  'estagio NAO e armazenado: e funcao pura dos campos tier 1 (se deriva, nao diverge). '
  'atualizado_seq e a marca dagua (platform_crm_messages.seq, bigint identity — NAO e '
  'timestamp, de proposito) e a base da trava otimista: a escrita e UPDATE condicional '
  '(... where atualizado_seq < :seq) com RETURNING, mesmo padrao do brain_claim — sem '
  'isso, hand-backs concorrentes causam lost update e a contagem passa a MENTIR '
  'exatamente na conversa em que ela mais importa. '
  'Compartilhada com a Duda (inbound): um orgao, dois inquilinos, politicas separadas.';

-- Índice parcial: só conversas que JÁ têm estado. Hoje são zero linhas; o índice
-- cresce junto com a adoção e o planner ganha o caminho para "conversas com estado"
-- sem varrer a tabela inteira de conversas legadas (que ficam NULL para sempre).
create index if not exists platform_crm_conversations_conversation_state_idx
  on public.platform_crm_conversations (id)
  where conversation_state is not null;
