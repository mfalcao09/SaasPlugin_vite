# Plano v2 — OS da casa Nexvy (branded house)

**Data:** 23/08/2026  
**Autor:** Marcelo (PM) + sessão gestao-crm  
**Worktree:** `SaasPlugin_vite-gestao-crm` · branch `feat/gestao-crm-v2`  
**Substitui:** interpretação v1 deste plano (três eixos todos “gap agora”).  
**Não substitui:** [STATUS-E1-D3-CORRECAO-2026-08-23.md](./STATUS-E1-D3-CORRECAO-2026-08-23.md) (status factual do CRM).  
**Doc legado (histórico):** [P1C-E1D3-MAPA-EXECUCAO-2026-07-11.md](./P1C-E1D3-MAPA-EXECUCAO-2026-07-11.md)

---

## Premissa que muda a sequência

Hoje **tudo roda num único CNPJ** (Nexvy), porque os produtos pertencem ao universo **SaaS B2B** da mesma pessoa jurídica.

Futuramente entram **outras operações** (imobiliárias, mercado de franquias, etc.). Isso precisa ser **conciliado no mesmo software** (`gestao.nexvy.tech`), sem segundo “gestao” e sem fork de repo.

**Estamos pela metade:** o capítulo SaaS (produto + CRM do grupo) já existe; o capítulo multi-operação / multi-CNPJ ainda não. Multi-CNPJ **não é bug do CRM atual** — é o **próximo universo**. Não construir UI de holding enquanto `N_cnpj = 1`.

**Check hoje:** operador vê a casa SaaS inteira e recorta por **produto** ou **cliente-tenant**, sem chamar tenant de “empresa do grupo”.

**Check quando nascer o 2º CNPJ:** o mesmo software recorta também por **operação / CNPJ**, com visão consolidada.

---

## 0. O que já é verdade (não reabrir)

