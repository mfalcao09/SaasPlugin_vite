# 📋 INVENTÁRIO DE PENDÊNCIAS — GO-LIVE NexvyBeauty
**Criado:** 2026-07-14 · **Atualizado:** 2026-07-15 (batelada P2/P9/P10 — deploys em voo)
**Fonte:** 6 investigações read-only + execução da sessão.

> 📸 **FOTO DE GO-LIVE CONSOLIDADA (2026-07-16):** [ESTADO-GO-LIVE-2026-07-16](ESTADO-GO-LIVE-2026-07-16.md) — o retrato único pós-maratona (produto + 3 vetores no ar + FILA-HITL do Marcelo + corte de lançamento). Use ELA para decidir o lançamento; este inventário é o histórico tático.

---

## 🆕 2026-07-17 — BATELADA 3 (LP nova no ar + assessment 100% go-live VERIFICADO)

### ✅ Fechado nesta batelada
- **Todos os PRs da maratona MERGEADOS+DEPLOYADOS** (produto + 3 vetores + integridade de preço). Nada mais a *construir/deployar* no core — só ATIVAR.
- **Ladder A APLICADA** (tabela 450/720/1190; cobrado 275/427/693 intocado) + **campo `list_price_monthly` editável no admin** (#89) + **de-para na lista de planos** (#90).
- **Cakto root-fix DEPLOYADO** (#85 · `cakto-sync-offer` v31 / `cakto-webhook` v40) — mudar preço desabilita a oferta velha na origem + rede webhook underpay (alerta+provisiona).
- **LP nova "Clientes de Volta" LIVE no apex** `nexvybeauty.com.br` (substitui a SalesPage): preço/checkout de `public_plans` (fonte-única), links reais (WhatsApp NEXVY_VENDAS +5511955021205 · `app.nexvybeauty.com.br` · `/termos` `/privacidade` já existentes · IG @nexvytech), **og:image próprio** na identidade da LP. PRs #91/#92/#93.
- **Área Cofounder** = produto CRM próprio `e2e1e85d…` + pipeline isolado (`Interessada→Assinou o SaaS→Vaga reservada→Em mentoria→Concluída/Perdida`) + tag automática + form `interesse-cofounder`. **Lead nasce do Marcelo + tag automática.** Reusa o CRM, zero tabela nova. NexvyBeauty intacto.

### 🔴 O QUE FALTA PRA 100% — 3 BLOQUEADORES ENCADEADOS (assessment verificado 07-17: deploy+flags+DB)
> **A distância real é 1 migration + 1 flag + 1 teste. Não é mais construir.**
1. **R1 — `public_plans` filtra `is_active`, NÃO `is_public`** → o plano Teste E2E R$10 (is_active=true, is_public=false) **VAZA no pricing público**. **[EU] 1 migration** (governar visibilidade por `is_public`). **Pré-requisito do E2E** (roda sem vazar).
2. **E2E R$10 NUNCA RODOU** — a cadeia compra→provisão→key→onboarding→login nunca foi provada com pagamento real. **[EU orquestro + Marcelo paga].** Depende de 1 e 3. É a única prova que ainda não existe.
3. **`EMAIL_SEND_ENABLED` OFF** — e-mail transacional dormente (drena a fila como `dry_run`, não chama o Resend). Se a key/boas-vindas vai por e-mail, o cliente **não recebe credencial**. `RESEND_API_KEY` já está em prod. **[Marcelo: 1 env]**.

> **Nenhum outro gate bloqueia a compra.** Cold/CAPI/ADS-mutations/Nina/handoff — todos fail-safe dormentes; ligá-los é escolha, não pré-requisito.

### ⚙️ Runbook de ativação (ordem)
1. **[EU]** fix R1 → *verify: view não retorna o R$10.* · 2. **[Marcelo]** `EMAIL_SEND_ENABLED=true` → *verify: `email_send_log` grava `sent`, não `dry_run`.* · 3. **[EU+Marcelo]** rodar E2E R$10 no link Cakto real → *verify binário: tenant provisionado + key entregue + login 200.* · 4. Aquisição (cold/ads/nina) fica **OFF** = fast-follow.

### 🟡 Fast-follow (lança SEM): Nina D-7 (`NINA_HEALTH_SCAN_ENABLED`) · handoff Duda→CS (`ONBOARDING_HANDOFF_ENABLED`) · cold outreach (`COLD_OUTREACH_ENABLED`+dry_run+Evolution) · ads inbound/CAPI (`CAPI_ENABLED`+secrets Meta) · pricing-cron. Todos gated OFF.
### ⚖️ RIPD: **não bloqueia** piloto pago via LP+Cakto+provisão (não usa a esteira demo). Marcelo (advogado) assume os atos.

---

## 🆕 2026-07-16 — BATELADA 2 (maratona: pricing + aquisição + oferta)

### ✅ Construído + verificado nesta maratona (gated, aguardando merge/deploy do Marcelo)
- **#85 Cakto root-fix** — mata o link velho na origem (`status:'disabled'` na oferta antiga) + rede webhook underpay (alerta+provisiona). SHIP-READY (94/94, revisão adversarial). 🔄 **DEPLOYANDO** (merge + 2 edges `cakto-sync-offer`/`cakto-webhook`, sem migration).
- **#84 Cold gate `approved_at` AIRTIGHT** — enqueue + send-boundary recheck. 49/49, gated OFF.
- **#86/87/88 ADS management** — docs · agente `ads-optimize` (gated `ADS_MUTATIONS_ENABLED` OFF) · console front. Draft stacked; schema `ads_*` **live confirmado**, zero migration.
- **Prospecção per-lead** (#82→#83) — portão de aprovação POR LEAD (clean slate: 0 aprovados, 4.006 crus intactos).
- **Oferta redesenhada** (Grand Slam) — naming **"Agenda Cheia"** (promessa-mãe) + "Cliente de Volta"/Raio-X (hook cold); **Ladder A aprovada** (tabela → **450/720/1190**; lançamento 275/427/693 intocado). ⚠️ write no banco aguarda GO do Marcelo (eu aplico + re-sync Cakto).
- **Cold outreach v2** — DNA + 3 variantes (anti-ban/A-B) p/ os 1.497. Copy pronta.

### 🔬 Achado crítico de integridade — doc [PRECO-INTEGRIDADE-3GAPS](PRECO-INTEGRIDADE-3GAPS-2026-07-16.md)
- **Cakto = fonte-da-verdade do valor cobrado** (nosso banco é vitrine). **#85 mata a raiz** (oferta velha `disabled`).
- **Timing lançamento→tabela = 100% MANUAL** (sem cron): hoje é `UPDATE price_monthly=list_price_monthly` na mão + re-run do `cakto-sync-offer`.
- **Admin sem controle** de `list_price_monthly` (`PlanFormDialog` não tem o campo → editar = SQL cru).

### 🔴 O QUE FALTA — pra ENTREGAR O SOFTWARE PRONTO (go-live)
1. **E2E R$10** — 🔄 runbook sendo construído; Marcelo paga → prova a cadeia inteira (pagar→provisionar→onboarding→automação). **O gate nº1.**
2. **Merge+deploy dos PRs prontos** — #85 (em voo) · #84 · #86-88. [comando do Marcelo]
3. **LP nova** (Lovable) + render do "de/por" nela (hoje só o wizard renderiza). [Marcelo finaliza → eu subo]
4. **Ladder A no banco** (450/720/1190) — [GO do Marcelo → eu aplico + re-sync Cakto p/ não deixar link velho]
5. **Flags de lançamento:** `EMAIL_SEND_ENABLED` · `ONBOARDING_HANDOFF_ENABLED`(+2 smokes) · duplo-gate cold (`dry_run`+`COLD_OUTREACH_ENABLED`) · `NINA_HEALTH_SCAN`(pós D-7). [Marcelo]
6. **Números/ops:** número Meta salão-teste (Salvy 11 95213-9912 existe) · burner cold (≠ oficial) · número+WABA ads inbound.
7. **Resend:** domínio `nexvybeauty.com.br` verificado (infra+cron `process-email-queue` **JÁ aplicados**; falta DNS + flag). [Marcelo: conta+DNS]

### ⚙️ O QUE FALTA — pra ENTREGAR TUDO AUTOMATIZADO (o "no automático")
> Regra honesta: tudo abaixo está **CONSTRUÍDO**; o que falta é **ATIVAR** (flag/número/secret) ou o **último elo** de automação.
- **Venda → provisionamento:** ✅ automático (webhook→org). Falta o E2E provar com pagamento real.
- **Onboarding pós-compra:** 🟡 wizard existe; o **elo automático** (link auto-enviado P14 · handoff Duda→CS no mesmo thread · QR na última tela · F6 Evolution lê histórico→monta carteira) = spec 07-13, **parte construída (esteira), parte a fiar**.
- **E-mail pós-compra:** 🟡 infra+cron aplicados → automático ao ligar `EMAIL_SEND_ENABLED` + DNS verificado.
- **Automação (4 receitas) + carteira:** ✅ default ON (gated); ativa por org provisionada.
- **Retenção Nina D-7:** 🟡 cron existe, dormente; liga em `NINA_HEALTH_SCAN` pós-âncora D-7 (0 pagantes hoje).
- **Cold outreach:** 🟡 motor+cron+anti-ban prontos; automático ao provisionar burner + flipar duplo-gate.
- **Ads:** 🟡 captura CTWA + agente de otimização prontos; **aplicar mutação na Graph é gated** (validar forma vs API Meta real + `ADS_MUTATIONS_ENABLED` + cron). App Review Meta = semanas.
- **Pricing timing (lançamento→tabela):** 🔴 **100% MANUAL** — pra ser automático, falta `effective_date` + cron diário (recomendo **manual no lançamento**; automação = fast-follow, 0 pagantes).
- **Lead engine (scrap):** 🟡 keyword+import vivos; expansão em grafo/query-actor CONGELADA (exige farm de contas IG logadas).

> **Leitura da controladora:** o software está **construído**; nenhum item acima é "escrever feature nova". O caminho é **provar (E2E) + mergear/deployar + ligar flags + ops (números/DNS)**. O único que exige mais código pra ficar *totalmente automático* é o **pricing timing** (cron) e o **elo final do onboarding pós-compra** (F6/handoff) — ambos fast-follow, não bloqueiam o piloto controlado.

Legenda: ✅ resolvido/no ar · 🟡 parcial · 🔴 não existe · ⏳ pendente · ⚙️ config externa

---

## ✅ SUBIU EM PRODUÇÃO nesta sessão (2026-07-14 → 15)
- **P10 Handoff SDR→Lia** — PR #66 mergeado + 3 edges deployadas (brain/cakto-webhook/cakto-reprocess-order) com a flag **OFF** (comportamento idêntico). ⚠️ Falta só **você ligar o secret** `ONBOARDING_HANDOFF_ENABLED=true` + 2 smokes (o "dedo no gatilho").
- **Onboarding E2E** (wizard 9 passos + telemetria + apply-onboarding) — PR #63
- **Menu "Prospecção Ativa"** (Buscas + Base consolidada dedup-merge + 4 stubs) — PR #64, VIEW aplicada (4.005 handles, nada perdido)
- **Sunset "Piloto Fundadora"** — PR #65: migrations (preço de-para 275/383·427/599·693/849 + 8 colunas + Duda/Bia reescritos) + deploy edges (brain/copilot/cakto-webhook). Banco verificado limpo.
- **R5** (Teste E2E R$10 vazando) — corrigido (brain filtra `is_public`)
- **ICP enriquecido** + **preço fonte-única** (`list_price_monthly`) — aplicados no sunset
- **Enriquecimento** — 4.006 leads (1.919 WhatsApp + 1.562 IG), pool esgotado
- **Preços** 275/427/693 · **número demo Meta** · **e-mail Resend** · **webhook Cakto** (já configurado)

---

## ⏳ PENDÊNCIAS (o que falta — você prioriza)

| # | Item | Estado | O que falta | Esforço | Bloqueia? |
|---|---|---|---|---|---|
| **P8** | **Esteira de demonstração** (ver o R$ DELA antes de comprar) | 🔬 **roadmap /loop PRONTO** (blueprint v2 + 36 entregáveis) | ⛔ 2 blockers antes do /loop: **B1** geo-IP provider · **B4** QR+compra são físicos (redefine "100%") | ~11-13d | pitch promete |
| **P9** | **Automação real** (4 receitas) | 🔄 **DEPLOYANDO agora** (agente: merge #69→main + migration + edges + front) · código 100% (deno test 20/20) | aguardar `DEPLOY-VERDE` | — | pitch "automático" |
| **CART** | **Agente de Gestão de Carteira** (auditor + captura) | 🔄 **DEPLOYANDO agora** (junto do #69) · smoke live 7 pending/3 unreachable | aguardar `DEPLOY-VERDE` + backfill do auditor | — | pré-disparo |
| **P2** | **3 agentes-casca** (Nina/Nexvy/Orquestrador) | ✅ PR-A **#67 em PROD** · **PR-B #68 GO DADO** — enfileirado atrás do #69 (evita corrida git); dispara sozinho quando #69 fechar, com gate `tmp-eval ≥90%` (rollback se falhar) | eu: rodar o #68 pós-#69 · você (depois): confirmar D-7 antes de `NINA_HEALTH_SCAN` | — | não (flags OFF = idêntico) |
| **P10** | **Handoff SDR** (Duda→pago→Lia mesmo thread) | ✅ no ar (flag OFF) — PR #66 · **smokes prontos** · o **porte sobe junto com o #69** (redeploy do `cakto-webhook`) | falta só: você ligar `ONBOARDING_HANDOFF_ENABLED=true` → eu rodo os 2 smokes | mínimo | não |
| **P11** | **Agentes LDR / BDR** (outbound aos 4.006 leads) | 🔴 personas faltam (motor `manual-outreach` existe) | prompt + `agent_type` + anti-spam | Médio | só se outbound |
| **P13** | **Orquestrador formal** (dispatcher por `agent_type`) | 🟡 implícito | migrar roteador nome→agent_type | Alto | não (3 lineares ok) |
| **LP** | **LP nova** (Lovable) substituir a antiga | 🟡 você fazendo | você finaliza no Lovable → eu subo | — | incoerência R3 temporária |
| **E2E** | **Rodar o E2E de verdade** (compra real R$10) | ⏳ adiado por você | pagar → provar provisioning ponta-a-ponta | Baixo | prova final |
| P14 | Link de onboarding auto-enviado (compra direta) | 🟡 manual existe | opcional | Baixo | não |
| P15 | ~4 telefones unicode-bold (lote antigo) | ✅ **RESOLVIDO 100%** — 4 `telefone` + 4 `whatsapp_link` normalizados em `platform_crm_extracted_leads` (prova: 0 restantes) | — | Baixo | não |
| INFRA | Disco do Mac cheio (1,3 GB) · roteador de agentes por-nome | 🔴/🟡 | liberar espaço · migrar (P13) | — | ambiente |

---

## 🚦 CAMINHO PARA O GO-LIVE

**O produto está essencialmente construído. O que falta pra lançar não é mais código — são GATES + os 2 deploys terminando.**

### 🔴 Caminho crítico (bloqueia lançar)
1. 🔄 **2 deploys fecharem** — #69 (automação+carteira) deployando · #68 (brain) enfileirado atrás. [em voo]
2. 🚀 **LP nova** (Lovable) → eu subo. [Marcelo finaliza]
3. 🔴 **E2E real (compra R$10)** — a **maior incógnita**: tudo está construído, mas a cadeia inteira (pagar→provisionar→onboarding→automação) **nunca rodou com pagamento real neste ciclo**. Até passar, "pronto" é afirmação, não fato. [Marcelo paga → eu monitoro]
4. 📧 **Resend/e-mail** — o cron `process-email-queue` **NÃO existe** → o e-mail de pós-compra nunca sai. [Marcelo: conta Resend + DNS · eu: cron + branding]
5. ⚙️ **P10 flag** — o porte sobe com o #69; falta você ligar `ONBOARDING_HANDOFF_ENABLED=true` → eu rodo os 2 smokes. [Marcelo]

### 🟡 Fast-follow (lança sem, adiciona depois)
- **Esteira demonstração** (~11-13d) — a demo "veja seu dinheiro". No piloto controlado, a demo pode ser **manual**; a esteira vira fast-follow pra escala.
- **Nina retenção D-7** — importa em D+30, não no dia 1.
- **LDR/BDR outbound (P11)** — só se o go-to-market for outbound.
- **Captação C1/C3/C5 · Instagram Flows · Voz IA** — Fase 2.

### ⚠️ Decisão sua (corte de lançamento — pendência #2 do plano mestre)
- **(recomendo) Opção A — lançar no CORE como piloto controlado (1-3 salões):** sell→buy→onboard→automate funcionando + demo manual; esteira/retenção/outbound fast-follow. **Semana, não meses.**
- Opção B — esperar paridade total do pitch (esteira construída): ~2 semanas a mais, deixa receita na mesa com a máquina pronta.
- **Coerência:** se a pitch promete "demo carteira", ou a demo é manual no piloto, ou suaviza a promessa até a esteira subir. Não vender o que não entrega.
