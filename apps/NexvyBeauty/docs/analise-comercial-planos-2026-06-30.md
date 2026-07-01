# Análise comercial dos planos — NexvyBeauty

> **Data:** 2026-06-30 · **Método:** 3 lentes em paralelo (Sales Strategist × Sales Coach × Sales Engineer) + síntese de Revenue, com verificação no código e no banco.
> **Pergunta do Marcelo:** "Os planos em super-admin estão servindo os tenants e a LP? Como está estruturado? Todas as features estão contempladas?"

---

## Veredito (a resposta desconfortável primeiro)

**NÃO.** Os planos não servem nem o tenant nem a LP de forma unificada. Não é um problema de "qual número está certo" — são **quatro narrativas de preço incompatíveis** convivendo no mesmo produto, e o **gating que diferenciaria os planos quase não existe em runtime**. Antes de discutir preço, a fundação está quebrada.

---

## 1. O drift — 4 fontes, 4 verdades

| Fonte | Starter | Pro | Premium | É a fonte que **cobra**? |
|---|---|---|---|---|
| **DB `platform_plans`** (catálogo real) | R$247 | R$391 | R$587 | ✅ **SIM** — o checkout Cakto cobra `plan.price_monthly` |
| **LP `SalesPage.tsx`** (hardcoded L98-100) | **R$197** | **R$397** | **R$697** | ❌ vitrine — preço decorativo |
| **Super-admin `SubscriptionsManager`** (hardcoded L153/163) | R$97 | R$497 | "Enterprise" | ❌ números fantasma |
| **Narrativa de capacidade da LP** | "até 2 prof." | "até 8 prof." | "ilimitado" | — (mas catálogo gateia por `max_users` 1/5/10) |

**Consequência P0:** o lead vê **R$197** na landing e o checkout cobra **R$247** (+25% no momento mais sensível do funil). Preço-anunciado ≠ preço-cobrado = abandono de carrinho + risco de chargeback + "vocês mentiram no preço". É o vazamento de receita mais grave: enquanto existir, todo investimento em tráfego/copy vaza aqui.

Só a tela super-admin "Planos" lê o catálogo real. A LP e a tela "Assinaturas" são **vitrines mortas** (HTML hardcoded, nenhum import de `usePlatformPlans`).

---

## 2. Bugs e incoerências (verificados)

| # | Achado | Severidade | Status na verificação |
|---|---|---|---|
| a | LP cobra ≠ anuncia (197 vs 247) | **P0** | ✅ confirmado (cakto-plan-provisioning cobra `platform_plans`) |
| b | ~~Premium `max_ai_agents=0` (cliente paga e não tem IA)~~ | — | ❌ **FALSO em prod** — banco tem **5**. A migration tinha slug errado (`enterprise`), mas o valor vivo foi corrigido. **Não é bug ativo.** |
| c | **Gating fictício** — das 18 feature flags, só `max_connections` e `max_ai_agents` têm enforcement real | **P0** | ⚠️ [Provável] (grep dos agentes; recomendo confirmar) |
| d | Starter: `feature_ai_agents=true` mas `max_ai_agents=0` (anuncia IA, entrega 0) | **P1** | ✅ confirmado no banco |
| e | Pro e Premium têm o **mesmo teto de tokens IA** (50k) — o custo que mais escala não cresce com o preço | **P1** | ✅ confirmado (Pro 50k = Premium 50k) |
| f | Taxonomia tripla: catálogo usa `premium`, enum/tela usam `enterprise`; master tem 3 identidades (plan_type='enterprise' + price 997 + plan_id→Premium) | **P1** | ✅ confirmado |
| g | LP vende **white-label, multi-unidade, API** no Premium — features que **não existem** (whitelabel foi removido, módulos são fixos) | **P1** | ✅ confirmado (promessa sem lastro) |
| h | Trial: LP diz "14 dias", catálogo diz **7 dias** | **P1** | ✅ confirmado |

> **Lição da verificação:** o achado (b) mostra por que checar o banco importa — a inferência "Premium sem IA" parecia P0 mas era falsa em produção. Os demais se confirmaram.

---

## 3. O gating é o problema invisível (mais grave que o preço)

Das **18 feature flags** do catálogo (instagram, campaigns, ai_agents, voice_agents, outreach, webhooks, external_api, integrations…), **só ~2 barram algo no produto**. Tradução comercial: **hoje um cliente Starter consegue usar quase tudo**, porque nada no app checa a flag. **Você vende 4 tiers que entregam funcionalmente o mesmo produto** — não há motivo *técnico* para o cliente subir de plano. A escada de preço não existe em runtime; é decorativa.

E o **value-metric está errado**: cobra por `max_users` (usuário-do-sistema), métrica que o dono **sonega** (não dá login pra recepção pra "não gastar vaga") → subutilização → churn. Em salão, valor escala com **profissionais/cadeiras** (cada cadeira = receita) — que a LP já usa ("até 2/8/ilimitado") mas **não existe como quota** no catálogo.

---

## 4. Decisão de preço: **vale 197/397/697** (os números da LP)

Não 247/391/587 (catálogo atual), nem 97/497 (fantasma). Motivos:

1. **Assimetria de risco:** baixar o cobrado (247→197) de quem viu R$197 nunca gera reclamação. Subir a LP (197→247) gera — e te deixa mais caro que Trinks/Belasis (~R$80-130).
2. **Psicologia:** terminação 97 / abaixo de barreira (197<200, 397<400) converte melhor que 391 (número "sujo").
3. **O mercado já viu 197/397/697** na LP em produção — cravar no catálogo só formaliza o esperado.

