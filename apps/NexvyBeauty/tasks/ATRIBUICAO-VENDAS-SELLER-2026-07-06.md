# Atribuição de vendas por seller — ponta a ponta

**Data:** 2026-07-06 · **Produto:** NexvyBeauty (CRM do grupo / plataforma)
**Braço:** SELLERS-RELATORIO
**Migration:** `supabase/migrations_salao/20260706_sellers_e_relatorio_vendas.sql`
**Irmã (braço ATRIBUICAO):** `supabase/migrations_salao/20260706_cakto_seller_attribution.sql`

---

## TL;DR

Um **seller** é um `affiliate`. Cada seller — agente IA (Duda, Bia), vendedor humano
ou afiliado externo — tem 1 linha em `affiliates` e 1 `ref_code` em `affiliate_links`.
O checkout Cakto carrega `?src=<ref_code>`; o webhook grava a atribuição no pedido;
a view `platform_vendas_por_seller` soma as **vendas pagas** por seller.

**Nada de tabela nova.** Reusamos a camada de afiliados que já existia
(`20260619_affiliates_tracking.sql`). A única coluna nova em `affiliates` é
`kind` (`agente_ia` | `humano` | `externo`), para diferenciar o tipo de vendedor.

---

## O fluxo ponta a ponta

```
1. LINK           https://pay.cakto.com.br/<slug>?src=duda
                  (o ref_code do seller entra como ?src=)
                        │
                        ▼
2. CHECKOUT       Cliente paga na Cakto. A Cakto repassa o src no corpo do pedido.
                        │
                        ▼
3. WEBHOOK        supabase/functions/cakto-webhook/index.ts
                  • grava o corpo inteiro em cakto_orders.raw_payload  (L60)
                  • [braço ATRIBUICAO] extrai o src → cakto_orders.seller_ref
                  • resolve_affiliate_ref(ref_code) → cakto_orders.affiliate_id
                  • upsert em cakto_orders                              (L96)
                        │
                        ▼
4. RELATÓRIO      SELECT * FROM public.platform_vendas_por_seller;
                  • filtra status IN ('paid','approved')  (só venda paga)
                  • agrupa por seller → count, receita, ticket médio
                  • LEFT JOIN affiliates → nome + kind do seller
```

### Onde cada peça mora

| Peça | Arquivo | Papel |
|---|---|---|
| Camada de sellers | `20260619_affiliates_tracking.sql` | `affiliates`, `affiliate_links`, `resolve_affiliate_ref()` |
| Colunas de atribuição no pedido | `20260706_cakto_seller_attribution.sql` (irmã) | `cakto_orders.seller_ref` + `.affiliate_id` (+ FK + índice) |
| Sellers IA + `kind` + relatório | `20260706_sellers_e_relatorio_vendas.sql` (**este braço**) | registra Duda/Bia, `affiliates.kind`, `register_human_seller()`, view |
| Escrita do pedido | `supabase/functions/cakto-webhook/index.ts` | grava `raw_payload`, `seller_ref`, `affiliate_id` |

---

## O que esta migration faz (4 blocos)

1. **`affiliates.kind`** — coluna nova (`ADD COLUMN IF NOT EXISTS`, default `externo`)
   com `CHECK (kind IN ('agente_ia','humano','externo'))`. Diz que tipo de vendedor é.

2. **Registra Duda e Bia como sellers** — `INSERT ... ON CONFLICT (lower(email)) DO UPDATE`
   em `affiliates`, com `kind='agente_ia'`, `commission_pct=0` (não recebem payout),
   emails sintéticos `@agent.nexvy.tech`.

3. **`ref_code` 'duda' e 'bia'** em `affiliate_links` (`INSERT ... WHERE NOT EXISTS`,
   idempotente — a única de `ref_code` é sobre expressão funcional, então não dá pra
   usar `ON CONFLICT` nativo). É este `ref_code` que o webhook casa via
   `resolve_affiliate_ref()`.

