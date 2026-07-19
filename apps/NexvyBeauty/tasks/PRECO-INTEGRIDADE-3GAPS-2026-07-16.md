# 💰 INTEGRIDADE DE PREÇO — 3 gaps (admin · timing · Cakto) NexvyBeauty
**2026-07-16** · investigação da controladora (3 threads paralelos + síntese, grounded na fonte) · resposta aos 3 gaps que o Marcelo levantou sobre a tela Planos. Complementa [PRECO-FONTE-UNICA-2026-07-05](PRECO-FONTE-UNICA-2026-07-05.md) (que fixou o *princípio*); este audita a *integridade real*.

## TL;DR — a verdade desconfortável
Dos 3 gaps que você apontou (admin sem controle · timing manual · link Cakto rançoso), **o único que é bloqueador de DINHEIRO não estava na sua lista** — está enterrado no provisionamento: **o webhook da Cakto não valida o valor pago.** Quem pagar um preço errado (link velho, oferta divergente) é **provisionado no plano cheio, com todos os módulos, sem alerta.** Todo o resto (`list_price_monthly` editável, cron de timing) é cosmético/operacional com **0 base pagante** e pode esperar. **Não automatize o flip de preço antes de o webhook validar pagamento — seria automatizar o lado errado.**

---

## Estado real do banco (verificado read-only, live)
| Plano | slug | Cobrado (`price_monthly`) | Tabela/âncora (`list_price_monthly`) | checkout_url (Cakto) | is_public |
|---|---|---|---|---|---|
| Essencial | starter | R$ 275 | R$ 383 | pay.cakto.com.br/3dydcfk | ✅ |
| Premium | pro | R$ 427 | R$ 599 | pay.cakto.com.br/5jyxi6p | ✅ |
| Ultra | premium | R$ 693 | R$ 849 | pay.cakto.com.br/35saejw | ✅ |
| Teste E2E | teste | R$ 10 | — (null) | pay.cakto.com.br/34h7jqp | ❌ (mas `is_active=true` → **vaza** em filtro que só checa is_active) |
| Trial | trial | R$ 0 | — | — | ❌ |

→ `list_price_monthly` **está populado** (383/599/849). A âncora de-para está viva no dado. (Ladder A subiria esses 3 pra 450/720/1190.) Cada plano tem `cakto_product_id` distinto; ofertas novas por mudança de preço reusam o mesmo product_id — a raiz do gap C.

---

## Mapa de fonte-da-verdade — quem guarda preço → quem lê → onde diverge
| Preço | Onde vive | Quem lê | Editável no admin? | Drift |
|---|---|---|---|---|
| **Cobrado (lançamento)** | `platform_plans.price_monthly` | view `public_plans` → LP + sales-brain + wizard | ✅ (`PlanFormDialog`) | — |
| **Tabela / "de"** | `platform_plans.list_price_monthly` | só `public_plans` → **só o wizard `PlanosStep` renderiza** o "de/por"; LP e PlanSelector não | ❌ (sem campo; tipo base nem declara) | só SQL cru |
| **Anual** | `price_yearly` | idem | ✅ | não auto-deriva |
| **Deadline** | `platform_settings.launch_price_ends_at` (proposto) | **ninguém** — 0 consumidores | ❌ | coluna morta |
| **VALOR REALMENTE PAGO** | **objeto-oferta DENTRO da Cakto** | comprador via `checkout_url` | só via `cakto-sync-offer` (manual, sem cron) | **ALTO — gap C** |

**Fluxo do dinheiro:** `SalesPage.tsx:193` manda o comprador pro `checkout_url` (oferta Cakto). O preço cobrado está **congelado dentro da oferta Cakto**, nunca é read ao vivo do nosso banco. Nosso `price_monthly` só toca a Cakto no momento do sync manual.

---

## Os 3 gaps — CONFIRMADOS na fonte

**(a) Admin não controla `list_price_monthly` nem timing.** `PlanFormDialog.tsx` (aba Pricing) expõe só `price_monthly`, `price_yearly`, `trial_days`, `grace_period_days`. Nenhum input de `list_price_monthly`; o tipo `PlatformPlan` nem o declara (só existe em `PublicPlan`, view read-only). Valor existente faz round-trip no save, mas **não há UI pra mudá-lo** → editar = SQL cru. Nenhum campo de data em nenhuma aba.

**(b) Timing lançamento→tabela é 100% MANUAL — não há motor.** Zero cron/edge/trigger toca pricing (os 8 crons são cold_outreach, email_queue, campaign_notif, nina_health_scan, dispatch_scheduled, demo_reaper, salon_automation, lead_score_decay). `launch_price_ends_at` = coluna morta. O "de X por Y — sobe em breve" (`platform-sales-brain:236`) é **texto reativo** (booleano `list_price > price`), não countdown. Subir preço hoje = um `UPDATE price_monthly = list_price_monthly` na mão.

