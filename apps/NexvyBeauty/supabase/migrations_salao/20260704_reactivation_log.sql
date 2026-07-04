-- ─────────────────────────────────────────────────────────────────────────────
-- 20260704_reactivation_log.sql — trilha de disparos + "R$ recuperado" (F2.1)
--
-- PROBLEMA: os disparos de reativação do /ai-growth não ficam registrados em
-- nenhuma tabela consultável (sendReactivation só tenta marcar
-- opportunity_scan_items, que não contém os cards de carteira — o update
-- silenciosamente não acha o id). Sem trilha, não existe "R$ recuperado" —
-- e a garantia da oferta v3 ("recuperado ≥ mensalidade ou devolvo") fica sem juiz.
--
-- SOLUÇÃO:
--   1. reactivation_log — 1 linha por mensagem de reativação enviada.
--      organization_id tem DEFAULT get_user_organization(auth.uid()) para o
--      insert do client não precisar (nem poder errar) o tenant.
--   2. recovered_agendamentos — view com security_invoker=on (o RLS das tabelas
--      base vale para quem consulta): agendamentos CONCLUÍDOS de clientes que
--      receberam reativação até 30 dias antes. Match primário por cliente_id;
--      fallback por telefone (só dígitos). 1 linha por agendamento (não duplica
--      quando houve mais de um disparo).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reactivation_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.get_user_organization(auth.uid()),
  cliente_id      uuid NULL,
  phone           text NOT NULL,          -- dígitos normalizados (55DDDNÚMERO)
  source          text NOT NULL DEFAULT 'reactivation',  -- reactivation | ai_growth | automacao
  deal_value      numeric NULL,           -- valor estimado no card (referência, não é o "recuperado")
  message         text NULL,
  sent_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reactivation_log_org_sent
  ON public.reactivation_log (organization_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_reactivation_log_org_phone
  ON public.reactivation_log (organization_id, phone);

ALTER TABLE public.reactivation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members read reactivation_log" ON public.reactivation_log;
CREATE POLICY "org members read reactivation_log"
  ON public.reactivation_log FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "org members insert reactivation_log" ON public.reactivation_log;
CREATE POLICY "org members insert reactivation_log"
  ON public.reactivation_log FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

COMMENT ON TABLE public.reactivation_log IS
  'Trilha de mensagens de reativação enviadas (ai-growth/radar/automações). Base do painel R$ recuperado — juiz da garantia da oferta v3 (roadmap 2026-07-04).';

-- ── View: agendamentos concluídos atribuíveis a uma reativação (janela 30d) ──
DROP VIEW IF EXISTS public.recovered_agendamentos;

CREATE VIEW public.recovered_agendamentos
WITH (security_invoker = on) AS
SELECT
  a.organization_id,
  a.id            AS agendamento_id,
  a.cliente_id,
  c.nome          AS cliente_nome,
  a.valor,
  a.data,
  MIN(rl.sent_at) AS first_sent_at
FROM public.agendamentos a
JOIN public.clientes c
  ON c.id = a.cliente_id
 AND c.organization_id = a.organization_id
JOIN public.reactivation_log rl
  ON rl.organization_id = a.organization_id
 AND (
       rl.cliente_id = a.cliente_id
    OR (c.telefone IS NOT NULL
        AND regexp_replace(c.telefone, '\D', '', 'g') <> ''
        AND regexp_replace(c.telefone, '\D', '', 'g') = regexp_replace(rl.phone, '\D', '', 'g'))
     )
WHERE a.status = 'concluido'
  AND a.data >= rl.sent_at::date
  AND a.data <= (rl.sent_at::date + INTERVAL '30 days')
GROUP BY a.organization_id, a.id, a.cliente_id, c.nome, a.valor, a.data;

COMMENT ON VIEW public.recovered_agendamentos IS
  'R$ recuperado: agendamentos concluídos até 30d após uma reativação enviada ao mesmo cliente (por cliente_id ou telefone). security_invoker=on — RLS das bases vale para quem consulta.';

GRANT SELECT ON public.recovered_agendamentos TO authenticated;
GRANT SELECT, INSERT ON public.reactivation_log TO authenticated;
