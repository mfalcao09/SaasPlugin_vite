# STATUS GO-LIVE NexvyBeauty — 2026-07-11
> ⚰️ **SUPERSEDED por [PLANO-MESTRE-GO-LIVE-2026-07-11](PLANO-MESTRE-GO-LIVE-2026-07-11.md)** (07-11) — a lista de ação viva mudou pra lá. Este doc = histórico.
> **Atualiza** [LEVANTAMENTO-PENDENCIAS-REAIS-2026-07-08](LEVANTAMENTO-PENDENCIAS-REAIS-2026-07-08.md) · sessão `6cf2fc02` · foco: *o que já foi feito + o que falta DE VERDADE pra lançar*.
> **Níveis de evidência:** 🅲 = verificado em código/banco/prod nesta sessão · 🅳 = atestado por doc/auditoria recente · ❔ = não verificado.

---

## 0. Veredito — a que distância estamos de vender

**A máquina de dinheiro está construída E PROVADA.** Pagamento → webhook → provisionamento → org operacional nasce ponta-a-ponta (provado E2E em 07-08 e reconfirmado hoje). O que separa a gente de um **primeiro cliente pagante** não é mais engenharia de núcleo — são **3 coisas**:

1. **1 prova do funil conversacional** (LP → WhatsApp → Duda qualifica → Bia oferta → link Cakto → pagamento). O lado do *provisionamento* está provado; a *conversa que vende* ponta-a-ponta, não.
2. **Conectar o WhatsApp da dona** (scan do QR) — o único "teto físico" que exige ação humana + teu número de salão-teste.
3. **Um punhado de decisões tuas** (§4) que destravam o resto.

Tudo além disso é polimento pós-lançamento. **Dá pra decolar com um piloto controlado agora.**

---

## 1. O que ESTA SESSÃO (07-11) fechou — delta desde 07-08

| Item | Antes (07-08) | Agora | Evidência |
|---|---|---|---|
| **Funil de pagamento Cakto** | webhook deployado mas `verify_jwt` travava + sem secret | ✅ **LIVE** — aberto, secret no ar, 2 testes 200, guard-rail "plano não encontrado → Telegram" provado | 🅲 logs edge + `cakto_orders` |
| **F4.3 secrets Telegram** (2.2) | "código pronto, falta secret" | ✅ **secrets no ar**, alerta testado HTTP 200 | 🅲 |
| **Cards nativos Meta (catálogo)** | nem existia como frente | ✅ **catálogo criado + 3 planos empurrados + auto-sync ligado** (espelha o Cakto: frontend→edge com JWT) | 🅲 GET /products = 3 itens; tsc+deno verdes |
| **2.10 Sync ao salvar plano** | "sem evidência de entrega" | ✅ **confirmado wired** (`maybeSyncCakto` + agora `maybeSyncCommerce`) | 🅲 `PlanFormDialog.tsx` |
| **Dedup `cakto_orders`** (débito) | bug latente (NULL≠NULL no índice) | ✅ **corrigido** (`UNIQUE NULLS NOT DISTINCT`), deduplicado, provado | 🅲 outra sessão, migration versionada |
| **Paridade do Atendimento (FRENTE 1)** | "régua 11/35 — reclamação nº1" | ✅ **auditoria funda rebaixou o risco**: inbox **73% completo, 0 não-portado**; núcleo em paridade | 🅳 AUDITORIA-PORTABILIDADE-V5-07-11 |
| Itens de atendimento desta sessão | vários abertos | ✅ Mia identifica por telefone · chip Pipeline espelha switcher · status do lead vem da conversa · tela Tarefas · som corrigido · IG outbound · catálogo no inbox c/ checkout · copiloto com retry | 🅲 commits `f2b88d0`/`3135374`/`f277e57` |

**A grande mudança de leitura:** o levantamento de 07-08 apontava a **paridade do inbox** como o gap nº1 (régua pessimista 11/35). A **auditoria funda de 07-11** (5 auditores + 39 verificações adversariais, 260 itens) desmentiu isso: o núcleo do CRM que você opera todo dia está **completo ou em paridade funcional**. Os gaps reais se agrupam em blocos **opcionais e nomeados**, não espalhados. → **A onda de portabilidade pode ser ENCERRADA.**

---

## 2. Backlog re-priorizado — o que BLOQUEIA lançar × o que é PÓS-lançamento

### 🔴 Bloqueia (caminho crítico — §3)
| # | Item | Dono | Esforço |
|---|---|---|---|
| B-1 | **Prova do funil conversacional E2E** (2.1) — 1 conversa real LP→Duda→Bia→link→pagamento-teste→org | Claude + você (1 pagamento-teste) | M |
| B-2 | **Conectar WhatsApp da dona** (B3) — pós-compra criar instância + deep-link do QR; o scan é humano | Claude (código) + você (nº salão-teste + local Evolution) | M |
| B-3 | **Deploy do frontend + commits/push** desta sessão | ✅ **FEITO** — commit `a90b84a` + deploy provado (`index-BsTNxNjo.js`, HTTP 200 nos 3 hosts) | — |

