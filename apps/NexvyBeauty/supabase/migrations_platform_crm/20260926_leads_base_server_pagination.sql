-- A Base de Leads deve filtrar, contar, ordenar e paginar no Postgres.
-- O cliente nunca deve carregar os 40k cards para exibir uma página pequena.

CREATE INDEX IF NOT EXISTS idx_pcrm_extracted_leads_product_imported_lead
  ON public.platform_crm_extracted_leads (product_id, imported_to_lead_id)
  WHERE imported_to_lead_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.platform_crm_leads_base_page(
  p_product_id uuid,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_sort_by text DEFAULT 'name',
  p_sort_direction text DEFAULT 'asc',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
WITH profile_rollup AS MATERIALIZED (
  SELECT
    e.imported_to_lead_id AS lead_id,
    count(*)::integer AS profile_count,
    coalesce(sum(greatest(coalesce(e.seguidores, 0), 0)), 0)::bigint
      AS followers_count,
    min(lower(coalesce(e.handle, ''))) AS handle_sort,
    (array_agg(e.handle ORDER BY e.created_at, e.id))[1] AS first_handle,
    CASE
      WHEN bool_or(coalesce(e.triagem, 'nao_classificado') = 'principal') THEN 'principal'
      WHEN bool_or(coalesce(e.triagem, 'nao_classificado') = 'semente') THEN 'semente'
      WHEN bool_and(coalesce(e.triagem, 'nao_classificado') = 'remocao_confirmada') THEN 'remocao_confirmada'
      ELSE 'nao_classificado'
    END AS triagem_summary,
    coalesce(bool_or(coalesce(e.triagem, 'nao_classificado') = 'principal'), false) AS has_principal,
    coalesce(bool_or(coalesce(e.triagem, 'nao_classificado') = 'semente'), false) AS has_semente,
    coalesce(bool_or(coalesce(e.triagem, 'nao_classificado') = 'nao_classificado'), false)
      AS has_nao_classificado,
    coalesce(bool_or(coalesce(e.triagem, 'nao_classificado') = 'remocao_confirmada'), false)
      AS has_remocao_confirmada
  FROM public.platform_crm_extracted_leads e
  WHERE e.product_id = p_product_id
    AND e.imported_to_lead_id IS NOT NULL
  GROUP BY e.imported_to_lead_id
), lead_rows AS MATERIALIZED (
  SELECT
    l.id AS lead_id,
    l.name,
    l.phone,
    l.source,
    l.updated_at,
    coalesce(s.derived_stage, 'db') AS derived_stage,
    coalesce(p.triagem_summary, 'nao_classificado') AS triagem_summary,
    coalesce(p.profile_count, 0) AS profile_count,
    coalesce(p.followers_count, 0) AS followers_count,
    coalesce(p.handle_sort, '') AS handle_sort,
    coalesce(p.first_handle, '') AS first_handle,
    coalesce(p.has_principal, false) AS has_principal,
    coalesce(p.has_semente, false) AS has_semente,
    coalesce(p.has_nao_classificado, false) AS has_nao_classificado,
    coalesce(p.has_remocao_confirmada, false) AS has_remocao_confirmada,
    regexp_replace(
      regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'),
      '^0+', '', 'g'
    ) AS phone_digits,
    EXISTS (
      SELECT 1
      FROM public.platform_crm_lead_operations op
      WHERE op.product_id = l.product_id
        AND op.lead_id = l.id
        AND op.status IN ('queued', 'running')
    ) AS has_active_operation,
    EXISTS (
      SELECT 1
      FROM public.platform_crm_lead_optout lo
      WHERE lo.product_id = l.product_id
        AND (
          (lo.telefone IS NOT NULL AND lo.telefone = l.phone)
          OR (
            lo.telefone IS NULL
            AND lo.handle IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.platform_crm_extracted_leads e
              WHERE e.product_id = l.product_id
                AND e.imported_to_lead_id = l.id
                AND lower(trim(leading '@' FROM e.handle)) =
                    lower(trim(leading '@' FROM lo.handle))
            )
          )
        )
    ) AS is_suppressed
  FROM public.platform_crm_leads l
  LEFT JOIN public.platform_crm_lead_state s
    ON s.product_id = l.product_id AND s.lead_id = l.id
  LEFT JOIN profile_rollup p ON p.lead_id = l.id
  WHERE l.product_id = p_product_id
), normalized AS MATERIALIZED (
  SELECT r.*,
    CASE
      WHEN left(r.phone_digits, 2) = '55'
        AND length(r.phone_digits) IN (12, 13)
        THEN substring(r.phone_digits FROM 3)
      ELSE r.phone_digits
    END AS national_phone
  FROM lead_rows r
), prepared AS MATERIALIZED (
  SELECT n.*,
    CASE
      WHEN length(n.national_phone) = 10
        AND substring(n.national_phone FROM 3 FOR 1) BETWEEN '6' AND '9'
        THEN '55' || substring(n.national_phone FROM 1 FOR 2) || '9' ||
             substring(n.national_phone FROM 3)
      WHEN length(n.national_phone) = 11
        AND substring(n.national_phone FROM 3 FOR 1) = '9'
        THEN '55' || n.national_phone
      ELSE NULL
    END AS phone_normalized
  FROM normalized n
), filtered AS MATERIALIZED (
  SELECT p.*
  FROM prepared p
  WHERE (
      NOT (coalesce(p_filters, '{}'::jsonb) ? 'triagem')
      OR jsonb_array_length(coalesce(p_filters->'triagem', '[]'::jsonb)) = 0
      OR (
        (p.profile_count = 0 AND
          coalesce(p_filters->'triagem', '[]'::jsonb) ? p.triagem_summary)
        OR (p.has_principal AND p_filters->'triagem' ? 'principal')
        OR (p.has_semente AND p_filters->'triagem' ? 'semente')
        OR (p.has_nao_classificado AND p_filters->'triagem' ? 'nao_classificado')
        OR (p.has_remocao_confirmada AND p_filters->'triagem' ? 'remocao_confirmada')
      )
    )
    AND (
      NOT (coalesce(p_filters, '{}'::jsonb) ? 'derived_stage')
      OR jsonb_array_length(coalesce(p_filters->'derived_stage', '[]'::jsonb)) = 0
      OR coalesce(p_filters->'derived_stage', '[]'::jsonb) ? p.derived_stage
    )
    AND (
      NOT (coalesce(p_filters, '{}'::jsonb) ? 'phone')
      OR (p_filters->>'phone' = 'with' AND nullif(btrim(p.phone), '') IS NOT NULL)
      OR (p_filters->>'phone' = 'without' AND nullif(btrim(p.phone), '') IS NULL)
    )
    AND (
      NOT (coalesce(p_filters, '{}'::jsonb) ? 'suppressed')
      OR p.is_suppressed = (p_filters->>'suppressed')::boolean
    )
    AND (
      NOT (coalesce(p_filters, '{}'::jsonb) ? 'active_operation')
      OR p.has_active_operation = (p_filters->>'active_operation')::boolean
    )
    AND (
      nullif(btrim(p_filters->>'query'), '') IS NULL
      OR strpos(lower(coalesce(p.name, '')), lower(btrim(p_filters->>'query'))) > 0
      OR strpos(lower(coalesce(p.phone, '')), lower(btrim(p_filters->>'query'))) > 0
      OR (
        nullif(regexp_replace(coalesce(p_filters->>'query', ''), '\D', '', 'g'), '') IS NOT NULL
        AND strpos(p.phone_digits,
          regexp_replace(p_filters->>'query', '\D', '', 'g')) > 0
      )
      OR EXISTS (
        SELECT 1
        FROM public.platform_crm_extracted_leads e
        WHERE e.product_id = p_product_id
          AND e.imported_to_lead_id = p.lead_id
          AND strpos(lower(coalesce(e.handle, '')),
            lower(btrim(p_filters->>'query'))) > 0
      )
    )
), page AS MATERIALIZED (
  SELECT f.*
  FROM filtered f
  ORDER BY
    CASE WHEN p_sort_by = 'name' AND p_sort_direction <> 'desc' THEN lower(f.name) END ASC,
    CASE WHEN p_sort_by = 'name' AND p_sort_direction = 'desc' THEN lower(f.name) END DESC,
    CASE WHEN p_sort_by = 'handle' AND p_sort_direction <> 'desc' THEN f.handle_sort END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'handle' AND p_sort_direction = 'desc' THEN f.handle_sort END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'followers' AND p_sort_direction <> 'desc' THEN f.followers_count END ASC,
    CASE WHEN p_sort_by = 'followers' AND p_sort_direction = 'desc' THEN f.followers_count END DESC,
    CASE WHEN p_sort_by = 'phone' AND p_sort_direction <> 'desc' THEN f.phone_normalized END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'phone' AND p_sort_direction = 'desc' THEN f.phone_normalized END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'stage' AND p_sort_direction <> 'desc' THEN f.derived_stage END ASC,
    CASE WHEN p_sort_by = 'stage' AND p_sort_direction = 'desc' THEN f.derived_stage END DESC,
    CASE WHEN p_sort_by = 'updated_at' AND p_sort_direction <> 'desc' THEN f.updated_at END ASC,
    CASE WHEN p_sort_by = 'updated_at' AND p_sort_direction = 'desc' THEN f.updated_at END DESC,
    lower(f.name) ASC,
    f.lead_id ASC
  LIMIT least(greatest(coalesce(p_limit, 25), 1), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0)
), page_with_profiles AS (
  SELECT
    pg.*,
    coalesce(profiles.items, '[]'::jsonb) AS profiles,
    coalesce(operations.items, '[]'::jsonb) AS active_operations,
    coalesce(operations.operation_count, 0)::integer AS active_operation_count
  FROM page pg
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', e.id,
      'handle', e.handle,
      'triagem', e.triagem,
      'telefone', e.telefone,
      'seguidores', e.seguidores,
      'origem', e.extraction_id
    ) ORDER BY e.created_at, e.id) AS items
    FROM public.platform_crm_extracted_leads e
    WHERE e.product_id = p_product_id AND e.imported_to_lead_id = pg.lead_id
  ) profiles ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS operation_count,
      jsonb_agg(jsonb_build_object(
        'id', op.id,
        'type', op.operation_type,
        'status', op.status,
        'requested_at', op.requested_at
      ) ORDER BY op.requested_at DESC) AS items
    FROM public.platform_crm_lead_operations op
    WHERE op.product_id = p_product_id
      AND op.lead_id = pg.lead_id
      AND op.status IN ('queued', 'running')
  ) operations ON true
)
SELECT jsonb_build_object(
  'filtered_total', (SELECT count(*) FROM filtered),
  'data', coalesce((
    SELECT jsonb_agg(to_jsonb(pp) - 'phone_digits' - 'national_phone' -
      'handle_sort' - 'first_handle' - 'has_principal' - 'has_semente' -
      'has_nao_classificado' - 'has_remocao_confirmada' - 'has_active_operation')
    FROM page_with_profiles pp
  ), '[]'::jsonb),
  'summary', jsonb_build_object(
    'total_cards', (SELECT count(*) FROM public.platform_crm_leads l
      WHERE l.product_id = p_product_id),
    'with_phone', (SELECT count(*) FROM public.platform_crm_leads l
      WHERE l.product_id = p_product_id AND nullif(btrim(l.phone), '') IS NOT NULL),
    'active_operations', (SELECT count(DISTINCT op.lead_id)
      FROM public.platform_crm_lead_operations op
      WHERE op.product_id = p_product_id AND op.lead_id IS NOT NULL
        AND op.status IN ('queued', 'running'))
  )
);
$function$;

REVOKE ALL ON FUNCTION public.platform_crm_leads_base_page(
  uuid, jsonb, text, text, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_crm_leads_base_page(
  uuid, jsonb, text, text, integer, integer
) TO service_role;
