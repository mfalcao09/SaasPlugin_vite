# Auditoria de Fidelidade 1:1 — PIPELINE / KANBAN / LEADS (F)

> **Modo:** READ-ONLY. Nenhuma fonte/Supabase/deploy tocado.
> **Data:** 2026-07-02
> **PORTADO:** `src/components/superadmin/crm/{kanban,leads}/` + `data/usePlatformCrm*`
> **ORIGINAL:** `.vendus-src-reference/src/components/{admin/kanban,admin/leads,lead}/` + `hooks/use{Leads,KanbanData,LeadDetail,...}`

Legenda de tags: `[1:1]` port literal · `[TEMA]` só estilo · `[PLATFORM_CRM]` reescrito p/ `platform_crm_*` · `[RENOMEADO]` mesmo comportamento, nome novo · `[CONSOLIDADO]` N arquivos → 1 · `[MAPEADO-ERP]` tabela ERP↔plataforma equivalente · `[DROP-OK]` removido com justificativa · `[FALTA]` gap real · `[ADICIONADO]` novo no portado.

---

## 1. Arquitetura macro (2 diffs estruturais)

### 1.1 `[CONSOLIDADO]` LeadDetail: 14 arquivos → 1 monolito de 2.252 linhas
- **PORTADO:** `leads/PlatformCrmLeadDetail.tsx:1-2252` — TODAS as 8 abas + header + summary inlinados como funções internas (`LeadDetailHeader:300`, `LeadSummaryTab:465`, `LeadBANTTab:931`, `LeadTimelineTab:1094`, `LeadJourneyTab:1239`, `LeadOriginTab:1450`, `LeadWalletTab:1616`, `RoleAssignmentCard:1724`, `LeadNotesTab:1782`, `LeadCadencesTab:2146`).
- **ORIGINAL:** `lead/LeadDetailPage.tsx:1-233` orquestra 8 arquivos-irmãos (`LeadSummaryTab.tsx`, `LeadBANTTab.tsx`, `LeadTimeline.tsx`, `LeadJourneyTab.tsx`, `LeadOriginTab.tsx`, `LeadWalletTab.tsx`, `LeadNotesTab.tsx`, `LeadCadencesTab.tsx`) + `LeadHeader.tsx` + `RoleAssignmentCard.tsx` + `summary/` (5 blocos).
- **Razão:** decisão de porting — 1 arquivo por vertical p/ isolar `platform_crm_*`. Comportamento preservado; só a topologia de arquivos muda.

### 1.2 `[PLATFORM_CRM]` Pipeline perde a dimensão `product_id` (multi-pipeline → pipeline único)
- **ORIGINAL:** `admin/kanban/KanbanBoard.tsx:6,18-19,25,42-44` — `useProducts()`, `selectedProductId`, seletor de produto no header, pipeline POR produto, empty-state "Nenhum produto encontrado". `LeadDetailPage.tsx:45` puxa `usePipelineStages(lead.product_id)`.
- **PORTADO:** `kanban/PlatformCrmKanban.tsx:39-60` — SEM produto: `usePlatformCrmStages()` global, coluna sintética "Sem etapa" (`UNASSIGNED_ID:23,94-100`) para leads sem `current_stage_id`.
- **Razão:** plataforma não tem catálogo de produtos. Pipeline único global isolado por RLS `super_admin`. **Legítimo**, mas é a maior mudança semântica da portagem.

---

## 2. As 8 abas do LeadDetail