4. **View `platform_vendas_por_seller`** — lê `cakto_orders.seller_ref`/`affiliate_id`
   (materializados pela irmã), filtra `status IN ('paid','approved')`, agrupa por seller.

### A query do relatório (comentada)

```sql
CREATE VIEW public.platform_vendas_por_seller AS
WITH pedidos_pagos AS (
  SELECT o.id, o.amount, o.paid_at, o.affiliate_id,
         lower(NULLIF(o.seller_ref,'')) AS seller_ref
  FROM public.cakto_orders o
  WHERE o.status IN ('paid','approved')          -- só venda paga
),
atribuido AS (
  SELECT p.id, p.amount, p.paid_at,
         COALESCE(p.affiliate_id, l.affiliate_id)   AS affiliate_id, -- rota primária OU tardia
         COALESCE(p.seller_ref, lower(l2.ref_code)) AS seller_ref
  FROM pedidos_pagos p
  LEFT JOIN public.affiliate_links l  ON lower(l.ref_code) = p.seller_ref   -- por ref_code
  LEFT JOIN public.affiliate_links l2 ON l2.affiliate_id  = p.affiliate_id  -- por affiliate_id
)
SELECT
  COALESCE(a.id::text, t.seller_ref, 'sem_atribuicao') AS seller_key,
  t.seller_ref, a.id AS affiliate_id, a.name AS seller_name, a.kind AS seller_kind,
  count(*)                                    AS vendas,
  COALESCE(sum(t.amount),0)::numeric          AS receita_total,
  round(COALESCE(avg(t.amount),0)::numeric,2) AS ticket_medio,
  min(t.paid_at) AS primeira_venda, max(t.paid_at) AS ultima_venda
FROM atribuido t
LEFT JOIN public.affiliates a ON a.id = t.affiliate_id
GROUP BY COALESCE(a.id::text, t.seller_ref,'sem_atribuicao'), t.seller_ref, a.id, a.name, a.kind
ORDER BY receita_total DESC;
```

**Por que a dupla `LEFT JOIN` (l e l2):**
- `l` resolve o afiliado a partir do `ref_code` cru (caso o webhook ainda não tenha
  preenchido `affiliate_id`).
- `l2` recupera o `ref_code` a partir do `affiliate_id` já resolvido.
- `COALESCE` prioriza o `affiliate_id` do pedido; cai no `ref_code` como fallback.
- Vendas sem atribuição nenhuma caem em `sem_atribuicao` — **nunca são descartadas.**

**`paid` vs `approved`:** os dois valores contam como venda paga. Isso não é chute:
`cakto-plan-provisioning.ts:141` aceita `status !== 'paid' && status !== 'approved'`
para bloquear provisionamento (logo, ambos = pago); `useCaktoOrders.ts:96` conta `'paid'`
para a receita. A view usa os dois para não perder venda `approved`.

---

## Prova de funcionamento (rodada em Postgres 18 efêmero)

Apliquei, em ordem: dep real (`20260619_affiliates_tracking`) → irmã
(`cakto_seller_attribution`) → esta migration. Semeei vendas sintéticas e conferi a view.

| seller_ref | seller_name | kind | vendas | receita_total | ticket_medio |
|---|---|---|---|---|---|
| (null) | (null) | (null) | 1 | 999 | 999.00 |
| duda | Duda (SDR IA) | agente_ia | 2 | 400 | 200.00 |
| bia | Bia (Closer IA) | agente_ia | 1 | 250 | 250.00 |
| ana | Ana Vendas | humano | 1 | 150 | 150.00 |

**Asserts (todos `t`):** `duda_ok`, `bia_ok`, `ana_ok`, `sem_ok`, `total_pagas_ok`.
- `pending` e `refunded` **não entram** (total de vendas pagas = 5, não 7).
- `approved` (bia) conta como pago.
- `ana` foi resolvida pelo `ref_code` mesmo com `affiliate_id` NULL no pedido.

**Idempotência:** reapliquei a migration 3× → continuam 2 sellers IA, 1 `ref_code`
cada, view idêntica (5 vendas / R$1799). Só avisos `IF NOT EXISTS`, nenhum erro.

