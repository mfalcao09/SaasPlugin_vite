# Auditoria de Fidelidade 1:1 — Módulo INBOX/ATENDIMENTO (platform_crm) vs CRM Vendus original

> Auditoria **READ-ONLY** (2026-07-02). App: `apps/NexvyBeauty`. Escopo: inbox + inbox-sections + agents + operation + mia + hooks + edges.
> Original: `.vendus-src-reference/`. Nenhum arquivo de fonte/Supabase/deploy foi tocado.

---

## 0. Correção estrutural do briefing (fato que muda a contagem)

O briefing diz **"ORIGINAL: admin/webchat/(15)"**. **Isso está incompleto.** O `admin/webchat/WebChatInbox.tsx` original é um **wrapper de 16 linhas** que delega a UI de chat inteira para `@/components/seller/SellerInbox` (1455 linhas) + `seller/inbox/` (**38 arquivos**). Portanto o verdadeiro corpo do inbox original NÃO está em `admin/webchat/` — está em `seller/` + `seller/inbox/`.

Evidência: `.vendus-src-reference/src/components/admin/webchat/WebChatInbox.tsx:1` (`import { SellerInbox } from '@/components/seller/SellerInbox'`).

| Domínio | Original (verdadeiro) | Portado | Razão da diferença de contagem |
|---|---|---|---|
| Inbox UI (chat) | `seller/SellerInbox.tsx` (1) + `seller/inbox/` (38) + `admin/webchat/` (4) | `inbox/` (9) | **`[CONSOLIDADO]`**: 43 arquivos → 9. Reescrita enxuta que preserva o esqueleto de UX e **derruba todo o suporte a canal externo** (WhatsApp/Meta/Evolution/mídia/janela-24h). |
| Painel/Radar/Followup/Reports | `admin/webchat/AttendancePanel` + `admin/radar/` (10) + `admin/followup/` (7) + `admin/webchat/reports/` (8) + `panel/` (3) | `inbox-sections/` (22 + `reports/`=7) | **`[1:1]` quase perfeito** (ver §3–§6). |
| Agentes | `admin/agents/` (20) | `agents/` (2) | **`[FALTA]` massivo** — suíte de orquestração multi-agente reduzida a CRUD (ver §2). |
| Mia | `mia/` (~6 comp) + hooks (5) + edges (4) | `mia/` (1) + edge (1) | **`[CONSOLIDADO]`+`[FALTA]`** (voz/ações/memória caíram, ver §7). |

**Radar**: não existe edge/pasta "radar" no original com esse nome — o conceito é `opportunity-scan-run`/`opportunity-scan-cron` (edges) + `admin/radar/` (UI). O portado usa `usePlatformCrmRadar`. **`[RENOMEADO]`** (radar = opportunity-scan).

---

## 1. Contagem por TAG (nível de diff/decisão)

| Tag | Qtd | Onde |
|---|---:|---|
| `[1:1]` | 6 | Followup (§4), Reports (§5), ConversationList núcleo (§1.1), ChatArea header/ações (§1.1), edge auto-notifications (§8), edge sales-copilot (§8) |
| `[CONSOLIDADO]` | 4 | inbox 43→9 (§1.1), Mia 6comp→1 (§7), Mia 4edges→1 (§7), webchat-inbox edge 2323→858 linhas (§8) |
| `[RENOMEADO]` | 3 | radar→opportunity-scan (§3), `webchat-*`→`platform-webchat-*`, `assigned_user_id`→`assigned_to` (Mia/inbox) |
| `[PLATFORM_CRM]` | 5 | todos os hooks `usePlatformCrm*` (desacoplam `organization_id`/`product_id`/`sector_id`) |
| `[MAPEADO-ERP]` | 0 | (nenhum mapeamento p/ tabelas ERP neste módulo — tudo `platform_crm_*`) |
| `[DROP-OK]` | 6 | multicanal WhatsApp/Meta/IG/mídia (§1.2), janela-24h, `LineChart` morto no Radar (§3), dedup cross-canal na lista, `product_id` nos filtros, gate de permissão tenant |
| `[FALTA]` | 11 | ver §9 (lista completa) |
| `[ADICIONADO]` | 4 | ver §9 |