**Execução:** editar `platform_plans` **para baixo** (197/397/697; anual 1970/3970/6970 = 2 meses grátis), **não** mexer na LP. Critério binário: LP == `plan.price_monthly` == valor cobrado na Cakto. E criar **migration versionada** do UPDATE (hoje o seed vive solto no banco, invisível).

---

## 5. Escada recomendada (hipótese ancorada — validar com pesquisa)

value-metric = **PROFISSIONAIS/CADEIRAS** · usuários-do-sistema **ilimitados** em todos os tiers · anual default com selo "2 meses grátis".

| Tier | Mensal | Profissionais | Conexões WA | Agentes IA | Tokens/mês | Msgs/mês | Papel |
|---|---|---|---|---|---|---|---|
| **Trial** | R$0 (14d, sem cartão) | até 3 | 1 | 1 | 50k | 500 | remover atrito |
| **Essencial** (ex-Starter) | **R$197** | até 2 | 1 | 0 | 20k | 1.000 | **porta de entrada** — sem IA; IA vira o gancho de upgrade |
| **Pro** ⭐ (Mais Escolhido) | **R$397** | até 8 | 2 | 3 | **150k** (↑) | 8.000 | **âncora (60-70% das vendas)** — onde mora a IA |
| **Premium** | **R$697** | até 20 | 4 | 5 | **400k** (↑) | 25.000 (↑) | gap real +76% vs Pro |
| **Enterprise** | sob consulta (≥R$1.497) | ilimitado / multi-unidade | a combinar | a combinar | — | — | âncora de topo (rede/franquia) |

**Mudanças-chave:** mata o Starter-natimorto (R$247/1-usuário/0-IA); Pro alinha com a LP (R$397); Premium sobe pra criar gap; tokens IA e mensagens **passam a escalar com o preço** (protege margem — hoje Pro=Premium=50k); IA sai do Essencial e vira a razão #1 de upgrade (resolve a incoerência flag=true+quota=0).

> ⚠️ **Ressalva honesta:** os números são **hipótese estruturada** (benchmark BR + a narrativa que a LP já usa), **não verdade revelada**. Antes de cravar, rodar **Van Westendorp** (4 perguntas) com 15-30 salões por segmento (solo / 2-5 cadeiras / rede).

---

## 6. Fix de arquitetura — fonte única `platform_plans`

1. **LP (`SalesPage.tsx`):** trocar o array hardcoded por `useActivePlans()` (o hook `usePlatformPlans.ts` **já existe**). Botão usa `plan.checkout_url` direto → elimina por construção o preço-anunciado ≠ cobrado.
2. **Super-admin (`SubscriptionsManager.tsx`):** cards e preços vêm do catálogo, zero literal; matar "enterprise".
3. **Gating do tenant:** criar `useFeatureFlag(flag)` + `usePlanLimit(key)` lendo `get_organization_effective_limits` e plantar guards nos pontos de entrada das features pagas (Instagram, campanhas, outreach, webhooks, API, voice). Regra: flag=true ⟺ quota>0; nenhum item de copy da LP sem coluna no catálogo.
4. **Taxonomia única:** slug canônico do catálogo (trial/starter/pro/premium); migrar `subscriptions.plan_type` 'enterprise'→'premium'; CHECK constraint anti-drift.
5. **Guarda-trilho anti-drift:** teste de CI que falha se aparecer literal de preço (`/R\$\s?\d/`) em páginas/componentes de plano. A ausência disso foi o que gerou o drift.

---

## 7. Top 5 ações (impacto × esforço)

| # | Ação | Prioridade | Esforço |
|---|---|---|---|
| 1 | **Consertar a cobrança:** migration `platform_plans` → 197/397/697 + LP lê `useActivePlans()` (botão = `checkout_url`). Para o vazamento HOJE. | P0 | ~1-2h |
| 2 | **Ligar o gating real:** `useFeatureFlag`/`usePlanLimit` + guards nas features pagas. Sem isto não há motivo técnico de upgrade. | P0 | ~1-2 dias |
| 3 | **Limpar promessa + taxonomia:** tirar white-label/multi-unidade/API do copy; apagar R$97/497 e "enterprise"; trial 7→14d. | P1 | ~2-3h |
| 4 | **Value-metric:** quota `max_professionals` (gatear por ela, não `max_users`); usuários ilimitados; tokens/mensagens escalando com preço. | P1 estratégico | médio + pesquisa |
| 5 | **Validar preço** com Van Westendorp antes de cravar (15-30 salões/segmento). | P1 | depende |

> ~~Ação anterior "UPDATE max_ai_agents WHERE slug='premium'"~~ — **descartada**: o valor já está correto (5) em prod.

---

## 8. Item 5 — Bonificação da assinatura master (dovetail)

A bonificação é propriedade da **assinatura**, não do plano: a Nexvy fica no plano completo (features intactas) mas a assinatura ganha um flag de cortesia → R$0 de receita, excluída do MRR/ARR/Faturamento, selo "Bonificada". Implementação: coluna `is_complimentary` (+ motivo) em `subscriptions` + toggle "Bonificar/Isentar" na tela Assinaturas + ajuste do cálculo de MRR. **Faz parte do mesmo refactor** da tela Assinaturas (ação #3) — implementar junto.

---

## Como sei que terminei (critério verificável)

- [ ] LP, catálogo e oferta Cakto exibem/cobram **o mesmo** preço (provar: abrir LP → checkout → conferir valor).
- [ ] `SELECT distinct plan_type FROM subscriptions` não retorna nenhum valor sem plano no catálogo.
- [ ] Cada `feature_*=true` no catálogo tem um guard no produto que barra quem não tem.
- [ ] Nenhum literal de preço/nome de plano em `src/pages`/`src/components` de plano.
- [ ] Assinatura master aparece como "Bonificada" e MRR a exclui.
