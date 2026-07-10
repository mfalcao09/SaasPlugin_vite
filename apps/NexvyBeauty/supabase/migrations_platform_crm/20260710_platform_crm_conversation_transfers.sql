-- ─────────────────────────────────────────────────────────────────────────────
-- 20260710_platform_crm_conversation_transfers.sql — A2b (histórico de
-- transferências de CONVERSA)
-- Data: 2026-07-10 · AGUARDA APLICAÇÃO PELO DONO (revisão + apply via MCP).
--
-- Equivalente de plataforma da `conversation_transfers` do v5
-- (oficial-vendus-v5/supabase/migrations_shared/00000000000002_tables.sql:691).
-- A UI já espera esta tabela: TODO(A1.2-backend) em
-- PlatformCrmTransferModal.tsx:345 — hoje a transferência de conversa só é
-- registrada best-effort em platform_crm_lead_transfer_history (que exige
-- lead_id NOT NULL e portanto perde transferências de conversa sem lead).
--
-- Desacoplamento do shape v5 (regras do porte, mesmas do 20260702_setores):
--   * SEM organization_id (tenant-of-one).
--   * from_user_id/to_user_id/created_by: v5 → profiles(id); plataforma →
--     auth.users(id) (padrão de todas as platform_crm_*).
--   * to_queue_id (uuid solto, sem FK no v5) → to_sector_id COM FK para
--     platform_crm_sectors + from_sector_id (simétrico, permite trilha
--     completa "saiu do setor X → entrou no setor Y").
--   * internal_note → note (nome pedido pela onda; mesma semântica).
--   * created_by: v5 era NOT NULL; aqui NULL + ON DELETE SET NULL para o
--     histórico sobreviver à remoção do usuário (mesmo padrão de
--     platform_crm_scheduled_messages.created_by).
--
-- Regras de design (mesmas do 20260701_platform_crm_schema.sql):
--   * FKs só para platform_crm_* / auth.users.
--   * RLS super_admin-only via public.has_role.
--   * Migration idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_crm_conversation_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES public.platform_crm_conversations(id) ON DELETE CASCADE,
  from_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  to_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  from_sector_id uuid NULL
    REFERENCES public.platform_crm_sectors(id) ON DELETE SET NULL,
  to_sector_id uuid NULL
    REFERENCES public.platform_crm_sectors(id) ON DELETE SET NULL,
  note text NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_crm_conversation_transfers IS
  'Histórico de transferências de CONVERSA do inbox da plataforma (equivalente ao conversation_transfers do v5). Transferência p/ usuário preenche to_user_id; p/ setor preenche to_sector_id; p/ agente IA registra só a note (agente vive em current_agent_id da conversa).';
COMMENT ON COLUMN public.platform_crm_conversation_transfers.to_sector_id IS
  'Setor de destino (materializa o to_queue_id do v5, agora com FK real para platform_crm_sectors).';
COMMENT ON COLUMN public.platform_crm_conversation_transfers.note IS
  'Nota interna da transferência (internal_note no v5) — inclui trilha de troca de conexão/instância enquanto essa troca não tiver coluna própria.';

-- Timeline da conversa (listagem já ordenada por data, cobre o filtro simples
-- por conversation_id pedido pela onda).
CREATE INDEX IF NOT EXISTS idx_platform_crm_conversation_transfers_conversation
  ON public.platform_crm_conversation_transfers(conversation_id, created_at DESC);

-- ─── RLS — padrão platform_crm_* (super_admin-only; espelho do bloco DO $$ do
--     20260701_platform_crm_inbox.sql) ──────────────────────────────────────
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'platform_crm_conversation_transfers'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_super_admin_only" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_super_admin_only" ON public.%I '
      'FOR ALL TO authenticated '
      'USING (public.has_role(auth.uid(), ''super_admin''::app_role)) '
      'WITH CHECK (public.has_role(auth.uid(), ''super_admin''::app_role));',
      t, t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
  END LOOP;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIM — 1 tabela + 1 índice composto, RLS super_admin-only.
-- ─────────────────────────────────────────────────────────────────────────────