| Aba | Tag | PORTADO | ORIGINAL | Fidelidade |
|---|---|---|---|---|
| **Resumo** | `[PLATFORM_CRM]` | `LeadSummaryTab:465-806` | `LeadSummaryTab.tsx` | Edição inline de valor (`isEditingValue:476`), stats, blocos `detail/*`. Fiel. |
| **BANT** | `[MAPEADO-ERP]` | `LeadBANTTab:931-1092` | `LeadBANTTab.tsx` | Grava em `platform_crm_leads.bant_{budget,authority,need,timing}` (`:1015,1033-1038` via `onUpdateLead`). Score/categorias idênticos. **Funcional.** |
| **Timeline** | `[MAPEADO-ERP]` | `LeadTimelineTab:1094-1238` | `LeadTimeline.tsx` | Wired a `usePlatformCrmLeadStageHistory` + `usePlatformCrmLeadNotes` (`:1101-1102`). **Funcional.** |
| **Jornada** | `[MAPEADO-ERP]` | `LeadJourneyTab:1239-1449` | `LeadJourneyTab.tsx` | `platform_crm_lead_stage_history` (`:1255`). **Funcional.** |
| **Origem** | `[MAPEADO-ERP]` | `LeadOriginTab:1450-1615` | `LeadOriginTab.tsx` | Lê `lead.utm_*` + `lead_origin`/`lead_channel` reais (`:1461-1465,1587 UtmRow`). **Funcional.** |
| **Carteira** | `[PLATFORM_CRM]` + gaps | `LeadWalletTab:1616-1722` | `LeadWalletTab.tsx` | Responsável/Squad/SDR/Closer funcionais; **transfer + histórico stubados** (ver §4). |
| **Notas** | `[MAPEADO-ERP]` | `LeadNotesTab:1782-2145` | `LeadNotesTab.tsx` (16KB) | Notas + tarefas via `usePlatformCrmLeadNotes`/`Tasks` (`:1797-1801`). Criar/toggle task reais. **Funcional.** |
| **Cadências** | `[PLATFORM_CRM]` + gaps | `LeadCadencesTab:2146-2252` | `LeadCadencesTab.tsx` | LÊ `platform_crm_cadence_enrollments` (`:2153`); **enroll/stop stubados** (ver §4). |

**Cobertura de abas: 8/8 presentes.** Set de labels/ícones idêntico (`Resumo·BANT·Timeline·Jornada·Origem·Carteira·Notas·Cadências`, `PlatformCrmLeadDetail.tsx:210-241` vs `LeadDetailPage.tsx:131-162`).

### 2.1 Blocos do Resumo/Squad (`detail/` ↔ `summary/`)
`[RENOMEADO]` 4:5 — mapeamento direto: `PlatformCrmLeadConversationPreview` ↔ `LeadConversationPreview`, `...CustomFields` ↔ `LeadCustomFields`, `...KeyResponses` ↔ `LeadKeyResponses`, `...TagsBlock` ↔ `LeadTagsBlock`. **`[ADICIONADO]`**: `PlatformCrmLeadSquadCard.tsx` (novo, wired a `platform_crm_sales_squads`). O 5º original `summary/LeadRecentNotes.tsx` foi **inlinado** no monolito ("Notas recentes", `PlatformCrmLeadDetail.tsx:699-704`) — não é gap.

---

## 3. Leads: filtros / bulk / import / paginação / tabela

- `[1:1]` **Filtros** — `PlatformCrmLeadsFilters.tsx` (37KB) vs `LeadsFilters.tsx` (36KB): set de labels **idêntico** (Origem·Canal·Temperatura·Squad·Estágio·Tags·Etiquetas·Data·Período·Valor). Custom fields via `field_key` preservados. ("Produto" já dropado no filtro, `:34-35`, coerente com §1.2.)
- `[1:1]` **Paginação** — `PlatformCrmLeadsManager.tsx:217-359` espelha `LeadsManager.tsx:226-355` (setPage, PaginationLink, prev/next, ellipsis).
- `[CONSOLIDADO]` **Bulk actions** — `PlatformCrmBulkActionsBar.tsx`: Transferir·Exportar·Excluir + **Etiquetar** virou componente `PlatformCrmBulkTagPopover` (`:4,69`) em vez do `onTag` handler separado do original (`BulkActionsBar.tsx:17,72-76`). Mesma capacidade.
- `[MAPEADO-ERP]` **Bulk transfer REAL** — `usePlatformCrmLeadsManager.ts` grava `assigned_to`/`squad_id` em `platform_crm_leads` (`handleBulkTransfer:125-137`). ⚠️ Contraste com o transfer stubado da aba Carteira (§6).
- `[1:1]` **Import CSV** — `PlatformCrmImportLeadsDialog.tsx` (18 feat-lines) ≈ `ImportLeadsDialog.tsx` (17). Mapping/preview/parse presentes.
- `[1:1]` **Tabela** — `PlatformCrmLeadsTable.tsx` (13KB) ≈ `LeadsTable.tsx` (12.6KB); colunas equivalentes.

