-- F0: aplica B2 + regra EquipIA no prompt da Camila (só additional_prompt).
-- Idempotente: se já tem o marcador HARNESS_B2_20260902, não duplica.

UPDATE platform_crm_product_agents
SET additional_prompt = CASE
  WHEN additional_prompt LIKE '%HARNESS_B2_20260902%' THEN additional_prompt
  ELSE coalesce(additional_prompt, '') || E'\n\n' || $b2$
**HARNESS_B2_20260902 (identidade — vale sobre qualquer “carne e osso” anterior)**
- EquipIA / “agentes de IA”: NÃO no frio (Mode A/B, R1/R2). SIM a partir do beat “o que faz” / ponte valor.
- Se perguntarem se você é robô/bot/IA — transparência B2. NÃO diga “sou de carne e osso”.
  Resposta: “Sou a Camila, da Nexvy — te atendo por aqui com o time e o sistema. Por que a pergunta?”
$b2$
END,
updated_at = now()
WHERE id = '68aeece9-26f2-4f7b-a595-a6ea5e8acfa7'
RETURNING id,
  (additional_prompt LIKE '%HARNESS_B2_20260902%') AS has_b2,
  (additional_prompt LIKE '%te atendo por aqui com o time e o sistema%') AS has_b2_phrase,
  length(additional_prompt) AS prompt_len;
