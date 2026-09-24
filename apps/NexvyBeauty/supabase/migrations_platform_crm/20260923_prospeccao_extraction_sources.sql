-- Nova Prospecção Ativa — origens reais da ingestão.
-- A tabela nasceu com source='instagram' apenas, mas o CRM agora recebe o
-- export do Prospectagram e outros providers sem criar outra tabela de staging.
-- Mantém instagram e amplia o vocabulário sem alterar linhas existentes.

ALTER TABLE public.platform_crm_lead_extractions
  DROP CONSTRAINT IF EXISTS platform_crm_lead_extractions_source_check;

ALTER TABLE public.platform_crm_lead_extractions
  ADD CONSTRAINT platform_crm_lead_extractions_source_check
  CHECK (source IN ('instagram', 'prospectagram', 'video', 'server_api'));

COMMENT ON COLUMN public.platform_crm_lead_extractions.source IS
  'Origem da ingestão: instagram, prospectagram, video ou server_api; o staging e a triagem são compartilhados.';
