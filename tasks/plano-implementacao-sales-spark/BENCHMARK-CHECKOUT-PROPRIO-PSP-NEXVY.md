# Benchmark Estratégico — Checkout / Plataforma de Pagamento Própria (substituir a Cakto?)

**Para:** Marcelo (fundador) · **Produto:** NexvyBeauty (SaaS de gestão para salões, monorepo `SaasPlugin_vite`) · **Data:** 2026-06-19 · **Status:** benchmark para decisão (build-vs-buy do meio de pagamento)

> **Escopo deste relatório:** **meio de pagamento + split de comissão + economia de taxa.** A captura, o tracking de 2 eixos e a atribuição de afiliado **já estão desenhados e migrados na NOSSA camada** ([`ESTAGIO0-AFILIADOS-TRACKING-CAPTURA.md`](ESTAGIO0-AFILIADOS-TRACKING-CAPTURA.md) + migração [`20260619_affiliates_tracking.sql`](../../apps/NexvyBeauty/supabase/migrations_salao/20260619_affiliates_tracking.sql)), de forma **provider-agnóstica**. Ou seja: o checkout é um **plugue**. Este documento decide **qual plugue** e **se vale trocar**.

---

## TL;DR executivo (a recomendação primeiro)

**Recomendação: NÃO fazer big-bang. Ir de HÍBRIDO FASEADO — manter a Cakto como está, plugar UM PSP direto atrás da camada provider-agnóstica que você já tem, medir a economia real com dados próprios, e só então migrar o grosso se o volume justificar.**

Três fatos que sustentam isso, em ordem de importância:

1. **A Cakto NÃO é uniformemente cara — e isso muda a conta.** Tarifa real (jun/2026): **PIX 0% + R$ 2,49 · Cartão 3,89% + R$ 2,49 · Boleto 4,99% + R$ 2,49.** O PIX da Cakto é **quase imbatível** (zero %). A dor está no **cartão (em ticket alto / recorrência) e no boleto**. "Taxas altas" é verdade **seletiva**, não geral.
2. **A economia é real, mas modesta em p.p. e dominada por volume.** Contra o PSP transparente mais barato (Asaas), a diferença blended fica em **~1,0 a 2,1 pontos percentuais**. Em fee, isso **só paga o build acima de ~R$ 500k–1M de GMV/mês**. Abaixo disso, a decisão tem de ser justificada por motivo **estratégico** (dono do dado, risco de plataforma, controle de conversão), não por taxa.
3. **O caro do "build" você já pagou.** Captura, tracking, afiliados, comissão idempotente e provisionamento **já existem no seu banco** e são provider-agnósticos. O que falta é só o **adaptador de pagamento** (UI de cartão tokenizada + 3DS + execução de split/payout + recorrência/dunning + chargeback). Isso encolhe o risco do build — mas não o zera.

**Veredito por cenário de GMV mensal recorrente:**

| GMV recorrente/mês | Recomendação | Por quê |
|---|---|---|
| **< R$ 300k** | **Manter Cakto** | Economia de fee não cobre build + operação de pagamento (chargeback, conciliação, antifraude, PCI). |
| **R$ 300k – 1M** | **Híbrido faseado** | Plugar 1 PSP, rotear boleto + cartão de ticket alto, medir. Migrar só o que economiza. |
| **> R$ 1M** | **Checkout próprio (faseado)** | Break-even em ~6–11 meses; ganha fee + dono do dado + zero risco de plataforma. |

> **Premissa que NÃO tenho e muda tudo:** seu **GMV recorrente mensal** e o **mix PIX/cartão/boleto** atuais. Sem isso, dou o **modelo + o limiar**; você se posiciona na tabela. Se me passar o MRR e o mix reais, fecho o número exato de break-even.

---

## 0. Premissas declaradas e o que já está pronto

### 0.1 O que JÁ está construído (não rebuildar)
Verificado em código nesta sessão:

- **Camada de afiliado provider-agnóstica** — tabelas `affiliates` (com `pix_key` para payout), `affiliate_links` (`ref_code`), `affiliate_commissions` (idempotente por `idempotency_key`, estados `pending|approved|paid|cancelled`) + RPC `resolve_affiliate_ref`. RLS por `is_super_admin()`. Migração `20260619_affiliates_tracking.sql`.
- **Captura + tracking de 2 eixos** — `ref`/afiliado + 5 UTMs + `referrer`/`landing_page`/`fbc`/`fbp` em `sales_leads`, persistidos em cookie 1st-party e gravados server-side **antes** do checkout (decisão travada no ESTAGIO0). Atribuição = webhook server-side (fonte de verdade).
- **Provisionamento pós-venda** — `cakto-plan-provisioning.ts`: cria org + admin + e-mail de acesso + `billing_history`, **idempotente** por `cakto_id`, casado por **e-mail do cliente**. Isso é **agnóstico ao provedor** — qualquer PSP que entregue `{email, valor, status=paid, plano}` reusa o mesmo pipeline.

> **Implicação central:** a decisão "checkout próprio" **não** envolve refazer captura/tracking/afiliado/provisionamento. Envolve só trocar o **adaptador** que recebe o dinheiro e dispara o evento `paid`.

### 0.2 Premissas do benchmark (declaradas)
- Entidade **brasileira**, liquidação em **BRL**, venda do **SaaS por assinatura recorrente** (o provisionamento grava `plan_status`, `cakto_subscription_id`, `price_monthly` → é recorrência, não infoproduto avulso).
- Tarifas abaixo são **tabela de balcão pública (jun/2026)** — **todas negociáveis por volume**. São **piso de negociação**, não preço final.
- Ticket recorrente representativo modelado em **R$ 97 / R$ 197 / R$ 397** (não sei o real — flag de premissa). Use a linha que bate com seu plano.

---

## 1. Benchmark de PSPs / adquirentes BR

### 1.1 Tabela mestre — 6 PSPs diretos + a Cakto (referência)

> Legenda: ✅ tem · ⚠️ tem com ressalva · ❓ não documentado/confirmar · ❌ não tem. Tarifas = balcão público, negociáveis.

