-- C residual: drop view de compat (tabela física já é platform_crm_wa_qr_instances).
-- Rollback: recrear VIEW security_invoker AS SELECT * FROM platform_crm_wa_qr_instances;

DROP VIEW IF EXISTS public.platform_crm_evolution_instances;
