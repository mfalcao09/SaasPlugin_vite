# P1.C — CRM multiproduto E1/D3 · Mapa de Execução (scoping)

> **Data:** 2026-07-11 · **Autor:** sessão de scoping P1.C (read-only em `src/`)
> **Repo:** `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite` · **App:** `apps/NexvyBeauty`
> **Branches em jogo:** `feat/e1-db-spine` (1795ca4) · `feat/e1-f2-productcontext` (162c497) · base `main` (f8966d2)
> **Natureza:** documento de scoping — nenhum código foi alterado. Provas de liveness (curl/DNS/git) rodadas nesta sessão; provas de tsc/build/UI são **herdadas dos docs das branches** (marcadas como tal).

---

## 0. TL;DR (resposta desconfortável primeiro)

**[Certo]** As duas branches E1 **não são fungíveis nem estão "prontas para merge simétrico".**
- `feat/e1-db-spine` = **SQL puro, aditivo, faz merge LIMPO** em main (0 conflitos). E o efeito de banco **já está no prod** — a branch só *versiona* o que o MCP já aplicou. Merge dela é quase cosmético (registro em git), baixo risco.
- `feat/e1-f2-productcontext` = **React, faz merge com 4 CONFLITOS** contra o main atual, porque o main avançou 25 commits de trabalho de inbox (PRs #5/#6) que tocaram **exatamente os mesmos 4 arquivos** que a F2 religou (Inbox, Kanban, LeadsManager, PlatformShell).

**[Certo]** A prova de runtime da F2 (o check binário do plano) **continua bloqueada pela mesma dependência de 2026-07-06: só existe 1 produto semeado (`nexvybeauty`).** Sem 2+ produtos, o switcher vira label travada e é fisicamente impossível provar o re-filtro sincronizado. **O gargalo do P1.C não é código — é o seed de produtos, que depende de decisão do Marcelo (qual é a lista canônica dos ~9-10 SaaS).**

**[Provável]** Existe uma **armadilha de duas trilhas D3** que precisa ser dita em voz alta (§1.4): o que serve `gestao.nexvy.tech` HOJE é a trilha **D3-antiga** (`tasks/d3-multiproduto/`, deploy 2026-07-03, `product_id` em 21 tabelas + backfill Beauty). As branches E1 são a trilha **nova** (espinha `platform_crm_*` sem `org_id` + ProductContext global), cortadas de um commit de 06-07 e ainda fora do main. Não confundir "D3 live" com "E1 mergeado".

**1º passo recomendado:** mergear `feat/e1-db-spine` primeiro (limpo, destrava a religação dos stubs), e **antes de tocar na F2**, decidir com o Marcelo a lista de produtos + rodar o seed. A F2 sem seed não fecha o check binário de qualquer jeito — resolver conflito de merge de uma feature que não pode ser provada é ordem errada.

---

## 1. Estado REAL de cada peça

### 1.1 Branch `feat/e1-db-spine` (1795ca4) — a espinha de banco

| Dimensão | Estado |
|---|---|
| Merge-base com main | `00acf9b` (2026-07-06 06:23) |
| Commits à frente do main | 2 (`47ec5cf` wip + `1795ca4` aplicado/provado) |
| Main à frente da base | **25 commits** |
| **Mergeable?** | **SIM, LIMPO** (`git merge-tree main feat/e1-db-spine` → 0 conflitos) |
| Conteúdo | 3 migrations SQL + `todo-e1-db-spine.md`. **Zero arquivo `.tsx`/`.ts` de app.** |
| Efeito no prod | **JÁ APLICADO** via MCP Supabase (F1 baseline + F4 9 tabelas + F6 RLS). A branch é o *registro versionado* do que já rodou. |

**O que tem que o main não tem (arquivos):**
- `apps/NexvyBeauty/supabase/migrations_platform_crm/20260706_platform_crm_f1_baseline_reconciliation.sql` — DDL fiel do catálogo (idempotente `IF NOT EXISTS`, no-op no prod).
- `.../20260706_platform_crm_product_hub_tables.sql` — **9 tabelas** do hub do produto:
  `platform_crm_email_templates`, `_product_knowledge_sources`, `_materials`, `_product_training_videos`, `_objections`, `_product_catalog_items`, `_product_ctas`, `_post_sale_event_actions`, `_post_sale_event_logs`.
- `.../20260706_platform_crm_rls_product_isolation.sql` — helper `SECURITY DEFINER` + policy rep SELECT (RLS opção (c), provada com 4 personas/2 JWTs).

> **[Certo]** Essas 9 tabelas são **exatamente o backend que os 10 stubs esperam** (§2.4). Merge desta branch é pré-requisito lógico da religação.

### 1.2 Branch `feat/e1-f2-productcontext` (162c497) — o produto ativo global

| Dimensão | Estado |
|---|---|
| Merge-base com main | `00acf9b` (mesma da db-spine) |
| Commits à frente | 2 (`ead39ec` feat + `162c497` doc watcher) |
| **Mergeable?** | **NÃO — 4 conflitos de conteúdo** |
| tsc / build (herdado do doc F2) | tsc `-b --force` = 24 erros = baseline exato, **zero novos**; `vite build` **verde**. *(Não re-verificado nesta sessão; medido no main de 06-07, pode ter drift após 25 commits.)* |
| Prova de runtime (check binário) | **PENDENTE / BLOQUEADA** — precisa 2+ produtos semeados |

**Arquivos da F2 (14 no diff):** novo `ProductContext.tsx` (131 linhas: `ActiveProductProvider` / `useActiveProduct` / `ActiveProductSwitcher`, Model A com `activeProductId` cru + `effectiveProductId` fallback) + religação de Kanban, Leads(+Filters), Inbox(+`usePlatformCrmConversations`), Agenda, Agentes, Captação(Funis/Forms/Widgets), `PlatformShell`, `PlatformCrmSection`.

**Os 4 CONFLITOS (verbatim do `merge-tree`):**
```
CONFLICT: apps/NexvyBeauty/src/components/superadmin/crm/inbox/PlatformCrmInbox.tsx
CONFLICT: apps/NexvyBeauty/src/components/superadmin/crm/kanban/PlatformCrmKanban.tsx
CONFLICT: apps/NexvyBeauty/src/components/superadmin/crm/leads/PlatformCrmLeadsManager.tsx
CONFLICT: apps/NexvyBeauty/src/components/superadmin/platform-shell/PlatformShell.tsx
```
**Causa-raiz:** o main pós-06-07 recebeu o trabalho A1.x de inbox (commits `66a74ff` "produto global (switcher)", `f2b88d0` "chip Pipeline espelha switcher", `3135374` tarefas, etc.). Esses commits **já mexeram em produto global no inbox/kanban por conta própria** — ou seja, há **sobreposição semântica**, não só textual. Resolver não é "escolher um lado": é reconciliar duas implementações do mesmo conceito (produto global). Risco real de regressão silenciosa.

> **[Provável]** Parte da F2 pode já ter sido reimplementada no main pela onda A1.x. **Antes de resolver os conflitos, diffar o que o main já faz de "produto global"** — pode ser que a F2 esteja parcialmente redundante e o merge vire "adotar o ProductContext como fonte única e descartar os useState locais que o A1.x deixou".

### 1.3 `gestao.nexvy.tech` — no ar, servindo o quê

**[Certo] Provas desta sessão (2026-07-11):**
```
curl https://gestao.nexvy.tech        → HTTP 200
curl https://gestao.nexvybeauty.com.br → HTTP 200
curl https://app.nexvybeauty.com.br    → HTTP 200
DNS: gestao.nexvy.tech        → 145.223.29.96
     gestao.nexvybeauty.com.br → 145.223.29.96   (mesmo IP)
```

**O que serve:** o **mesmo container `nexvy-beauty`** (mesmo bundle host-aware). O SPA detecta `gestao.` via `isGestaoHostname()` (prefixo) → renderiza `<PlatformShell/>` (painel super-admin / CRM do grupo), aplica tema `.theme-nexvy-institucional` (Nexvy Lux navy/azul) e marca institucional Nexvy. `viewMode='gestao'` forçado por hostname.

**⚠️ Achado de infra (desacoplamento):** o **router Traefik de `nexvy.tech` NÃO está neste repo.** O template versionado (`infra/traefik/NexvyBeauty.yml.template`) **hardcoda `nexvybeauty.com.br`** nos 3 hosts (gestao./app./apex) — comentário explícito "Dominio HARDCODADO de proposito". O `gestao.nexvy.tech` é servido por um router **fora do repo**, no VPS: `nexvy-gestao-grupo.yml → nexvy-beauty-svc` (documentado em `tasks/d3-multiproduto/STATE.md` L10, DNS na zona Cloudflare `ea83eda1`, cert LE `CN=YR2` exp 2026-10-01). **Consequência:** um redeploy que regenere só o template do repo **não recria** o router do nexvy.tech — ele vive à parte e é um ponto cego de versionamento.

**⚠️ Achado de app (confinamento):** `isHostConfinementActive()` só liga para hosts que terminam em `nexvybeauty.com.br` (`APEX_BASE` hardcoded em `lib/publicUrl.ts`). Em `nexvy.tech` o confinamento de host está **inativo** — o que é *correto por ora* (a família nexvy.tech é só-gestão, não tem app./apex lá), mas é dívida latente: quando outros produtos do grupo ganharem `app.<produto>.nexvy.tech`, o confinamento precisará generalizar a base de apex.

### 1.4 ⚠️ Duas trilhas D3 — não confundir (premissa explícita, §8.1)

| | **D3-antiga (LIVE)** | **E1 novo (branches, fora do main)** |
|---|---|---|
| Pastas | `tasks/d3-multiproduto/` | `feat/e1-db-spine` + `feat/e1-f2-productcontext` |
| Abordagem | `product_id` em 21 tabelas + `platform_crm_products`(30c) + backfill Beauty | espinha `platform_crm_*` **sem `org_id`** + ProductContext global + 9 hub tables + RLS(c) |
| Estado | **P0/P1/P2/P3 ✅ deploy 2026-07-03, LIVE** | F1/F4/F6 no banco ✅ · F2 código ⏳ · **nada mergeado** |
| Serve gestao.nexvy.tech? | **SIM (é o que está no ar)** | não |

**[Provável]** As duas não são contraditórias — a E1 é continuação/refino sobre a F1a já-viva (a própria F1-baseline da db-spine reconcilia "23 `platform_crm_*` com product_id + 3 twins"). Mas o **ProductContext global (F2) ainda não está no ar** — o "produto global" que hoje existe em `gestao.nexvy.tech` é o do A1.x/D3-antiga, com `useState` locais. Fechar o P1.C = **unificar isso no ProductContext e provar re-filtro sincronizado com ≥2 produtos.**

### 1.5 ProductContext — funcionando até onde

- **Código:** completo e coerente (Model A, `effectiveProductId` fallback, flag `initialized` para não sobrescrever "Todos", switcher reusa `PlatformCrmProductSelector`). Montado no `PlatformShell` **só** no Módulo Vendas (`id==='vendas'`); ERP intocado.
- **Data path:** lê `platform_crm_products` via `usePlatformCrmProducts` (order by created_at). Sem `org_id` — product-scoped puro.
- **Provado?** Não em runtime. `grep useActiveProduct` = 8 arquivos religados (doc F2). O watcher auto-prova (sessão `eb0b1860`, poll Supabase ~15min) dispararia a prova de DADOS quando `platform_crm_products ≥ 2` — **mas depende daquela sessão estar viva**; tratar como não-garantido hoje.

---

## 2. Checklist executável (ordenado) para fechar o P1.C

> Cada passo tem **check binário** (§8.3). Passos com 🚦 exigem GO do Marcelo (§4).

### PASSO 1 — Mergear `feat/e1-db-spine` → main
- Ordem: **primeira** (limpa, destrava tudo).
- Ação: `git merge feat/e1-db-spine` (fast-forward-friendly, 0 conflitos).
- **Check:** `git merge-tree` já provou 0 conflitos; pós-merge `git grep -l platform_crm_product_hub_tables supabase/` retorna o arquivo. Migrations são idempotentes → re-rodar no prod é no-op.
- Risco: **baixo** (SQL aditivo, efeito já no prod).

### PASSO 2 — 🚦 Decidir a lista de produtos + semear (F3)
- **Bloqueador nº1 do P1.C.** Hoje há **1 produto** (`nexvybeauty`, verificado 06-07 no doc F2 — **recheck ao vivo recomendado**, esta sessão não tem MCP Supabase autenticado).
- **"~9 produtos" — de onde vem a lista?** **Não existe seed em código.** Não há migration/arquivo de seed nas branches; produtos nascem via UI (`useCreatePlatformCrmProduct`, fluxo de criar em `PlatformCrmSection`). A lista canônica é **os ~10 SaaS do grupo** (memória P4: "1 CRM p/ ~10 SaaS" — Beauty, LAW, Ads, Payments, Advoco, Oficinas, Foods, GYM, BarbeiroPro, Intentus…). **Qual subconjunto e com que nome/slug/preço entra é decisão do Marcelo** — não é derivável do código sem chutar (§8.1: não inferir).
- Ação (após decisão): inserir N≥2 produtos em `platform_crm_products` (script SQL ou pela UI de criação). Mínimo para desbloquear = **2**; alvo declarado = ~9.
- **Check:** `select count(*) from platform_crm_products` ≥ 2 (mínimo p/ prova) / = N (alvo).

### PASSO 3 — Prova de runtime da F2 (o check binário do plano)
- Pré: PASSO 2 feito (≥2 produtos) **e** F2 no ar (depende do PASSO 4/5).
- Ação: logar `gestao.nexvy.tech` (ou `/super-admin`) como super_admin → Módulo Vendas → trocar o produto no switcher GLOBAL do topo.
- **Check binário:** ao trocar o produto, **Pipeline (Kanban) E Leads E Inbox re-filtram simultaneamente** (conjuntos distintos por `product_id`). Verde = P1.C tem sua prova central.
- Nota: prova de DADOS (queries filtradas retornam conjuntos distintos) pode anteceder a de UI; a simultaneidade é garantida por construção (todas as telas leem 1 `activeProductId`).

### PASSO 4 — 🚦 Mergear `feat/e1-f2-productcontext` → main (com resolução dos 4 conflitos)
- Ordem: **depois** de decidir seed (não faz sentido mergear feature improvável antes; mas pode vir antes do PASSO 3 se preferir provar já no main).
- Ação: `git merge feat/e1-f2-productcontext`; resolver 4 conflitos:
  - `PlatformCrmInbox.tsx`, `PlatformCrmKanban.tsx`, `PlatformCrmLeadsManager.tsx`, `PlatformShell.tsx`.
  - **Estratégia de resolução:** não é escolha de lado — **adotar o ProductContext como fonte única** e remover os `useState`/"produto global" locais que o A1.x introduziu no main. Diffar `66a74ff`/`f2b88d0` antes.
- **Check:** `tsc -b --force` = ≤ baseline (sem erros novos nos 4 arquivos) **E** `vite build` verde **E** switcher continua re-filtrando (PASSO 3 re-rodado no main mergeado).
- Risco: **médio-alto** — sobreposição semântica de "produto global"; regressão silenciosa possível no inbox.

### PASSO 5 — Religar os 10 stubs (`useProductHubStubs.ts`) → tabelas reais
- Contexto: os 10 hooks-stub têm UI 1:1 pronta, só devolvem vazio/TODO. As **9 tabelas F4 já existem** (PASSO 1) → religação = trocar o corpo dos hooks por queries reais.
- **Os 10 stubs** (arquivo `.../crm/products/hooks/useProductHubStubs.ts`):
  1. `useProductKnowledgeSources` → `platform_crm_product_knowledge_sources`
  2. `useProductKnowledgeSourceStats` → (idem, agregação)
  3. `useProductMaterials` → `platform_crm_materials`
  4. `useProductTrainingVideos` → `platform_crm_product_training_videos`
  5. `useProductObjections` → `platform_crm_objections`
  6. `useProductCatalogItems` → `platform_crm_product_catalog_items`
  7. `useProductCTAs` → `platform_crm_product_ctas`
  8. `useProductPostSaleEventActions` → `platform_crm_post_sale_event_actions`
  9. `useProductPostSaleEventLogs` → `platform_crm_post_sale_event_logs`
  10. `useProductEmailTemplates` → `platform_crm_email_templates`
- **Consumidores** (onde a religação toca UI): `CatalogImporter`, `CatalogManager`, `CatalogItemEditor`, `CadenceTab`, `PlaybookTab`, `MaterialsTab`, `BrainTab`, `ObjectionsTab`, `PostSaleTab`, `ChatTab` (CTAs).
- **⚠️ Colisão declarada (doc db-spine):** a religação edita `products/tabs/catalog/CatalogSync.tsx` e `products/tabs/chat/ChatTab.tsx`, que **`feat/beauty-lux-l4` também alterou** (commit `87cc744` "L4 cirúrgico — acento rosa→token Lux (ChatTab IA + CatalogSync)"). **2 arquivos em conflito previsível** entre religação e Lux L4. Coordenar ordem: mergear/rebasear Lux L4 antes, ou religar sobre o Lux já aplicado.
- Pré: regenerar `types.ts` do Supabase (as 9 tabelas novas precisam entrar nos tipos, senão tsc quebra na religação).
- **Check por aba:** criar registro na aba → reload → persiste. 10 abas verdes.

### PASSO 6 — Lead manual gravando `product_id`
- **Achado:** `PlatformCrmLeadsManager.tsx:96` filtra `leads.filter(l => l.product_id === activeProductId)`. Lead criado manualmente **sem** `product_id` → grava NULL → **some da lista quando um produto está ativo** (Model A default = 1º produto, nunca "Todos" por padrão).
- Ação: na criação manual de lead, carimbar `product_id = effectiveProductId` do contexto (espelhar o que a captação/edge já faz).
- **Check:** criar lead manual com produto X ativo → lead aparece na lista de X e some ao trocar para Y. `select product_id from platform_crm_leads where id=<novo>` = X (não NULL).

---

## 3. Mapa do DESACOPLAMENTO (Beauty ↔ gestao)

> Sem propor reescrita física de bundle (decisão pendente do Marcelo). Só o mapa do que está acoplado e as opções.

### 3.1 O que HOJE está acoplado (siameses de fato)

| Camada | Acoplamento atual | Onde |
|---|---|---|
| **Bundle** | **1 único bundle Vite**, 1 container `nexvy-beauty`, serve os 3 hosts + nexvy.tech | `infra/…`, `main.tsx` |
| **Entrada / routing** | 1 `App.tsx`. Host decide tudo via **prefixo de hostname** (`isGestaoHostname`/`isApexDomain`) em runtime | `App.tsx:262`, `lib/publicUrl.ts` |
| **Marca / tema** | `getActiveBrand(host)` e `.theme-nexvy-institucional` trocam Nexvy↔Beauty em runtime pelo mesmo CSS | `config/brand.ts`, `index.css`, `main.tsx` |
| **Auth / viewMode** | `useSuperAdminView` deriva `gestao|empresa` do hostname; impersonação via `set_active_organization` RPC | `hooks/useSuperAdminView.tsx` |
| **Banco** | **1 Supabase** (`fzhlb…`). ERP salão (org-scoped) e CRM grupo (`platform_crm_*` product-scoped, sem org_id) **coabitam o mesmo projeto** | migrations, `usePlatformCrmProducts` |
| **Componentes** | `superadmin/crm/*` (gestao) e `salao/*`+`admin/*` (tenant) **no mesmo `src/`**. Compartilham `components/ui/*`, `Logo`, `hooks/useAuth`, `integrations/supabase/client` | `apps/NexvyBeauty/src` |
| **Infra de rede** | Router do nexvy.tech vive **fora do repo** (`nexvy-gestao-grupo.yml` no VPS) → ponto cego | `tasks/d3-multiproduto/STATE.md` |

**Confinamento lógico que JÁ existe (as costuras entre os gêmeos):**
- `requiredHostClass(path)` + `HostConfinementGuard` — cada rota responde só na sua classe de host (app/gestao/public), redireciona se errado. **Mas só ativo em `nexvybeauty.com.br`** (não em nexvy.tech).
- `SuperAdminRoute` gateia `/super-admin` e o `PlatformShell`.
- Máxima de dados declarada: **"crm/ NUNCA toca tabela de tenant; ERP fica no nexvybeauty"** (STATE.md) — `platform_crm_*` sem `organization_id` é o enforcement estrutural disso.

### 3.2 O que "separação lógica com autonomia de features" exigiria

A arquitetura-alvo do Marcelo (Beauty = sistema próprio; gestao.* = CRM do grupo que vende TODOS os produtos + gere o Beauty-enquanto-negócio) **não exige** split físico de bundle já — exige **fronteiras nítidas e autonomia de deploy de feature**. Opções, do mais barato ao mais caro:

- **Opção A — Manter mono-bundle host-aware, endurecer fronteiras (menor esforço).**
  - Extrair `superadmin/crm/*` para um módulo/pasta com barrier de imports (lint rule: `crm/*` não importa `salao/*`/`admin/*` e vice-versa; só `components/ui` e `lib` compartilhados).
  - Versionar o router do nexvy.tech no repo (matar o ponto cego).
  - Generalizar `APEX_BASE`/confinamento para multi-domínio (nexvy.tech + por-produto).
  - **Autonomia de feature = por flag/rota, não por deploy.** Beauty e CRM sobem juntos.
  - Custo: baixo. Reversível. Não muda deploy.

- **Opção B — Split de build no mesmo repo (monorepo real).**
  - `apps/gestao` (CRM grupo) e `apps/NexvyBeauty` (tenant) como builds separados, compartilhando um pacote `packages/ui` + `packages/supabase`.
  - Deploys independentes; bundles menores; fronteira vira física.
  - Custo: médio-alto (hoje `apps/*` são apps forkados independentes, não um workspace com pacotes compartilhados — ver NexvyPayments ADR hard-fork). Precisa extrair o compartilhado primeiro.

- **Opção C — Repos/serviços separados (máximo desacoplamento).**
  - CRM do grupo vira produto próprio; Beauty consome via API. Alinha com o CRM-do-grupo-multiproduto (P4) e NexvyPayments (fork gerenciado).
  - Custo: alto. Duplicação de auth/branding. Só se o grupo escalar para muitos produtos com times separados.

> **[Palpite]** Dado o estágio (Beauty é o 1º produto pronto, receita a destravar), **Opção A é a que casa com "impacto mínimo" (Seção 3)** — endurece a fronteira sem parar a esteira. B/C são decisão do Marcelo quando o 2º produto entrar de fato no CRM. **Este doc não escolhe — mapeia.**

---

## 4. Riscos / irreversíveis que exigem GO do Marcelo

| # | Ação | Por que precisa de GO | Classe |
|---|---|---|---|
| R1 | **Seed de produtos em prod** (PASSO 2) | Escreve dados em `platform_crm_products` do banco de produção compartilhado. A lista/slug/preço é decisão de negócio, não técnica — inferir = §8.1 violado. | 🚦 GO + lista |
| R2 | **Merge da F2 com resolução dos 4 conflitos** (PASSO 4) | Sobreposição semântica com o A1.x de inbox no main → regressão silenciosa possível no inbox/kanban em prod. Não é merge mecânico. | 🚦 GO (revisar diff da resolução) |
| R3 | **Ordem F2 × Lux L4 × religação de stubs** | 3 frentes tocam `CatalogSync`/`ChatTab`/tabs de produto. Merge fora de ordem gera retrabalho/conflito. Definir sequência (sugerido: db-spine → Lux L4 → religação → F2). | 🚦 decisão de ordem |
| R4 | **Deploy que regenere o router Traefik** | O template do repo hardcoda `nexvybeauty.com.br`; o router do `nexvy.tech` vive fora do repo. Um redeploy "limpo" pode **derrubar gestao.nexvy.tech** se sobrescrever a config sem preservar `nexvy-gestao-grupo.yml`. | 🚦 verificar antes de deploy |
| R5 | **Confiar no watcher auto-prova** (sessão `eb0b1860`) | Se a sessão morreu, a prova de dados não dispara sozinha. Não marcar F2 provada por causa dele sem confirmar que rodou. | aviso |

**Não-irreversível / pode seguir sem GO:** merge da `feat/e1-db-spine` (R0, SQL aditivo idempotente, efeito já no prod) e a religação de stubs em branch (só vira risco no deploy).

---

## 5. Premissas explícitas desta análise (§8.1)

1. **[verificado]** `feat/e1-db-spine` merge limpo / `feat/e1-f2-productcontext` 4 conflitos — via `git merge-tree` nesta sessão.
2. **[verificado]** `gestao.nexvy.tech` 200 + mesmo IP do beauty — via curl/dig nesta sessão.
3. **[herdado, não re-verificado]** tsc 24-baseline + build verde da F2 — do doc `F2-PRODUCTCONTEXT-REVIEW.md` (medido em 06-07; **pode ter drift** após 25 commits no main).
4. **[herdado, recheck recomendado]** só 1 produto no banco — do doc F2 (06-07); esta sessão **não tem MCP Supabase autenticado** para confirmar ao vivo.
5. **[não inferido]** a lista dos "~9 produtos" — **exige o Marcelo**; não há seed em código e chutar a lista seria inferência >1-hop.

---

## Review

Scoping do P1.C concluído (read-only). Fatos-âncora: **db-spine merge limpo** (SQL aditivo, efeito já no prod), **F2 com 4 conflitos** contra o inbox A1.x do main, **gestao.nexvy.tech vivo mas com router fora do repo**, **prova da F2 bloqueada por falta de 2+ produtos** (gargalo de decisão, não de código), **10 stubs prontos para religar nas 9 tabelas F4** (colidem com Lux L4 em 2 arquivos). Desacoplamento hoje = siameses de bundle/host/banco com confinamento lógico parcial; 3 opções mapeadas (A endurecer fronteira / B monorepo / C repos separados), sem escolher. Próximo ato humano: Marcelo decide a lista de produtos (R1) e a ordem de merge (R3).