| Dimensão | **Cakto** (atual) | **Asaas** | **Pagar.me** (Stone) | **Mercado Pago** | **Iugu** | **Efí** (ex-Gerencianet) | **Stripe** (BR) |
|---|---|---|---|---|---|---|---|
| **PIX** | **0% + R$ 2,49** | **Grátis** (receber) ⚠️ | 1,19% | **0,99%** (0,79–0,89% neg.) | ~0,99% (não publica) | 1,19% via API | 1,19% ⚠️ *invite-only* |
| **Cartão à vista (1x)** | **3,89% + R$ 2,49** | **2,99% + R$ 0,49** | 4,39% @D+15 ⚠️ | **3,98%** @D+30 | ~4% (não publica) | 3,49% | 3,99% + R$ 0,39 |
| **Cartão parcelado** | repassa juros ao comprador | 3,49–4,29% +R$0,49 | ~+1,25 p.p./parcela | a partir ~3,99% +juros | sob consulta | 3,99–4,39% | **❌ não suporta** |
| **Boleto (pago)** | 4,99% + R$ 2,49 | **R$ 1,99** | R$ 3,49 | R$ 3,49 | ~R$ 1,99–2,50 | R$ 3,45 | R$ 3,45 |
| **Split nativo** | ✅ (afiliado nativo) | ✅ API `walletId`, sobre líquido, **sem fee extra** | ✅ `recipients` + split rules (**padrão infoproduto**) | ✅ `application_fee` (+ OAuth) | ✅ Conta-mestre/subcontas (multi-recebedor) | ✅ Pix/cartão/boleto, Pix instantâneo | ✅ Connect (**+R$6/conta/mês +0,25%+R$0,67/repasse**) |
| **Onboarding do afiliado** | — | conta Asaas / subconta white-label via API | cria `recipient` via API (**simples**) | afiliado precisa conta MP + OAuth ⚠️ | subconta c/ KYC via API | conta Efí (cada afiliado) | conta Connect |
| **Antifraude** | ✅ incluído | ✅ incluído grátis | ⚠️ add-on (fixo/transação) | ✅ incluído (device FP) | ❓ sem doc | ✅ incluído | ✅ Radar (R$0,08/tx) |
| **Recorrência/assinatura** | ✅ (inc. PIX recorrente) | ✅ | ✅ robusta (Planos/Assinaturas v2) | ✅ Preapproval (verify) | ✅ **forte** (pro-rata + dunning) | ✅ (cartão/boleto/Pix Automático) | ✅ Billing (+0,7% volume) |
| **Settlement cartão** | PIX instantâneo; saque grátis | **D+32** ⚠️ (antecipa 1,25%/mês) | **D+15** (antecipa ~3%/mês) | **D+30** (D+14/D+0 mais caro) | **D+1** (antecip. embutida) | **D+30** | ~30d inicial; payout diário |
| **Tokenização (SAQ A)** | ✅ (é da Cakto) | ✅ | ✅ Checkout Transparente | ✅ Bricks/Transparente | ✅ iugu.js | ✅ lib JS | ✅ |
| **3DS 2.0** | ✅ (da Cakto) | ❓ **não documentado** | ✅ confirmado | ✅ confirmado | ❓ citado | ❓ não confirmado | ✅ |
| **Parcelado BR / Elo / Hipercard** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **❌ não (lacuna grave)** |
| **Preços públicos?** | ✅ | ✅ | parcial (negocia) | ✅ | **❌ sob consulta** | ✅ | ✅ |
| **Mensalidade** | não | não | não | não | **sim (plano)** | não | não (taxa por serviço) |

### 1.2 Leitura por provedor (bottom line)

- **Asaas** — **melhor custo transparente + split mais simples de operar.** Cartão à vista mais barato (2,99% + R$ 0,49), PIX de recebimento grátis, boleto R$ 1,99, antifraude incluso, split sobre líquido sem fee extra. **Pontos a fechar:** **3DS 2.0 não documentado** (risco de liability shift) e **D+32 padrão** (vai pagar antecipação para girar caixa).
- **Pagar.me** — **melhor fit técnico para split de afiliado.** O modelo `recipients` + split rules **é exatamente o que a Cakto faz por baixo** → migração conceitual 1:1, afiliado entra por API sem precisar abrir conta. Recorrência v2 robusta, 3DS confirmado. **Trade-off:** antifraude é add-on, PIX 1,19% (caro vs MP), D+15.
- **Mercado Pago** — **mais barato na tabela + melhor DX**, antifraude de escala incluso, 3DS confirmado. **Trade-off:** split via `application_fee` é menos flexível para "1 produtor + N afiliados", e o **OAuth por recebedor** adiciona atrito de onboarding.
- **Efí** — **melhor API de PIX do Brasil** + split nativo nos 3 métodos (Pix instantâneo) + SDKs maduros multi-linguagem. **Trade-off:** boleto caro (R$ 3,45), D+30, cada afiliado precisa de conta Efí, 3DS a confirmar.
- **Iugu** — **a mais "marketplace-first"** (multi-recebedor, recorrência madura com dunning). **Trade-off:** **não publica preços** (negociação obrigatória), tem **mensalidade de plano**, e 3 lacunas (antifraude, 3DS, chargeback no split).
- **Stripe** — **fraca como adquirente doméstica BR**: **não faz parcelado**, não aceita Elo/Hipercard, PIX *invite-only* e mais caro. Connect cobra mensalidade por recebedor. Ganha em DX/Billing/Radar e cobertura internacional — **não entra** para venda doméstica de SaaS no Brasil.

### 1.3 A Cakto não é o vilão que parece — onde ela é cara e onde não é

