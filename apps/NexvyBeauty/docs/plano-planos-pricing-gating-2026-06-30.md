# Plano de correções — Planos, Pricing & Gating · NexvyBeauty

> **Data:** 2026-06-30 · **Base:** benchmark de 12 concorrentes BR (web) + 3 lentes (Strategist/Coach/Engineer) + síntese de Revenue + auditoria do código/banco.
> **Decisões já fechadas com o Marcelo:** `platform_plans` = fonte única (super-admin "Planos" é o portal de escrita); LP não pública (preço livre); SEM trial público / SEM "dias grátis"; "cancele quando quiser"; bonificação na assinatura; remover promessas sem lastro; value-metric aguardava esta análise.

---

## TL;DR

1. **Preço:** a análise recomenda **Essencial R$147 · Crescimento R$297 ⭐ · Rede R$597** (razão 1:2:4, anual −20%) + Enterprise "fale com vendas". **MAS** os números são um *prior estratégico* — **não cravar sem validar seu COGS de IA** (token + instância Evolution 24h) e a **telemetria de uso** dos tenants vivos. Isso é a única coisa que pode invalidar a escada.
2. **Value-metric:** cobrar por **profissionais/cadeiras** (base) + **quota de IA** (motor de upgrade). **Matar `max_users` como eixo de preço** — anti-padrão (dono sonega login).
3. **Nomes:** Essencial/Crescimento/Rede (não Starter/Pro/Premium — "Pro" sinaliza booking barato).
4. **Seu desenho de gating está ~70% certo** — não precisa refazer arquitetura, são **5 correções cirúrgicas**.
5. **Separar em 2 tracks:** **Track A (arquitetura)** independe do número e pode começar já; **Track B (pricing)** aplica a escada depois da validação de COGS+telemetria.

---

## 1. Escada de preço recomendada

| Tier | Mensal | Anual (−20%) | Profissionais (value-metric) | Cadeira extra | Papel |
|---|---|---|---|---|---|
| **Essencial** | **R$147** | R$117/mês (R$1.404) | até 2 | +R$25 | porta de entrada — "recepcionista de IA + agenda + CRM" |
| **Crescimento** ⭐ | **R$297** | R$237/mês (R$2.844) | até 5 | +R$22 | **âncora (60-70% das vendas)** — atende, qualifica E reativa |
| **Rede** | **R$597** | R$477/mês (R$5.724) | ilimitado / multi-unidade | — | voz + multi-instância + integrações; âncora alta |
| **Enterprise** | "fale com vendas" (~R$897+) | negociado | ilimitado multi-CNPJ | — | franquia — **não é card na LP** (só linha "Precisa de mais?") |

Razão **1:2:4** (cada degrau ~dobra → ancoragem que empurra pro meio). Desconto anual **único de −20%** (simplicidade > otimizar por tier). **Overage de IA = add-on** (+mensagens/+tokens por cima de qualquer tier) — **nunca cortar atendimento no meio**.

