-- C-hard-2: rename físico platform_crm_evolution_instances → platform_crm_wa_qr_instances.
-- A view soft (mesmo nome) é dropada; a tabela física assume o nome canônico.
-- Compat: VIEW platform_crm_evolution_instances → tabela nova (leitura/escrita legado).
-- Colunas evolution_instance_id nas FKs NÃO renomeadas neste passo (C-hard-3).

DROP VIEW IF EXISTS public.platform_crm_wa_qr_instances;

ALTER TABLE public.platform_crm_evolution_instances
  RENAME TO platform_crm_wa_qr_instances;

COMMENT ON TABLE public.platform_crm_wa_qr_instances IS
  'Instâncias WhatsApp via QR (platform / Camila). Renomeada de platform_crm_evolution_instances (C-hard-2 2026-09-01).';

-- Compat para clientes/types que ainda leem o nome antigo.
CREATE VIEW public.platform_crm_evolution_instances
  WITH (security_invoker = true)
AS
SELECT *
FROM public.platform_crm_wa_qr_instances;

COMMENT ON VIEW public.platform_crm_evolution_instances IS
  'Alias de compat (C-hard-2). Preferir platform_crm_wa_qr_instances.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_crm_wa_qr_instances
  TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_crm_evolution_instances
  TO anon, authenticated, service_role;
