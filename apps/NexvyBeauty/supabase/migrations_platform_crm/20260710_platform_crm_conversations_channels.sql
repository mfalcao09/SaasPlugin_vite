-- ─────────────────────────────────────────────────────────────────────────────
-- 20260710_platform_crm_conversations_channels.sql — A1.3 (canal por conversa, multi-provider)
--
-- ENTREGA 1: materializa o CANAL da conversa apontando para a conexão concreta
-- (uma das 3 tabelas de conexão da plataforma). Espelha o shape multi-provider
-- do inbox v5. Aditivo/idempotente, mesmo padrão do 20260709 (sector_id).
--
-- Contexto (verificado em prod via src/integrations/supabase/types.ts):
--   * platform_crm_conversations JÁ TEM: channel (text, DEFAULT 'web_chat'),
--     product_id, current_agent_id, sector_id (add 07-09). NÃO recriar.
--   * Faltam as FKs de canal → tabelas de conexão. Adicionadas aqui.
--
-- Tabelas de conexão de destino (criadas fora do repo, via MCP; pré-existem):
--   * meta_connection_id       → platform_crm_whatsapp_meta_connections(id)
--   * evolution_instance_id     → platform_crm_evolution_instances(id)
--   * instagram_connection_id   → platform_crm_instagram_connections(id)
--   Todas ON DELETE SET NULL: apagar a conexão não apaga a conversa (histórico).
--
-- ⚠️ CANAL (channel): a coluna já existe com DEFAULT 'web_chat' (underscore) e há
--   linhas em prod usando esse valor. NÃO adicionamos CHECK constraint aqui —
--   um CHECK com o vocabulário do v5 ('webchat'|'whatsapp_cloud'|
--   'whatsapp_evolution'|'instagram') REJEITARIA as linhas 'web_chat' existentes
--   e o próprio default. A padronização do vocabulário de channel é decisão de
--   produto (UI + edges) e deve vir com backfill/UPDATE, não com CHECK cego.
--
-- RLS: herdada da própria platform_crm_conversations (super_admin only).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) FK de canal: WhatsApp Cloud (Meta oficial)
ALTER TABLE public.platform_crm_conversations
  ADD COLUMN IF NOT EXISTS meta_connection_id uuid NULL
  REFERENCES public.platform_crm_whatsapp_meta_connections(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.platform_crm_conversations.meta_connection_id IS
  'Conexão WhatsApp Cloud (platform_crm_whatsapp_meta_connections) que originou/atende a conversa. NULL quando o canal não é whatsapp_cloud.';

-- 2) FK de canal: WhatsApp Evolution (não-oficial)
ALTER TABLE public.platform_crm_conversations
  ADD COLUMN IF NOT EXISTS evolution_instance_id uuid NULL
  REFERENCES public.platform_crm_evolution_instances(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.platform_crm_conversations.evolution_instance_id IS
  'Instância WhatsApp Evolution (platform_crm_evolution_instances) que originou/atende a conversa. NULL quando o canal não é whatsapp_evolution.';

-- 3) FK de canal: Instagram Direct
ALTER TABLE public.platform_crm_conversations
  ADD COLUMN IF NOT EXISTS instagram_connection_id uuid NULL
  REFERENCES public.platform_crm_instagram_connections(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.platform_crm_conversations.instagram_connection_id IS
  'Conexão Instagram (platform_crm_instagram_connections) que originou/atende a conversa. NULL quando o canal não é instagram.';

-- 4) Índices — filtro por canal e por conexão (parciais nas FKs, padrão sector_id)
CREATE INDEX IF NOT EXISTS idx_platform_crm_conversations_channel
  ON public.platform_crm_conversations(channel);
CREATE INDEX IF NOT EXISTS idx_platform_crm_conversations_meta_connection
  ON public.platform_crm_conversations(meta_connection_id) WHERE meta_connection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_crm_conversations_evolution_instance
  ON public.platform_crm_conversations(evolution_instance_id) WHERE evolution_instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_crm_conversations_instagram_connection
  ON public.platform_crm_conversations(instagram_connection_id) WHERE instagram_connection_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIM — 3 FKs de canal + 4 índices em platform_crm_conversations. Aditivo.
-- ─────────────────────────────────────────────────────────────────────────────
