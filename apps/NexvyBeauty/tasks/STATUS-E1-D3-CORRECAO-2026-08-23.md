# Status E1-D3 — Correção de narrativa (23/08/2026)

**Autor:** Marcelo (PM) · **Sessão:** investigação `gestao.nexvy.tech` (CRM multiproduto)  
**Objetivo:** Substituir afirmações desatualizadas (jul/2026, P1C) pela verdade operacional verificada em 23/08/2026.

---

## 1. Resumo executivo

O CRM em **gestao.nexvy.tech** é o **CRM de grupo multiproduto** da Nexvy (não um “superadmin só NexvyBeauty”). O núcleo **F2 (PlatformProductContext)** está **mergeado em `main`** via PR #9 (`d00ca3c`). O switcher de produto filtra Kanban, Leads e Inbox por `product_id`; a área **Negócios** lista todos os registros de `platform_crm_products`. A produção já contém **8+ produtos** no banco (evidência visual Marcelo). **F5 (default de módulo por host) foi rejeitado pelo PM (23/08):** tudo fica em `gestao.nexvy.tech`, separado por **módulos** (ERP / Vendas), sem abrir Vendas automaticamente conforme o TLD.

---

## 2. O que foi provado hoje (gestao.*)

| Evidência | Conclusão |
|-----------|-----------|
| Navegação em gestao.nexvy.tech | Shell de plataforma com módulos **ERP** e **Vendas** (`PlatformShell`) |
| Código em `main` | `PlatformProductContext` + `PlatformProductSwitcher` integrados (merge F2 / PR #9) |
| Troca de produto no switcher | Re-filtro de **Kanban**, **Leads** e **Inbox** por `product_id` |
| Negócios | Lista o catálogo `platform_crm_products` (todos os produtos da plataforma) |
| Banco de produção | ≥8 produtos ativos (screenshots Marcelo) — **não** depende de seed local F3 para provar multiproduto em prod |
| UI “Acessando: Studio Flor” | **Impersonação de tenant** (salão), **não** seleção de produto SaaS |
| F5 rejeitado (PM) | Um host (`gestao.nexvy.tech`); ERP e Vendas são módulos da mesma shell. Sem default por TLD. |

**Referência de merge F2:** commit `d00ca3c`, merge `93e7754` (PR #9 `feat/e1-f2-regraft`).

---

## 3. Narrativas incorretas corrigidas

| Afirmação antiga | Verdade (23/08/2026) |
|------------------|----------------------|
| “CRM do grupo não funciona” | **Errado.** Multiproduto operacional em prod; switcher e filtros coerentes. |
| “F2 não mergeado” | **Errado.** F2 mergeado (`d00ca3c` / PR #9). Branches `feat/e1-f2-*` eram histórico/obsoletas. |
| “F5 não mergeado = quebrado” | **Errado.** F5 foi **rejeitado**: não é requisito. Módulos na mesma URL. |
| “F3 seed bloqueia runtime F2” | **Exagerado.** P1C (jul) assumia 1 produto; **prod já tem 8+**. Seed F3 ainda relevante para ambientes vazios / catálogo canônico, não para “provar” prod. |
| Docs P1C (jul) “produto único” | **Desatualizados** quanto ao estado de produção e ao merge F2. |

Documento legado a tratar como contexto histórico, não status: `tasks/P1C-E1D3-MAPA-EXECUCAO-2026-07-11.md`.

---

## 4. Status das fases E1-D3 (F0–F6)

| Fase | Nome (épico) | Status | Evidência |
|------|----------------|--------|-----------|
| **F0** | Planejamento / mapa D3 | **Concluído (doc)** | Planos P1C, d3-multiproduto; escopo E1 definido |
| **F1** | Baseline DB (`platform_crm_*`, `product_id`) | **Concluído em prod** | `feat/e1-db-spine`; SQL aplicado via MCP (jul); branch versionada |
| **F2** | `PlatformProductContext` global | **Mergeado** | PR #9, `d00ca3c`; switcher + religação Kanban/Leads/Inbox |
| **F3** | Seed / catálogo canônico de produtos | **Parcial** | Prod: 8+ produtos (screenshots); seed/scripts ainda úteis para staging e lista oficial ~9–10 SaaS |
| **F4** | Tabelas CRM plataforma (9 tabelas) | **Concluído em prod** | Aplicado com F1 spine; stubs UI com religação pendente em alguns hooks |
| **F5** | Módulo padrão por host (`gestao` → vendas) | **Rejeitado (PM 23/08)** | Não implementar. Um host, dois módulos. |
| **F6** | RLS super_admin / isolamento | **Concluído em prod** | Aplicado com spine; políticas no banco (jul) |

---

## 5. Limpeza Git (23/08/2026)

Branches e worktrees removidos (local + `origin`):

| Branch | Nota |
|--------|------|
| `feat/e1-f2-productcontext` | Obsoleta (worktree `SaasPlugin_vite-e1f2`) |
| `feat/e1-f2-regraft` | Mergeada via PR #9; branch histórica |
| `feat/e1-f5-host-module` | Não mergeada. **Não retomar** — F5 rejeitado pelo PM (23/08). |

**Verificação:** `git worktree list` sem e1f2/e1f5; `git branch -a` sem `feat/e1-f2-*` / `feat/e1-f5-*`.

---

## 6. Gaps ainda reais (não confundir com “CRM quebrado”)

1. **F5 — fora de escopo:** rejeitado. Tudo em `gestao.nexvy.tech`, separado por módulos.
2. **Create sem produto (regra B):** lead manual **e** Import / Agenda (lead inline) / Tarefas — implementados em `feat/gestao-crm-v2`. Switcher em “Todos” exige Select; locked carimba `activeProductId`. Catálogo vazio → `product_id` null (degenerado). **Ainda não em prod.** Atalhos Inbox Radar (`CreateRadarTaskDialog`) e detalhe do lead (`handleCreateTask`) agora também usam o mesmo refine nesta branch. **Browser/prod: não verificado.**
3. **Prospecção / Captação:** fluxos que ainda assumem ou exigem **produto único** em partes da UI (revisão por módulo).
4. **Confinamento por host:** lógica de fronteira `nexvy.tech` vs salão **não** plenamente ativa no bundle monólito atual.
5. **Monólito de bundle:** mesmo deploy serve **grupo (gestao)** + **salão** — desacoplamento físico (repos/host) permanece backlog de arquitetura.

---

## 7. Checks binários atualizados

| Check | Critério de sucesso | Estado (23/08/2026) |
|-------|---------------------|----------------------|
| **CB-F2** | Em gestao, trocar produto no switcher → Kanban, Leads e Inbox mostram conjuntos distintos por `product_id` | **Passa em prod** (observação manual gestao.*) |
| **CB-F2-merge** | `PlatformProductContext.tsx` presente em `main`; PR #9 mergeado | **Passa** (`git log main`) |
| **CB-multiproduto-db** | `platform_crm_products` ≥ 2 em produção | **Passa** (8+ produtos, evidência Marcelo) |
| **CB-F5** | (antigo) Abrir gestao sem localStorage → Vendas | **Cancelado** — requisito rejeitado pelo PM |
| **CB-lead-todos** | Lead criado com switcher “todos” visível na lista ao selecionar o produto escolhido (e não visível em outro) | **Regra B nesta branch** — refine 5/5. **Browser/prod: não verificado** |
| **CB-import-todos** | Import em “Todos” sem produto → bloqueado; com P (≠1º) lote nasce com `product_id=P` e some em Q | **Regra B nesta branch**. **Browser/prod: não verificado** |
| **CB-agenda-todos** | Lead inline da Agenda em “Todos” sem produto → bloqueado; com P nasce com `product_id=P` | **Regra B nesta branch**. **Browser/prod: não verificado** |
| **CB-task-todos** | Tarefa em “Todos” sem produto → bloqueada; com P nasce com `product_id=P` e some em Q | **Regra B nesta branch**. **Browser/prod: não verificado** |
| **CB-host-confinement** | Rotas/API salão não expostas em host grupo sem guard | **Não verificado completo** — gap arquitetural conhecido |

---

## 8. Referências de código (paths)

| Área | Path |
|------|------|
| Contexto produto global | `apps/NexvyBeauty/src/contexts/PlatformProductContext.tsx` |
| Shell ERP / Vendas | `apps/NexvyBeauty/src/components/superadmin/platform-shell/PlatformShell.tsx` |
| Switcher de produto | `apps/NexvyBeauty/src/components/superadmin/platform-shell/PlatformProductSwitcher.tsx` |
| Registry módulos | `apps/NexvyBeauty/src/components/superadmin/platform-shell/registry.tsx` |
| Módulos ERP / Vendas (mesmo host) | `apps/NexvyBeauty/src/components/superadmin/platform-shell/usePlatformModule.tsx` |
| Leads + product_id | `apps/NexvyBeauty/src/components/superadmin/crm/leads/PlatformCrmLeadsManager.tsx` |
| Create lead + regra B | `apps/NexvyBeauty/src/components/superadmin/crm/leads/CreatePlatformCrmLeadDialog.tsx` |
| Refine produto (regra B) | `apps/NexvyBeauty/src/components/superadmin/crm/leads/createPlatformCrmLeadProduct.ts` |
| Import CSV | `apps/NexvyBeauty/src/components/superadmin/crm/leads/PlatformCrmImportLeadsDialog.tsx` |
| Agenda lead inline | `apps/NexvyBeauty/src/components/superadmin/crm/agenda/PlatformCrmEventModal.tsx` |
| Tarefas | `apps/NexvyBeauty/src/components/superadmin/crm/tasks/PlatformCrmTasksManager.tsx` |
| Inbox CRM plataforma | `apps/NexvyBeauty/src/components/superadmin/crm/inbox/PlatformCrmInbox.tsx` |
| App / rotas gestão | `apps/NexvyBeauty/src/App.tsx` |
| Brand / módulos default | `apps/NexvyBeauty/src/config/brand.ts` |
| Doc legado (desatualizado) | `apps/NexvyBeauty/tasks/P1C-E1D3-MAPA-EXECUCAO-2026-07-11.md` |

---

## 9. Próximos atos recomendados (PM)

1. Marcar P1C como **histórico**; usar este doc como status E1-D3.
2. F5 rejeitado — não retomar default por host.
3. Regra B em lead manual + Import + Agenda + Tarefas **nesta branch**. Atalhos Inbox Radar (`CreateRadarTaskDialog`) e detalhe do lead (`handleCreateTask`) passam pelo mesmo refine. Falta prova browser/prod após deploy.
4. Priorizar gaps de Captação/Prospecção multiproduto e confinamento de host conforme roadmap de desacoplamento (A/B/C do P1C).

---

*Documento de correção formal — não substitui evidência de runtime; checks CB-* devem ser reexecutados após cada deploy relevante.*
