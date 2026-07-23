-- A1 — o PRODUTOR do CAPI: compra paga vira evento de venda na jornada.
--
-- Consolida as migrations aplicadas em prod, na ordem:
--   a1_capi_produtor_purchase_trigger
--   a1_capi_purchase_resolve_produto_por_plano
--   a1b_platform_plans_product_id
--   a1b_capi_trigger_le_produto_do_plano
--   a1c_corrige_capi_escreve_journey_event   <- versao final desta funcao
--
-- ════════════════════════════════════════════════════════════════════════════
-- A CADEIA DO DEFEITO, descoberta de tras para frente
-- ════════════════════════════════════════════════════════════════════════════
-- `ads_capi_events` estava em 0 desde sempre. Nao era um elo faltando, eram varios:
--
--   1. NADA jamais produziu evento de venda
--      (cakto-webhook tem zero mencao a capi/ads/ctwa)
--   2. o produtor precisa de product_id
--   3. que o webhook resolveria em product_offers — tabela com ZERO linhas
--   4. e que ainda por cima e TENANT-SCOPED (organization_id NOT NULL): guardar
--      "Essencial R$275" ali afirmaria que o salao Studio Bella vende esse plano
--   5. e EU escrevi na tabela errada: ads_capi_events e o registro de SAIDA, nao a
--      fila de ENTRADA
--
-- O item 5 foi erro meu, e passou por "pronto" antes de ser pego. O que denunciou
-- foi `platform-capi-send` responder 200 com `candidates: 0` — contador zerado com
-- a tabela cheia. Mesmo padrao do `sem_conversa` parado no classificador: sucesso
-- aparente sem progresso.
--
-- ════════════════════════════════════════════════════════════════════════════
-- O CAMINHO REAL
-- ════════════════════════════════════════════════════════════════════════════
--   compra paga
--     -> platform_crm_journey_events (sale_completed)      FILA DE ENTRADA
--          -> ads_capi_pending() cruza com ads_attribution (ctwa_clid)
--               -> platform-capi-send envia ao Meta
--                    -> ads_capi_events                    REGISTRO DE SAIDA
--
-- ⚠️ Isto NAO faz o CAPI disparar sozinho: `ads_capi_pending` exige atribuicao CTWA,
-- que nasce do CLIQUE no anuncio. ads_attribution tem 0 linhas — e esta CERTO: sem
-- anuncio no ar nao ha clique, e venda organica nao deve ser reportada como
-- conversao de anuncio.
--
-- ════════════════════════════════════════════════════════════════════════════
-- DECISAO DO MARCELO (23/07): ligacao explicita PLANO -> PRODUTO
-- ════════════════════════════════════════════════════════════════════════════
-- Descartadas: (a) criar org fantasma "Nexvy (plataforma)" para usar product_offers;
-- (c) deixar o trigger assumir NexvyBeauty — quebra no 2o produto que vender.
-- Escolhida (b): uma coluna em platform_plans. Semanticamente correta e tira a
-- tabela tenant-scoped do caminho da plataforma de vez.
alter table public.platform_plans
  add column if not exists product_id uuid references public.platform_crm_products(id);

update public.platform_plans
set product_id = (select id from public.platform_crm_products where slug = 'nexvybeauty')
where product_id is null;

create index if not exists idx_platform_plans_product on public.platform_plans (product_id);

comment on column public.platform_plans.product_id is
  'Produto (platform_crm_products) que este plano vende. Substitui o uso de product_offers — que e TENANT-scoped e nao serve para oferta da plataforma.';

-- ── o trigger ───────────────────────────────────────────────────────────────
-- TRIGGER, NAO PATCH NA EDGE FUNCTION: um pedido vira 'paid' por pelo menos tres
-- caminhos (cakto-webhook, cakto-reprocess-order, ajuste manual). Patchar um deixa
-- os outros mudos.
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

  -- O plano diz de qual produto ele é. Sem chute.
  if v_product is null and NEW.product_cakto_id is not null then
    select pl.product_id into v_product
    from public.platform_plans pl
    where pl.cakto_product_id = NEW.product_cakto_id
    limit 1;
  end if;

  -- Melhor NAO atribuir do que atribuir errado: atribuicao errada ninguem desconfia.
  if v_product is null then
    raise log '[capi] pedido % pago mas produto nao resolvido (cakto_product_id=%). Preencha platform_plans.product_id.',
      NEW.id, NEW.product_cakto_id;
    return NEW;
  end if;

  insert into public.platform_crm_journey_events
    (product_id, lead_id, event_type, event_category, channel, source,
     title, description, payload, occurred_at)
  values
    (v_product, NEW.lead_id, 'sale_completed', 'sale', 'whatsapp', 'cakto',
     'Venda concluída',
     coalesce(NEW.product_name, 'Plano') || ' — R$ ' || coalesce(NEW.amount::text, '?'),
     jsonb_build_object(
       'cakto_order_id', NEW.id::text,
       'cakto_id',       NEW.cakto_id,
       'value',          NEW.amount,
       'currency',       'BRL',
       'product_name',   NEW.product_name
     ),
     coalesce(NEW.paid_at, now()))
  on conflict do nothing;

  return NEW;
end $function$;

-- Idempotencia real: um sale_completed por pedido da Cakto.
create unique index if not exists uq_journey_sale_por_pedido_cakto
  on public.platform_crm_journey_events ((payload->>'cakto_order_id'))
  where event_type = 'sale_completed';

drop trigger if exists trg_cakto_order_capi_purchase on public.cakto_orders;
create trigger trg_cakto_order_capi_purchase
  after insert or update of status on public.cakto_orders
  for each row execute function public.cakto_order_enfileira_capi_purchase();

revoke all on function public.cakto_order_enfileira_capi_purchase() from public, anon, authenticated;

comment on function public.cakto_order_enfileira_capi_purchase() is
  'A1/CAPI: pedido pago gera sale_completed em platform_crm_journey_events — a fila que ads_capi_pending() le. NAO escreve em ads_capi_events (esse e o registro de SAIDA).';

-- ── PROVAS (sinteticos, inseridos e removidos) ──────────────────────────────
--   plano COM product_id (Essencial R$275)  -> sale_completed / sale / NexvyBeauty
--   remarcado paid e depois approved        -> continua 1 evento (idempotente)
--   cakto_product_id DESCONHECIDO           -> NAO enfileira, so loga (nao chuta)
--   5/5 planos com produto explicito