| Método | Cakto | Melhor PSP direto | Δ (economia bruta) | Veredito |
|---|---|---|---|---|
| **PIX** | 0% + R$ 2,49 | Asaas grátis | só o R$ 2,49 fixo | **quase empate**; Cakto perde só o fixo, que some em ticket alto |
| **Cartão à vista** | 3,89% + R$ 2,49 | Asaas 2,99% + R$ 0,49 | **~0,9 p.p. + R$ 2,00** | economia real, modesta |
| **Boleto** | 4,99% + R$ 2,49 | Asaas R$ 1,99 (0%) | **~5 p.p.** | **aqui a Cakto é cara de verdade** |

**Conclusão:** se sua venda é majoritariamente **PIX**, trocar de provedor economiza **quase nada**. O ganho real mora em **boleto** e em **cartão de ticket alto / recorrência longa**. Antes de qualquer build, **meça seu mix** — é o dado que decide.

### 1.4 Modelo de economia (taxa efetiva por cenário)

Taxa **efetiva** (= % + fixo/ticket) na assinatura recorrente, Cakto vs Asaas (PSP transparente mais barato, cartão à vista):

**Ticket R$ 197/mês:**

| Método | Cakto efetiva | Asaas efetiva | Δ p.p. |
|---|---|---|---|
| PIX | 1,26% | ~0% | 1,26 |
| Cartão | 5,15% | 3,24% | 1,91 |
| Boleto | 6,25% | 1,01% | 5,24 |

**Blended por mix (ticket R$ 197):**

| Mix (PIX/Cartão/Boleto) | Cakto blended | Asaas blended | **Δ p.p.** |
|---|---|---|---|
| **PIX-heavy** (70/20/10) | 2,54% | 0,75% | **1,79** |
| **Misto** (40/45/15) | 3,67% | 1,62% | **2,05** |
| **Cartão-heavy** (20/70/10) | 4,48% | 2,37% | **2,11** |

**Sensibilidade ao ticket (cartão, Δ p.p.):** R$ 97 → ~2,5 p.p. · R$ 197 → ~1,9 p.p. · R$ 397 → ~1,4 p.p. (o fixo R$ 2,49 pesa mais em ticket baixo).

> **Ressalvas honestas:** (1) usa a **tabela** de ambos — a Cakto também negocia em volume, então o Δ real pode encolher; (2) o PIX recorrente via **Pix Automático** pode custar mais que a cobrança PIX avulsa "grátis" (Efí cobra R$ 3,50/tx, *pior* que o R$ 2,49 da Cakto) — **confirmar antes de assumir economia em PIX recorrente**; (3) Asaas D+32 → se precisar de caixa, a **antecipação (1,25%/mês)** come parte do ganho.

---

## 2. Anatomia de um checkout próprio (o que é preciso construir)

A boa notícia: **você não constrói "o checkout inteiro" — constrói o adaptador de pagamento.** O resto (captura, tracking, afiliado, provisionamento) já existe e é agnóstico.

| Componente | O que é | Estado / esforço | Risco |
|---|---|---|---|
| **Página de pagamento (PIX/cartão/boleto)** | UI própria com os **hosted fields/iframe do PSP** para cartão (mantém você em **PCI SAQ A**). PIX = gera QR/copia-e-cola; boleto = linha digitável. | 🔴 novo · **M** | conversão (UX do cartão) |
| **Tokenização** | Cartão vira **token** no browser, nunca toca seu backend. Todos os 6 PSPs oferecem. | 🔴 novo (usa lib do PSP) · **P** | baixo (delegado ao PSP) |
| **3DS 2.0 / autenticação** | Fluxo frictionless + challenge; habilita **liability shift** de chargeback de fraude. | 🔴 novo · **M** | **médio** — confirmar suporte real no PSP (Asaas/Efí ❓) |
| **Order bump** | Oferta extra 1-clique no checkout. | 🔴 novo · **P** | baixo |
| **Upsell / downsell (one-click)** | Oferta pós-compra reusando o token do cartão. | 🔴 novo · **M** | médio (regras + token reuse) |
| **Recuperação de carrinho** | Já desenhada como **camada própria** (Edge Function ouve eventos `pix_gerado`/`abandono` → WhatsApp). | 🟡 desenhado no ESTAGIO0 · **M** | depende de eventos do PSP |
| **Recorrência + dunning** | Cobrança mensal, retry de falha, pro-rata, troca de plano. | 🔴 novo · **G** | **alto** — é o coração de um SaaS; PSP forte aqui (Iugu/Asaas/Pagar.me) reduz |
| **Refund / chargeback ops** | Estorno, reversão de comissão, disputa. | 🔴 novo · **M** | **alto** — vira operação contínua, não código one-shot |
| **Conciliação financeira** | Casar payout do PSP × pedidos × comissões. | 🔴 novo · **M** | médio (mas obrigatório p/ contabilidade) |

