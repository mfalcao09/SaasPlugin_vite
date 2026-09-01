-- C-data soft: vocabulário WA QR sem rename físico da tabela.
-- Rollback: DROP VIEW public.platform_crm_wa_qr_instances;
-- A tabela platform_crm_evolution_instances e FKs permanecem.

CREATE OR REPLACE VIEW public.platform_crm_wa_qr_instances
  WITH (security_invoker = true)
AS
SELECT *
FROM public.platform_crm_evolution_instances;

COMMENT ON VIEW public.platform_crm_wa_qr_instances IS
  'Alias canônico (C-data soft 2026-09-01) de platform_crm_evolution_instances. Sem rename físico; FKs continuam na tabela base.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_crm_wa_qr_instances TO anon, authenticated, service_role;
