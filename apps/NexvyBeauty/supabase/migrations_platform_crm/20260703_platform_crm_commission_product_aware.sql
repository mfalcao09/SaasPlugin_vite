-- D4 (P6) — torna o calculo de comissao CIENTE DE PRODUTO.
-- Aplicada em prod via MCP apply_migration em 2026-07-03 (projeto fzhlbwhdejumkyqosuvq).
-- Contexto: D3 restaurou product_id em platform_crm_commission_rules/deals/commissions,
-- mas a funcao de calculo ainda casava a regra so por vendedor/default e inseria a
-- comissao SEM product_id (o TODO(produto) do CommissionsManager). Agora:
--   1. busca o product_id do deal;
--   2. prefere a regra do produto (fallback: regra agnostica = backward-compatible);
--      vendedor-especifico tem prioridade sobre produto-especifico;
--   3. grava product_id na comissao gerada.
CREATE OR REPLACE FUNCTION public.platform_crm_calculate_commission(p_deal_id uuid, p_deal_value numeric, p_seller_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rule RECORD; v_commission NUMERIC; v_product_id uuid;
BEGIN
  SELECT product_id INTO v_product_id FROM public.platform_crm_deals WHERE id = p_deal_id;

  SELECT * INTO v_rule FROM public.platform_crm_commission_rules
  WHERE is_active = true
    AND (user_id = p_seller_id OR (user_id IS NULL AND is_default = true))
    AND (product_id = v_product_id OR product_id IS NULL)
  ORDER BY (user_id IS NOT NULL) DESC, (product_id IS NOT NULL) DESC
  LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF v_rule.rule_type = 'percentage' THEN v_commission := p_deal_value * (v_rule.base_value / 100);
  ELSE v_commission := v_rule.base_value; END IF;
  IF v_rule.min_value IS NOT NULL AND v_commission < v_rule.min_value THEN v_commission := v_rule.min_value; END IF;
  IF v_rule.max_value IS NOT NULL AND v_commission > v_rule.max_value THEN v_commission := v_rule.max_value; END IF;

  INSERT INTO public.platform_crm_commissions (deal_id, user_id, amount, percentage_applied, rule_id, status, product_id)
  VALUES (p_deal_id, p_seller_id, v_commission, v_rule.base_value, v_rule.id, 'pending', v_product_id);
  RETURN v_commission;
END; $function$;
