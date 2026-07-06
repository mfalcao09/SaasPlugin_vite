# EIXO 1 (Pivot D3 Multiproduto) — Plano Faseado e Acionável

> **Base factual:** recon read-only (subagente Opus, 2026-07-06) + verificação direta em disco. Worktree `feat/beauty-lux-l4` (== `main` no que toca ao CRM). **Fonte de verdade:** `src/integrations/supabase/types.ts` (espelho do banco `fzhlbwhdejumkyqosuvq`).

## ⚠️ Correção de premissa (a resposta desconfortável primeiro)

**O handoff-mestre e a memória D3 diziam "🔴 DECIDIDO, NÃO EXECUTADO". Isso é FALSO.** Verificado em disco:

- **D3 Fase 1a JÁ FOI EXECUTADA** e está em `main`/prod. Headers verbatim "D3 Fase 1a" em `PlatformCrmProductDetailPage.tsx` ("HUB DO PRODUTO com 14 ABAS"), `PlatformCrmProductListPage.tsx`, `PlatformCrmProductSelector.tsx`.
- Tabela `platform_crm_products` **existe** (`types.ts`), **23 tabelas `platform_crm_*` têm `product_id`** (555 ocorrências), hub de 14 abas navega, "Negócios"→catálogo feito, comissão product-aware.

**Não é "começar do zero" — é terminar as Fases F1→N** de um D3 cuja fundação já está posta. Ainda é frente de dias com Plan Mode próprio, mas muito mais adiantada do que os docs sugeriam. (Memória D3 já atualizada; handoff §2 idem.)

---

## 1. Estado atual da dimensão `product_id` (o que EXISTE)

**Schema/banco:** `platform_crm_products` completa (name, slug, status, pricing, pitches, icp, objections, knowledge_base). 23 de ~80 tabelas com `product_id` (9 NOT NULL: cadences, capture_funnels, commission_rules, commissions, deals, forms, pipeline_stages, stage_values, user_product_assignments; 14 NULLABLE: leads, conversations, calendar_events, chat_flows, notifications, product_agents, sales_goals, sales_squads, tag_automations, tasks, webchat_*, webhooks, lead_queue). Twins `platform_crm_product_agents` + `_user_product_assignments` existem. Comissão product-aware executada (`migrations_platform_crm/20260703_...commission_product_aware.sql`). **RLS por produto NÃO existe** (gate uniforme `super_admin_only`; product_id é filtro, não segurança). **Só 1 produto semeado** (`nexvybeauty`).

**UI/frontend (`src/components/superadmin/crm/`):** hub de 14 abas COMPLETO (Dashboard, Config, Cérebro, Agentes, Funil, Objeções, Cadência, Pós-venda, Playbook, Materiais, Catálogo, Chat, Equipe, Relatórios). Lista lê do banco (`usePlatformCrmProducts`), zero hardcode. Seletor de produto existe (`PlatformCrmProductSelector`), controlado; com 1 produto vira label. Kanban/Leads filtram por produto **via `useState` LOCAL por tela** (dessincronizado entre telas).

---

## 2. GAPS (o que falta), por gravidade

- **G1 — Nenhum estado GLOBAL de produto ativo** (gap arquitetural central). Não existe `ProductContext`/`useActiveProduct`. Trocar produto no Kanban não repercute em Leads/Inbox/Agenda/Agentes. Inbox nem filtra por produto. Se a visão D3 é "1 produto ativo global que re-filtra o CRM inteiro", **isso não existe**.
- **G2 — Separação de módulo por HOST não existe.** `gestao.nexvy.tech` e `gestao.nexvybeauty.com.br` renderizam o MESMO `PlatformShell` com os mesmos 2 módulos, default `erp`, escolhido por `localStorage`+switcher — nunca pelo host. `isGestaoHostname()` = `startsWith('gestao.')`, não distingue TLD.
- **G3 — Migrations locais divergentes do banco.** `platform_crm_products`/`product_agents`/`user_product_assignments` + os `ADD COLUMN product_id` foram aplicados via Supabase MCP em **outra máquina** (`05dc4b38`), sem migration local. `types.ts` tem tudo; as migrations locais não. `db reset` local NÃO reproduz o prod.
- **G4 — 8 tabelas-fantasma (abas do hub em stub).** Cérebro, Materiais, Catálogo, Playbook, Objeções, Chat/CTAs, Pós-venda, e-mail templates têm UI completa mas persistência via `useProductHubStubs.ts` (TODO) — dependem de 8 tabelas que NÃO existem (`platform_crm_product_knowledge_sources`, `_materials`, `_product_catalog_items`, `_product_training_videos`, `_objections`, `_product_ctas`, `_post_sale_event_actions`, `_email_templates`).
- **G5 — Só 1 produto semeado + migração de domínio inexistente no app** (parte do G2).

---

## 3. Plano faseado (cada fase com check binário)

> Fronteiras invioláveis respeitadas: nenhuma fase edita Módulo ERP, `cakto_*`, `affiliate_*`, nem restaura o azul. Migrations D3 em `migrations_platform_crm/` (afiliados usa `migrations_salao/` → zero colisão de migrations).