---

## ⚠️ O passo de verificação que FALTA (não é opcional)

O elo frágil é o **passo 3**: só sabemos que a Cakto **de fato ecoa** o `?src=` no
corpo do pedido testando com dinheiro real. Enquanto isso não for confirmado,
`cakto_orders.seller_ref` pode vir NULL e tudo cai em `sem_atribuicao`.

**Teste ponta a ponta (1 pagamento real):**

1. Gere um link de checkout com um src de teste:
   `https://pay.cakto.com.br/<slug>?src=teste123`
2. Faça **1 pagamento de teste** (menor valor / cupom 100%).
3. Inspecione o `raw_payload` do pedido que chegou:
   ```sql
   SELECT jsonb_pretty(raw_payload)
   FROM public.cakto_orders
   WHERE customer_email = '<email-do-teste>'
   ORDER BY created_at DESC LIMIT 1;
   ```
4. **Ache onde `teste123` aparece** no JSON. É o campo que a irmã precisa extrair
   no mapper `mapCaktoOrderForUpsert` (`supabase/functions/_shared/cakto-client.ts`).
   Candidatos prováveis: `src`, `trackingParameters.src`, `checkout.src`, `utm_source`.
5. Confirme que `seller_ref` foi materializado:
   ```sql
   SELECT seller_ref, affiliate_id FROM public.cakto_orders
   WHERE raw_payload::text ILIKE '%teste123%' ORDER BY created_at DESC LIMIT 1;
   ```
6. Se `seller_ref` estiver preenchido → o pipeline está fechado. Se NULL → ajuste o
   caminho de extração no mapper da irmã e reprocesse
   (`supabase/functions/cakto-reprocess-order`).

**Enquanto o teste não roda, o relatório funciona mas fica cego à origem** — as vendas
aparecem em `sem_atribuicao`. A view já está correta; o que falta é o dado chegar.

---

## Como estender

### Vendedor humano (cada user vira um ref_code)

Helper pronto e idempotente:

```sql
SELECT public.register_human_seller(
  'ana',              -- ref_code (vira ?src=ana no checkout)
  'Ana Vendas',       -- nome
  'ana@nexvy.tech',   -- email
  '<auth_uid>'        -- opcional: vincula ao user do painel (self-service futuro)
);
```

Cria/atualiza o `affiliate` (`kind='humano'`) e garante o `ref_code`. A partir daí,
todo checkout com `?src=ana` é atribuído a ela no relatório. Para dar comissão,
setar `affiliates.commission_pct` (a estrutura `affiliate_commissions` já existe em
`20260619_affiliates_tracking.sql` §3).

### Afiliado externo (parceiro)

Mesmo mecanismo, `kind='externo'` (o default). Cadastre o `affiliate` com seu
`pix_key` e `commission_pct`, crie o `ref_code` em `affiliate_links`, entregue o
link `?src=<ref_code>`. O relatório já o inclui automaticamente.

### Comissão por venda

A camada `affiliate_commissions` (idempotente por `idempotency_key = order_ref`)
já está pronta desde `20260619`. O próximo passo natural é o webhook gravar 1
comissão por venda paga atribuída — fora do escopo deste braço, mas o alicerce existe.

---

## Decisões e por quês

- **Reuso, não tabela nova:** `affiliates`/`affiliate_links`/`resolve_affiliate_ref`
  já cobrem "quem vende + código de rastreamento". Um seller é um caso de affiliate;
  criar tabela paralela seria duplicação.
- **`kind` em vez de tabela `sellers`:** a diferença entre agente IA, humano e externo
  é um atributo, não uma entidade nova. `CHECK` mantém o domínio fechado.
- **View lê colunas materializadas, não `raw_payload`:** a irmã já materializa
  `seller_ref`/`affiliate_id` no pedido; parsear JSON na view seria frágil e lento.
- **`sem_atribuicao` explícito:** venda sem origem é informação (mostra o quanto do
  faturamento não está sendo atribuído), não algo a esconder.
