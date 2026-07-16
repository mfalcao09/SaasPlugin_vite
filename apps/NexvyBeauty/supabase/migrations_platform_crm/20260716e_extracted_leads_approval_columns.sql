-- ════════════════════════════════════════════════════════════════════════════
-- Prospecção Ativa · Portão de Aprovação — MIGRAÇÃO DA UNIDADE: extração → LEAD.
-- PASSO 1/2 (por-lead) — colunas de aprovação no PRÓPRIO LEAD (unidade = o lead).
--
-- Projeto: fzhlbwhdejumkyqosuvq (PG 17.6).
--
-- CONTEXTO: o portão por-EXTRAÇÃO (#82: 20260716c colunas na extração +
-- 20260716d flip da view) já está LIVE. O Marcelo pediu para SELECIONAR LEADS e
-- aprovar só eles (mantendo o atalho de aprovar a base inteira). A fonte da verdade
-- passa a ser o LEAD.
--
-- ADITIVA e INÓCUA: só adiciona 2 colunas nullable em platform_crm_extracted_leads.
-- Nada lê `extracted_leads.approved_at` ainda — o filtro da view continua sendo por
-- extração até o PASSO 2 (20260716f, flip por-lead) ser aplicado em COORDENAÇÃO com
-- o deploy do front. Aplicar ESTA agora é seguro:
--   • CLEAN SLATE (decisão do Marcelo): todos os 4.006 leads nascem NÃO-aprovados
--     (approved_at = NULL). Consolidada = 0 hoje; nada muda ao aplicar só as colunas.
--   • O portão por-extração (fonte atual da view) segue intacto: extrações também
--     estão todas em approved_at=NULL, então a Base consolidada continua em 0.
--
-- DECISÃO sobre as colunas approved_at/approved_by de platform_crm_lead_extractions
-- (postas pelo #82): DEIXAM DE SER a fonte do portão após o flip por-lead. Ficam
-- ÓRFÃS (nada as lê/escreve pelo front novo). NÃO são dropadas aqui porque a view
-- LIVE ainda as referencia (dropar antes do flip quebraria a Base consolidada em
-- produção). Um DROP é passo OPCIONAL de limpeza APÓS o flip (ver 20260716f). Fonte
-- única do portão passa a ser extracted_leads.approved_at.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.platform_crm_extracted_leads
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

COMMENT ON COLUMN public.platform_crm_extracted_leads.approved_at IS
  'Portão Prospecção→Base consolidada (unidade = o LEAD). NULL = lead "em tratamento" (não entra na Base consolidada). Preenchido = lead aprovado (entra na view consolidada após o flip por-lead 20260716f). Clean slate: existentes começam NULL.';
COMMENT ON COLUMN public.platform_crm_extracted_leads.approved_by IS
  'auth.users.id do super_admin que aprovou o lead (NULL enquanto não-aprovado).';

-- Índice parcial: o portão da view filtra por `approved_at IS NOT NULL` (pós-flip),
-- e a UI conta aprovados por extração. Índice só nas linhas aprovadas (barato).
CREATE INDEX IF NOT EXISTS idx_pcel_approved_at
  ON public.platform_crm_extracted_leads (extraction_id)
  WHERE approved_at IS NOT NULL;
