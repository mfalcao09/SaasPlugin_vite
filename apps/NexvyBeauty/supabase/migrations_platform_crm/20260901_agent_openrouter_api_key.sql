-- API key OpenRouter POR persona (ex.: Camila com conta dedicada).
-- NULL = herda AI_API_KEY global do edge (comportamento anterior).
-- Segredo: service_role / brain leem; authenticated/anon NÃO selecionam a coluna.

ALTER TABLE public.platform_crm_product_agents
  ADD COLUMN IF NOT EXISTS openrouter_api_key text;

COMMENT ON COLUMN public.platform_crm_product_agents.openrouter_api_key IS
  'OpenRouter API key dedicada a ESTA persona. NULL = herda AI_API_KEY do edge. Nunca expor no front.';

-- Defesa em profundidade: PostgREST/authenticated não lê a coluna mesmo com select *.
REVOKE SELECT (openrouter_api_key) ON public.platform_crm_product_agents FROM PUBLIC;
REVOKE SELECT (openrouter_api_key) ON public.platform_crm_product_agents FROM anon;
REVOKE SELECT (openrouter_api_key) ON public.platform_crm_product_agents FROM authenticated;
GRANT SELECT (openrouter_api_key) ON public.platform_crm_product_agents TO service_role;
GRANT UPDATE (openrouter_api_key) ON public.platform_crm_product_agents TO service_role;