**Custo "invisível" do build:** a Cakto entrega esse pacote inteiro pronto pela taxa. Ao internalizar, você troca **% de taxa** por **CapEx de engenharia + OpEx de operação de pagamento** (antifraude, chargeback, conciliação, re-atestação PCI anual). É exatamente esse trade que o break-even da Seção 5 quantifica.

---

## 3. Programa de afiliados próprio + split (a decisão-chave)

Você já tem `affiliate_commissions` (idempotente) e `affiliates.pix_key`. Isso abre **dois caminhos** para pagar o afiliado — e a escolha importa mais que o PSP:

### 3.1 Caminho A — Split nativo no PSP
O PSP divide o valor **na liquidação**: a parte do afiliado nunca entra na sua conta.

- **Prós:** dinheiro do afiliado não transita por você (contabilidade limpa, não vira sua receita); reversão automática em refund (Asaas/Pagar.me).
- **Contras:** **todo afiliado precisa ter conta no PSP** (atrito de onboarding — pior no MP/Efí, mais leve no Pagar.me via `recipients`); você fica **preso ao PSP** (split é proprietário); responsabilidade de chargeback no split precisa ser configurada (`liable` no Pagar.me).

### 3.2 Caminho B — Payout próprio via PIX (recomendado para começar)
Você recebe **100%**, calcula a comissão na sua camada (**já existe**) e paga o afiliado por **PIX em lote** usando a `pix_key` que você já guarda.

- **Prós:** **afiliado só precisa de uma chave PIX** (zero onboarding no PSP) → fricção mínima; **provider-agnóstico de verdade** (troca de PSP sem refazer o programa de afiliado); controle total da régua `pending→approved→paid` (segura a comissão até passar a janela de chargeback). Aproveita 100% do que você já migrou.
- **Contras:** a comissão entra como **sua receita** e sai como **despesa** (impacto fiscal/contábil — falar com contador); você arca com o **float**; **clawback** de comissão em refund/chargeback é **sua responsabilidade** (mas você já tem o estado `cancelled` para isso).

> **Recomendação:** **começar pelo Caminho B (payout PIX próprio).** É mais simples, mais barato, mais alinhado à sua arquitetura provider-agnóstica e elimina o maior atrito (afiliado abrir conta no PSP). Migrar para split nativo só se o volume de afiliados e a exigência contábil de "não tangenciar a receita" justificarem. A régua que você já tem (`pending → approved` só após a janela de reembolso → `paid`) é exatamente o antifraude de **auto-compra**: comissão não vira `paid` antes de a venda "assentar".

### 3.3 Antifraude de auto-compra e atribuição
- **Auto-compra:** bloquear comissão quando `affiliate.email == order.customer_email` (ou mesmo CPF/CNPJ); manter `pending` até `approved` (pós-janela de chargeback); flag de velocidade (muitos pedidos do mesmo afiliado no mesmo cartão/IP).
- **Comissão por recorrência:** modelar `commission_kind` (`first_sale` vs `recurring`) e gerar nova `affiliate_commission` a cada cobrança recorrente paga (idempotente por `id` da cobrança do mês) — o schema atual já suporta com `idempotency_key` por pedido.