---

## 1.1 INBOX núcleo (`inbox/` 9 arquivos) — `[CONSOLIDADO]` + `[1:1]`

Cabeçalho verbatim em `inbox/PlatformCrmInbox.tsx:28-39` e `inbox/PlatformCrmChatArea.tsx:27-38`: **"PORTE 1:1 da UX de seller/SellerInbox.tsx"**, desacoplado (só `platform_crm_*`).

| Portado | Original correspondente | Tag | Evidência |
|---|---|---|---|
| `PlatformCrmInbox.tsx` (281) | `seller/SellerInbox.tsx` (1455) | `[CONSOLIDADO]` | 2 painéis, abas Atendendo/Agentes/Em Fila, Ctrl+K, som — `PlatformCrmInbox.tsx:42,85,191` |
| `PlatformCrmChatArea.tsx` (530) | `seller/inbox/ChatArea.tsx` (~1100, 41 KB) | `[CONSOLIDADO]` | header (avatar/status/#code/reabrir/retomar/transferir/devolver/menu) + histórico agrupado por dia + composer — `PlatformCrmChatArea.tsx:206,345,472` |
| `PlatformCrmConversationList.tsx` (473) | `seller/inbox/ConversationList.tsx` (25 KB) | `[1:1]` núcleo | busca/filtro-badge/sort-por-unread — `:163,184,322` vs original `:232,278` |
| `PlatformCrmMessageBubble.tsx` (364) | `seller/inbox/MessageBubble.tsx` (17 KB) | `[1:1]` | reply/star/edit/delete/reactions |
| `PlatformCrmTransferModal.tsx` (126) | `seller/inbox/TransferConversationModal.tsx` (26 KB) | `[CONSOLIDADO]` | 26 KB → 126 linhas (sem setor/produto/squad tenant) |
| `PlatformCrmArchiveDialog.tsx` (179) | `seller/inbox/ArchiveConversationDialog.tsx` (12 KB) | `[1:1]` | won/lost/no_deal/other + reason |
| `PlatformCrmStartConversationDialog.tsx` (128) | `seller/inbox/StartConversationDialog.tsx` (10 KB) | `[1:1]` | |
| `PlatformCrmEmptyInboxState.tsx` (58) | `seller/inbox/EmptyInboxState.tsx` | `[1:1]` | 3 cards |
| `PlatformCrmAnalysisPanel.tsx` (65) | `seller/inbox/ConversationAnalysisPanel.tsx` (7 KB) | **`[FALTA]`** | só o shell/CTA; análise real = toast "em breve" — `PlatformCrmAnalysisPanel.tsx:31-37` (sem edge `platform-analyze-conversation`) |

## 1.2 Composer — features derrubadas do original (`seller/inbox/ChatInput.tsx` 30 KB → texto+emoji+IA) — `[DROP-OK]`/`[FALTA]`

Original tinha (evidência `seller/inbox/ChatInput.tsx:36-40,593,638,704,757` + dialogs de `ChatArea.tsx:34-39`): **AudioRecorder, anexo de arquivo/mídia (MediaPreviewBar), CatalogPicker, PaymentLink, PollComposer, ScheduleMessage, SendCadence, SendFlow, SendTemplate, QuickReplies (`/`), ContactPicker, Forward, InternalNotes, LeadContextPanel (35 KB), JourneyTimeline, MediaAttachment**. Portado só tem: texto + 12 emojis + reply + "Sugerir Resposta IA".
- Mídia/áudio/anexo/catálogo/payment/poll/template/flow/cadence-send → **`[DROP-OK]`** (dependem de canal externo WhatsApp/Meta; decisão de escopo v1 documentada em `PlatformCrmChatArea.tsx:34-37`).
- **QuickReplies (`/`), InternalNotes, LeadContextPanel (painel de contato), JourneyTimeline, ScheduleMessage, Forward** → **`[FALTA]`** (NÃO dependem de canal externo; são UX de produtividade cujas tabelas existem em `platform_crm_quick_replies`/`platform_crm_lead_notes` no schema, mas o botão está `disabled`/toast — ex.: `PlatformCrmChatArea.tsx:317` "Notas internas" `DropdownMenuItem disabled`; `:230` "Dados do Contato" → toast "em breve").

---

## 2. AGENTES — `admin/agents/` (20) → `agents/` (2) — **`[FALTA]` MASSIVO**

O portado (`PlatformCrmAgentsManager.tsx` 12 KB + `PlatformCrmAgentFormDialog.tsx` 6 KB) é um **CRUD chato**: lista de cards + criar/editar/duplicar/exportar-JSON/excluir/toggle, form com apenas **persona/typing_delay/handoff** (`usePlatformCrmAgentConfigs`). Cabeçalho admite: "porte CORE... Supervisor, Importar e orquestração/tools/routing dependem de Edge → botões presentes com toast em breve" (`PlatformCrmAgentsManager.tsx:50-57`).

Original = **suíte de orquestração multi-agente**. Não portado (features, não só arquivos):

| Original (arquivo) | Feature perdida | Tag |
|---|---|---|
| `AgentEditor.tsx` (63 KB, **~13 abas**: identity/tone/objective/executive/behavior/humanization/followup/tools/scheduling/routing/welcome/channels/test — `AgentEditor.tsx:420-498`) | Editor completo por-aba | `[FALTA]` |
| `AdminExecutivePanel.tsx` (39 KB) | Painel executivo do agente admin | `[FALTA]` |
| `AgentSupervisorPanel.tsx` (20 KB) + `AgentHierarchyView.tsx` + `AgentTreeNode.tsx` | Supervisor multi-agente + árvore de hierarquia | `[FALTA]` (botão = toast, `:113`) |
| `AgentOrchestratorRoutingTab.tsx` (18 KB) | Roteamento/orquestração entre especialistas | `[FALTA]` |
| `AgentHumanizationTab.tsx` (40 KB) | Humanização (delays, erros de digitação, áudio) | `[FALTA]` |
| `AgentImportModal.tsx` (24 KB) | Importar agente de PDF/DOCX (edge `import-agent-from-document`) | `[FALTA]` (botão = toast, `:119`) |
| `AgentTestChat.tsx` (9 KB) | Chat de teste do agente | `[FALTA]` |
| `AgentToolsTab`/`AgentSchedulingTab`/`AgentFollowupTab`/`AgentWelcomeMenuTab`/`AgentTrainingSection`/`AgentSupportTab`/`AgentActivationRules`/`QualificationSchemaEditor`/`AgentPromptTemplates.ts` | Tools, agenda, follow-up por-agente, menu de boas-vindas, treino, suporte, regras de ativação, schema de qualificação, templates de prompt | `[FALTA]` |

**Preservado tenant-side, não portado no módulo:** existe `AgentToolExecutionsPanel` e `AIQualityPanel` no registry super-admin (`registry.tsx:24-25,193`) — herdados do app, cobrem parte de "tools execution"/qualidade, mas NÃO são o editor de agente.

Edges de agente do original **não portados**: `admin-agent-alerts` (cron 5min), `admin-agent-handle-inbound` (admin via WhatsApp), `admin-agent-summary` (resumo diário/semanal), `agent-supervisor`, `agent-handoff-greeter`, `import-agent-from-document`, `generate-agent-ai`. Portado só tem o núcleo do bot em `platform-webchat-bot`. **`[FALTA]`.**

---

## 3. RADAR (IA) — `admin/radar/` (10) → `inbox-sections/` (10 arq Radar*) — `[1:1]` + `[RENOMEADO]`

Porte fiel arquivo-a-arquivo. Mesmo dashboard (Pie/Bar recharts, buckets HOT/WARM/COLD/LOST), mesmos `RadarLeadActions`/`RadarLeadDetailSheet`/`RadarFilters`/`RadarSchedules`/`RadarHistory`/`RadarActionsConfig`/`CreateRadarTaskDialog`/`FilterMultiSelect`. Diferenças:
- Hook `useOpportunityScan`/`useScanItems` → `usePlatformCrmOpportunityScan`/`usePlatformCrmScanItems` (`RadarDashboard.tsx:6-9` portado vs `:5` original). **`[RENOMEADO]`/`[PLATFORM_CRM]`**.
- Import `LineChart, Line` do original **não é renderizado** (0 usos no corpo — `grep -c "<LineChart" = 0`). Portado removeu o import morto. **`[DROP-OK]`** (nenhuma feature perdida).
- Wrapper `PlatformCrmInboxRadar.tsx` (7 KB) = novo container da seção. **`[ADICIONADO]`** (fiação).

Veredito Radar: **~99% coberto**.

---

## 4. FOLLOW-UP — `admin/followup/` (7) → `inbox-sections/` (Followup* 6 + wrapper) — `[1:1]`

Porte **quase idêntico** (mesmos imports, mesma estrutura). `FollowupPanel.tsx` → `PlatformCrmInboxFollowup.tsx`: header + filtros período/agente/status + KPIs + 3 gráficos (`FollowupRecoveryByAttempt`/`FollowupSentTrend`/`FollowupActiveStatusDonut`) + `FollowupActiveLeadsTable` + `FollowupUpcomingWidget` — todos os 6 subcomponentes portados 1:1.
- Dados: `useFollowupPanel` (fila `ai_outreach_queue` do tenant) → `usePlatformCrmFollowup` (réguas = cadências `platform_crm`, métricas client-side). Lista de agentes: `profiles`+`product_agents` → `platform_crm_agent_configs`. Documentado em `PlatformCrmInboxFollowup.tsx:18-31`. **`[PLATFORM_CRM]`**.
- Edges originais `ai-followup-cron` + `followup-ai-draft` → cobertos pelo motor de cadências `platform-cadence-*` (já existe no app). **`[MAPEADO]`** (motor equivalente).

Veredito Follow-Up: **~98% coberto** (UI 1:1; semântica de dados adaptada de fila→cadência).

---

## 5. RELATÓRIOS/ANALYTICS de atendimento — `admin/webchat/reports/` (8) → `inbox-sections/reports/` (7) + wrapper — `[1:1]`

`AttendanceReports.tsx` → `PlatformCrmInboxReports.tsx`: os **7 subcomponentes idênticos** (`KpiCard`/`StatusBars`/`TeamRanking`/`ChannelGrid`/`SmartAlerts`/`RisksTable`/`ReportsFilters`). Mesmos 6 KPIs com delta vs período anterior + insights. Evidência: imports lado-a-lado idênticos (`PlatformCrmInboxReports.tsx:5-16` vs `AttendanceReports.tsx:5-14`).
- Dados: `useAttendanceReports`+`buildInsights` → `usePlatformCrmAttendanceReports`+`buildPlatformInsights` (lê `platform_crm_conversations`/`_deals`/`profiles`). `productId` removido do filtro (schema não tem). Documentado `:23-37`. **`[PLATFORM_CRM]`/`[DROP-OK]`**.

Veredito Relatórios: **~99% coberto**.

---

## 6. OPERATION CENTER — `admin/operation/` (7) → `operation/` (7) — `[1:1]`

Contagem idêntica 7→7, mesmos nomes (`OperationCenter`/`HealthKpiRow`/`LeadsAtRiskTable`/`PrioritiesCard`/`RealtimeOpsCard`/`TeamPerformanceTable`/`AIRadarCard`). Tamanhos quase iguais (±100 bytes). Hook `useOperationCenter` → `usePlatformCrmOperationCenter`. **`[1:1]`/`[PLATFORM_CRM]`. ~100% coberto.**

---

## 7. MIA — `mia/`(~6 comp)+5 hooks+4 edges → `mia/`(1)+1 edge — `[CONSOLIDADO]`+`[FALTA]`

Portado: `PlatformCrmMia.tsx` (20 KB) + edge `platform-mia` + hook `usePlatformCrmMia`. Cabeçalhos documentam tudo (`PlatformCrmMia.tsx:21-38`, `platform-mia/index.ts:1-45`).

**PORTADO 1:1:** chat textual da Mia (persona executiva verbatim), painel briefing/resumo operacional, aba Contexto (via `tool_events`), 6 quick-questions, **19 tools read-only** (`get_operation_summary`, `get_team_status`, `get_hot_leads`, `get_unanswered_conversations`, etc.). **`[ADICIONADO]`**: `get_campaigns_overview` + `get_cadences_overview` (2 tools novas da plataforma).

**`[CONSOLIDADO]`**: 4 edges (`mia-tools`+`mia-prepare-action`+`mia-execute-action`+`mia-realtime-session`) → 1 edge `platform-mia` (modo `{tool,args}` OU `{messages}`). 5 hooks (`useMiaSession`/`useMiaWakeWord`/`useMiaActions`/`useMiaMemory`/`useMiaCommunications`) → 1 (`usePlatformCrmMia`).

**`[FALTA]`/`[DROP-OK]` (documentado como v2 em `platform-mia/index.ts:30-44`):**
- **Voz/WebRTC + wake word Picovoice** (`useMiaSession`/`useMiaWakeWord`/`mia-realtime-session`) → chat é só texto. **`[DROP-OK]`** (decisão v1).
- **Ciclo de AÇÃO prepare→approve→execute** (`mia_actions`, ~13 tools `draft_*`, edges prepare/execute, componentes `MiaPendingActions`/`MiaCommunications`) → Mia é **read-only**, não executa nada. **`[FALTA]`** (perda funcional real: a Mia original AGIA — enviava WhatsApp/email, atribuía/transferia/encerrava conversa, remarcava booking).
- **Memória** (`mia_user_memory`, `get_memory`/`remember_fact`/`MiaMemory.tsx`) → sem persistência de fatos/preferências. **`[FALTA]`**.
- Métricas de uso (`mia_logs`) → contador local de sessão. **`[DROP-OK]`**.

Veredito Mia: **~55% coberto** (consulta 1:1; ação e memória ausentes).

---

## 8. EDGES — paridade

| Portado | Original | Linhas (port/orig) | Tag |
|---|---|---|---|
| `platform-webchat-inbox` | `webchat-inbox` | 858 / 2323 | `[CONSOLIDADO]` — todas as ações (conversation/assign/send/close/accept/reopen/return-to-queue/resume) presentes (`:102,161,196,296,434`); −63% = tenant/setor/24h/canal removidos |
| `platform-webchat-bot` | `webchat-bot` | — | `[CONSOLIDADO]` — só o caminho núcleo agent→FAQ→prompt→LLM→persist (`index.ts:1-12`) |
| `platform-webchat-api` | `webchat-api` | — | `[1:1]` (widget público) |
| `platform-sales-copilot` | `sales-copilot` | 263 / 311 | `[1:1]` |
| `platform-mia` | `mia-tools`+3 | — | `[CONSOLIDADO]` (§7) |
| `platform-auto-notifications` | `auto-notifications` | — | `[1:1]` — "Porte 1:1... Nao construir inspirado" com tableMappings explícitos (`index.ts:1-22`) |

**Edges do original SEM porte** (além dos de agente do §2): `agent-handoff-greeter` (saudação pós-handoff), `analyze-conversation`/LLM-as-Judge (usado pelo AnalysisPanel — §1.1). **`[FALTA]`.**

---

## 9. LISTA de `[FALTA]` e `[ADICIONADO]`

### `[FALTA]` (gaps reais — 11)
1. **Editor de agente completo** (`AgentEditor` 63 KB, ~13 abas) → form com 3 campos. *(o maior gap do módulo)*
2. **Supervisor/hierarquia/roteamento multi-agente** (`AgentSupervisorPanel`+`AgentHierarchyView`+`AgentOrchestratorRoutingTab` + edge `agent-supervisor`) → toast "em breve".
3. **Importar agente de documento** (`AgentImportModal` + edge `import-agent-from-document`) → toast.
4. **Humanização do agente** (`AgentHumanizationTab` 40 KB: delays/typos/áudio).
5. **Chat de teste do agente** (`AgentTestChat`).
6. **Mia — execução de ações** (ciclo `mia_actions` prepare→execute; ~13 tools `draft_*`; edges prepare/execute) → Mia virou read-only.
7. **Mia — memória** (`mia_user_memory`).
8. **Análise de conversa por IA** (`ConversationAnalysisPanel` real + edge `analyze-conversation`) → stub/toast (`PlatformCrmAnalysisPanel.tsx:31`).
9. **Notas internas** na inbox (`InternalNotes` + `platform_crm_lead_notes` existe no schema) → `DropdownMenuItem disabled` (`PlatformCrmChatArea.tsx:317`).
10. **Painel de contexto do lead** na inbox (`LeadContextPanel` 35 KB + `JourneyTimeline`) → botão "Dados do Contato" = toast (`:230`).
11. **Filtros avançados da lista** (canal/etiqueta) + **QuickReplies (`/`)** + **agent alerts/summary crons** (`admin-agent-alerts`/`admin-agent-summary`) → toast/ausentes.

### `[ADICIONADO]` (não existia no original — 4)
1. Wrappers de seção `PlatformCrmInboxPanel/Radar/Followup/Reports` (fiação p/ o registry super-admin).
2. Mia tools `get_campaigns_overview` + `get_cadences_overview`.
3. Edge `platform-mia` unificada (2 modos numa função).
4. Fiação `onOpenConversation` injetado pelo pai (substitui sessionStorage+searchParams do tenant nas 3 seções).

---

## 10. VEREDITO — % coberto por domínio

| Domínio | Cobertura | Nota |
|---|---:|---|
| Inbox núcleo (chat/lista/bolha/ações) | **~85%** | UX 1:1; falta notas/contexto-lead/análise/quick-replies |
| Composer | **~45%** | texto+emoji+IA; mídia é DROP-OK, mas notas/contexto/schedule são FALTA |
| Radar IA | **~99%** | 1:1 |
| Follow-Up | **~98%** | 1:1 (UI); dados fila→cadência |
| Relatórios/Analytics | **~99%** | 1:1 |
| Operation Center | **~100%** | 1:1 |
| **Agentes** | **~20%** | CRUD só; suíte de orquestração ausente |
| Mia | **~55%** | consulta 1:1; ação+memória+voz ausentes |
| Edges | **~80%** | núcleo portado; agente/análise/handoff-greeter ausentes |

**Cobertura ponderada do módulo INBOX/ATENDIMENTO: ~75%.** O esqueleto de atendimento (inbox 2-painéis + 4 seções analíticas + operation) está fiel e desacoplado corretamente. Os 25% ausentes concentram-se em **(a) Agentes de IA** (orquestração multi-agente, o maior buraco) e **(b) capacidade de AÇÃO** (Mia read-only; análise/notas/contexto-lead como stub). Nenhuma regressão de dados detectada — tudo `platform_crm_*`, RLS super-admin, zero `organization_id` vazando.

---

## TOP-3 para o Marcelo

1. **Agentes é o buraco crítico, não a inbox.** A inbox/seções estão ~1:1; mas `admin/agents/` (20 arq, incl. `AgentEditor` 63 KB com 13 abas + supervisor + roteamento + humanização) virou um CRUD de 3 campos. Se "atendimento por IA" é venda, o editor de agente + supervisor/roteamento precisam de um sprint dedicado — hoje são toast "em breve".
2. **A Mia perdeu as mãos.** No original ela **executava** (enviava WhatsApp/email, atribuía/encerrava conversa, remarcava booking) via ciclo `mia_actions` prepare→approve→execute; no portado é **só consulta**. Decisão consciente (documentada como v2), mas o valor executivo da Mia mora na ação — confirmar se v1 read-only é aceitável comercialmente.
3. **3 features "de graça" estão como stub sem depender de canal externo:** Notas internas, Painel de contexto do lead e Análise de conversa por IA. As tabelas (`platform_crm_lead_notes`) e o padrão de edge já existem no app — são wiring, não construção nova. Baixo custo, alto ganho de paridade; priorizar antes das features que exigem WhatsApp/Meta.
