-- ─────────────────────────────────────────────────────────────────────────────
-- 20260704_pilot_funnel.sql — sub_vertical (F2.6) + funil de ativação (F2.7)
--
-- F2.6: coorte de pilotos 5×1 é um experimento de segmentação (análise PMF v2) —
--       cada organização piloto é etiquetada com a sub-vertical da beleza.
-- F2.7: funil semanal por organização: conectou (instância Evolution) →
--       disparou (reactivation_log) → RETORNOU (recovered_agendamentos).
--       Nota honesta: o evento 3 do roadmap era "resposta"; webchat_messages não
--       carrega organization_id direto (join por conversation), então o v1 usa
--       o evento mais forte e já atribuível: retorno concluído (recuperado).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS sub_vertical text;

COMMENT ON COLUMN public.organizations.sub_vertical IS
  'Sub-vertical da beleza (experimento piloto 5x1): salao | nails | lash | brow | podologia | estetica. Livre para novos segmentos.';

-- ── Funil de ativação semanal por organização ────────────────────────────────
DROP VIEW IF EXISTS public.pilot_activation_funnel;

CREATE VIEW public.pilot_activation_funnel
WITH (security_invoker = on) AS
WITH sends AS (
  SELECT
    organization_id,
    date_trunc('week', sent_at)::date AS semana,
    count(*)                          AS disparos
  FROM public.reactivation_log
  GROUP BY 1, 2
),
recovered AS (
  SELECT
    organization_id,
    date_trunc('week', first_sent_at)::date AS semana,
    count(*)     AS retornos,
    sum(valor)   AS valor_recuperado
  FROM public.recovered_agendamentos
  GROUP BY 1, 2
)
SELECT
  o.id            AS organization_id,
  o.sub_vertical,
  s.semana,
  (EXISTS (
    SELECT 1 FROM public.evolution_instances ei
    WHERE ei.organization_id = o.id
  ))              AS conectado,
  s.disparos,
  COALESCE(r.retornos, 0)          AS retornos,
  COALESCE(r.valor_recuperado, 0)  AS valor_recuperado
FROM sends s
JOIN public.organizations o ON o.id = s.organization_id
LEFT JOIN recovered r
  ON r.organization_id = s.organization_id AND r.semana = s.semana;

COMMENT ON VIEW public.pilot_activation_funnel IS
  'Funil de ativação semanal do piloto (conectou → disparou → retornou) por organização × sub_vertical. security_invoker=on: RLS das bases vale para quem consulta. Roadmap lancamento-v3 F2.7.';

GRANT SELECT ON public.pilot_activation_funnel TO authenticated;
