-- Teste transacional da Fase 1. Nunca executar sem ROLLBACK ao final.
BEGIN;

DO $$
DECLARE
  v_product_id uuid;
  v_lead_id uuid;
  v_phone text := '5599' || lpad((floor(random() * 100000000))::text, 8, '0');
  v_stage text;
  v_roster_count integer;
BEGIN
  SELECT id INTO v_product_id
  FROM public.platform_crm_products
  ORDER BY id
  LIMIT 1;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Harness regression test: no product available';
  END IF;

  INSERT INTO public.platform_crm_leads (product_id, name, phone, source)
  VALUES (v_product_id, 'TEST — Nova Prospecção Fase 1', v_phone, 'controlled_test')
  RETURNING id INTO v_lead_id;

  INSERT INTO public.platform_crm_lead_state
    (lead_id, product_id, version, derived_stage, facts)
  VALUES
    (v_lead_id, v_product_id, 0, 'db', jsonb_build_object(
      'harness', jsonb_build_object(
        'greeting', 'Olá',
        'instagram_handle', 'test_harness_fase1',
        'resume_exception', false,
        'pilot_order', 999999,
        'cohort', 'controlled-test'
      )
    ));

  UPDATE public.platform_crm_lead_state
  SET derived_stage = 'preselected', version = version + 1
  WHERE lead_id = v_lead_id AND product_id = v_product_id;

  SELECT derived_stage INTO v_stage
  FROM public.platform_crm_lead_state
  WHERE lead_id = v_lead_id AND product_id = v_product_id;
  IF v_stage <> 'preselected' THEN
    RAISE EXCEPTION 'Harness regression test: db -> preselected failed';
  END IF;

  SELECT count(*) INTO v_roster_count
  FROM public.platform_crm_leads l
  JOIN public.platform_crm_lead_state s
    ON s.lead_id = l.id AND s.product_id = l.product_id
  WHERE l.id = v_lead_id
    AND s.derived_stage = 'preselected'
    AND s.facts #>> '{harness,instagram_handle}' = 'test_harness_fase1';
  IF v_roster_count <> 1 THEN
    RAISE EXCEPTION 'Harness regression test: preselected roster lookup failed';
  END IF;

  UPDATE public.platform_crm_lead_state
  SET derived_stage = 'contacted', version = version + 1
  WHERE lead_id = v_lead_id AND product_id = v_product_id;
  UPDATE public.platform_crm_lead_state
  SET derived_stage = 'remarketing_pool', version = version + 1
  WHERE lead_id = v_lead_id AND product_id = v_product_id;
  UPDATE public.platform_crm_lead_state
  SET derived_stage = 'service', version = version + 1
  WHERE lead_id = v_lead_id AND product_id = v_product_id;
  UPDATE public.platform_crm_lead_state
  SET derived_stage = 'do_not_contact', version = version + 1
  WHERE lead_id = v_lead_id AND product_id = v_product_id;

  SELECT derived_stage INTO v_stage
  FROM public.platform_crm_lead_state
  WHERE lead_id = v_lead_id AND product_id = v_product_id;
  IF v_stage <> 'do_not_contact' THEN
    RAISE EXCEPTION 'Harness regression test: final transition failed';
  END IF;

  RAISE NOTICE 'Harness regression passed for controlled lead %', v_lead_id;
END $$;

ROLLBACK;
