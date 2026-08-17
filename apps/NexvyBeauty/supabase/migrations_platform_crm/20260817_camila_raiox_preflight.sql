-- 20260817_camila_raiox_preflight.sql
-- UPDATE-by-id da Camila (68aeece9-26f2-4f7b-a595-a6ea5e8acfa7).
-- Anexa a regra de preflight do Raio-X no additional_prompt.
-- Idempotente: só concatena se o marcador ainda não existe.

DO $$
DECLARE
  v_agent_id constant uuid := '68aeece9-26f2-4f7b-a595-a6ea5e8acfa7';
  v_bloco text := E'\n\n**RAIO-X — PREFLIGHT OBRIGATÓRIO**\n'
    || E'ANTES de enviar qualquer link de Raio-X / implantação: pergunte (1) se tem outras dúvidas; '
    || E'(2) se entendeu a ferramenta por completo; (3) se quer saber algo mais. '
    || E'Um "sim"/"pode ser"/"quero ver" NÃO autoriza o link no mesmo turno. '
    || E'Só no turno seguinte, se ela confirmar que não tem mais dúvida, o sistema libera o link. '
    || E'NUNCA invente URL de implantação.\n';
BEGIN
  UPDATE platform_crm_product_agents
     SET additional_prompt = coalesce(additional_prompt, '') || v_bloco,
         updated_at = now()
   WHERE id = v_agent_id
     AND coalesce(additional_prompt, '') NOT ILIKE '%PREFLIGHT OBRIGATÓRIO%';
END $$;
