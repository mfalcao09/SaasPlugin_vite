# Plano-Mestre — CRM do Grupo Multiproduto (executável em /loop)

> **2026-07-03.** Consolida toda a frente aprovada: **D3 multiproduto completo** + **LOTE L1–L13** + **D1–D9(b)** + **D10(a)/Utmify**. Sequenciado por dependência, com fan-out paralelo, gates de verificação e handoff entre sessões — o padrão "long-running agents" (walkinglabs/Anthropic) aplicado à nossa maratona.
> **Harness que roda isto:** `feature-list.json` (estado-máquina) + `verify.sh` (gate) + `STATE.md` (handoff) + este roadmap. Custo: **P**=horas · **M**=½–1 dia · **G**=dias (1 agente).

---

## 0. Como o /loop executa (as vantagens do loop, aplicadas)

Cada tick do /loop:
1. **Lê** `feature-list.json` → pega as features `todo` cujas `deps` estão todas `done`.
2. **Fan-out** de agentes disjuntos numa onda (paralelo só onde os arquivos não colidem).
3. **Gate** `bash tasks/d3-multiproduto/verify.sh` — fronteira + tsc baseline + build. **Nada vira `done` sem `verified`.**
4. **Commit + push** por onda; atualiza `feature-list.json` + `STATE.md`.
5. **Continua** — se a sessão trocar/estourar, qualquer sessão nova lê STATE+feature-list e retoma. (Já provado hoje: recuperei um agente-zumbi 100% do working-tree.)

**Por que gate obrigatório:** hoje o `verify.sh` pegou 2× o que revisão artesanal não pegaria — NOT NULL sem default (quebraria INSERT em prod) e 2 imports órfãos do zumbi (build quebrado). É o subsistema que faltava no nosso harness.

---

## 1. Sequência mestre (travada com você)

```
P0 D3 schema ✅ → P1 D3 front → P2 release D3 → P3 domínio+re-skin
   → P4 LOTE L1-L13 → P5 D1(b) Meta → P6 D2/D4/D5/D7/D8/D9(b) → P7 D10(a)+Utmify
```
**Regra de ouro:** D3 vem antes de tudo — LOTE e D-features nascem **product-aware**, senão é retrabalho.

---

## 2. Fases, o que paraleliza, e custo

### ✅ P0 — D3 schema (FEITO)
Migration `platform_crm_products`(30c, incl. cérebro IA) + `platform_crm_product_agents`(81c) + `user_product_assignments` + `product_id` em 21 tabelas + seed/backfill Beauty + 8 NOT NULL. **Provado.**

### 🔄 P1 — D3 restauração front (EM ANDAMENTO)
| Onda | O que | Paraleliza? | Custo |
|---|---|---|---|
| **F1a Hub** ✅ | 14 abas + `usePlatformCrmProducts` + `ProductSelector` + Negócios | (feito, recuperado) | — |
| **F1b** | Kanban por produto + Leads "Por Produto"+"Por Squad" (absorve **L9**) | ✅ com F1c/F1d | M/G |
| **F1c** | Captação: select de produto obrigatório + stamp `product_id` no lead | ✅ | M |
| **F1d** | Agentes por produto (editor 13 abas, supervisor) — **ABSORVE D6(b)** | ✅ (é o mais pesado) | G |
| F1c-filtros | "Todos os produtos" em Agenda/Tarefas/Notif | ✅ | P |

→ **F1b+F1c+F1d disparam JUNTOS agora** (têm os hooks compartilhados do F1a). Gate ao fim.

### P2 — Release D3
build + deploy VPS + anti-phantom no bundle servido + **eyeball Chrome logado** (Negócios lista Beauty · Pipeline com seletor travado em 1 produto · 14 abas renderizam · agentes CRUD). Custo P/M.

### P3 — Domínio `gestao.nexvy.tech` + host-split + re-skin (seu item 2)
Traefik file-provider (novo router→mesmo container) + DNS + redirect Supabase-auth + host-class + **módulo por host** (nexvy.tech=Vendas · nexvybeauty=ERP Beauty) + **tema institucional por host** (pesquisa `nexvy-design-export`; tenant intocado). Domínio e re-skin são **1 workstream**. Custo M/G.

### P4 — LOTE L1–L13 (agora product-aware)
L1 recorrência · L2/L3 crons campanha+notif · L4 booking-dispatcher · L5 cooldown · L6 bug Formulários · L7 cadência-no-LeadDetail · L8 transfer+histórico · L10 disparo-lote · L11 Biblioteca-Contextos · L12 higiene (dead-code+2 entrypoints) · L13 followup-confirm. **L9 já em F1b.** Vários paralelizam. Custo ~M total.

### P5 — D1(b) canal Meta Cloud + Instagram
Portar `platform-meta-whatsapp-webhook/-send` + `platform-instagram-*` → destrava os canais mudos (inbound+outbound), product-aware. Exige app Meta aprovado. Custo G.

### P6 — D2/D4/D5/D7/D8/D9 (b) — expansões product-aware (muito paralelizável)
D2 builders visuais completos · D4 dashboard financeiro de aprovação · D5 Mia ação+memória · D7 webhooks painéis+API · D8 booking conversacional · D9 web push. Custo ~G (várias ondas paralelas).

### P7 — D10(a) + Utmify (por último, seu pedido)
Reviver `campaign-ai-insights` + plugar **MCP Utmify**: atribuição por LP → `product_id` no lead. Fecha o loop **N LPs → 1 CRM**. Custo P/M.

---

## 3. Dedups que o D3-primeiro nos deu (economia real)
- **D6(b) = F1d** (mesmo subsistema de agentes) → feito 1× product-aware, **poupa uma onda inteira**.
- **L9 (Por Squad) = F1b** (mesma restauração do LeadsTabs).
- **D2(b) builders** encaixam na captação-por-produto (F1c/P6).
- **Domínio + re-skin (seu item 2)** = 1 workstream (tema por host).

---

## 4. Sua pergunta das LPs — resolvida no plano
**N LPs (1 por SaaS, cada uma no seu domínio) → 1 CRM.** Cada superfície de captação carrega `product_id` (F1c faz o stamp); a **Utmify (P7)** injeta a atribuição de campanha por LP no lead certo. Atribuição consolidada do grupo num CRM só — impossível com 10 CRMs.

---

## 5. Guardrails invioláveis (o gate reforça)
1. **Máxima:** `crm/` nunca toca tabela de tenant (products/organizations/evolution do salão). ERP fica no nexvybeauty.
2. **Prova = liveness:** release só com bundle SERVIDO (curl) + Chrome. Build local não conta.
3. **Fidelidade 1:1** da fonte Bizon; muda só tabela→`platform_crm_*`, tema, desacoplamento.
4. **Nada `done` sem `verified`** no feature-list.

---

## 6. Estimativa total
~**2–3 semanas de agente** (multi-sessão), dominadas por P1(F1d) + P5 + P6. É exatamente o caso de uso do /loop: fan-out + gate + handoff, sem eu segurar contexto.

**Próximo tick do /loop:** disparar F1b + F1c + F1c-filtros + F1d em paralelo (deps do F1a satisfeitas) → gate → P2.
