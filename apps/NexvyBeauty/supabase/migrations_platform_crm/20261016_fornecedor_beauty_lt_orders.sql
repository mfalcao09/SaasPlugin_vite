-- Fornecedor Beauty - LT: produto e pedidos Kiwify isolados por product_id.
-- Não cria tenant SaaS nem altera leads do produto nexvybeauty.

DO $$
DECLARE v_operation_id uuid;
BEGIN
  SELECT id INTO v_operation_id FROM public.group_operations WHERE slug = 'nexvy-saas';
  IF NOT EXISTS (SELECT 1 FROM public.platform_crm_products WHERE slug = 'fornecedor-beauty-lt') THEN
    INSERT INTO public.platform_crm_products (
      name, slug, status, category, description, short_description, pricing,
      external_links, icp, benefits, guarantee, operation_id
    ) VALUES (
      'Fornecedor Beauty - LT', 'fornecedor-beauty-lt', 'published', 'digital_guide',
      'Guia digital em PDF com 36 fornecedores Beauty organizados e contatos conferidos manualmente. Entrega pela área de membros da Kiwify.',
      '36 fornecedores Beauty para encontrar opções, comparar e comprar melhor',
      '{"price_brl":33,"payment":"one_time","supplier_count":36}'::jsonb,
      '{"checkout_url":"https://pay.kiwify.com.br/F8vRJVm","kiwify_product_id":"74da87e0-c6f2-11f1-9559-e7839c973a23"}'::jsonb,
      'Profissionais de beleza que compram produtos para uso no negócio; secundariamente revendedoras e demais compradores Beauty.',
      '36 contatos organizados em um PDF para iniciar cotações sem começar a pesquisa do zero.',
      '7 dias para solicitar reembolso pela Kiwify.',
      v_operation_id
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_crm_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.platform_crm_products(id) ON DELETE RESTRICT,
  lead_id uuid REFERENCES public.platform_crm_leads(id) ON DELETE SET NULL,
  provider text NOT NULL,
  external_order_id text NOT NULL,
  external_product_id text NOT NULL,
  order_status text NOT NULL CHECK (order_status IN ('approved','refunded','chargeback')),
  customer_name text,
  customer_email text,
  customer_phone text,
  amount_cents integer CHECK (amount_cents IS NULL OR amount_cents >= 0),
  currency text NOT NULL DEFAULT 'BRL',
  payment_method text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  src text,
  sck text,
  first_approved_at timestamptz,
  refunded_at timestamptz,
  last_event_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_orders_provider_external_unique UNIQUE (provider, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_crm_orders_product_created
  ON public.platform_crm_orders (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_crm_orders_lead
  ON public.platform_crm_orders (lead_id) WHERE lead_id IS NOT NULL;

ALTER TABLE public.platform_crm_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_crm_orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_crm_orders TO service_role;

CREATE OR REPLACE FUNCTION public.platform_crm_ingest_beauty_lt_order(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
  v_order_id text := nullif(btrim(p_payload->>'order_id'), '');
  v_external_product_id text := nullif(btrim(p_payload#>>'{Product,product_id}'), '');
  v_event text := lower(coalesce(p_payload->>'webhook_event_type', ''));
  v_incoming_status text;
  v_status text;
  v_email text := nullif(lower(btrim(p_payload#>>'{Customer,email}')), '');
  v_name text := nullif(btrim(p_payload#>>'{Customer,full_name}'), '');
  v_phone text := nullif(btrim(p_payload#>>'{Customer,mobile}'), '');
  v_amount integer;
  v_order public.platform_crm_orders%ROWTYPE;
  v_lead_id uuid;
BEGIN
  IF v_order_id IS NULL OR length(v_order_id) > 200 THEN
    RAISE EXCEPTION 'invalid_order_id';
  END IF;
  IF v_external_product_id <> '74da87e0-c6f2-11f1-9559-e7839c973a23' OR v_external_product_id IS NULL THEN
    RAISE EXCEPTION 'unexpected_kiwify_product';
  END IF;

  v_incoming_status := CASE v_event
    WHEN 'order_approved' THEN 'approved'
    WHEN 'order_refunded' THEN 'refunded'
    WHEN 'chargeback' THEN 'chargeback'
    ELSE NULL
  END;
  IF v_incoming_status IS NULL THEN RAISE EXCEPTION 'unsupported_event'; END IF;

  SELECT id INTO STRICT v_product_id
  FROM public.platform_crm_products
  WHERE slug = 'fornecedor-beauty-lt'
    AND external_links->>'kiwify_product_id' = v_external_product_id;

  IF v_incoming_status = 'approved' AND v_email IS NULL THEN
    RAISE EXCEPTION 'approved_order_missing_customer_email';
  END IF;

  -- A Kiwify reenvia eventos. Bloqueio transacional + UNIQUE evitam corrida/replay.
  PERFORM pg_advisory_xact_lock(hashtextextended('kiwify-order:' || v_order_id, 0));
  SELECT * INTO v_order FROM public.platform_crm_orders
  WHERE provider = 'kiwify' AND external_order_id = v_order_id FOR UPDATE;

  v_status := CASE
    WHEN v_order.order_status = 'chargeback' OR v_incoming_status = 'chargeback' THEN 'chargeback'
    WHEN v_order.order_status = 'refunded' OR v_incoming_status = 'refunded' THEN 'refunded'
    ELSE 'approved'
  END;
  v_lead_id := v_order.lead_id;

  IF v_incoming_status = 'approved' AND v_lead_id IS NULL THEN
    -- Unicidade operacional por (produto,email), sem tocar no lead SaaS.
    PERFORM pg_advisory_xact_lock(hashtextextended('beauty-lt-email:' || v_email, 0));
    SELECT id INTO v_lead_id FROM public.platform_crm_leads
    WHERE product_id = v_product_id AND lower(email) = v_email
    ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF v_lead_id IS NULL THEN
      INSERT INTO public.platform_crm_leads (
        product_id, name, email, phone, source, lead_origin, lead_channel,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content, metadata
      ) VALUES (
        v_product_id, coalesce(v_name, split_part(v_email, '@', 1)), v_email,
        v_phone, 'kiwify', 'purchase', 'kiwify',
        nullif(p_payload#>>'{TrackingParameters,utm_source}', ''),
        nullif(p_payload#>>'{TrackingParameters,utm_medium}', ''),
        nullif(p_payload#>>'{TrackingParameters,utm_campaign}', ''),
        nullif(p_payload#>>'{TrackingParameters,utm_term}', ''),
        nullif(p_payload#>>'{TrackingParameters,utm_content}', ''),
        jsonb_build_object('source_product', 'fornecedor-beauty-lt')
      ) RETURNING id INTO v_lead_id;
    END IF;
  END IF;

  v_amount := nullif(p_payload#>>'{Commissions,charge_amount}', '')::integer;

  INSERT INTO public.platform_crm_orders (
    product_id, lead_id, provider, external_order_id, external_product_id,
    order_status, customer_name, customer_email, customer_phone, amount_cents,
    currency, payment_method, utm_source, utm_medium, utm_campaign, utm_term,
    utm_content, src, sck, first_approved_at, refunded_at, last_event_type
  ) VALUES (
    v_product_id, v_lead_id, 'kiwify', v_order_id, v_external_product_id,
    v_status, v_name, v_email, v_phone, v_amount,
    coalesce(nullif(p_payload#>>'{Commissions,currency}', ''), 'BRL'),
    nullif(p_payload->>'payment_method', ''),
    nullif(p_payload#>>'{TrackingParameters,utm_source}', ''),
    nullif(p_payload#>>'{TrackingParameters,utm_medium}', ''),
    nullif(p_payload#>>'{TrackingParameters,utm_campaign}', ''),
    nullif(p_payload#>>'{TrackingParameters,utm_term}', ''),
    nullif(p_payload#>>'{TrackingParameters,utm_content}', ''),
    nullif(p_payload#>>'{TrackingParameters,src}', ''),
    nullif(p_payload#>>'{TrackingParameters,sck}', ''),
    CASE WHEN v_incoming_status = 'approved' THEN now() ELSE NULL END,
    CASE WHEN v_status = 'refunded' THEN now() ELSE NULL END,
    v_event
  )
  ON CONFLICT (provider, external_order_id) DO UPDATE SET
    lead_id = coalesce(EXCLUDED.lead_id, platform_crm_orders.lead_id),
    order_status = EXCLUDED.order_status,
    customer_name = coalesce(EXCLUDED.customer_name, platform_crm_orders.customer_name),
    customer_email = coalesce(EXCLUDED.customer_email, platform_crm_orders.customer_email),
    customer_phone = coalesce(EXCLUDED.customer_phone, platform_crm_orders.customer_phone),
    amount_cents = coalesce(EXCLUDED.amount_cents, platform_crm_orders.amount_cents),
    utm_source = coalesce(EXCLUDED.utm_source, platform_crm_orders.utm_source),
    utm_medium = coalesce(EXCLUDED.utm_medium, platform_crm_orders.utm_medium),
    utm_campaign = coalesce(EXCLUDED.utm_campaign, platform_crm_orders.utm_campaign),
    utm_term = coalesce(EXCLUDED.utm_term, platform_crm_orders.utm_term),
    utm_content = coalesce(EXCLUDED.utm_content, platform_crm_orders.utm_content),
    src = coalesce(EXCLUDED.src, platform_crm_orders.src),
    sck = coalesce(EXCLUDED.sck, platform_crm_orders.sck),
    first_approved_at = coalesce(platform_crm_orders.first_approved_at, EXCLUDED.first_approved_at),
    refunded_at = coalesce(platform_crm_orders.refunded_at, EXCLUDED.refunded_at),
    last_event_type = EXCLUDED.last_event_type,
    updated_at = now()
  RETURNING * INTO v_order;

  RETURN jsonb_build_object('order_id', v_order.id, 'lead_id', v_order.lead_id,
                            'status', v_order.order_status);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_crm_ingest_beauty_lt_order(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_crm_ingest_beauty_lt_order(jsonb) TO service_role;
