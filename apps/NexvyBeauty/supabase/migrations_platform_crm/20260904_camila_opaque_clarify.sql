-- 20260904_camila_opaque_clarify.sql
-- Regra: pergunta opaca / incompreensível → frase fixa (Marcelo 2026-09-04).
-- Idempotente: só acrescenta se o marcador ainda não estiver no prompt.

UPDATE public.platform_crm_product_agents
SET
  additional_prompt = additional_prompt || E'\n\n'
    || E'DÚVIDA OPAÇA (obrigatório — 2026-09-04):\n'
    || E'Se a última fala dela for confusa, truncada, ambígua ou você NÃO souber com certeza o que ela perguntou '
    || E'(ex.: frase incompleta sobre Pix/taxa/agenda sem dar pra afirmar o sentido), '
    || E'RESPONDA EXATAMENTE com esta frase (pode ser a única bolha do turno):\n'
    || E'"Não entendi muito bem, me explica melhor?"\n'
    || E'PROIBIDO inventar o que ela quis dizer, chutar feature, ou seguir o pitch como se tivesse entendido. '
    || E'Depois que ela esclarecer, aí sim responda o conteúdo.\n',
  updated_at = now()
WHERE id = '68aeece9-26f2-4f7b-a595-a6ea5e8acfa7'
  AND coalesce(additional_prompt, '') NOT LIKE '%DÚVIDA OPAÇA (obrigatório — 2026-09-04)%';