### 🟡 Melhora o dia-1 mas NÃO bloqueia
- B4/F6 ingestão de histórico 180d da dona (novas msgs já fluem sem backfill) — 🅲 PoC bloqueada no teu número
- C4 watcher de queda de sessão WhatsApp · C2/C3 painéis ativação
- 2.4 scoring QCR determinístico · 2.7 `founder_status` READ no runtime · 2.5 humanização
- 2.9 copy da LP "15 vagas" × 30/30/1 (incoerência pública — rápido)
- Apresentação visual rica de produtos (imagens no catálogo Meta + checkout Cakto) — **anotada como pendência de venda pós-lançamento** (análise em paralelo)

### ⚪ Pós-lançamento / trilha própria (não é buraco de porte)
- Voz IA (canal inteiro) · Meta Ads (outra frente que você já explora) · Fluxos automáticos de IG
- 4 cards de backlog da auditoria: **D** captação pública · **E** cérebro/conteúdo dos agentes · **F** Evolution *send* · **G** analytics de jornada
- Lux L4 (47 telas restantes) · CRM multiproduto E1/D3 · Afiliados fases 2-5 · Telefonia Salvy

---

## 3. Caminho crítico pra DECOLAR (mínimo viável)

```
1. [✅ FEITO] Deploy frontend + commits/push desta sessão
     → provado: bundle index-BsTNxNjo.js servido, HTTP 200 nos 3 hosts

2. [Claude] B3: pós-compra provisiona evolution_instance + e-mail com deep-link do QR
     → verifica: org-teste recebe e-mail com link de QR clicável

3. [VOCÊ] escanear o QR do WhatsApp do salão-teste (o único ato físico)
     → verifica: instância "connected"; 1 msg de teste entra no inbox da plataforma

4. [Claude + VOCÊ] B1: 1 rodada real do funil conversacional
     LP → wa.me → Duda qualifica → Bia oferta → link Cakto → 1 pagamento-teste → org nasce
     → verifica: a org do comprador-teste nasce operacional (o provisionamento já é provado;
        falta provar a CONVERSA que leva até o link)

5. [VOCÊ] rápido: corrigir copy da LP (15 vagas → 30/30/1) — incoerência pública

6. → PILOTO CONTROLADO: 1-3 salões reais (warm intros), você acompanha, mede.
```

Cada passo tem check binário. Os passos 3 e 4 (o "pagamento-teste" e o "número do salão") são teus átomos — sem eles o loop trava no achismo.

---

## 4. Decisões que SÓ VOCÊ toma (destravam o resto)

| # | Decisão | Impacto |
|---|---|---|
| D-1 | **Número do salão-teste + onde roda a Evolution** | destrava B3/B4/F6 (passos 2-4) — o maior desbloqueio |
| D-2 | **Quando iniciar o piloto** (warm intros, ≥3 pagamentos reais) | é o gatilho da venda humana |
| D-3 | `transfer_sector` — **dropar?** (recomendo sim) | limpa débito/herança Vendus |
| D-4 | IG/Messenger — **retomar (App Review Meta, exige teu vídeo) ou enterrar?** | fecha FRENTE 4 |
| D-5 | 4 cards da auditoria (D/E/F/G) — **quais entram no backlog priorizado?** | define o pós-lançamento |
| D-6 | Afiliados fases 2-5 / Telefonia Salvy — **reimplementar ou descartar branch stale?** | limpa 9.2/9.3 |

---

## 5. Recomendação

**Encerre a onda de portabilidade hoje** (a auditoria dá GO condicional — o núcleo está pronto, os gaps são opcionais e nomeados). O caminho pra decolar é curto e conhecido: os passos 2-4 do §3, gatilhados pela decisão **D-1** (teu número de salão-teste). Me dá esse número + local da Evolution e eu executo B3 na sequência; o resto do loop até o piloto é medido, não achado.

A verdade desconfortável, dita direto: **não é código que está te separando do lançamento — é a decisão de apontar um salão-teste real e rodar 1 venda de ponta a ponta.** A máquina está pronta esperando o primeiro combustível real.

---

*Fontes: [LEVANTAMENTO-PENDENCIAS-REAIS-2026-07-08](LEVANTAMENTO-PENDENCIAS-REAIS-2026-07-08.md) · [AUDITORIA-PORTABILIDADE-V5-2026-07-11](AUDITORIA-PORTABILIDADE-V5-2026-07-11.md) · verificação em `SaasPlugin_vite` + Supabase `fzhlbwhdejumkyqosuvq` nesta sessão (07-11).*
