-- ─────────────────────────────────────────────────────────────────────────────
-- 20260704_founder_fields.sql — trava de fundadora (P3 / cautela máxima)
--
-- CONTEXTO: a máquina de venda automatizada (Orquestrador + agentes) precisa
-- distinguir as 30 fundadoras (trilha humana) dos demais (100% automatizado).
-- A reconciliação do arsenal aponta founder_status + slots_left como pré-req.
--
-- CAUTELA (pedido do Marcelo — "não quebrar nada"):
--   - APENAS 1 coluna NULLABLE nova (founder_status) + 1 view read-only.
--   - Sem NOT NULL, sem default retroativo, sem trigger, sem constraint, sem RLS.
--     Linhas legadas ficam founder_status = NULL (a app trata NULL como
--     not_founder). Nada em provisioning/pagamento/RLS é tocado.
--   - slots_left NÃO é armazenado (evita drift): é DERIVADO por uma view
--     (30 − nº de organizações com founder_status='is_founder'). Fonte única
--     da verdade, impossível dessincronizar.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. founder_status por organização (nullable; sem default retroativo)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS founder_status text;

COMMENT ON COLUMN public.organizations.founder_status IS
  'Trava de fundadora (campanha Piloto 30/30/1). Valores: is_founder | not_founder | unknown | NULL(legado=not_founder). Lido pelo Orquestrador; nunca inferido. Nullable de propósito.';

-- 2. status da campanha (slots_left DERIVADO — sem contador armazenado)
DROP VIEW IF EXISTS public.founder_campaign_status;

CREATE VIEW public.founder_campaign_status
WITH (security_invoker = on) AS
SELECT
  30                                            AS total_vagas,
  count(*) FILTER (WHERE founder_status = 'is_founder')             AS fundadoras_ativas,
  greatest(0, 30 - count(*) FILTER (WHERE founder_status = 'is_founder')) AS slots_left,
  (count(*) FILTER (WHERE founder_status = 'is_founder')) >= 30    AS campanha_encerrada
FROM public.organizations;

COMMENT ON VIEW public.founder_campaign_status IS
  'Status da campanha Piloto Fundadora (30/30/1): slots_left = 30 − nº de orgs is_founder. Derivado, sem contador armazenado (zero drift). Consumido pelo Orquestrador. Roadmap lancamento-v3 / P3.';

GRANT SELECT ON public.founder_campaign_status TO authenticated;
