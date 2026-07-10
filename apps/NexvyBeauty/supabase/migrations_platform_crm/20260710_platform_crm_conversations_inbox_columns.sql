-- ─────────────────────────────────────────────────────────────────────────────
-- 20260710_platform_crm_conversations_inbox_columns.sql — A2a (colunas do inbox)
-- Data: 2026-07-10 · AGUARDA APLICAÇÃO PELO DONO (revisão + apply via MCP).
--
-- 3 colunas aditivas em platform_crm_conversations que os TODO(A1.2-backend)
-- do inbox já esperam (porte v5):
--   * visitor_email       — PlatformCrmEditVisitorDialog.tsx:69 (campo já está
--                           na UI; hoje o valor digitado não persiste).
--   * orchestrator_state  — PlatformCrmTransferModal.tsx:247 (transferir p/
--                           agente IA marca 'em_atendimento' p/ o orquestrador
--                           não re-rotear a conversa).
--   * metadata            — PlatformCrmTransferModal.tsx:271 (merge de
--                           manual_admin_takeover/_by/_at no admin takeover).
--
-- Conferido ANTES (types.ts + migrations 20260709/20260710): sector_id,
-- meta_connection_id, evolution_instance_id, instagram_connection_id,
-- product_id e channel JÁ EXISTEM — nada disso é recriado aqui.
--
-- ⚠️ DESVIO deliberado do brief da onda (documentado):
--   * orchestrator_state é TEXT (não jsonb). Fonte v5:
--     `orchestrator_state text DEFAULT 'triagem' NOT NULL`
--     (migrations_shared/00000000000002_tables.sql:2299) e o TODO consumidor
--     grava a STRING 'em_atendimento'. jsonb receberia "em_atendimento" com
--     aspas e quebraria a paridade dos filtros `.eq()` quando os edges do
--     orquestrador forem portados. Aqui: NULL sem default — as conversas
--     existentes não têm estado de orquestração conhecido (na plataforma o
--     orquestrador ainda não roda; NULL = "sem estado", vocabulário v5:
--     'triagem' | 'em_atendimento' | 'humano').
--
-- Regras de design (mesmas do 20260701_platform_crm_schema.sql):
--   * SEM organization_id (tenant-of-one).
--   * RLS/GRANTs herdados da própria platform_crm_conversations
--     (super_admin-only) — colunas não mudam policies.
--   * Migration idempotente (ADD COLUMN IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) E-mail do visitante (editável no dialog "Editar Contato")
ALTER TABLE public.platform_crm_conversations
  ADD COLUMN IF NOT EXISTS visitor_email text NULL;
COMMENT ON COLUMN public.platform_crm_conversations.visitor_email IS
  'E-mail do visitante/contato da conversa. Editado em PlatformCrmEditVisitorDialog (paridade v5, TODO A1.2-backend).';

-- 2) Estado do orquestrador (paridade v5 — TEXT, ver header)
ALTER TABLE public.platform_crm_conversations
  ADD COLUMN IF NOT EXISTS orchestrator_state text NULL;
COMMENT ON COLUMN public.platform_crm_conversations.orchestrator_state IS
  'Estado do orquestrador de IA (vocabulário v5: triagem | em_atendimento | humano). NULL = sem estado. Transferência p/ agente IA grava em_atendimento (PlatformCrmTransferModal). TEXT como na fonte v5 — NÃO jsonb.';

-- 3) Metadata da conversa (flags de takeover etc.)
ALTER TABLE public.platform_crm_conversations
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.platform_crm_conversations.metadata IS
  'Metadados livres da conversa (shape v5). Admin takeover mescla manual_admin_takeover (bool), manual_admin_takeover_by (uuid), manual_admin_takeover_at (timestamptz).';

-- ─────────────────────────────────────────────────────────────────────────────
-- FIM — 3 colunas aditivas em platform_crm_conversations. Sem mudança de RLS.
-- ─────────────────────────────────────────────────────────────────────────────