**Posicionamento:** sair da guerra de preço do *booking puro* (Trinks R$76, AppBarber R$80, Gendo base R$57). Ancorar no **médio (2-5 cadeiras)** onde IA+WhatsApp vira diferencial premium. Concorrente mais perigoso = **Avec** (L'Oréal, R$280-370, IA+WhatsApp 24h). Justificar o premium por **custo de oportunidade**, nunca feature-a-feature: *"A Trinks organiza sua agenda por R$76; o NexvyBeauty atende e vende sozinho no WhatsApp por R$297 — e traz de volta quem sumiu. Um cliente reativado/mês paga o plano."* **Eles vendem organização; você vende faturamento.**

---

## 2. Value-metric: híbrida (profissionais + quota de IA)

- **Base = faixa de profissionais/cadeiras** (cada cadeira = receita do salão; modelo que a dona já entende — Trinks/Avec/Booksy todos cobram assim).
- **Teto/upgrade = quota de IA** (mensagens/tokens/agentes) — o diferencial NexvyBeauty escala por **uso**, não por cadeira (um salão de 2 cadeiras pode disparar 8.000 msgs).
- **Matar `max_users` como eixo** → vira só teto técnico anti-abuso (~2× cadeiras). **Novo eixo = `max_professionals`** (campo a criar).
- **Comunicação:** nunca "R$X por cadeira" na LP (parece imposto); diga "até 2 / até 5 / ilimitado" como limite de plano. A cadeira vira gatilho de upgrade quando ela contrata mais gente.

---

## 3. Matriz de gating (feature × tier) — ENFORCED em runtime

**Limites:**

| Limite | Essencial | Crescimento ⭐ | Rede |
|---|---|---|---|
| `max_professionals` | 2 | 5 | ilimitado |
| `max_connections` (WhatsApp) | 1 | 2 | 4 |
| `max_ai_agents` | **1** (era 0!) | 3 | 5 |
| `max_messages_month` | ~2.000 | ~8.000 | ~25.000 |
| `max_ai_tokens_month` | ~300k | ~1,5M | ~4M |
| `max_contacts` | 3.000 | 15.000 | 50.000 |

> ⚠️ As quotas de IA (msgs/tokens) são **chutes calibrados** — puxar telemetria real dos tenants vivos antes de cravar.

**Features:**

| Feature | Essencial | Crescimento ⭐ | Rede |
|---|---|---|---|
| agenda · WhatsApp · CRM/funil · forms · pacotes | ✅ | ✅ | ✅ |
| **agentes IA** (atende/qualifica) | ✅ (1) | ✅ (3) | ✅ (5) |
| transcrição áudio IA · correção texto IA | ✅ | ✅ | ✅ |
| Instagram · campanhas · capture funnels · chat interno | ❌ | ✅ | ✅ |
| **outreach / AI Growth (reativação)** | ❌ | ✅ (leader) | ✅ |
| Facebook · **voice agents** · integrações · API · webhooks | ❌ | ❌ | ✅ |

**Fences (o "porquê de subir" em 10s):**
- **Essencial→Crescimento = MARKETING + CRESCIMENTO:** "Essencial *atende*; Crescimento atende **E VENDE/RECUPERA**" (Instagram, campanhas, AI Growth).
- **Crescimento→Rede = ESCALA + TÉCNICO:** "Crescimento opera 1 salão; Rede opera a **rede**" (voz, API, multi-unidade).

**Regra dura:** `feature_X = true ⟺ quota_X ≥ 1`. Nunca flag-ON-com-quota-0 (foi o bug do Starter — bait-and-switch). `audio_ai`/`text_ai` **descem pro Essencial** (custo trivial, são o "wow" da IA na 1ª demo — e sem trial, o 1º mês pago é o único test-drive). `outreach` **fica no Crescimento** (é o leader que paga o upgrade — não dar de graça no entry).

---

## 4. Veredito do seu desenho de gating: **~70% certo**

Não precisa refazer a arquitetura — as 3 lentes convergem. **5 correções cirúrgicas**, em ordem de impacto:

| # | Errado hoje | Correção |
|---|---|---|
| 1 | **Eixo de cobrança** = `max_users` | → `max_professionals` (mudança nº1; tudo o mais é secundário) |
| 2 | `feature_ai_agents=true` + `max_ai_agents=0` no entry | → 1 agente real no Essencial (flag ⟺ quota) |
| 3 | Nomes Starter/Pro/Premium (vocabulário de TI) | → Essencial/Crescimento/Rede (estágio do negócio) |
| 4 | Números 197/397/697 (faixa errada, topo sem fence) | → 147/297/597 (razão 1:2:4, fences justificáveis) |
| 5 | **Gating quase não é enforced** | → enforcement em runtime (sem isso, tudo é decorativo) |

**Certo (manter):** módulos fixos; 3 tiers com IA crescente (compromise effect); booking/funil já no entry; voz/API/webhooks confinados ao topo; diferenciar por quota.

---

## 5. Modelo sem trial público + "cancele quando quiser"

Para um produto de **IA**, isso é **melhor** que free-trial (protege COGS desde o dia 1; trial grátis queima tokens + instância sem receita).

- **`trial` vira `is_public=false`** — existe só no provisioning, liberado por super-admin pra lead quente específico. **Some da LP e do tenant.** Remover qualquer "N dias grátis".
- **"Cancele quando quiser, sem fidelidade, sem multa"** = a remoção de risco que substitui o trial. Vai **gritante ao lado do preço**, não no rodapé.
- **O que substitui o trial:** (a) **demo ao vivo com o número dela** (conecta o WhatsApp via QR e mostra a IA atendendo — vê antes de pagar); (b) **garantia 7 dias money-back** (paga e entra como cliente; default vira "fica"); (c) **onboarding feito-pra-ela** (conectamos WhatsApp, treinamos a IA, importamos clientes); (d) **prova social de resultado** ("recuperei 14 clientes em 1 mês").

---

## 6. Plano de correções — 2 tracks

### Track A — Arquitetura (independe do número; pode começar JÁ)

1. **Fonte única:** LP (`SalesPage.tsx`) e `SubscriptionsManager` passam a ler `useActivePlans()` (hook já existe). Zero literal de preço. Botão da LP = `plan.checkout_url`.
2. **Completar o `PlanFormDialog`** (portal de escrita) pra expor 100% do catálogo — faltam **`max_ai_agents`**, **`modules`**, e o novo **`max_professionals`**.
3. **Gating enforced:** criar `useFeatureFlag(flag)` + `usePlanLimit(key)` lendo `get_organization_effective_limits`; plantar guards nos pontos de entrada das features pagas (Instagram, campanhas, outreach, voice, API, webhooks) + cortes de quota (agentes/instâncias/mensagens/tokens) com tela de upgrade/add-on ao bater o teto.
4. **Taxonomia única:** slug do catálogo (trial/starter/pro/premium → ou os novos nomes); migrar `subscriptions.plan_type` enterprise→premium; CHECK constraint anti-drift.
5. **Sem trial:** `trial.is_public=false`; remover "dias grátis" do copy; add "cancele quando quiser".
6. **Bonificação:** coluna `is_complimentary` (+ motivo) em `subscriptions` + toggle "Bonificar" na tela Assinaturas + MRR/ARR excluem comped.
7. **Anti-drift:** teste de CI que falha com literal de preço (`/R\$\s?\d/`) em componentes de plano.
8. **Limpar LP:** remover white-label/multi-unidade/API do copy (não existem).

### Track B — Pricing (aplicar APÓS validação)

9. **Validar COGS** (você): no teto do Essencial (~2.000 msgs, ~300k tokens, 1 instância), R$147 deixa margem ≥60%? Se não → subir piso (R$167-187) ou apertar quota.
10. **Validar quotas** com telemetria real dos tenants vivos (msgs/mês, tokens/mês por agente).
11. **(Opcional) Van Westendorp** com 15-20 donas reais, ou A/B de LP ao publicar.
12. **Aplicar a escada** (migration versionada): nomes + 147/297/597 + `max_professionals` + quotas validadas + cadeira-extra.

---

## 7. Ressalvas (o que pode mudar os números)

- 🔴 **[CRÍTICO — bloqueia fixar preço] COGS real não validado.** Só você tem o custo de token (OpenRouter/litellm) + instância Evolution 24h. É a única coisa que pode invalidar a escada inteira.
- 🟡 **WTP não revelada** — 147/297/597 é prior calibrado por benchmark, não disposição-a-pagar de cliente real.
- 🟡 **Quotas de IA são chutes** — puxar telemetria dos tenants vivos antes de cravar (quota demais = queima margem; de menos = churn por corte no meio).
- 🟡 **Avec entrada ~R$64,90** (confiança média) — abrir `negocios.avec.app/planos` e confirmar; marca L'Oréal pode pressionar o Essencial por baixo.
- 🟡 **Enforcement não existe hoje** — é pré-requisito de engenharia, não opcional; vai junto com a migration.
- ⚪ **Money-back** precisa de gate anti-abuso (1 por CNPJ + uso mínimo) pra não virar trial disfarçado.

---

## Critério de pronto

- [ ] LP == catálogo == valor cobrado na Cakto (um preço só).
- [ ] `PlanFormDialog` configura 100% dos campos (incl. `max_ai_agents`, `modules`, `max_professionals`).
- [ ] Cada `feature_*=true` tem guard que barra quem não tem; quota corta de verdade.
- [ ] `trial.is_public=false`; zero "dias grátis"; "cancele quando quiser" na LP.
- [ ] Assinatura master "Bonificada", fora do MRR.
- [ ] Zero literal de preço em `src/` de plano.
