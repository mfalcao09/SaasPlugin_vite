# F2 — ProductContext GLOBAL (produto ativo) — Review

> EIXO 1 / D3 Multiproduto · Model A (decisão travada Marcelo, 2026-07-06).
> Branch: `feat/e1-f2-productcontext` (base `main`). Worktree: `SaasPlugin_vite-e1f2`.

## O que ficou FUNCIONANDO

**Novo:** `src/components/superadmin/crm/products/ProductContext.tsx`
- `ActiveProductProvider` — estado de "produto ativo GLOBAL" no escopo do Módulo Vendas.
- `useActiveProduct()` — expõe `products`, `activeProductId` (null="Todos"), `setActiveProductId`, `effectiveProductId` (=`activeProductId ?? products[0].id`, para telas que exigem produto concreto), `activeProduct`, `isSingleProduct`. Lança se usado fora do provider (falha explícita > silêncio).
- `ActiveProductSwitcher` — reusa `PlatformCrmProductSelector` (0→oculto, 1→label travada, 2+→dropdown "Todos"). Comportamento "1 produto → label travada" PRESERVADO.
- Default = 1º produto quando a lista carrega (Model A: sempre há UM ativo). Escolher "Todos" (null) não é sobrescrito pelo efeito de init (flag `initialized`).

**Montagem:** `platform-shell/PlatformShell.tsx` — `ShellContent` envolve SÓ o Módulo Vendas (`id === 'vendas'`) com o provider + switcher no topo. ERP intocado.

**Superfícies religadas (useState local de produto → contexto):**
| Superfície | Antes | Depois |
|---|---|---|
| Kanban (`kanban/PlatformCrmKanban`) | `useState selectedProductId` + selector local | `effectiveProductId` do contexto, selector removido |
| Leads (`leads/PlatformCrmLeadsManager` + `PlatformCrmLeadsFilters`) | `filters.productId` + Select no painel | sync-effect `activeProductId`→`filters.productId`; Select removido; produto tirado das contagens de "filtros ativos" |
| Inbox (`inbox/PlatformCrmInbox` + `data/usePlatformCrmConversations`) | lista NÃO filtrava por produto | hook ganhou `productId?` opcional; lista filtra por `activeProductId` (inclui `product_id null` p/ nunca sumir conversa). Seletor POR-CONVERSA preservado (concern distinto) |
| Agenda (`agenda/PlatformCrmAgendaManager`) | `useState selectedProductId` + selector | `activeProductId` (tolera "Todos"), selector removido |
| Agentes (`agents/PlatformCrmProductAgentsManager`) | `useState` + selector | `effectiveProductId`+`products` do contexto, selector removido |
| Captação — Funis/Forms/Widgets (`capture/*Tab`) | `singleProductId` local | novo ativo nasce em `effectiveProductId`; lista filtra por `activeProductId` |
| `crm/PlatformCrmSection` (montagem 2ª, hoje não-roteada) | — | envolvido em `ActiveProductProvider` próprio (defesa: Kanban/Leads não quebram fora do PlatformShell) |

## Provas (o que está verde)
- **tsc `-b --force`**: 24 erros = baseline EXATO, **zero novos**, nenhum erro nos arquivos editados. (Baseline de `main` já tinha 24 erros pré-existentes alheios à F2.)
- **`vite build`**: VERDE (`✓ built`), bundle `PlatformShell` shippable.
- `grep -rn useActiveProduct crm/` = 8 arquivos. useState locais de produto removidos das superfícies.

## PENDENTE (não marcar F2 "pronto" sem isto)
- **Prova de runtime do re-filtro sincronizado** (check binário do task): trocar o produto no switcher GLOBAL re-filtra Kanban E Leads E Inbox simultaneamente, no Chrome logado. **Bloqueado por dependência: precisa de 2+ produtos semeados (F3, sessão de banco).** Hoje só há `nexvybeauty` → switcher vira label travada, impossível trocar. Assim que a F3 semear ≥2 produtos: logar no gestao super-admin → Módulo Vendas → trocar o switcher no topo → verificar Pipeline, Leads e Chat re-filtrarem juntos.

## Follow-up conhecido (fora do escopo desta F2)
- `capture/widget/PlatformCrmWidgetManager.tsx` — builder secundário ("Abrir builder") tem filtro de produto LOCAL próprio (`productFilter`, default 'all' = inócuo). Não religado (risco desproporcional p/ view aninhada fora do check binário). Candidato a consolidação futura.