- **F1 — Reconciliar migrations locais ↔ banco (paga G3).** Dumpar o schema real do remoto p/ `migrations_platform_crm/` (CREATE das 3 tabelas + ADD COLUMN das 23). NÃO altera o banco. **Check:** `supabase db diff`/`reset` → schema local == remoto p/ as 23+products. 🟢 sem colisão. *É a fundação — sem isso tudo depois é frágil.*
- **F2 — `ProductContext` global + religar superfícies (resolve G1).** Provider de "produto ativo" no escopo do Módulo Vendas; religar Kanban/Leads/Inbox/Agenda/Agentes/Captação (substituir `useState` locais). **Check:** trocar produto no switcher global re-filtra Kanban E Leads E Inbox simultaneamente (teste no Chrome logado, 2 produtos). 🟡 coordenar merge (toca `agents/*`). *É o coração do D3.*
- **F3 — Seed dos ~9 produtos restantes (resolve G5-produtos).** INSERT idempotente por slug, espelhando o seed do nexvybeauty. **Check:** `SELECT count(*) FROM platform_crm_products` ≥ 10. 🟢 sem colisão. ⚠️ **decisão aberta:** quais produtos + dados comerciais.
- **F4 — Backend das abas stub (resolve G4).** Criar as 8 tabelas + religar stubs. **Fatiável** (F4a Cérebro, F4b Materiais…). **Check por aba:** criar registro → persiste → recarrega e permanece. 🟢 sem colisão.
- **F5 — Módulo por HOST + domínio (resolve G2).** `gestao.nexvy.tech`→Vendas default; `gestao.nexvybeauty`→ERP default. Toca `publicUrl.ts`/`usePlatformModule`/`PlatformShell`. **NÃO** mexe no ERP em si. **Check:** cada host abre logado no módulo certo; `HostConfinementGuard` não quebra. 🟡 fazer **pós-merge de afiliados** (contato com `publicUrl.ts`/`main.tsx`).
- **F6 — RLS/isolamento por produto (opcional, decisão).** RLS por `product_id` via `user_product_assignments`. **Check:** rep do produto A não vê leads do produto B (2 JWTs). ⚠️ **decisão aberta:** é requisito ou super_admin-vê-tudo basta?

---

## 4. Sequência recomendada

`F1 (baseline) → F3 (seed) → F2 (ProductContext, coração) → F4 (abas stub, fatiável) → F5 (host/domínio, pós-afiliados) → F6 (RLS, se decidido)`

- **F1 primeiro** (fundação versionada). **F3 antes de F2** (ProductContext só testável com 2+ produtos). **F2 é o coração.** **F4 paralelizável.** **F5 pós-merge afiliados** (evita conflito em `publicUrl.ts`/`main.tsx`). **F6 só com decisão.**
- **Sessão conjunta:** nenhuma fase exige o ERP. Única interface com afiliados = **ordenação de merge** (F2/F5), não código conjunto.

---

## 5. Decisões abertas (exigem Marcelo)

1. **G1 — "produto ativo global" é mesmo o alvo?** F2 assume 1 switcher global que re-filtra o CRM inteiro. Se a intenção era "cada produto tem seu hub, ponto", F2 encolhe. **Confirmar o modelo mental.**
2. **F3 — quais são os ~10 produtos + dados comerciais** (slug, pricing, pitches, ICP)? Pode começar com stub mínimo (nome+slug).
3. **F6 — isolamento por produto é requisito?** Hoje super_admin vê tudo; reps por produto também veriam. Se haverá vendedores dedicados por SaaS que não devem ver leads dos outros, F6 vira obrigatória.
4. **G3 (risco) — o banco é a fonte da verdade, não o git.** F1 deve dumpar o schema REMOTO real (não confiar só no `types.ts`); pode haver mais mudanças remotas não versionadas.

---

## 6. Colisão com sessões paralelas (roteiro de merge)

`feat/afiliados-proprios`: branch **velha e divergente** (merge-base 19-jun, 9 à frente / 224 atrás). Diff real = 43 arquivos, TODOS de afiliados/Cakto — **não toca `crm/products/`, `migrations_platform_crm/`, nem a região gestão de `App.tsx`** (só adiciona rota `/portal-afiliado`). **Colisão com D3 ~nula.** Risco só se ela for rebaseada sobre o main atual antes de mergear → mitigação: mergear afiliados primeiro, depois F2/F5. `feat/nexvypayments-bootstrap`: app novo isolado (`apps/NexvyPayments/`), zero interseção.

| Fase | Toca diff-real afiliados? | `migrations_platform_crm`? | Veredito |
|---|---|---|---|
| F1 | não | sim (novos) | 🟢 livre |
| F2 | não | não | 🟡 coordenar merge |
| F3 | não | sim (novo seed) | 🟢 livre |
| F4 | não | sim (novos) | 🟢 livre |
| F5 | `publicUrl.ts`/`main.tsx` alto contato | não | 🟡 pós-merge afiliados |
| F6 | não | sim | 🟢 livre |