---

## 4. Compliance

### 4.1 PCI-DSS — a decisão que define o esforço
A pergunta real do "checkout próprio" não é "UI própria?", é **onde fica a fronteira de captura do cartão**:

| Cenário | Onde o PAN passa | Questionário | Controles | Veredito |
|---|---|---|---|---|
| **UI própria + hosted fields/iframe do PSP** | nunca toca seu backend (token) | **SAQ A** | ~13 | ✅ **o caminho** — UI sua, PCI leve, ainda corta fee |
| JS direct-post você controlando a página | passa pelo browser na sua página | SAQ A-EP | mais pesado | ⚠️ evitar |
| API própria recebendo PAN | PAN no seu servidor | **SAQ D** | **~300+** | ❌ quase nunca vale |

- **Regra de ouro:** se o PAN passa pelo seu backend (mesmo que você tokenize depois), você cai em **SAQ D**. O ponto de captura **tem de ser o PSP**.
- **PCI v4.0.1** (obrigatório desde 31/03/2025): mesmo em SAQ A, você **atesta** que a página de pagamento só carrega elementos vindos **direto do PSP compliant** e não é suscetível a script tampering (anti-Magecart). Em SAQ D, os Req. 6.4.3 (integridade de scripts) e 11.6.1 (detecção de tampering ≥ semanal) são plenos.
- **Casa com a Seção 11 do seu CLAUDE.md:** chave de API do PSP **server-side** (Edge Function proxy), nunca em `NEXT_PUBLIC_*`; frontend usa só JWT Supabase; tokenização delegada.

### 4.2 3DS 2.0 e liability shift (BR)
- Transação **autenticada via 3DS** → responsabilidade por **chargeback de fraude migra para o emissor**. Não cobre disputa não-fraude (produto não entregue, "não reconheço o SaaS"). Divergência de bandeira: **Visa** assume se o cartão não está enrolado; **Mastercard** tende a manter no merchant.
- **~85%** das transações passam **frictionless** (sem desafio ao cliente) → impacto de conversão pequeno.
- **Due diligence #1 do build:** **confirmar por escrito o suporte a 3DS 2.0** no PSP escolhido. Pagar.me e Mercado Pago confirmam; **Asaas e Efí não documentam** → cobrar antes de fechar. Sem 3DS, o chargeback de fraude é **seu**.
- Não há **mandato legal** do Banco Central forçando 3DS em todo CNP — a adoção é dirigida por regra de bandeira + incentivo de fraude. Não afirmar compulsoriedade legal.

### 4.3 LGPD
- **Base legal:** checkout pago = **Art. 7º, V (execução de contrato)** → **não precisa de consentimento** para o dado necessário à compra. Antifraude = **IX (legítimo interesse, com LIA)**. Fiscal = **II (obrigação legal)**. Consentimento só para o que extrapola (marketing).
- **Erro comum:** **cartão e CPF NÃO são dado "sensível"** (Art. 5º, II) — são dado comum. Só vira Art. 11 se houver **biometria** no checkout.
- **Minimização (Art. 6º):** nunca guardar PAN completo nem CVV — só **token / últimos 4 / bandeira**. Isso **converge com o PCI** (delegar a captura ao PSP = você não pode vazar o que nunca teve).
- **Transferência internacional (Arts. 33–36):** PSP/cloud fora do Brasil exige mecanismo válido (cláusulas-padrão ANPD 2024/2025) no DPA. **Stripe/cross-border** acende esse ponto; PSP local não.
- Encarregado/DPO (Art. 41) e notificação de incidente à ANPD (Art. 48, endurecido em 2024) seguem valendo.

---

## 5. Esforço × risco × economia — break-even e recomendação

