-- ─────────────────────────────────────────────────────────────────────────────
-- 20260706_sellers_e_relatorio_vendas.sql — SELLERS na camada de afiliados +
--                                           relatório de vendas por seller.
--
-- CONTEXTO (investigado no código, não inferido):
--   • O checkout Cakto aceita ?src=<seller> na URL (pass-through de tracking).
--   • O webhook (supabase/functions/cakto-webhook/index.ts, L60) grava o pedido
--     inteiro em cakto_orders.raw_payload.
--   • A migration IRMÃ 20260706_cakto_seller_attribution.sql (mesmo dia, braço
--     ATRIBUICAO) MATERIALIZA a atribuição em colunas consultáveis:
--         cakto_orders.seller_ref   (text  — o src cru do checkout)
--         cakto_orders.affiliate_id (uuid  — FK affiliates, resolvido no webhook
--                                     via resolve_affiliate_ref(ref_code)).
--     → Esta migration NÃO recria essas colunas (evita colisão); o RELATÓRIO
--       aqui LÊ seller_ref/affiliate_id direto, sem parse de JSON.
--   • A camada PRÓPRIA de sellers já existe: affiliates + affiliate_links +
--     resolve_affiliate_ref() (migrations_salao/20260619_affiliates_tracking.sql).
--     ref_code é provider-agnóstico: ?ref= (LP própria) e ?src= (checkout Cakto)
--     apontam para o MESMO ref_code.
--
-- ORDEM de aplicação: os dois arquivos são 20260706_*; alfabeticamente
--   `cakto_seller_attribution` < `sellers_e_relatorio_vendas`, logo as colunas
--   já existem quando esta view é criada. (Se aplicada isolada antes da irmã,
--   a view falha por coluna inexistente — aplicar as duas do dia 06.)
--
-- DECISÃO (reuso, sem tabela nova): um "seller" é um affiliate. Cada seller —
--   agente IA (Duda, Bia) OU vendedor humano OU afiliado externo — vira 1 linha
--   em affiliates + 1 ref_code em affiliate_links. Diferenciamos pela coluna
--   NOVA affiliates.kind ('agente_ia' | 'humano' | 'externo').
--
-- Tudo idempotente (ON CONFLICT / IF NOT EXISTS / WHERE NOT EXISTS): reaplicar
--   não duplica seller nem altera resultado.
--
-- NÃO aplicar aqui: o orquestrador aplica via MCP apply_migration.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tipar o affiliate como "seller" ──────────────────────────────────────
-- affiliates é a entidade; kind diz QUE tipo de vendedor é. Default 'externo'
-- preserva a semântica original da tabela (parceiro que vende a plataforma).
ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'externo';

-- Guard-rail: só valores conhecidos. DROP+ADD torna a constraint idempotente.
ALTER TABLE public.affiliates DROP CONSTRAINT IF EXISTS affiliates_kind_chk;
ALTER TABLE public.affiliates
  ADD CONSTRAINT affiliates_kind_chk
  CHECK (kind IN ('agente_ia', 'humano', 'externo'));

COMMENT ON COLUMN public.affiliates.kind IS
  'Tipo de seller: agente_ia (Duda/Bia) | humano (vendedor interno) | externo (afiliado parceiro). Registrado em 20260706_sellers_e_relatorio_vendas.';

-- ── 2. Registrar os AGENTES IA como sellers (Duda + Bia) ────────────────────
-- Idempotente: upsert por lower(email) (índice único idx_affiliates_email).
-- Emails sintéticos @agent.nexvy.tech (não recebem payout; commission_pct=0).
INSERT INTO public.affiliates (name, email, kind, status, commission_pct, notes)
VALUES
  ('Duda (SDR IA)',    'duda@agent.nexvy.tech', 'agente_ia', 'active', 0,
   'Agente IA SDR — abre, descobre, recomenda e fecha o simples. seller_ref=duda.'),
  ('Bia (Closer IA)',  'bia@agent.nexvy.tech',  'agente_ia', 'active', 0,
   'Agente IA closer — recebe o dossiê da Duda e fecha o piloto. seller_ref=bia.')
ON CONFLICT (lower(email)) DO UPDATE
  SET kind   = EXCLUDED.kind,
      status = EXCLUDED.status,
      notes  = EXCLUDED.notes,
      updated_at = now();

-- ── 3. ref_code de cada agente ('duda' / 'bia') em affiliate_links ──────────
-- affiliate_links tem UNIQUE(lower(ref_code)); como a única é sobre expressão
-- funcional, ON CONFLICT nativo não a alcança → INSERT ... WHERE NOT EXISTS
-- (idempotente). É este ref_code que o webhook usa em resolve_affiliate_ref()
-- para preencher cakto_orders.affiliate_id.
INSERT INTO public.affiliate_links (affiliate_id, ref_code, label)
SELECT a.id, 'duda', 'Agente IA Duda (SDR)'
FROM public.affiliates a
WHERE lower(a.email) = 'duda@agent.nexvy.tech'
  AND NOT EXISTS (
    SELECT 1 FROM public.affiliate_links l WHERE lower(l.ref_code) = 'duda'
  );

INSERT INTO public.affiliate_links (affiliate_id, ref_code, label)
SELECT a.id, 'bia', 'Agente IA Bia (closer)'
FROM public.affiliates a
WHERE lower(a.email) = 'bia@agent.nexvy.tech'
  AND NOT EXISTS (
    SELECT 1 FROM public.affiliate_links l WHERE lower(l.ref_code) = 'bia'
  );

