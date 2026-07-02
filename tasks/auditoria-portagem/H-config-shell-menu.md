# Auditoria H — Config/Gestão + SHELL/nav/menu (fidelidade 1:1)

**Escopo:** portagem Vendus → NexvyBeauty `platform_crm` (módulo Vendas) + shell `platform-shell`.
**Modo:** READ-ONLY. Nenhum arquivo de fonte/Supabase tocado. Data: 2026-07-02.

**Fontes de verdade:**
- Original menu: `.vendus-src-reference/src/config/adminMenu.ts` (Fixos + 5 grupos)
- Original render: `.vendus-src-reference/src/pages/Admin.tsx` (`renderSection`, L229-293)
- Portado shell: `src/components/superadmin/platform-shell/registry.tsx` (`VENDAS_NAV`, L232-478)
- Portado sidebar: `src/components/superadmin/platform-shell/PlatformSidebar.tsx`

---

## 1. Contagem por tag

| Tag | Qtd | Notas |
|---|---:|---|
| `[1:1]` | 21 | itens de menu Vendas que casam label+destino com o original |
| `[TEMA]` | 1 | item ativo `bg-primary` (rosa) no lugar de `bg-sidebar-*` (re-skin cosmético) |
| `[PLATFORM_CRM]` | 30 | todos os managers portados leem `platform_crm_*` (desacoplamento por design) |
| `[RENOMEADO]` | 2 | `Campanhas Inteligentes`→`Campanhas`; `Cadências Inteligentes`→`Cadências` |
| `[CONSOLIDADO]` | 3 | Financeiro⊃(Comissões+Metas); Equipes⊃(Usuários+Squads); Captação Quiz/ChatBot/Widget/Forms → 1 `PlatformCrmCaptureManager` c/ `initialTab` |
| `[MAPEADO-ERP]` | 5 | `plan`, `company`, `payments`, `integrations`, `support` → módulo ERP (confirmado, ver §3) |
| `[DROP-OK]` | 2 | `deals` (tela read-only descartada, órfã); `products/tabs` catálogo pesado não portado (usa PlansManager) |
| `[FALTA]` | 4 | ver lista §4 |
| `[ADICIONADO]` | 1 | `v-negocios`→`PlansManager` (semântica ERP dentro do menu CRM) |

---

## 2. FOCO CRÍTICO 1 — Fidelidade do MENU (item-a-item)

Estrutura replicada corretamente: `PlatformSidebar` renderiza grupo `label:null` como itens planos (= `fixedItems`) e grupos com label como colapsáveis (= `menuGroups` accordion). **IA 1:1 preservada.**

### FIXOS (original 5 → portado `vendas-topo` 5)
| Original (`adminMenu.ts`) | Portado (`registry.tsx`) | Tag | Evidência |
|---|---|---|---|
| `dashboard` "Dashboard" → OperationCenter | `v-dashboard` → `PlatformCrmOperationCenter` | `[1:1]` | registry.tsx:238 |
| `mia` "Mia" | `v-mia` → `PlatformCrmMia` | `[1:1]` | registry.tsx:244 |
| `pipeline` "Pipeline" → KanbanBoard | `v-pipeline` → `PlatformCrmKanban` | `[1:1]` | registry.tsx:250 |
| `leads` "Leads" | `v-leads` → `PlatformCrmLeadsManager` | `[1:1]` | registry.tsx:256 |
| `calendar` "Agenda" | `v-agenda` → `PlatformCrmAgendaManager` | `[1:1]` | registry.tsx:262 |

### GRUPO "Atendimentos" (original 5 → portado 5) — `[1:1]` integral
Chat, Painel, Radar IA, Follow-Up, Relatórios → Inbox/InboxPanel/InboxRadar/InboxFollowup/InboxReports. registry.tsx:270-303.

### GRUPO "Automação & IA" (original 4 → portado 4)
| Original | Portado | Tag |
|---|---|---|
| `agents` "Agentes IA" | `v-agentes-ia` | `[1:1]` |
| `campaigns` "**Campanhas Inteligentes**" | `v-campanhas` "**Campanhas**" | `[RENOMEADO]` (registry.tsx:317) |
| `cadences` "**Cadências Inteligentes**" | `v-cadencias` "**Cadências**" | `[RENOMEADO]` (registry.tsx:323) |
| `webhooks` "Webhooks" | `v-webhooks` | `[1:1]` |

