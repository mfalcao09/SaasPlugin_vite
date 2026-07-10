-- ─────────────────────────────────────────────────────────────────────────────
-- 20260709_platform_crm_conversations_sector_id.sql — A1.2 (porte v5 do inbox)
--
-- Coluna sector_id em platform_crm_conversations: o LeadContextPanel do v5 tem
-- seletor de Setor por conversa; a tabela platform_crm_sectors JÁ existia, mas
-- a conversa não tinha a FK. Aditiva/idempotente. APLICADA em prod 2026-07-09
-- (apply_migration platform_crm_conversations_sector_id) — este arquivo é o
-- espelho no repo.
--
-- RLS: herdada da própria platform_crm_conversations (super_admin only);
-- ON DELETE SET NULL: apagar setor não apaga conversa.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.platform_crm_conversations
  ADD COLUMN IF NOT EXISTS sector_id uuid NULL
  REFERENCES public.platform_crm_sectors(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.platform_crm_conversations.sector_id IS
  'Setor de atendimento da conversa (platform_crm_sectors). Selecionado no LeadContextPanel do inbox (porte v5 A1.2).';

CREATE INDEX IF NOT EXISTS idx_platform_crm_conversations_sector
  ON public.platform_crm_conversations(sector_id) WHERE sector_id IS NOT NULL;