-- ── 4. PADRÃO pronto para vendedores humanos: cada user vira um ref_code ────
-- Helper idempotente: registra um seller humano e seu ref_code em 1 chamada.
-- Uso (fora desta migration, quando um vendedor entrar):
--   SELECT public.register_human_seller('ana', 'Ana Vendas', 'ana@nexvy.tech', '<auth_uid>');
-- O ref_code humano é tipicamente o primeiro nome / handle; ?src=ana no checkout.
CREATE OR REPLACE FUNCTION public.register_human_seller(
  p_ref_code text,
  p_name     text,
  p_email    text,
  p_user_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_affiliate_id uuid;
BEGIN
  -- 1) upsert do seller (por email), tipando como humano
  INSERT INTO public.affiliates (name, email, kind, status, commission_pct, user_id)
  VALUES (p_name, p_email, 'humano', 'active', 0, p_user_id)
  ON CONFLICT (lower(email)) DO UPDATE
    SET name    = EXCLUDED.name,
        kind    = 'humano',
        user_id = COALESCE(public.affiliates.user_id, EXCLUDED.user_id),
        updated_at = now()
  RETURNING id INTO v_affiliate_id;

  -- 2) garante o ref_code (idempotente por lower(ref_code))
  INSERT INTO public.affiliate_links (affiliate_id, ref_code, label)
  SELECT v_affiliate_id, lower(p_ref_code), p_name
  WHERE NOT EXISTS (
    SELECT 1 FROM public.affiliate_links l WHERE lower(l.ref_code) = lower(p_ref_code)
  );

  RETURN v_affiliate_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_human_seller(text, text, text, uuid)
  TO authenticated, service_role;
COMMENT ON FUNCTION public.register_human_seller(text, text, text, uuid) IS
  'Registra um vendedor humano como seller (affiliate kind=humano) + seu ref_code em affiliate_links. Idempotente. ?src=<ref_code> no checkout Cakto atribui a venda a ele.';

-- ── 5. RELATÓRIO: platform_vendas_por_seller ────────────────────────────────
-- Agrega cakto_orders (as vendas) por seller, SÓ status pago.
--
-- FONTE da atribuição (colunas materializadas pela migration irmã):
--   cakto_orders.seller_ref   → o ?src= cru do checkout (já normalizado no
--                               mapper; aqui só lower() por segurança).
--   cakto_orders.affiliate_id → FK affiliates, resolvida no webhook. Preferimos
--                               ela quando presente; senão caímos no ref_code.
--
-- pago = status IN ('paid','approved') — os dois valores que o código trata
--   como venda paga (cakto-plan-provisioning.ts L141 aceita ambos; a UI de
--   useCaktoOrders.ts L96 conta 'paid').
--
-- LEFT JOIN dupla: resolve nome/kind do seller por affiliate_id (rota primária)
--   OU por ref_code (rota de fallback, p/ vendas cujo affiliate_id ainda não
--   foi resolvido no webhook). Vendas sem nenhuma atribuição caem em
--   'sem_atribuicao' — nunca são descartadas.
DROP VIEW IF EXISTS public.platform_vendas_por_seller;

CREATE VIEW public.platform_vendas_por_seller AS
WITH pedidos_pagos AS (
  SELECT
    o.id,
    o.amount,
    o.paid_at,
    o.affiliate_id,
    lower(NULLIF(o.seller_ref, '')) AS seller_ref
  FROM public.cakto_orders o
  WHERE o.status IN ('paid', 'approved')
),
atribuido AS (
  SELECT
    p.id,
    p.amount,
    p.paid_at,
    -- afiliado efetivo: coluna resolvida no webhook OU resolução tardia por ref_code
    COALESCE(p.affiliate_id, l.affiliate_id) AS affiliate_id,
    -- ref efetivo p/ agrupar mesmo sem affiliate cadastrado
    COALESCE(p.seller_ref, lower(l2.ref_code)) AS seller_ref
  FROM pedidos_pagos p
  LEFT JOIN public.affiliate_links l  ON lower(l.ref_code) = p.seller_ref
  LEFT JOIN public.affiliate_links l2 ON l2.affiliate_id  = p.affiliate_id
)
SELECT
  COALESCE(a.id::text, t.seller_ref, 'sem_atribuicao') AS seller_key,
  t.seller_ref                                         AS seller_ref,
  a.id                                                 AS affiliate_id,
  a.name                                               AS seller_name,
  a.kind                                               AS seller_kind,
  count(*)                                             AS vendas,
  COALESCE(sum(t.amount), 0)::numeric                  AS receita_total,
  round(COALESCE(avg(t.amount), 0)::numeric, 2)        AS ticket_medio,
  min(t.paid_at)                                       AS primeira_venda,
  max(t.paid_at)                                       AS ultima_venda
FROM atribuido t
LEFT JOIN public.affiliates a ON a.id = t.affiliate_id
GROUP BY
  COALESCE(a.id::text, t.seller_ref, 'sem_atribuicao'),
  t.seller_ref, a.id, a.name, a.kind
ORDER BY receita_total DESC;

COMMENT ON VIEW public.platform_vendas_por_seller IS
  'Relatório: vendas PAGAS (status paid|approved) de cakto_orders agregadas por seller. Usa cakto_orders.affiliate_id/seller_ref (materializados por 20260706_cakto_seller_attribution). count vendas, receita_total, ticket_medio, primeira/ultima venda por seller. LEFT JOIN affiliates resolve nome+kind. Criada em 20260706_sellers_e_relatorio_vendas.';

-- Leitura só a authenticated (o front super-admin filtra) + service_role. As
-- tabelas-mãe (cakto_orders, affiliates) seguem fechadas por RLS.
GRANT SELECT ON public.platform_vendas_por_seller TO authenticated, service_role;
