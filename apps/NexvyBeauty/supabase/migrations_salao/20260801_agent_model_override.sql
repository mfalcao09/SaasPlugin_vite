-- Override de MODELO de LLM por agente — lado TENANT (agentes que o salão cria).
-- APLICADA via apply_migration 2026-08-01 (add_model_override_to_agents). Registro versionado.
-- Par desta migration (nossas personas): migrations_platform_crm/20260801_agent_model_override.sql.
--
-- POR QUE O TENANT TAMBÉM: quando um salão reclamar do atendimento, a primeira
-- pergunta é "em que modelo esse agente está?". Responder isso não pode exigir SQL,
-- e trocar o modelo de UM agente não pode obrigar a trocar o da org inteira.
--
-- PRECEDÊNCIA (_shared/ai-router.ts → resolveAIConfig):
--   agente.model > org_ai_routing.model > preferredModel (dica do call site) > DEFAULT_MODEL
-- O agente vence a org de propósito: é a configuração mais específica que existe.
-- Se a org pudesse sobrepô-la, o seletor do painel não faria efeito nenhum em toda
-- org que já tenha routing cadastrado.
--
-- Risco ZERO: coluna nullable e sem default — NULL preserva byte a byte a resolução
-- anterior, então nenhum agente de tenant muda de comportamento ao aplicar.

alter table public.product_agents
  add column if not exists model text;

comment on column public.product_agents.model is
  'Override de modelo LLM para ESTE agente do tenant. NULL = herda org_ai_routing/capability ou o default do ai-router.';