### 3.1 `[FALTA]` parcial: LeadsTabs perde 2 de 6 abas de carteira
- **ORIGINAL** `LeadsTabs.tsx:5` → 6 ids: `all | my-leads | my-squad | unassigned | by-squad | by-product`.
- **PORTADO** `PlatformCrmLeadsTabs.tsx:20-24` → 4 ids: `all | my-leads | my-squad | unassigned`. Faltam **`by-squad`** e **`by-product`** (agrupamento). `by-product` é `[DROP-OK]` (§1.2, sem produto); **`by-squad` é gap real** de agrupamento. Também some o gating por permissão (`availableTabs`/`myPerms.view_*_portfolio`, `LeadsManager.tsx:71-77`), já que na plataforma o super_admin vê tudo.

---

## 4. Kanban / drag-drop / etapas

- `[1:1]` **Drag-drop** — AMBOS usam HTML5 DnD nativo (NÃO dnd-kit): `onDragStartLead`/`onDropLead` + estado `draggedLeadId` + `handleDropOnStage` (`PlatformCrmKanban.tsx:226-227` vs `KanbanBoard.tsx:28-39,177-178`). Idêntico.
- `[MAPEADO-ERP]` **Mover lead** — `useMovePlatformCrmLeadToStage` (`platform_crm_leads.current_stage_id`) ↔ `useMoveLead`.
- `[MAPEADO-ERP]` **CRUD de etapas** — `usePlatformCrmStages.ts`: create/update/**reorder**/delete completos em `platform_crm_pipeline_stages` (`:33,58,88,117`) ↔ `usePipelineMutations.ts` em `pipeline_stages`. `is_won`/`is_lost`/`order_index`/`color` preservados.
- `[ADICIONADO]` `KanbanLeadCard` mostra campo `assigned` (avatar do responsável) a mais que o original.
- `[1:1]` `StageManagerDialog`/`StageCard`/`StageEditForm` → `PlatformCrmStage*` (mesma UI).

---

## 5. Contagem por tag

| Tag | Qtd | Onde |
|---|---:|---|
| `[1:1]` | 8 | drag-drop, paginação, filtros, import, tabela, StageManager/Card/EditForm |
| `[MAPEADO-ERP]` | 9 | BANT, Timeline, Jornada, Origem, Notas, move-lead, stages CRUD, bulk-transfer, cadence-read |
| `[PLATFORM_CRM]` | 3 | pipeline sem produto, Resumo, Carteira/Cadências (parciais) |
| `[CONSOLIDADO]` | 2 | LeadDetail 14→1, bulk-tag popover |
| `[RENOMEADO]` | ~30 | todo o namespace `PlatformCrm*` + blocos `detail/` |
| `[DROP-OK]` | 3 | CallWithAIDialog, aba `by-product`, LeadEditModal/LeadTransferModal (edição inline) |
| `[FALTA]` | 5 | ver §6 |
| `[ADICIONADO]` | 2 | `assigned` no card, `PlatformCrmLeadSquadCard` |

---

## 6. LISTA `[FALTA]` (gaps funcionais reais)

