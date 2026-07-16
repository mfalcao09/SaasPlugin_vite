-- ============================================================================
-- NEXVYADS — função ads_capi_pending(): o join DESACOPLADO do funil → CAPI.
-- ----------------------------------------------------------------------------
-- O edge platform-capi-send (G4) consome esta função. Ela pega os eventos de
-- jornada CTWA-atribuídos que AINDA NÃO foram enviados à Conversions API:
--   • join lateral com ads_attribution → resolve o ctwa_clid (só quem veio de
--     anúncio entra; CROSS JOIN = descarta jornada sem atribuição);
--   • anti-join ads_capi_events (por journey_event_id) → nunca reenvia;
--   • filtro dos 6 eventos do funil, com temperature_changed→qualificada só
--     quando a temperatura sobe para warm/hot (dona real).
-- Assim o CAPI não precisa que webhook/brain/esteira/cakto o chamem: eles só
-- emitem jornada (o que já fazem) e o dispatcher varre. Zero acoplamento.
--
-- SECURITY INVOKER (default): chamada pelo edge com service_role (bypassa RLS).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ads_capi_pending(p_limit int DEFAULT 100)
RETURNS TABLE (
  journey_event_id uuid,
  product_id       uuid,
  lead_id          uuid,
  conversation_id  uuid,
  event_type       text,
  ctwa_clid        text,
  occurred_at      timestamptz,
  value            numeric,
  currency         text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    je.id,
    je.product_id,
    je.lead_id,
    je.conversation_id,
    je.event_type::text,
    att.ctwa_clid,
    je.occurred_at,
    NULLIF(je.payload->>'value', '')::numeric AS value,
    je.payload->>'currency' AS currency
  FROM public.platform_crm_journey_events je
  CROSS JOIN LATERAL (
    -- ctwa_clid mais recente atribuído à conversa/lead deste evento.
    SELECT a.ctwa_clid
    FROM public.ads_attribution a
    WHERE a.ctwa_clid IS NOT NULL
      AND (a.conversation_id = je.conversation_id OR a.lead_id = je.lead_id)
    ORDER BY a.occurred_at DESC
    LIMIT 1
  ) att
  WHERE je.occurred_at > now() - interval '30 days'
    AND (
      je.event_type IN (
        'meta_ctwa_received', 'lead_qualified', 'demo_completed',
        'checkout_created', 'sale_completed', 'pix_paid'
      )
      OR (je.event_type = 'temperature_changed' AND je.payload->>'to' IN ('warm', 'hot'))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.ads_capi_events ce WHERE ce.journey_event_id = je.id
    )
  ORDER BY je.occurred_at ASC
  LIMIT GREATEST(p_limit, 1);
$$;

-- ============================================================================
-- FIM — ads_capi_pending(). Produtores dos eventos (cada um no seu PR/camada):
--   #2 meta_ctwa_received  → platform-meta-whatsapp-webhook (G1, ESTE build)
--   #3 temperature_changed→warm/hot → trigger de leads (já existe)
--   #4 demo_completed      → esteira demo-* (PRs #70-74, quando mergear)
--   #5 checkout_created / #6 sale_completed/pix_paid → checkout/Cakto (bridge próprio)
-- ============================================================================
