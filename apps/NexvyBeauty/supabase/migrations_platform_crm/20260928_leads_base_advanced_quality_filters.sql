-- Extende os filtros da Base sem alterar os filtros atuais. O recorte é aplicado
-- antes da paginação, no mesmo RPC usado pela tela.
DO $migration$
DECLARE
  function_sql text;
  old_clause text := $old$
      OR (p_filters->>'phone' = 'without' AND nullif(btrim(p.phone), '') IS NULL)
    )
    AND ($old$;
  new_clause text := $new$
      OR (p_filters->>'phone' = 'without' AND nullif(btrim(p.phone), '') IS NULL)
    )
    AND (
      NOT (coalesce(p_filters, '{}'::jsonb) ? 'phone_quality')
      OR (p_filters->>'phone_quality' = 'missing' AND nullif(btrim(p.phone), '') IS NULL)
      OR (p_filters->>'phone_quality' = 'invalid' AND nullif(btrim(p.phone), '') IS NOT NULL AND p.phone_normalized IS NULL)
      OR (p_filters->>'phone_quality' = 'valid' AND p.phone_normalized IS NOT NULL)
    )
    AND (
      NOT (coalesce(p_filters, '{}'::jsonb) ? 'followers_range')
      OR (p_filters->>'followers_range' = 'under_1k' AND p.profile_count > 0 AND p.followers_count < 1000)
      OR (p_filters->>'followers_range' = '1k_3k' AND p.followers_count >= 1000 AND p.followers_count < 3000)
      OR (p_filters->>'followers_range' = '3k_10k' AND p.followers_count >= 3000 AND p.followers_count < 10000)
      OR (p_filters->>'followers_range' = '10k_50k' AND p.followers_count >= 10000 AND p.followers_count < 50000)
      OR (p_filters->>'followers_range' = '50k_plus' AND p.followers_count >= 50000)
    )
    AND (
      NOT (coalesce(p_filters, '{}'::jsonb) ? 'instagram')
      OR (p_filters->>'instagram' = 'with' AND EXISTS (
        SELECT 1 FROM public.platform_crm_extracted_leads e
        WHERE e.product_id = p_product_id AND e.imported_to_lead_id = p.lead_id
          AND nullif(btrim(e.handle), '') IS NOT NULL
      ))
      OR (p_filters->>'instagram' = 'without' AND NOT EXISTS (
        SELECT 1 FROM public.platform_crm_extracted_leads e
        WHERE e.product_id = p_product_id AND e.imported_to_lead_id = p.lead_id
          AND nullif(btrim(e.handle), '') IS NOT NULL
      ))
    )
    AND (
      NOT (coalesce(p_filters, '{}'::jsonb) ? 'name_identifiability')
      OR (p_filters->>'name_identifiability' = 'identifiable'
        AND nullif(btrim(p.name), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.platform_crm_extracted_leads e
          WHERE e.product_id = p_product_id AND e.imported_to_lead_id = p.lead_id
            AND nullif(btrim(e.handle), '') IS NOT NULL
            AND regexp_replace(lower(btrim(p.name)), '[^[:alnum:]]', '', 'g')
                = regexp_replace(lower(trim(leading '@' FROM btrim(e.handle))), '[^[:alnum:]]', '', 'g')
        ))
      OR (p_filters->>'name_identifiability' = 'not_identifiable'
        AND (nullif(btrim(p.name), '') IS NULL OR EXISTS (
          SELECT 1 FROM public.platform_crm_extracted_leads e
          WHERE e.product_id = p_product_id AND e.imported_to_lead_id = p.lead_id
            AND nullif(btrim(e.handle), '') IS NOT NULL
            AND regexp_replace(lower(btrim(p.name)), '[^[:alnum:]]', '', 'g')
                = regexp_replace(lower(trim(leading '@' FROM btrim(e.handle))), '[^[:alnum:]]', '', 'g')
        )))
    )
    AND ($new$;
BEGIN
  function_sql := pg_get_functiondef(
    'public.platform_crm_leads_base_page(uuid,jsonb,text,text,integer,integer)'::regprocedure
  );
  IF position(old_clause IN function_sql) = 0
     OR position(old_clause IN substring(function_sql FROM position(old_clause IN function_sql) + length(old_clause))) > 0 THEN
    RAISE EXCEPTION 'Não foi possível localizar de forma única o trecho esperado de filtros da Base; migração abortada.';
  END IF;
  function_sql := replace(function_sql, old_clause, new_clause);
  EXECUTE function_sql;
END;
$migration$;