### 5.1 Custo do build (estimativa, banda)
- **CapEx (v1 robusta):** adaptador PSP + checkout hosted-fields + 3DS + split/payout + recorrência/dunning + refund/chargeback + conciliação + atestação SAQ A + testes. Estimativa **R$ 60k – R$ 180k** (tempo de engenharia) — *estimate, calibrar com seu time*.
- **OpEx contínuo:** monitoramento de fraude + conciliação + operação de chargeback + re-atestação PCI anual. Estimativa **R$ 2k – R$ 5k/mês**.
- Porque a camada de afiliado/tracking/provisionamento **já existe**, esse CapEx é **menor** do que um "checkout do zero" típico — mas o **OpEx é estrutural** (vira função permanente).

### 5.2 Break-even (Δ blended conservador = 1,5 p.p.; build R$ 120k; OpEx R$ 3k/mês)

| GMV recorrente/mês | Economia bruta (1,5%) | − OpEx (R$ 3k) | Economia líquida/mês | Meses p/ pagar o build | Vale? |
|---|---|---|---|---|---|
| R$ 100k | R$ 1.500 | −R$ 1.500 | **negativo** | nunca | ❌ |
| R$ 200k | R$ 3.000 | R$ 0 | ~0 | nunca recupera CapEx | ❌ |
| R$ 300k | R$ 4.500 | R$ 1.500 | R$ 1.500 | ~80 meses | ❌ (só estratégico) |
| R$ 500k | R$ 7.500 | R$ 4.500 | R$ 4.500 | **~27 meses** | ⚠️ limítrofe |
| R$ 1M | R$ 15.000 | R$ 12.000 | R$ 12.000 | **~10 meses** | ✅ |
| R$ 2M | R$ 30.000 | R$ 27.000 | R$ 27.000 | **~4,4 meses** | ✅✅ |

**Limiar de decisão por fee:** ~**R$ 500k–1M de GMV/mês**. Abaixo, o build só se justifica por **ganho estratégico** (dono do dado/cliente, fim do risco de plataforma, controle total de conversão e do programa de afiliado), não por economia.

### 5.3 Riscos do build (além do custo)
- **Migração de cartão-on-file:** assinaturas ativas no cartão **não migram facilmente** de PSP (portabilidade de token é restrita) → risco de churn na virada. Mitigação: rodar **novos** clientes no PSP novo e deixar a base antiga decair na Cakto (mais um argumento para o **híbrido**).
- **Você vira operador de dinheiro:** chargeback, conciliação, antifraude e PCI viram **função permanente** — não é "entregou e acabou".
- **3DS não confirmado** em Asaas/Efí → chargeback de fraude pode recair em você.
- **PIX recorrente** pode custar **mais** que a Cakto (Pix Automático ≥ R$ 3,50 em alguns PSPs).

### 5.4 Recomendação final + roadmap faseado

**Híbrido faseado, provider-agnóstico, medindo antes de migrar.** Cada fase tem critério binário (Seção 8.3 do CLAUDE.md):

| Fase | Objetivo | Entrega | Critério VERIFICÁVEL |
|---|---|---|---|
| **Fase 0 — Medir (1 sem)** | Saber se vale | Dashboard do **mix real** (PIX/cartão/boleto), ticket médio, GMV recorrente/mês e **taxa blended efetiva paga à Cakto hoje** | Query retorna `{mix, ticket_medio, gmv_mensal, fee_blended_atual}`; você se posiciona na tabela 5.2 |
| **Fase 1 — Provar (2–4 sem)** | Validar economia real sem risco | **Adaptador de 1 PSP** (recomendo **Asaas** por custo/transparência **ou Pagar.me** por fit de split) atrás da camada provider-agnóstica; rotear **só boleto + cartão de ticket alto** | Uma venda-teste real fecha `paid` → provisiona org+admin (reusa `provisionFromOrder`) e cria comissão; **fee medida < fee Cakto** no mesmo pedido |
| **Fase 2 — Afiliado (1–2 sem)** | Pagar comissão sem atrito | **Payout PIX próprio em lote** (Caminho B) sobre `affiliate_commissions`; régua `pending→approved→paid`; bloqueio de auto-compra | Comissão aprovada pós-janela vira PIX pago à `pix_key`; auto-compra fica `cancelled`; idempotente |
| **Fase 3 — Conversão (2–4 sem)** | Paridade de features Cakto | Checkout hosted-fields + 3DS + order bump + upsell 1-clique + recorrência/dunning | Checkout aprova cartão tokenizado com 3DS; assinatura recorrente cobra mês 2 automaticamente |
| **Fase 4 — Migrar (condicional)** | Só se Fase 0 deu ≥ R$ 500k–1M/mês | Rotear o grosso; **Cakto vira fallback**; base antiga decai sem migração forçada de cartão | % de GMV no PSP próprio sobe; churn na virada ≈ 0; conciliação fecha mensal |

