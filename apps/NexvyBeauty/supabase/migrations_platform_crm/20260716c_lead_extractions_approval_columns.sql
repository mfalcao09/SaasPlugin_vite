-- ════════════════════════════════════════════════════════════════════════════
-- Prospecção Ativa · Portão de Aprovação (Prospecção → Base consolidada)
-- PASSO 1/2 — colunas de aprovação na EXTRAÇÃO (unidade de aprovação = a extração).
--
-- Projeto: fzhlbwhdejumkyqosuvq (PG 17.6).
--
-- ADITIVA e INÓCUA: só adiciona 2 colunas nullable. Nada lê `approved_at` ainda
-- (o filtro da view é o PASSO 2, aplicado em coordenação). Aplicar esta é seguro:
--   • CLEAN SLATE — decisão do Marcelo: as extrações EXISTENTES nascem
--     NÃO-aprovadas (approved_at = NULL). Ele aprova base a base na mão.
--   • Só depois que a UI de aprovar existir + o PASSO 2 (flip da view) for aplicado
--     é que `approved_at IS NOT NULL` passa a gatear a Base consolidada.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.platform_crm_lead_extractions
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

COMMENT ON COLUMN public.platform_crm_lead_extractions.approved_at IS
  'Portão Prospecção→Base consolidada. NULL = extração "em tratamento" (não entra na Base consolidada). Preenchido = base aprovada (seus leads entram na view consolidada). Clean slate: existentes começam NULL.';
COMMENT ON COLUMN public.platform_crm_lead_extractions.approved_by IS
  'auth.users.id do super_admin que aprovou a base (NULL enquanto não-aprovada).';