**(c) Link Cakto velho nunca se auto-corrige — o gap grave.** Mecanismo exato (`cakto-sync-offer:112-129`): mudar preço → `syncCycle` casa oferta por **preço exato** → preço novo não casa → **cria oferta NOVA** (`caktoCreateOffer`). A oferta antiga **fica viva no preço antigo pra sempre**. `buildUpdate` repointa nosso `checkout_url` pra oferta nova — mas **todo link já distribuído** (ads, e-mail, WhatsApp, bookmark, LP cacheada) segue cobrando o preço velho. E o webhook (`_shared/cakto-plan-provisioning.ts:150-160,244-274`) **não valida `amount`**: resolve por `cakto_offer_slug` → fallback `cakto_product_id` (mesmo produto entre ofertas) → **quem pagou o preço velho é provisionado no plano atual, módulos completos, sem alerta** (o alerta "venda paga sem acesso" nunca dispara — o produto casa). Único vestígio: `billing_history.amount` (baixo) ao lado de `plan.price_monthly` (alto) — **nada compara os dois**.

---

## Arquitetura recomendada — por gap: fix limpo + interino barato

**(a) Editar `list_price_monthly`:** *Fix limpo* = add o campo ao tipo `PlatformPlan` + `numberField` na aba Pricing (~5 linhas) + regenerar `types.ts` (stale). *Interino* = SQL cru (estado atual). Trivial.

**(b) Timing — "precisa ser manual?" → NÃO precisa, mas HOJE deve ser:**
| Opção | O que é | Veredito |
|---|---|---|
| **Runbook manual** | 1 `UPDATE price_monthly=list_price_monthly` quando decidir | ✅ **RECOMENDADO agora.** 0 clientes; subir preço é decisão rara e estratégica, não candidata a automação (over-engineering). |
| `effective_date` + cron | coluna de data + cron diário que flipa | fast-follow — só quando um 2º aumento for previsível e você não quiser estar online |
| "launch = preço real" | nunca flipa; `list_price` é só âncora perene "de/por" | válido/honesto, mas colide com a âncora declarada "lançamento sobe pra tabela" |

**(c) Cakto — fonte-única:**
| Opção | Tradeoff | Veredito |
|---|---|---|
| **Validar `amount` no webhook** (rejeitar OU flag+alerta se pago < preço atual, com tolerância) | não impede a divergência, mas **detecta** — silêncio vira sinal | ✅ **REDE OBRIGATÓRIA** (~10 linhas). O único fix de dinheiro. |
| **Desativar oferta antiga no sync** (`status: inactive` na Cakto após criar a nova) | mata o link velho na origem | ✅ interino mais barato — pareado com o de cima fecha o buraco |
| **Editar preço da oferta in-place** (API Cakto, em vez de criar nova) | corrige a raiz: link nunca muda, preço muda dentro. **Depende de a API permitir editar `price` de oferta ativa** (checar `docs.cakto.com.br/schema.yaml`) | 1ª escolha de médio prazo SE a API permitir |
| **Checkout dinâmico por compra** (gera link/sessão no preço atual no clique) | elimina 100% a staleness; exige LP→edge→Cakto na hora | alvo final ideal, maior engenharia |

---

## Corte de lançamento (0 clientes pagantes hoje)
**🔴 BLOQUEADOR antes de cobrar o 1º cliente / E2E R$10:**
1. **Validação de `amount` no webhook** (`cakto-plan-provisioning.ts`) — sem isso, link velho/preço divergente provisiona plano cheio por valor errado, silencioso. **Único gap de perda de receita.** Barato.
2. **Confirmar `checkout_url` de cada plano aponta pra oferta no preço de lançamento correto** (275/427/693) antes do 1º disparo real — é o que o R$10 E2E precisa provar.
3. **Fechar o vazamento do Teste E2E** (`is_active=true` o expõe em filtro que não checa `is_public`).

**🟡 FAST-FOLLOW (não bloqueia):** campo `list_price_monthly` no `PlanFormDialog` · `effective_date`+cron · editar oferta Cakto in-place / checkout dinâmico · regenerar `types.ts` · renderizar "de/por" na LP + PlanSelector (marketing, não integridade).

---

## Decisão que preciso do Marcelo (pra construir o fix do webhook)
Na validação de `amount`, quando alguém paga **menos** que o preço atual do plano (link velho): **rejeitar** (nega acesso — protege receita, mas pune um cliente que pagou de boa-fé) ou **provisionar + alertar** (entrega o acesso, mas te avisa na hora pra você regularizar)? **Meu voto: provisionar + alertar** — negar acesso a quem pagou é pior que a diferença de preço, e o alerta te dá o controle sem fricção pro cliente. Confirma?

## Arquivos-chave
`src/components/superadmin/plans/PlanFormDialog.tsx` · `src/hooks/usePlatformPlans.ts` · `src/pages/SalesPage.tsx` · `supabase/functions/cakto-sync-offer/index.ts` · `supabase/functions/_shared/cakto-plan-provisioning.ts` · `supabase/functions/platform-sales-brain/index.ts`