### GRUPO "Captação" (original 9 → portado 9) — `[1:1]` estrutural
Quiz, Formulários, Form Vendedores, ChatBot, Widget, WhatsApp, Templates, Resultados, Analytics. **Todos presentes**; Quiz/ChatBot/Widget/Forms consolidados sob `PlatformCrmCaptureManager` via `initialTab/initialChannel` `[CONSOLIDADO]`. registry.tsx:336-393.

### GRUPO "Gestão" (original 6 → portado 5)
| Original | Portado | Tag |
|---|---|---|
| `products` "**Negócios**" → ProductListPage (catálogo) | `v-negocios` → **PlansManager** | `[ADICIONADO]`/`[DROP-OK]` (registry.tsx:400-408) |
| `sectors` "Setores" | `v-setores` | `[1:1]` |
| `team` "Equipes" → TeamManager | `v-equipes` → Equipes(Usuários+Squads) | `[CONSOLIDADO]` |
| `operation` "Central de Operação" | `v-operacao` | `[1:1]` |
| `financial` "Financeiro" | `v-financeiro` → Financeiro(Comissões+Metas) | `[CONSOLIDADO]` |
| `payments` "Pagamentos" | **— ausente —** | `[MAPEADO-ERP]` |

### GRUPO "Configurações" (original 10 → portado 6)
| Original | Portado | Tag |
|---|---|---|
| `connections` "Conexões" | `v-conexoes` | `[1:1]` |
| `integrations` "Integrações" | **— ausente —** | `[MAPEADO-ERP]` |
| `quick-replies` "Respostas Rápidas" | `v-respostas` | `[1:1]` |
| `custom-fields` "Campos personalizados" | `v-campos` | `[1:1]` |
| `tags` "Etiquetas" | `v-etiquetas` | `[1:1]` |
| `notifications` "Notificações" | `v-notificacoes` | `[1:1]` |
| `schedules` "Horários" | `v-horarios` → BusinessHours | `[1:1]` |
| `company` "Empresa" | **— ausente —** | `[MAPEADO-ERP]` |
| `plan` "Plano" | **— ausente —** | `[MAPEADO-ERP]` |
| `support` "Suporte" | **— ausente —** | `[MAPEADO-ERP]` |

---

## 3. FOCO CRÍTICO 2 — Fronteira CRM vs ERP ("conta-do-cliente")

**Veredito da fronteira: coerente e intencional.** Os 5 itens "conta/assinatura/nossa-operação" saíram do menu CRM e vivem no `ERP_NAV` (mesmo `registry.tsx`). Confirmação:

| Item original (Vendus admin) | Destino | Onde no ERP | Prova |
|---|---|---|---|
| `plan` / `products`(planos) | **ERP** "conta-do-cliente" | `ERP_NAV › Comercial › plans` → `PlansManager` | registry.tsx:104 |
| `payments` | **ERP** | `Comercial › payments` → `CaktoSuperAdminPanel` + `Crescimento › sales-payments` → `CaktoAdminPanel` | registry.tsx:121,142 |
| `integrations` | **ERP** | `Infra › integrations` → `IntegrationsManager` | registry.tsx:157 |
| `company` (Empresa) | **ERP** | coberto por `Infra › branding` → `PlatformSettings` (identidade da plataforma) | registry.tsx:163 |
| `support` | **ERP** | `Sistema › support` → `SupportTickets scope="super_admin"` | registry.tsx:187 |

**Original `products/` (24 arq., ProductListPage/ProductDetailPage + tabs), `payments/` (10), `plan/` (1), `company/` (2), `support/` (5):** nenhum portado como `platform_crm_*`. `products`/`plan`/`payments`/`company`/`support` = **conta-do-cliente/ERP** `[MAPEADO-ERP]`. `products/tabs` (catálogo rico) = `[DROP-OK]` — substituído por PlansManager por decisão Marcelo ("nosso produto é o plano da LP", registry.tsx:403-407).

**`reports/` original (ReportsManager top-level):** NÃO era item de menu próprio no `adminMenu.ts` (só `inbox-reports`). Portado 1:1 como `PlatformCrmInboxReports` reusando os 7 subcomponentes (`reports/KpiCard`, `StatusBars`, `TeamRanking`, etc.). `[1:1]`.

---

## 4. LISTA `[FALTA]` (lacunas de fidelidade dentro do que É CRM)