- CRM do grupo **funciona em prod.** F2 mergeado (PR #9, `d00ca3c`). Switcher recorta Kanban / Leads / Inbox por `product_id`. Banco com 8+ produtos.
- **Um host, dois módulos.** F5 (default Vendas por TLD) foi **rejeitado** pelo PM (23/08). Tudo em `gestao.nexvy.tech`, separado por ERP / Vendas.
- **Regra B** nesta branch: create de lead / import / agenda (lead inline) / tarefas da lista não nasce sem produto quando o switcher está em “Todos”. Refine Deno 5/5. **Browser/prod não verificado.** Atalhos Inbox Radar e detalhe do lead ainda órfãos.
- P1C (jul) **errou o status** (F2 “não mergeado”, 1 produto bloqueando prova). **Acertou a infra:** mesmo bundle serve grupo + salão; confinamento `nexvy.tech` inerte.

---

## 1. Diagnóstico: o plano original era um CRM; o destino é a casa

P1C/E1-D3 perguntou: *“um CRM para ~10 SaaS, com produto ativo global”*. Isso descreve **só o capítulo atual**.

O destino é um **OS da branded house**: um software que concilia a operação SaaS de hoje **e** operações que ainda não existem. Imobiliária e franquia **não cabem** como “mais um card” em `platform_crm_products` com o Kanban do Beauty — são **outra operação** (outro motion, outro caixa, provavelmente outro CNPJ).

Três eixos — dois vivos, um reservado:

- **Produto SaaS** (`platform_crm_products`) — vivo. Beauty, LAW, Ads… **filhos do CNPJ Nexvy**. F2 é o recorte certo *neste capítulo*.
- **Cliente-tenant** (`organizations`) — vivo e mal nomeado. “Empresas” no ERP = quem **compra** o SaaS (salão, oficina), não a Nexvy. Sem `product_id` no org; drill-down no-op.
- **Operação / CNPJ do grupo** — **reservado**. Não modelado. Semear contrato; **zero switcher** até existir o segundo.

Kamino parece boa gestão multiempresarial porque resolve o **capítulo 2** (vários CNPJs, consolidado). Não é um CRM. HubSpot Brands resolve o **capítulo 1** (um grafo, N linhas). Copiar Kamino agora é resolver 2027 com a ferramenta de 2026.

### Invariantes

- Um host (`gestao.nexvy.tech`); módulos separam ERP vs Vendas; sem F5.
- **Um CNPJ implícito** até existir o segundo. Todo produto SaaS atual pertence à operação `nexvy-saas`.
- Quando nascer imobiliária/franquia: **nova operação** (e CNPJ se for o caso), não mais um `platform_crm_product` só para caber no switcher.
- Não virar banco. Tesouraria = integração na hora do 2º CNPJ, se precisar.
- Não mergear worktrees stale (afiliados, brain, LP, payments) neste épico.

---

## 2. O que faltou vs concorrentes

### Kamino — destino, não sprint

O que eles acertam e vamos **precisar depois**: um login, consolidado ou por entidade, unidade de negócio, alçada, DRE/caixa.

O que **não** copiar (agora nem como core depois): conta PJ, cartão, PIX em lote, Open Finance.

O que faltou **como preparação** (não como feature visível):

- Campo mental **operação ≠ produto**. Beauty e Ads = produtos da operação SaaS. Imobiliária = outra operação.
- Slot `operation_id` / `legal_entity_id` no catálogo **antes** do 2º CNPJ — senão o backfill dói.
- Lente consolidada **no desenho**; na UI, só `Todos | Produto | Cliente` enquanto N=1.

Fonte: [kamino.com.br](https://kamino.com.br/) (23/08/2026).

### HubSpot Brands / Salesforce — o capítulo de agora

Padrão branded house: um contato, N linhas; time vê o recorte; rollup no parent. Contato pode ser cliente de Beauty **e** Ads.

Faltou:

- **Pessoa única da casa** (`party`). Sem isso não há cross-sell.
- **Conta-mãe + filhos** (Grupo Silva dono de 3 salões). Organizations hoje = um tenant de um produto.
- Receita do **cliente** através das linhas (não só MRR por plano).

O grafo continua válido quando a casa crescer: o mesmo party pode ser tenant SaaS **e** cliente da imobiliária.

### RD / Kommo / Pipedrive

Funil + WhatsApp. Já ganhamos (inbox plataforma, prospecção, Meta signup, agentes). Não é o gap estratégico.

### Omie / Conta Azul

Fiscal do tenant ou, no futuro, da operação imobiliária/franquia. Integração, não rebuild.

---

## 3. O que podemos melhorar (fechar a primeira metade)

1. **Regra B nos atalhos** — Radar Inbox e detalhe do lead ainda criam tarefa sem `product_id`.
2. **Provar no browser** os CB-lead / import / agenda / task-todos após deploy. Unitário 5/5 não fecha o check.
3. **Prospecção / captação** — “Todos” ainda cai em `effectiveProductId` = `products[0]`. Ação que grava exige produto explícito.
4. **Vocabulário** — Empresas = clientes; Negócios / Produtos = linhas SaaS; a palavra “CNPJ” não entra no menu até existir o segundo.
5. **Dashboard da casa SaaS** — pipeline + MRR + mix por produto (hoje o ERP é só assinatura de tenant).
6. **Confinamento `nexvy.tech` e monólito** — backlog de fronteira; não bloqueia o OS.

---

## 4. O que podemos inovar

1. **Operação como tipo** — `saas | real_estate | franchise | …`. Produto SaaS vive *dentro* de `saas`.
2. **Grafo da casa (Party)** — uma pessoa/empresa; vínculos para produto **e**, depois, para operação.
3. **Lentes progressivas** — hoje 3; a 4ª (CNPJ/operação) aparece quando `count(legal_entities) > 1`.
4. **Casa que conversa** — Mia: “já é tenant Beauty; oferecer Ads”. Depois: contexto cross-operação.
5. **Alçada da casa** — desconto, impersonation, publish de agente, cold. Padrão que o financeiro multi-CNPJ reusa.
6. **Playbook por operação** — motion SaaS (já temos); imobiliária/franquia ganham motion próprio no **mesmo host**.
7. **Não vender “Kamino da Nexvy”** — tesouraria multi-CNPJ é integração (Kamino/Omie/Cakto), não rebuild.

---

## 5. Arquitetura (reversível, CNPJ-ready)

**Agora:** CRM+ERP da operação SaaS + grafo + lentes 3.  
**Preparar:** uma linha `group_operations` / `group_legal_entities` com **um** registro (`nexvy-saas`, CNPJ atual) e FK opcional nos produtos. Sem switcher.  
**Depois (2ª operação):** inserir a entidade, ligar a lente, motion próprio. Tesouraria via integração se o caixa precisar consolidar.

### Fases

| Fase | O quê | Quando |
|------|--------|--------|
| 0 | B nos atalhos + prova browser | Esta branch |
| 1 | Vocabulário + dashboard SaaS; lentes sem CNPJ | Em seguida |
| 2 | `party` (cross-sell dentro do CNPJ Nexvy) | Capítulo SaaS |
| 3 | Seed da operação/CNPJ único + FK nos produtos. Sem UI. Check: 1 legal entity; todo produto com `operation_id` | Preparação silenciosa |
| 4 | Alçada + Mia da casa SaaS | Capítulo SaaS |
| 5 | 2º registro + lente CNPJ + motion próprio + rollup | **Só** quando imobiliária/franquia for projeto real |

---

## 6. O que *não* fazer

- F5 / segundo host para “abrir Vendas”.
- UI “multi-CNPJ” ou DRE de holding **enquanto N=1**.
- Tratar imobiliária/franquia como mais um `platform_crm_product` só para caber no switcher.
- Replicar Kamino (conta, cartão, conciliação nativa).
- Merge de afiliados, brain, LP, payments-bootstrap neste épico.
- `NOT NULL` em `product_id`; incluir null no filtro para passar check.

---

## 7. O que fizemos nesta sessão (rastreio)

- Inventário: worktree limpa `feat/gestao-crm-v2` from `origin/main`. Embedded signup já na main (PR #176) — nada a portar.
- F5 regraftado e **desfeito** (rejeitado).
- Regra B em lead manual, import, agenda (lead inline), tarefas da lista.
- Este plano v2: casa SaaS agora; multi-operação depois; mesmo software.

---

*Plano de direção — não substitui evidência de runtime. Checks CB-* no STATUS devem ser reexecutados após cada deploy relevante.*