> **Não pule a Fase 0.** "Taxas altas demais" é uma hipótese até você medir o mix e a taxa blended real. Se 80% das suas vendas são PIX, o PSP próprio economiza **quase nada** e o build não se paga — e isso só se descobre com o seu dado.

---

## Anexo — Fontes e itens a verificar (anti-invenção)

### Itens a CONFIRMAR antes de fechar (não decidir sem isto)
1. **Seu GMV recorrente/mês + mix PIX/cartão/boleto + ticket médio** (Fase 0) — o dado que decide tudo.
2. **3DS 2.0** por escrito no PSP escolhido (Asaas/Efí ❓; Pagar.me/MP ✅).
3. **Custo do PIX recorrente / Pix Automático** no PSP (pode ser pior que Cakto).
4. **Proposta comercial** dos 2 finalistas com **seu volume** — tabela é piso; o real cai 0,3–1,0 p.p.
5. **Tabela Cakto** confirmada na conta logada (central de ajuda deu 404 em fetch direto; lida via snippets — PIX 0% e cartão 3,89% consistentes, mas validar).
6. **Cláusula de chargeback no split** (quem é `liable`) e **antecipação** negociada (Asaas D+32 / Pagar.me D+15).

### Fontes (acessadas 2026-06-19)
- **Asaas:** asaas.com/precos-e-taxas · docs.asaas.com/docs/split-de-pagamentos · docs.asaas.com/reference/tokenizacao-de-cartao-de-credito
- **Pagar.me:** docs.pagar.me (recebedores, split-rules, pedidos-com-split) · pagarme.helpjuice.com (taxas, antecipação)
- **Mercado Pago:** mercadopago.com.br/blog/split-de-pagamento · mercadopago.com.br/developers (3DS, prazos)
- **Iugu:** dev.iugu.com/docs/split-de-pagamentos · iugu.com/blog/entenda-a-tarifa-da-iugu
- **Efí:** sejaefi.com.br/tarifas · dev.efipay.com.br (split Pix, marketplace)
- **Stripe BR:** stripe.com/en-br/pricing · stripe.com/connect/pricing · docs.stripe.com/payments/installments (parcelado BR não suportado)
- **Cakto / concorrentes:** ajuda.cakto.com.br (taxas — 404 em fetch, via snippets) · investfinance (Kiwify 8,99%+R$2,49) · tactus.com.br (Hotmart 9,9%+R$1) · ajuda.eduzz.com (Eduzz 4,90%/8,90%+R$2,49, 14/abr/2026)
- **Compliance:** blog.pcisecuritystandards.org (SAQ A / v4.0.1) · EMVCo (3DS) · planalto.gov.br Lei 13.709 (LGPD) · ANPD

> **Labels:** PIX/boleto/cartão à vista (melhor caso) = **VERIFICADO** (multi-fonte). Parcelado detalhado, antifraude Pagar.me (R$/tx), saque MP, estado 3DS Asaas/Efí/Elo, e tabela Cakto = **ESTIMATE/VERIFY**. Todas as tarifas são **piso negociável**, não preço final.
