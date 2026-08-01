-- Override de MODELO de LLM por agente — lado PLATAFORMA (nossas personas).
-- APLICADA via apply_migration 2026-08-01 (add_model_override_to_agents). Registro versionado.
-- Par desta migration (agentes de TENANT): migrations_salao/20260801_agent_model_override.sql.
-- As duas pontas precisam da coluna porque o painel de gestão lista ambas numa tela só.
--
-- PROBLEMA QUE RESOLVE: até 2026-08-01 o modelo vinha de env GLOBAL
-- (AI_SALES_BRAIN_MODEL / _CLOSER, default google/gemini-2.5-flash). Para afinar
-- UMA persona — a Demo é a vitrine dos anúncios pagos — seria preciso trocar o
-- modelo da Lia e da Duda junto, ou seja, do funil que está vendendo de verdade.
--
-- PRECEDÊNCIA (platform-sales-brain): persona.model > env > DEFAULT_MODEL.
-- Risco ZERO: coluna nullable e sem default de propósito — NULL preserva byte a byte
-- o comportamento anterior, então nenhum agente já cadastrado muda ao aplicar.

alter table public.platform_crm_product_agents
  add column if not exists model text;

comment on column public.platform_crm_product_agents.model is
  'Override de modelo LLM para ESTA persona (ex.: google/gemini-3.1-pro-preview). NULL = herda AI_SALES_BRAIN_MODEL/_CLOSER ou o default do brain.';
