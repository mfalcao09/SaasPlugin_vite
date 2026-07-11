-- ─────────────────────────────────────────────────────────────────────────────
-- 20260710_platform_crm_is_within_24h_window.sql — A2c (janela 24h Meta)
-- Data: 2026-07-10 · AGUARDA APLICAÇÃO PELO DONO (revisão + apply via MCP).
--
-- RPC de janela 24h da Meta para o inbox da plataforma — equivalente do
-- `is_within_24h_window(_conversation_id)` do v5
-- (oficial-vendus-v5/.../20260604030213_*.sql:171). A UI já espera a RPC:
--   * PlatformCrmChatArea.tsx:263 — banner/bloqueio do composer fora da janela
--     (hoje `outOfWindow = false` fixo);
--   * PlatformCrmLeadContextPanel.tsx:144 — hoje computa a janela no client
--     com 2 queries (pode migrar para esta RPC).
--
-- DIFERENÇA deliberada vs v5: o v5 lia a coluna materializada
-- `webchat_conversations.last_inbound_at`; a plataforma NÃO tem essa coluna,
-- então a função computa direto de platform_crm_messages (EXISTS de mensagem
-- do visitante < 24h — mesma semântica Meta, mesmo critério que o
-- LeadContextPanel já usa no client: sender_type='visitor').
--
-- SECURITY DEFINER (como no v5): permite ao caller autenticado checar a janela
-- sem depender do RLS de platform_crm_messages. Exposição limitada: retorna
-- APENAS um boolean (existe/não existe inbound recente) — nenhum conteúdo de
-- mensagem vaza. search_path fixado em public (anti-hijack).
--
-- Conversa inexistente ⇒ EXISTS vazio ⇒ false (mesmo COALESCE-false do v5).
-- Idempotente: CREATE OR REPLACE + CREATE INDEX IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.platform_crm_is_within_24h_window(
  p_conversation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_crm_messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_type = 'visitor'
      AND m.created_at > now() - interval '24 hours'
  );
$$;

COMMENT ON FUNCTION public.platform_crm_is_within_24h_window(uuid) IS
  'Janela 24h da Meta (inbox plataforma): true se a conversa tem mensagem do visitante (sender_type=visitor) nas últimas 24h. Porta o is_within_24h_window do v5, computando de platform_crm_messages (a plataforma não materializa last_inbound_at).';

-- A UI consulta a janela por conversa com polling (v5: refetch 60s). Índice
-- parcial só nas mensagens de visitante torna o EXISTS um range-scan curto.
CREATE INDEX IF NOT EXISTS idx_platform_crm_messages_visitor_inbound
  ON public.platform_crm_messages(conversation_id, created_at DESC)
  WHERE sender_type = 'visitor';

-- Mesmos grants do v5 (authenticated para a UI; service_role para edges).
GRANT EXECUTE ON FUNCTION public.platform_crm_is_within_24h_window(uuid)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIM — 1 função STABLE + 1 índice parcial + grants.
-- ─────────────────────────────────────────────────────────────────────────────
