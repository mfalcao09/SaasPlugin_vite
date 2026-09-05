-- Callers: supabase db apply / deploy-vps SQL. Runtime UPDATE/SELECT:
--   platform-camila-conductor (grava snapshot), platform-sales-brain le
--   conversation.metadata.wa_profile; extracted_leads.wa_profile e o dossie.
-- Glob **/*wa_profile*: 0. Tabela em 20260712_platform_crm_lead_extractions.sql ~69;
--   types.ts Row nao tem wa_profile. platform_crm_business_hours e horario da Nexvy, nao da lead.
-- Fields: wa_profile jsonb
--   {"fetched_at":"2026-09-04T14:00:00.000Z","hours_mode":"specificHours",
--    "timezone":"America/Sao_Paulo","days":[{"weekday":5,"openMin":600,"closeMin":1170}],
--    "greeting_name":null,"is_business":true}
--   wa_profile_fetched_at timestamptz
-- User: "a) nao e so ligar o vocativo, e ligar todas as informacoes que o numero
-- pode fornecer. [...] horario de funcionamento. [...] salvo no DB, na informacao
-- do lead. [...] b) ainda nao. Quero improvement da Camila primeiro."
--
-- Snapshot Z-API do NUMERO no lead de prospeccao (horario, descricao, chat).
-- Idempotente. ADD COLUMN. NAO dispara WhatsApp.

ALTER TABLE public.platform_crm_extracted_leads
  ADD COLUMN IF NOT EXISTS wa_profile jsonb,
  ADD COLUMN IF NOT EXISTS wa_profile_fetched_at timestamptz;

COMMENT ON COLUMN public.platform_crm_extracted_leads.wa_profile IS
  'Snapshot Z-API (chat + business profile): hours_mode, days, greeting_name, description. Fonte Porta 5 Camila.';
COMMENT ON COLUMN public.platform_crm_extracted_leads.wa_profile_fetched_at IS
  'Quando o snapshot wa_profile foi gravado (timestamptz).';
