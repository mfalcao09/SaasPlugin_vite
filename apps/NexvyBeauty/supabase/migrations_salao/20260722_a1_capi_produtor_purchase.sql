-- A1 — o PRODUTOR do CAPI: compra paga vira evento Purchase na outbox.
-- Aplicada em prod como `a1_capi_produtor_purchase_trigger` + `a1_capi_purchase_resolve_produto_por_plano`.
--
-- CADEIA DO DEFEITO, descoberta de trás para frente:
--   ads_capi_events = 0 desde sempre
--     porque NADA jamais produziu evento (cakto-webhook tem zero mencao a capi/ads/ctwa)
--       e o trigger que resolve isso exige product_id
--         que o cakto-webhook resolveria em product_offers.cakto_product_id
--           e product_offers tem ZERO linhas
--             e alem disso e TENANT-SCOPED (organization_id NOT NULL)
--
-- Ou seja: mesmo com credencial do Meta, o CAPI seguiria mudo em tres niveis.
--
-- ⚠️ DIVIDA REGISTRADA, NAO CORRIGIDA AQUI: usar `product_offers` para mapear produto
-- da PLATAFORMA exigiria inventar uma org "Nexvy" ou poluir a tabela de ofertas de um
-- salao com os planos do SaaS. Existem apenas 2 organizacoes, ambas saloes. Essa
-- decisao estrutural e do Marcelo. Enquanto isso, `cakto_orders.product_id` seguira
-- nulo e o lookup do webhook (linha 85-92) segue sem filtro de org.
--
-- COMO O TRIGGER RESOLVE SEM ELA: confirma que o `product_cakto_id` do pedido pertence
-- a um plano conhecido (`platform_plans.cakto_product_id`, JA preenchido para
-- Essencial/Premium/Ultra/Teste) e atribui ao produto NexvyBeauty por SLUG — chave
-- estavel, nao uuid hardcoded.
--
-- TRIGGER, NAO PATCH NA EDGE FUNCTION: um pedido vira 'paid' por pelo menos tres
-- caminhos (cakto-webhook, cakto-reprocess-order, ajuste manual). Patchar um deixa os
-- outros mudos.
--
-- NAO envia nada ao Meta: so enfileira. Quem envia e `platform-capi-send`, que exige
-- os secrets CAPI_ENABLED / META_CAPI_TOKEN / META_CAPI_DATASET_ID / META_CAPI_WABA_ID
-- — nenhum existe no projeto. Por isso o evento fica legitimamente em 'pending'.
--
-- PROVA (sintetico, inserido e removido): pedido Essencial R$275 marcado como pago ->
-- evento Purchase / pending / 275.00 / BRL / produto NexvyBeauty.
-- Idempotencia: remarcado pago e depois approved -> continua 1 evento.
create or replace function public.cakto_order_enfileira_capi_purchase()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_product uuid;
begin
  if NEW.status not in ('paid','approved') then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.status in ('paid','approved') then
    return NEW;  -- já estava pago; não reenfileira a cada update
  end if;

  v_product := NEW.product_id;

  -- Fallback: pedido de um plano conhecido pertence ao produto NexvyBeauty.
  if v_product is null and NEW.product_cakto_id is not null then
    select p.id into v_product
    from public.platform_crm_products p
    where p.slug = 'nexvybeauty'
      and exists (
        select 1 from public.platform_plans pl
        where pl.cakto_product_id = NEW.product_cakto_id
      )
    limit 1;
  end if;

  if v_product is null then
    raise log '[capi] pedido % pago mas produto nao resolvido (cakto_product_id=%) — Purchase nao enfileirado',
      NEW.id, NEW.product_cakto_id;
    return NEW;
  end if;

  insert into public.ads_capi_events
    (product_id, lead_id, event_name, event_id, value, currency, event_time, status)
  values
    (v_product, NEW.lead_id, 'Purchase',
     'purchase:' || NEW.id::text,          -- determinístico: dedup do Meta contra o Pixel
     NEW.amount, 'BRL',
     coalesce(NEW.paid_at, now()), 'pending')
  on conflict (event_id) do nothing;

  return NEW;
end $function$;

drop trigger if exists trg_cakto_order_capi_purchase on public.cakto_orders;
create trigger trg_cakto_order_capi_purchase
  after insert or update of status on public.cakto_orders
  for each row execute function public.cakto_order_enfileira_capi_purchase();

-- Funcao de trigger: nao deve ser chamavel por ninguem diretamente.
revoke all on function public.cakto_order_enfileira_capi_purchase() from public, anon, authenticated;

comment on function public.cakto_order_enfileira_capi_purchase() is
  'A1/CAPI: pedido pago vira evento Purchase na outbox. Resolve o produto pelo plano quando cakto_orders.product_id vem nulo (product_offers esta vazia e e tenant-scoped). Idempotente por event_id.';