1. **Transfer de carteira na aba Carteira = STUB.** `PlatformCrmLeadDetail.tsx:1667-1676` → botão "Transferir" chama `toast.info('Transferência de carteira em breve')`. Original abre `LeadTransferModal` real (`LeadWalletTab.tsx:97-107,257-267`). **Assimetria:** o bulk-transfer da LISTA funciona (§3), mas o individual no detalhe não. TODO explícito no código.
2. **Histórico de Transferências = STUB.** `:1708-1719` → "Histórico de transferências em breve". Falta tabela `platform_crm_lead_transfers` + hook. Original usa `useLeadTransferHistory` com timeline completa (`LeadWalletTab.tsx:56,205-247`).
3. **Cadência: inscrever = STUB.** `LeadCadencesTab:~2188` → `toast.info('Inscrição em cadência em breve')`. Original invoca edge `cadence-enroll` (`LeadCadencesTab.tsx:89`). Falta a edge versão-plataforma. (Leitura de enrollments funciona.)
4. **Cadência: remover = STUB.** `toast.info('Remoção de cadência em breve')`. Original invoca `cadence-stop`.
5. **LeadsTabs `by-squad`.** Aba de agrupamento por squad ausente no portado (`PlatformCrmLeadsTabs.tsx:20-24` só 4 abas vs 6 do original). `by-product` é DROP-OK; `by-squad` é gap real.

> Nota: (1)-(2) = mesmo domínio (transferência/histórico) e (3)-(4) = mesmo (cadence write). 2 clusters de trabalho + o gap isolado (5), não 5 frentes independentes.

## 7. LISTA `[ADICIONADO]` (novo no portado)

1. `PlatformCrmLeadSquadCard` (`detail/`) — card de squad dedicado wired a `platform_crm_sales_squads`, substitui o bloco inline do `LeadWalletTab` original.
2. Campo `assigned` (avatar do responsável) no `PlatformCrmKanbanLeadCard` — o card original não exibia.

## 8. `[DROP-OK]` justificados

- **CallWithAIDialog** (`lead/CallWithAIDialog.tsx`, 20KB, usado em `LeadHeader.tsx`) — DROPADO. Comentário `PlatformCrmLeadDetail.tsx:287` "drop: CallWithAIDialog do original; sem edge de IA". Feature de ligação-com-IA fora do escopo. **OK** (maior feature dropada em volume).
- **`by-product` tab** — sem catálogo de produto na plataforma (§1.2). OK.
- **LeadEditModal / LeadTransferModal** (no LeadDetailPage) — substituídos por edição inline (`isEditingValue`) + stubs de transfer. OK como escolha de UX.

---

## Veredito

**Cobertura funcional estimada: ~90%.**
Kanban, etapas (CRUD+reorder+drag-drop), filtros, paginação, bulk (incl. transfer real), import, tabela, e 6 das 8 abas (Resumo, BANT, Timeline, Jornada, Origem, Notas) são **fiéis e funcionais** sobre `platform_crm_*`. Os ~10% faltantes concentram-se em 2 clusters (transferência-no-detalhe/histórico; escrita de cadência) + a aba `by-squad`, todos com TODO explícito e leitura já funcionando. As duas mudanças estruturais (pipeline sem produto; LeadDetail monolítico) são deliberadas e coerentes.

### Top-3 para o Marcelo
1. **Transferência é meio-funcional e isso confunde.** O usuário transfere em massa na lista, mas o botão "Transferir" DENTRO do lead só dá toast "em breve". Decidir: implementar `platform_crm_lead_transfers` + modal (fecha gaps 1 e 2 de uma vez) OU esconder o botão até lá, pra não parecer bug.
2. **Cadência é read-only.** Vê inscrições mas não inscreve/remove (faltam edges `cadence-enroll`/`cadence-stop` versão plataforma). Se cadência entra no go-live do Módulo Vendas, é o próximo item; senão, esconder os botões.
3. **Pipeline global (sem produto) é a decisão irreversível a validar AGORA.** Toda a portagem assume 1 pipeline único. Se um dia precisar de pipelines por segmento, é reescrita — confirmar que "pipeline único" é definitivo antes de acumular mais código em cima.