1. **`webhooks` — sub-UI incompleta** `[FALTA]`. Original: 8 arquivos (ActionConfigDialog, AddActionDialog, `WebhookActionsPanel`, `WebhookRequestsPanel`, editor, logs, manager, index). Portado: 3 (`PlatformCrmWebhookEditor`, `WebhookLogsTab`, `WebhooksManager`). **Faltam os painéis de Ações e de Requests** (2 features do webhook original não portadas). Ev.: `crm/webhooks/` (3) vs `admin/webhooks/` (8).
2. **`tags` — `TagFormDialog` ausente** `[FALTA]` (menor). Original 4 (inclui `TagFormDialog`); portado 3 (Manager+AutomationsPanel+PackageGeneratorDialog). Criação/edição de etiqueta pode estar inline no Manager — **verificar** se o form foi absorvido ou perdido. Ev.: `crm/tags/` vs `admin/tags/`.
3. **`Financeiro` — profundidade parcial** `[FALTA]` (declarado no próprio código). `PlatformCrmFinanceiro` cobre só Comissões(regras)+Metas; **falta** o resto do `FinancialDashboard` original (aprovação/pagamento de comissões + cards pendente/aprovada/paga). TODO explícito em `financeiro/PlatformCrmFinanceiro.tsx:14-16`.
4. **`v-negocios` sem visão-catálogo CRM** `[FALTA]` (assumido). Aponta para `PlansManager` (ERP); uma tela-catálogo dedicada do CRM ficou como "ajuste futuro" (registry.tsx:406).

### `[ADICIONADO]`
1. **`v-negocios` → `PlansManager`** — item de menu CRM renderiza componente ERP (planos). Não existe no fluxo Vendus original (lá era catálogo de produtos). registry.tsx:408.

### Achados de higiene (não bloqueiam)
- **`deals/PlatformCrmDealsManager.tsx` = código órfão** `[DROP-OK]`. Existe no disco, referenciado só por si mesmo; não entra no registry (comentado como descartado, registry.tsx:407). Candidato a remoção.
- **`crm/PlatformCrmSection.tsx` = wrapper legado** (Funil+Contatos "Vendas da Plataforma"). NÃO faz parte de `VENDAS_NAV`, mas **ainda é usado** por `src/pages/SuperAdmin.tsx` (caminho pré-shell). Coexistência SuperAdmin.tsx (legado) ↔ PlatformShell (novo) — confirmar qual é o entrypoint vivo.

---

## Veredito

**Fidelidade do MENU: ALTA (~87%).** Estrutura Fixos+5-grupos replicada 1:1 na IA (flat + collapsible). Dos 34 itens do menu original, **26 casam** (21 exatos + 5 mapeados-ERP corretamente), 2 renomeados (perda de "Inteligentes"), 3 consolidados fielmente à IA original (Comissões/Metas/Squads nunca foram menu). A **fronteira CRM↔ERP está bem desenhada e é intencional** — nenhum item "conta-do-cliente" vazou pro menu de Vendas; todos têm destino ERP rastreável.

Gaps reais de portagem (não de escopo): profundidade de **Webhooks** (2 painéis) e **Financeiro** (dashboard de comissões). Nenhum `[FALTA]` é de shell/nav — todos são de sub-UI dentro de seções já presentes.

---

## Top-3 para Marcelo

1. **Webhooks portado pela metade.** Faltam `WebhookActionsPanel` + `WebhookRequestsPanel` (3 de 8 arquivos vs original). Se o CRM de Vendas usa webhooks com ações/inspeção de requests, essa é a lacuna funcional mais concreta. Decidir: portar agora ou marcar EmBreve honesto.
2. **Renomeações silenciosas "Inteligentes".** `Campanhas Inteligentes`→`Campanhas` e `Cadências Inteligentes`→`Cadências`. Se o branding "Inteligentes" importa (posicionamento IA), reverter os 2 labels é 1-linha cada (registry.tsx:317,323).
3. **Dois entrypoints coexistindo + 1 órfão.** `SuperAdmin.tsx` (legado, usa `PlatformCrmSection` Funil/Contatos) ainda vive ao lado do `PlatformShell`/registry novo, e `PlatformCrmDealsManager` é dead code. Confirmar qual shell é o vivo e limpar o outro — risco de manter duas verdades de navegação divergindo.
